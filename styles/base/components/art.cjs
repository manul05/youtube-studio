'use strict';

const s = require('./shared.cjs');

const { createCanvas } = require('@napi-rs/canvas');

const MOVE_SEC = 0.5; // eased move between tour crops
const blurCache = new WeakMap();

/**
 * Shorts show landscape art sharp inside a square band, over a darkened, softened copy of the
 * same picture (cropping a landscape picture to fill a phone screen would magnify it badly).
 * Returns the rectangle the camera moves inside, and its aspect ratio.
 */
function artArea(ctx, img, env) {
  if (env.format !== 'short' || img.width <= img.height) {
    return { x: 0, y: 0, w: env.width, h: env.height, aspect: env.width / env.height };
  }
  let soft = blurCache.get(img);
  if (!soft) {
    soft = createCanvas(54, 96);
    const crop = s.cropFor(img, [0, 0, 1, 1], 54 / 96);
    soft.getContext('2d').drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, 54, 96);
    blurCache.set(img, soft);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(soft, 0, 0, env.width, env.height);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, env.width, env.height);
  const top = ctx.__safe.y0 + 60 * s.unit(env);
  return { x: 0, y: top, w: env.width, h: env.width, aspect: 1 };
}

function drawInArea(ctx, img, crop, area) {
  ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, area.x, area.y, area.w, area.h);
}
const HOLD_PUSH = 0.04; // slow push-in while a crop holds

function artFocus(ctx, beat, t, assets, env) {
  const area = artArea(ctx, assets.image, env);
  const full = s.cropFor(assets.image, [0, 0, 1, 1], area.aspect);
  const focus = s.cropFor(assets.image, beat.fields.focus, area.aspect);
  const p = s.easeInOut(t / env.duration);
  const [from, to] = beat.fields.reverse ? [focus, full] : [full, focus];
  drawInArea(ctx, assets.image, s.lerpCrop(from, to, p), area);
  s.vignette(ctx, env, 0.3);
  if (beat.illustration) s.illustrationTag(ctx, env);
}

function artTour(ctx, beat, t, assets, env) {
  const area = artArea(ctx, assets.image, env);
  const crops = beat.fields.crops.map((c) => s.cropFor(assets.image, c, area.aspect));
  const share = env.duration / crops.length;
  const k = Math.min(crops.length - 1, Math.floor(t / share));
  const local = t - k * share;
  const from = k === 0 ? crops[0] : crops[k - 1];
  const moved = k === 0 ? 1 : s.easeInOut(local / MOVE_SEC);
  const crop = s.zoomCrop(s.lerpCrop(from, crops[k], moved), HOLD_PUSH * s.clamp(local / share));
  drawInArea(ctx, assets.image, crop, area);
  s.vignette(ctx, env, 0.3);
  if (beat.illustration) s.illustrationTag(ctx, env);
}

function stock(ctx, beat, t, assets, env) {
  const grade = env.style.meta.stockGrade || {};
  const pal = s.palette(env);
  if (assets.videoFrame) {
    ctx.save();
    ctx.filter =
      `saturate(${grade.saturate ?? 1}) contrast(${grade.contrast ?? 1}) ` +
      `brightness(${grade.brightness ?? 1})`;
    ctx.drawImage(assets.videoFrame, 0, 0, env.width, env.height);
    ctx.restore();
  } else {
    s.fill(ctx, env, pal.bg);
  }
  if (grade.tint && grade.tintAlpha) {
    ctx.save();
    ctx.globalAlpha = grade.tintAlpha;
    s.fill(ctx, env, grade.tint);
    ctx.restore();
  }
  s.vignette(ctx, env, grade.vignette || 0);
  s.grain(ctx, env, grade.grain || 0, t);
  if (beat.fields.lowerThird) {
    const u = s.unit(env);
    const safe = ctx.__safe;
    const a = s.reveal(t, 0.4);
    const y = safe.y1 - 120 * u;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = pal.accent;
    ctx.fillRect(safe.x0, y, 8 * u, 84 * u);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(safe.x0 + 8 * u, y, env.width * 0.42 * s.easeOut((t - 0.4) / 0.5), 84 * u);
    s.drawText(ctx, beat.fields.lowerThird, {
      x: safe.x0 + 32 * u,
      y: y + 20 * u,
      width: env.width * 0.4,
      size: Math.round(40 * u),
      maxLines: 1,
      font: s.fonts(env).display,
      color: '#ffffff', // always light: the bar is dark in every pack
    });
    ctx.restore();
  }
}

module.exports = { 'art-focus': artFocus, 'art-tour': artTour, stock };
