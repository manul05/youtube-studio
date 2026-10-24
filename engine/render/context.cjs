'use strict';

const { createCanvas } = require('@napi-rs/canvas');
const { registerFonts } = require('../util/fonts.cjs');

// Where essential text may sit, as fractions of the frame.
// Long-form keeps the bottom 12% free for YouTube's own captions; Shorts keep clear of the
// Shorts interface (top bar, and the caption/buttons area at the bottom and right).
const SAFE_AREAS = {
  long: { x0: 80 / 1920, x1: 1840 / 1920, y0: 40 / 1080, y1: 0.88 },
  short: { x0: 60 / 1080, x1: 1020 / 1080, y0: 280 / 1920, y1: 1500 / 1920 },
};

/**
 * A canvas for drawing frames, carrying the text audit log (every string drawn) and the list of
 * layout problems found while drawing. Both are read by the chapter renderer and QC.
 */
function createFrameCanvas(width, height, format = 'long') {
  registerFonts();
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  const area = SAFE_AREAS[format] || SAFE_AREAS.long;
  ctx.__textLog = new Set();
  ctx.__layoutIssues = [];
  ctx.__safe = {
    x0: area.x0 * width,
    x1: area.x1 * width,
    y0: area.y0 * height,
    y1: area.y1 * height,
  };
  return { canvas, ctx };
}

module.exports = { createFrameCanvas, SAFE_AREAS };
