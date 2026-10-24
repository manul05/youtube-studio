'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createCanvas } = require('@napi-rs/canvas');
const { writeJson } = require('../util/files.cjs');
const { qc } = require('../config.cjs');
const { BEAT_TYPES } = require('../plan/beat-types.cjs');
const { createFrameCanvas } = require('../render/context.cjs');
const { contrastRatio } = require('../qc/color.cjs');
const { grayOf, changeEvents } = require('../qc/change.cjs');
const { loadStyle } = require('./loader.cjs');
const { demoImage, demoVideoFrame, demoBeats, demoDuration } = require('./demo.cjs');

const FORMATS = { long: [1920, 1080], short: [1080, 1920] };
const MIN_CONTRAST = 4.5;
const REQUIRED_META = ['id', 'name', 'bestFor', 'formats', 'palette', 'fonts', 'imagePromptSuffix'];

/** The components a pack defines itself (not inherited from base). */
function ownComponents(dir) {
  const own = {};
  for (const file of [
    path.join(dir, 'components.cjs'),
    path.join(dir, 'components', 'index.cjs'),
  ]) {
    if (fs.existsSync(file)) Object.assign(own, require(file));
  }
  return own;
}

const canvases = new Map();
/** One reusable frame canvas per format (fresh canvases per frame exhaust native memory). */
function frameFor(format) {
  if (!canvases.has(format)) canvases.set(format, createFrameCanvas(...FORMATS[format], format));
  const frame = canvases.get(format);
  frame.ctx.setTransform(1, 0, 0, 1, 0, 0);
  frame.ctx.globalAlpha = 1;
  frame.ctx.__layoutIssues.length = 0;
  frame.ctx.__textLog.clear();
  return frame;
}

function drawDemo(style, beat, t, format, duration) {
  const [width, height] = FORMATS[format];
  const { canvas, ctx } = frameFor(format);
  const env = {
    width,
    height,
    format,
    fps: 30,
    style,
    beat,
    duration,
    words: [],
    channel: { name: 'Demo Channel', handle: '@demo' },
  };
  const assets = { image: demoImage(), videoFrame: demoVideoFrame(width, height, t), logo: null };
  ctx.save();
  style.components[beat.type](ctx, beat, t, assets, env);
  ctx.restore();
  return { canvas, ctx };
}

/**
 * Render a 6 s slow drift (should not count as a change) and a list reveal (should), and pick
 * a change threshold that separates them. Rendered at 1280×720 for speed.
 */
function calibrate(id) {
  const style = loadStyle(id);
  const { canvas, ctx } = createFrameCanvas(1280, 720, 'long');
  const render = (beat, seconds) => {
    const grays = [];
    for (let f = 0; f < seconds * 30; f += 15) {
      const env = {
        width: 1280,
        height: 720,
        format: 'long',
        fps: 30,
        style,
        beat,
        duration: seconds,
        words: [],
      };
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.save();
      style.components[beat.type](ctx, beat, f / 30, { image: demoImage() }, env);
      ctx.restore();
      grays.push(grayOf(canvas));
    }
    return grays;
  };
  const drift = render(
    {
      id: 'drift',
      type: 'art-focus',
      fields: { imagePrompt: 'x', focus: [0.08, 0.08, 0.84, 0.84] },
    },
    6,
  );
  const revealBeat = {
    id: 'reveal',
    type: 'list',
    fields: { items: ['First point', 'Second point', 'Third point'] },
  };
  const reveal = render(revealBeat, 6);
  let threshold = (style.meta.qc && style.meta.qc.changeThreshold) || qc().changeThreshold;
  let d = changeEvents(drift, threshold);
  let r = changeEvents(reveal, threshold);
  if ((d.events.length > 1 || r.events.length < 2) && d.largest < r.largest) {
    threshold = Math.round(((d.largest + r.largest) / 2) * 100) / 100;
    d = changeEvents(drift, threshold);
    r = changeEvents(reveal, threshold);
  }
  return {
    threshold,
    driftEvents: d.events.length - 1,
    revealEvents: r.events.length - 1,
    driftLargest: d.largest,
    revealLargest: r.largest,
  };
}

