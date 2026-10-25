'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { ensureDir, writeJson } = require('../util/files.cjs');
const { registerFonts } = require('../util/fonts.cjs');
const { channelLogo } = require('../config.cjs');
const { cropFor } = require('../render/crop.cjs');
const { loadStyle } = require('../styles/loader.cjs');
const { wrap } = require('../render/text.cjs');

const W = 1280;
const H = 720;
const TEXT_AREA = 0.62; // headline lives in the left 62%
const MARGIN = 40;
const MIN_CONTRAST = 4.5;

const relLum = (r, g, b) => {
  const lin = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
const contrastLum = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** Median relative luminance of a canvas region. */
function medianLuminance(canvas, box) {
  const g = canvas.getContext('2d');
  const d = g.getImageData(
    Math.round(box.x),
    Math.round(box.y),
    Math.round(box.w),
    Math.round(box.h),
  ).data;
  const values = [];
  for (let i = 0; i < d.length; i += 16) values.push(relLum(d[i], d[i + 1], d[i + 2]));
  values.sort((a, b) => a - b);
  return values[Math.floor(values.length / 2)] || 0;
}

/** Largest headline size (≤ 2 lines) that fits the text area. */
function fitHeadline(ctx, text, font) {
  const width = W * TEXT_AREA - 2 * MARGIN;
  for (let px = 230; px >= 70; px -= 4) {
    ctx.font = `${px}px ${font}`;
    const lines = wrap(ctx, text, width);
    if (lines.length <= 2 && lines.every((l) => ctx.measureText(l).width <= width))
      return { px, lines };
  }
  ctx.font = `70px ${font}`;
  return { px: 70, lines: wrap(ctx, text, width) };
}

/**
 * Compose the three thumbnails: base image (cover-cropped), headline (≤ 4 words) as large as fits
 * in the left 55% in ≤ 2 lines, with a text colour — and if needed a backing scrim — chosen so
 * text contrast is at least 4.5:1, a stroke and shadow, and the channel mark. Writes
 * outputs/package/thumb_<n>.png (or thumb_draft_<n>.png) and thumbs.json for the checks.
 */
async function composeThumbnails(project, { draft = false } = {}) {
  registerFonts();
  const brief = project.brief;
  const style = loadStyle(brief.style.main);
  // Thumbnails use condensed headline type (Impact) unless the pack names its own `thumb` font.
  const font = style.meta.fonts.thumb || 'Condensed';
  const outDir = project.path('outputs', 'package');
  ensureDir(outDir);
  const logoFile = channelLogo(brief.channel);
  const logo = fs.existsSync(logoFile) ? await loadImage(logoFile) : null;
  const results = [];
  for (let n = 1; n <= 3; n += 1) {
    const baseFile = project.path('assets', 'images', `thumb_base_${n}.png`);
    if (!fs.existsSync(baseFile))
      throw new Error(`Missing thumbnail base image ${path.basename(baseFile)}.`);
    const base = await loadImage(baseFile);
    const canvas = createCanvas(W, H);
    const ctx = canvas.getContext('2d');
    const crop = cropFor(base, [0, 0, 1, 1], W / H);
    ctx.drawImage(base, crop.x, crop.y, crop.w, crop.h, 0, 0, W, H);

    const text = String((brief.thumbTexts || [])[n - 1] || '').trim();
    const family = /\p{Script=Devanagari}/u.test(text) ? 'DevaBold' : font;
    const { px, lines } = fitHeadline(ctx, text, family);
    const lineHeight = px * 1.05;
    ctx.font = `${px}px ${family}`;
    const blockW = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const box = {
      x: MARGIN,
      y: (H - lines.length * lineHeight) / 2,
      w: blockW,
      h: lines.length * lineHeight,
    };

    let bg = medianLuminance(canvas, box);
    let color = bg < 0.4 ? '#ffffff' : '#111111';
    let fg = color === '#ffffff' ? 1 : relLum(17, 17, 17);
    if (contrastLum(fg, bg) < MIN_CONTRAST) {
      ctx.fillStyle = color === '#ffffff' ? 'rgba(0,0,0,0.62)' : 'rgba(255,255,255,0.7)';
      ctx.fillRect(box.x - 24, box.y - 18, box.w + 48, box.h + 36);
      bg = medianLuminance(canvas, box);
    }

    ctx.textBaseline = 'top';
    ctx.lineJoin = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 14;
    lines.forEach((line, i) => {
      const y = box.y + i * lineHeight;
      ctx.lineWidth = 12;
      ctx.strokeStyle = color === '#ffffff' ? '#000000' : '#ffffff';
      ctx.strokeText(line, box.x, y);
      ctx.fillStyle = color;
      ctx.fillText(line, box.x, y);
    });
    ctx.shadowBlur = 0;
    if (logo) ctx.drawImage(logo, MARGIN, H - 112, 72, 72);
    ctx.textBaseline = 'alphabetic';
    ctx.font = `${px}px ${family}`;
    const capHeight = ctx.measureText('H').actualBoundingBoxAscent || px * 0.7;

    const file = path.join(outDir, draft ? `thumb_draft_${n}.png` : `thumb_${n}.png`);
    fs.writeFileSync(file, canvas.toBuffer('image/png'));
    results.push({ n, file, text, color, box, capHeight, bgLuminance: bg });
  }
  writeJson(path.join(outDir, draft ? 'thumbs_draft.json' : 'thumbs.json'), results);
  return results;
}

module.exports = { composeThumbnails, medianLuminance, relLum, contrastLum, W, H };
