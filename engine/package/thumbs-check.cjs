'use strict';

const fs = require('node:fs');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { qc } = require('../config.cjs');
const { medianLuminance, relLum, contrastLum, H } = require('./thumbnails.cjs');

const hexLum = (hex) => {
  const h = hex.replace('#', '');
  return relLum(
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  );
};

/** Share of pixels on strong edges (Sobel) at 320×180 — a proxy for visual clutter. */
function edgeDensity(img) {
  const w = 320;
  const h = 180;
  const c = createCanvas(w, h);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  const gray = new Float32Array(w * h);
  for (let i = 0; i < gray.length; i += 1)
    gray[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
  let strong = 0;
  for (let y = 1; y < h - 1; y += 1) {
    for (let x = 1; x < w - 1; x += 1) {
      const p = (dx, dy) => gray[(y + dy) * w + x + dx];
      const gx = p(1, -1) + 2 * p(1, 0) + p(1, 1) - p(-1, -1) - 2 * p(-1, 0) - p(-1, 1);
      const gy = p(-1, 1) + 2 * p(0, 1) + p(1, 1) - p(-1, -1) - 2 * p(0, -1) - p(1, -1);
      if (Math.hypot(gx, gy) > 160) strong += 1;
    }
  }
  return strong / ((w - 2) * (h - 2));
}

/**
 * Thumbnail rules: ≤ 4 words, text cap height ≥ 18% of the thumbnail height (the same share at
 * 168×94 and 320×180), contrast ≥ 4.5:1 against the background under the text, low clutter,
 * and text that adds something to the title.
 */
async function thumbIssues(meta, title) {
  const limits = qc();
  const issues = [];
  const name = `Thumbnail "${meta.text}"`;
  const words = meta.text.split(/\s+/).filter(Boolean).length;
  if (words > limits.thumbMaxWords)
    issues.push(`${name}: ${words} words (max ${limits.thumbMaxWords}).`);
  const share = meta.capHeight / H;
  if (share < limits.thumbMinTextHeight) {
    issues.push(
      `${name}: text is ${(share * 100).toFixed(0)}% of the thumbnail height at phone size ` +
        `(min ${limits.thumbMinTextHeight * 100}%) — use fewer, shorter words.`,
    );
  }
  const img = await loadImage(fs.readFileSync(meta.file));
  const bg = meta.bgLuminance ?? medianLuminance(toCanvas(img), meta.box);
  const ratio = contrastLum(hexLum(meta.color), bg);
  if (ratio < limits.thumbMinContrast) {
    issues.push(`${name}: text contrast ${ratio.toFixed(1)}:1 (min ${limits.thumbMinContrast}:1).`);
  }
  const clutter = edgeDensity(img);
  if (clutter > limits.thumbMaxEdgeDensity) {
    issues.push(
      `${name}: the image is busy (edge density ${clutter.toFixed(2)}, max ${limits.thumbMaxEdgeDensity}).`,
    );
  }
  if (title && meta.text.trim().toLowerCase() === String(title).trim().toLowerCase()) {
    issues.push(`${name}: the text is the same as the title; make it add something.`);
  }
  return issues;
}

function toCanvas(img) {
  const c = createCanvas(img.width, img.height);
  c.getContext('2d').drawImage(img, 0, 0);
  return c;
}

function titleIssues(titles) {
  const max = qc().titleMaxChars;
  const issues = [];
  if (titles.length !== 3) issues.push('Three title options are needed.');
  titles.forEach((t, i) => {
    if (String(t).length > max)
      issues.push(`Title ${i + 1} is ${String(t).length} characters (max ${max}).`);
  });
  return issues;
}

module.exports = { thumbIssues, titleIssues, edgeDensity };
