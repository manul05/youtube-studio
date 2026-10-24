'use strict';

const { spawn } = require('node:child_process');
const { createCanvas } = require('@napi-rs/canvas');
const { ffmpegPath } = require('../util/proc.cjs');

/**
 * Stream a video clip as canvases, already scaled and cropped to w×h at the studio frame rate.
 * Frames must be requested in order (frame(0), frame(1), …). If the clip ends early the last
 * frame is held. Only a few frames are buffered, so memory stays small.
 */
function openVideoSource(file, { w, h, inSec = 0, fps = 30 }) {
  const frameSize = w * h * 4;
  const proc = spawn(
    ffmpegPath(),
    [
      '-v',
      'error',
      '-ss',
      String(inSec),
      '-i',
      file,
      '-vf',
      `fps=${fps},scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`,
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgba',
      '-',
    ],
    { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const queue = [];
  let buffered = 0;
  let ended = false;
  let waiter = null;
  let stderr = '';
  const wake = () => {
    if (waiter) {
      const resolve = waiter;
      waiter = null;
      resolve();
    }
  };
  proc.stderr.on('data', (d) => (stderr += d.toString()));
  proc.stdout.on('data', (chunk) => {
    queue.push(chunk);
    buffered += chunk.length;
    if (buffered > frameSize * 3) proc.stdout.pause();
    wake();
  });
  proc.stdout.on('end', () => {
    ended = true;
    wake();
  });
  proc.on('error', (err) => {
    stderr += err.message;
    ended = true;
    wake();
  });

  const pixels = Buffer.alloc(frameSize);
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(w, h);
  let index = -1;
  let hasFrame = false;

  async function readFrame() {
    while (buffered < frameSize && !ended) {
      proc.stdout.resume();
      await new Promise((resolve) => (waiter = resolve));
    }
    if (buffered < frameSize) return false;
    let filled = 0;
    while (filled < frameSize) {
      const chunk = queue[0];
      const take = Math.min(chunk.length, frameSize - filled);
      chunk.copy(pixels, filled, 0, take);
      filled += take;
      if (take === chunk.length) queue.shift();
      else queue[0] = chunk.subarray(take);
    }
    buffered -= frameSize;
    if (buffered <= frameSize * 2) proc.stdout.resume();
    return true;
  }

  return {
    async frame(i) {
      if (i < index) throw new Error('Video frames must be requested in order.');
      while (index < i) {
        const got = await readFrame();
        index += 1;
        if (got) {
          image.data.set(pixels);
          ctx.putImageData(image, 0, 0);
          hasFrame = true;
        } else if (!hasFrame) {
          throw new Error(`Could not decode ${file}: ${stderr.slice(-300) || 'no frames'}`);
        }
      }
      return canvas;
    },
    close() {
      proc.stdout.destroy();
      proc.kill();
    },
  };
}

module.exports = { openVideoSource };