/**
 * Check a pack: required settings, text contrast, coverage of every beat type, and a render of
 * every beat type at entry/action/settled times in each format and in English and Hindi with
 * no layout problems. With write: true, saves check.json, check.jpg and the calibrated threshold.
 */
function styleCheck(id, { write = true } = {}) {
  const style = loadStyle(id);
  const meta = style.meta;
  const issues = [];
  for (const key of REQUIRED_META)
    if (meta[key] === undefined) issues.push(`style.json needs "${key}".`);
  for (const [a, b] of [
    ['ink', 'bg'],
    ['ink', 'surface'],
  ]) {
    const ratio = contrastRatio(meta.palette[a], meta.palette[b]);
    if (ratio < MIN_CONTRAST) {
      issues.push(`Text contrast ${a}/${b} is ${ratio.toFixed(2)}:1 (min ${MIN_CONTRAST}:1).`);
    }
  }
  const own = ownComponents(style.dir);
  const fallback = meta.fallback || [];
  for (const type of Object.keys(BEAT_TYPES)) {
    if (id !== 'base' && !own[type] && !fallback.includes(type) && !fallback.includes('*')) {
      issues.push(`${type}: not drawn by this pack and not listed in "fallback" in style.json.`);
    }
  }

  const tiles = [];
  for (const format of meta.formats || []) {
    for (const language of ['en', 'hi']) {
      for (const demo of demoBeats(language)) {
        if (format === 'short' && ['endcard', 'chapter'].includes(demo.type)) continue;
        const duration = demoDuration(demo.type);
        const beat = {
          id: `demo-${demo.type}`,
          type: demo.type,
          fields: demo.fields,
          illustration: Boolean(demo.illustration),
        };
        for (const [label, t] of [
          ['entry', 0.3],
          ['action', duration * 0.45],
          ['settled', duration - 0.3],
        ]) {
          try {
            const { canvas, ctx } = drawDemo(style, beat, t, format, duration);
            for (const problem of new Set(ctx.__layoutIssues)) {
              issues.push(`${format}/${language}/${demo.type}/${label}: ${problem}`);
            }
            if (language === 'en' && label === 'action')
              tiles.push({ canvas: thumbnail(canvas, format), format, type: demo.type });
          } catch (err) {
            issues.push(`${format}/${language}/${demo.type}/${label}: ${err.message}`);
          }
        }
      }
    }
  }

  const result = { id, passed: issues.length === 0, issues };
  if (write) {
    const calibration = calibrate(id);
    if (calibration.driftEvents > 0 || calibration.revealEvents < 1) {
      issues.push('Change threshold cannot separate a slow drift from a reveal for this pack.');
      result.passed = false;
    }
    result.calibration = calibration;
    const metaFile = path.join(style.dir, 'style.json');
    const saved = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
    saved.qc = { ...(saved.qc || {}), changeThreshold: calibration.threshold };
    fs.writeFileSync(metaFile, `${JSON.stringify(saved, null, 2)}\n`);
    writeJson(path.join(style.dir, 'check.json'), {
      passed: result.passed,
      issues: issues.length,
      threshold: calibration.threshold,
      checkedAt: new Date().toISOString(),
    });
    result.sheet = writeSheet(style.dir, tiles);
  }
  return result;
}

function thumbnail(canvas, format) {
  const [w, h] = format === 'short' ? [152, 270] : [480, 270];
  const small = createCanvas(w, h);
  small.getContext('2d').drawImage(canvas, 0, 0, w, h);
  return small;
}

function writeSheet(dir, tiles) {
  const cols = 4;
  const w = 480;
  const sheet = createCanvas(cols * w, Math.ceil(tiles.length / cols) * 270);
  const g = sheet.getContext('2d');
  g.fillStyle = '#000000';
  g.fillRect(0, 0, sheet.width, sheet.height);
  tiles.forEach((tile, i) => {
    const x = (i % cols) * w;
    const y = Math.floor(i / cols) * 270;
    g.drawImage(tile.canvas, tile.format === 'short' ? x + (w - 152) / 2 : x, y);
  });
  const file = path.join(dir, 'check.jpg');
  fs.writeFileSync(file, sheet.toBuffer('image/jpeg'));
  return file;
}

module.exports = { styleCheck, calibrate, ownComponents };
