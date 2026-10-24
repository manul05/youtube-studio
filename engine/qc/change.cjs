'use strict';

/**
 * "Meaningful visual change" detection, shared by style calibration and the static-interval QC.
 *
 * Frames are reduced to 80×45 grey images. To decide whether a frame shows something new
 * compared with an anchor frame, the anchor is first warped by the zoom and pan that best
 * explain the difference (a Ken Burns drift or slow pan is fully explained this way). Whatever
 * the camera move cannot explain — new text, a new crop, a cut, a new element — remains as a
 * residual. The score is the largest residual among 8×5 blocks of the frame, so a small new
 * element counts even when most of the frame is unchanged. When the score reaches the threshold
 * a change event is recorded and the anchor moves on.
 */

const { createCanvas } = require('@napi-rs/canvas');

const GW = 80;
const GH = 45;
const BLOCKS_X = 8;
const BLOCKS_Y = 5;
const SCALES = [0.75, 0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.17, 1.25, 1.33];
const SHIFT = 8; // pixels at 80×45
const SHIFT_STEP = 2;

let scratch = null;

/** A canvas (or anything drawable) as an 80×45 grey image. */
function grayOf(canvas) {
  if (!scratch) scratch = createCanvas(GW, GH);
  const ctx = scratch.getContext('2d');
  ctx.drawImage(canvas, 0, 0, GW, GH);
  return grayFromRgba(ctx.getImageData(0, 0, GW, GH).data);
}

function grayFromRgba(rgba) {
  const gray = new Uint8Array(GW * GH);
  for (let i = 0, p = 0; p < gray.length; i += 4, p += 1) {
    gray[p] = Math.round(0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2]);
  }
  return gray;
}

/** Mean absolute difference between frame and anchor warped by (scale, dx, dy), every 2nd px. */
function warpedMad(anchor, frame, scale, dx, dy) {
  const cx = GW / 2;
  const cy = GH / 2;
  let sum = 0;
  let n = 0;
  for (let y = 0; y < GH; y += 2) {
    const sy = Math.round(cy + (y - cy) / scale - dy);
    if (sy < 0 || sy >= GH) continue;
    for (let x = 0; x < GW; x += 2) {
      const sx = Math.round(cx + (x - cx) / scale - dx);
      if (sx < 0 || sx >= GW) continue;
      sum += Math.abs(frame[y * GW + x] - anchor[sy * GW + sx]);
      n += 1;
    }
  }
  return n > GW * GH * 0.1 ? sum / n : Infinity;
}

/** Largest per-block residual after the best zoom/pan alignment of anchor onto frame. */
function residual(anchor, frame) {
  let best = { mad: Infinity, scale: 1, dx: 0, dy: 0 };
  for (const scale of SCALES) {
    for (let dx = -SHIFT; dx <= SHIFT; dx += SHIFT_STEP) {
      for (let dy = -SHIFT; dy <= SHIFT; dy += SHIFT_STEP) {
        const mad = warpedMad(anchor, frame, scale, dx, dy);
        if (mad < best.mad) best = { mad, scale, dx, dy };
      }
    }
  }
  const cx = GW / 2;
  const cy = GH / 2;
  const sums = new Float64Array(BLOCKS_X * BLOCKS_Y);
  const counts = new Uint32Array(BLOCKS_X * BLOCKS_Y);
  for (let y = 0; y < GH; y += 1) {
    const sy = Math.round(cy + (y - cy) / best.scale - best.dy);
    for (let x = 0; x < GW; x += 1) {
      const sx = Math.round(cx + (x - cx) / best.scale - best.dx);
      const b =
        Math.min(BLOCKS_Y - 1, Math.floor((y * BLOCKS_Y) / GH)) * BLOCKS_X +
        Math.min(BLOCKS_X - 1, Math.floor((x * BLOCKS_X) / GW));
      // Edges the camera move brings into view have no anchor pixels; they are ignored.
      const diff =
        sx < 0 || sx >= GW || sy < 0 || sy >= GH
          ? 0
          : Math.abs(frame[y * GW + x] - anchor[sy * GW + sx]);
      sums[b] += diff;
      counts[b] += 1;
    }
  }
  let worst = 0;
  for (let b = 0; b < sums.length; b += 1) worst = Math.max(worst, sums[b] / counts[b]);
  return worst;
}

/** Indices of frames where a meaningful change happens (index 0 always counts). */
function changeEvents(grays, threshold) {
  const events = [0];
  let anchor = grays[0];
  let largest = 0;
  for (let i = 1; i < grays.length; i += 1) {
    const score = residual(anchor, grays[i]);
    largest = Math.max(largest, score);
    if (score >= threshold) {
      events.push(i);
      anchor = grays[i];
    }
  }
  return { events, largest };
}

module.exports = { grayOf, grayFromRgba, residual, changeEvents, GW, GH };
