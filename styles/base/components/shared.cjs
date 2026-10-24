'use strict';

const { createCanvas } = require('@napi-rs/canvas');
const { drawText } = require('../../../engine/render/text.cjs');

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = (x) => 1 - (1 - clamp(x)) ** 3;
const easeInOut = (x) => {
  const v = clamp(x);
  return v < 0.5 ? 4 * v * v * v : 1 - (-2 * v + 2) ** 3 / 2;
};

/** 0→1 as an element animates in, starting at `at` seconds over `dur` seconds. */
const reveal = (t, at, dur = 0.45) => easeOut((t - at) / dur);

/**
 * Layout unit: 1 at 1920 px wide for long-form. Shorts are watched on a phone held close, so
 * the same design sizes are enlarged (1080 px wide ≈ 1.42 units).
 */
const unit = (env) => (env.format === 'short' ? env.width / 760 : env.width / 1920);
const palette = (env) => env.style.meta.palette;
const fonts = (env) => env.style.meta.fonts;

function fill(ctx, env, color) {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, env.width, env.height);
}

/**
 * A crop rectangle (image pixels) with the frame's aspect ratio that covers `region`
 * ([x, y, w, h] as fractions of the image), centred on it and kept inside the image.
 */
function cropFor(img, region, aspect) {
  const [fx, fy, fw, fh] = region;
  const rw = fw * img.width;
  const rh = fh * img.height;
  let w = Math.max(rw, rh * aspect);
  let h = w / aspect;
  if (w > img.width) {
    w = img.width;
    h = w / aspect;
  }
  if (h > img.height) {
    h = img.height;
    w = h * aspect;
  }
  const cx = (fx + fw / 2) * img.width;
  const cy = (fy + fh / 2) * img.height;
  return {
    x: clamp(cx - w / 2, 0, img.width - w),
    y: clamp(cy - h / 2, 0, img.height - h),
    w,
    h,
  };
}

const lerpCrop = (a, b, t) => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  w: lerp(a.w, b.w, t),
  h: lerp(a.h, b.h, t),
});

/** Shrink a crop around its centre (a slow push-in). */
function zoomCrop(c, amount) {
  const w = c.w * (1 - amount);
  const h = c.h * (1 - amount);
  return { x: c.x + (c.w - w) / 2, y: c.y + (c.h - h) / 2, w, h };
}

function drawCrop(ctx, img, crop, env) {
  ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, env.width, env.height);
}

function vignette(ctx, env, strength) {
  if (!strength) return;
  const g = ctx.createRadialGradient(
    env.width / 2,
    env.height / 2,
    Math.min(env.width, env.height) * 0.35,
    env.width / 2,
    env.height / 2,
    Math.max(env.width, env.height) * 0.75,
  );
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${strength})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, env.width, env.height);
}

/** The "Illustration" label required on AI artwork of real events. */
function illustrationTag(ctx, env, label = 'ILLUSTRATION') {
  const u = unit(env);
  const safe = ctx.__safe;
  const size = Math.round(22 * u);
  ctx.font = `${size}px ${fonts(env).mono}`;
  const w = ctx.measureText(label).width + 28 * u;
  const h = size + 18 * u;
  const corner = env.style.meta.tagCorner || 'top-right';
  const x = corner.endsWith('left') ? safe.x0 : safe.x1 - w;
  const y = corner.startsWith('top') ? safe.y0 + 4 * u : safe.y1 - h - 4 * u;
  ctx.fillStyle = 'rgba(0,0,0,0.62)';
  ctx.fillRect(x, y, w, h);
  drawText(ctx, label, {
    x: x + 14 * u,
    y: y + 9 * u,
    width: w,
    size,
    font: fonts(env).mono,
    color: '#ffffff',
    maxLines: 1,
  });
}

const canonWord = (w) =>
  String(w)
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}\p{N}]/gu, '');

/**
 * When each word of on-screen `text` should appear: at the moment the narrator says it when the
 * word is found in the beat's aligned speech, otherwise spread evenly over the first 60%.
 */
function wordTimes(text, spoken, duration) {
  const parts = String(text).split(/\s+/).filter(Boolean);
  const times = [];
  let cursor = 0;
  parts.forEach((part, i) => {
    const target = canonWord(part);
    let found = null;
    for (let k = cursor; k < spoken.length; k += 1) {
      if (canonWord(spoken[k].text) === target && spoken[k].start >= 0) {
        found = spoken[k].start;
        cursor = k + 1;
        break;
      }
    }
    const fallback = ((duration * 0.6) / Math.max(1, parts.length)) * i;
    times.push(found !== null && found < duration ? found : fallback);
  });
  for (let i = 1; i < times.length; i += 1) times[i] = Math.max(times[i], times[i - 1]);
  return { parts, times };
}

let grainTile = null;
/** Film grain from a fixed seeded tile, shifted every frame. */
function grain(ctx, env, amount, t) {
  if (!amount) return;
  if (!grainTile) {
    grainTile = createCanvas(256, 256);
    const g = grainTile.getContext('2d');
    const img = g.createImageData(256, 256);
    let seed = 1234567;
    for (let i = 0; i < img.data.length; i += 4) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const v = seed % 256;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }
  const shift = Math.floor(t * 30) * 37;
  ctx.save();
  ctx.globalAlpha = amount;
  ctx.globalCompositeOperation = 'overlay';
  for (let y = -256; y < env.height; y += 256) {
    for (let x = -256; x < env.width; x += 256)
      ctx.drawImage(grainTile, x + (shift % 256), y + ((shift * 3) % 256));
  }
  ctx.restore();
}

module.exports = {
  clamp,
  lerp,
  easeOut,
  easeInOut,
  reveal,
  unit,
  palette,
  fonts,
  fill,
  cropFor,
  lerpCrop,
  zoomCrop,
  drawCrop,
  vignette,
  illustrationTag,
  wordTimes,
  grain,
  drawText,
};
