'use strict';

const { createCanvas } = require('@napi-rs/canvas');
const { readJson, rootPath } = require('../util/files.cjs');
const { BEAT_TYPES } = require('../plan/beat-types.cjs');

const imageCache = new Map();

/** A procedural stand-in picture (no real people, no text) for checks and previews. Cached. */
function demoImage(seed = 7) {
  if (imageCache.has(seed)) return imageCache.get(seed);
  const c = createCanvas(2400, 1350);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 2400, 1350);
  grad.addColorStop(0, '#1d2b3a');
  grad.addColorStop(0.55, '#7a4a3a');
  grad.addColorStop(1, '#e3b062');
  g.fillStyle = grad;
  g.fillRect(0, 0, 2400, 1350);
  let r = seed;
  const rand = () => {
    r = (r * 16807) % 2147483647;
    return r / 2147483647;
  };
  for (let i = 0; i < 60; i += 1) {
    g.globalAlpha = 0.35 + rand() * 0.5;
    g.fillStyle = `hsl(${Math.floor(rand() * 360)}, 55%, ${25 + rand() * 45}%)`;
    g.beginPath();
    g.arc(rand() * 2400, rand() * 1350, 30 + rand() * 180, 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 1;
  imageCache.set(seed, c);
  return c;
}

/** A plain frame used as the "video" for stock beats in checks and previews. */
function demoVideoFrame(width, height, t = 0) {
  const c = createCanvas(width, height);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#24445a');
  grad.addColorStop(1, '#8aa0a8');
  g.fillStyle = grad;
  g.fillRect(0, 0, width, height);
  g.fillStyle = 'rgba(255,255,255,0.18)';
  for (let i = 0; i < 12; i += 1)
    g.fillRect(((i * 160 + t * 120) % (width + 200)) - 100, height * 0.55, 90, height * 0.3);
  return c;
}

function demoBeats(language) {
  return readJson(rootPath('templates', 'style-demo', `${language}.json`)).beats;
}

/** A sensible demo duration for a beat type within its limits. */
function demoDuration(type) {
  const spec = BEAT_TYPES[type];
  return Math.min(spec.maxSec, Math.max(spec.minSec, 6));
}

module.exports = { demoImage, demoVideoFrame, demoBeats, demoDuration };
