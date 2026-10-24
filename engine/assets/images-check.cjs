'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { readJson } = require('../util/files.cjs');
const { qc } = require('../config.cjs');
const { cropFor } = require('../render/crop.cjs');
const { readPrompts } = require('./prompts.cjs');

const ASPECTS = { '16:9': 16 / 9, '9:16': 9 / 16 };
const DUPLICATE_BITS = 5;

/** What the file really is, from its first bytes (not its name). */
function sniff(buffer) {
  if (buffer.length >= 4 && buffer[0] === 0x89 && buffer.toString('ascii', 1, 4) === 'PNG')
    return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff)
    return 'jpeg';
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

/** 64-bit difference hash: compare neighbouring pixels of a 9×8 grey thumbnail. */
function dHash(image) {
  const c = createCanvas(9, 8);
  const g = c.getContext('2d');
  g.drawImage(image, 0, 0, 9, 8);
  const d = g.getImageData(0, 0, 9, 8).data;
  const gray = (x, y) => {
    const i = (y * 9 + x) * 4;
    return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  };
  const bits = [];
  for (let y = 0; y < 8; y += 1)
    for (let x = 0; x < 8; x += 1) bits.push(gray(x, y) < gray(x + 1, y) ? 1 : 0);
  return bits;
}

const hamming = (a, b) => a.reduce((n, bit, i) => n + (bit !== b[i] ? 1 : 0), 0);

/** Crops a beat will show from its image (art-focus: start and focus; art-tour: each crop). */
function beatRegions(beat) {
  if (beat.type === 'art-focus') return [beat.fields.focus];
  if (beat.type === 'art-tour') return beat.fields.crops || [];
  return [];
}

/**
 * Check every expected image: present, a real PNG/JPEG/WebP (JPEG/WebP are converted to PNG in
 * place), large enough, the right shape, not a near-copy of another, and never zoomed in so far
 * that fewer than imageMinCropWidth source pixels fill the frame. Returns [{file, problem}].
 */
async function checkImages(project) {
  const limits = qc();
  const prompts = readPrompts(project);
  const plan = readJson(project.path('beats.json'));
  const beats = new Map(plan.beats.map((b) => [b.id, b]));
  const dir = project.path('assets', 'images');
  const problems = [];
  const hashes = [];
  for (const entry of prompts) {
    const file = path.join(dir, entry.file);
    const flag = (problem) => problems.push({ file: entry.file, problem });
    if (!fs.existsSync(file)) {
      flag('missing — generate it from assets/IMAGE_PROMPTS.md');
      continue;
    }
    let bytes = fs.readFileSync(file);
    const kind = sniff(bytes);
    if (!kind) {
      flag('unsupported format (use PNG, JPEG or WebP)');
      continue;
    }
    let image;
    try {
      image = await loadImage(bytes);
    } catch (err) {
      flag(`cannot be decoded (${err.message})`);
      continue;
    }
    if (kind !== 'png') {
      const c = createCanvas(image.width, image.height);
      c.getContext('2d').drawImage(image, 0, 0);
      bytes = c.toBuffer('image/png');
      fs.writeFileSync(file, bytes);
      image = await loadImage(bytes);
    }
    const longEdge = Math.max(image.width, image.height);
    if (longEdge < limits.imageMinLongEdge) {
      flag(`long edge ${longEdge} < ${limits.imageMinLongEdge} px — generate it larger`);
    }
    const target = ASPECTS[entry.aspect];
    const actual = image.width / image.height;
    if (target && Math.abs(actual - target) / target > 0.02) {
      flag(`aspect ${image.width}×${image.height} does not match ${entry.aspect}`);
    }
    for (const beatId of entry.beatIds) {
      const beat = beats.get(beatId);
      if (!beat) continue;
      const frameAspect = plan.width / plan.height;
      for (const region of beatRegions(beat)) {
        const crop = cropFor(image, region, frameAspect);
        if (crop.w < limits.imageMinCropWidth) {
          flag(
            `${beatId} would zoom to a ${Math.round(crop.w)} px wide part of the image ` +
              `(min ${limits.imageMinCropWidth}) — zoom in less or supply a larger image`,
          );
        }
      }
    }
    const hash = dHash(image);
    const twin = hashes.find((h) => hamming(h.hash, hash) <= DUPLICATE_BITS);
    if (twin) flag(`near duplicate of ${twin.file} — each beat needs its own picture`);
    hashes.push({ file: entry.file, hash });
  }
  return problems;
}

module.exports = { checkImages, sniff, dHash };
