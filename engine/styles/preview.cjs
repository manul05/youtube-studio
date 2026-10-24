'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { ffmpegPath } = require('../util/proc.cjs');
const { createFrameCanvas } = require('../render/context.cjs');
const { loadStyle } = require('./loader.cjs');
const { demoImage, demoVideoFrame, demoBeats } = require('./demo.cjs');

// 20 seconds that show off a pack: picture, type, a number, a map, a quote, a list.
const SEQUENCE = [
  ['art-focus', 4],
  ['kinetic', 3],
  ['stat', 3],
  ['map', 4],
  ['quote', 3],
  ['list', 3],
];

/** Render styles/<id>/preview.mp4 (20 s, silent) and card.png. */
async function stylePreview(id) {
  const style = loadStyle(id);
  const format = (style.meta.formats || ['long']).includes('long') ? 'long' : 'short';
  const [width, height] = format === 'long' ? [1280, 720] : [720, 1280];
  const demos = new Map(demoBeats('en').map((b) => [b.type, b]));
  const { canvas, ctx } = createFrameCanvas(width, height, format);
  const out = path.join(style.dir, 'preview.mp4');
  const partial = path.join(style.dir, 'preview.partial.mp4');
  const ff = spawn(
    ffmpegPath(),
    [
      '-v',
      'error',
      '-y',
      '-f',
      'rawvideo',
      '-pixel_format',
      'rgba',
      '-video_size',
      `${width}x${height}`,
      '-framerate',
      '30',
      '-i',
      'pipe:0',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '24',
      '-pix_fmt',
      'yuv420p',
      '-movflags',
      '+faststart',
      partial,
    ],
    { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] },
  );
  let stderr = '';
  ff.stderr.on('data', (d) => (stderr += d.toString()));
  const closed = new Promise((resolve) => ff.on('close', resolve));
  for (const [type, seconds] of SEQUENCE) {
    const demo = demos.get(type);
    const beat = {
      id: `preview-${type}`,
      type,
      fields: demo.fields,
      illustration: Boolean(demo.illustration),
    };
    const env = {
      width,
      height,
      format,
      fps: 30,
      style,
      beat,
      duration: seconds,
      words: [],
      channel: { name: style.meta.name },
    };
    for (let f = 0; f < seconds * 30; f += 1) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.save();
      style.components[type](
        ctx,
        beat,
        f / 30,
        { image: demoImage(), videoFrame: demoVideoFrame(width, height, f / 30) },
        env,
      );
      ctx.restore();
      if (type === 'stat' && f === 60)
        fs.writeFileSync(path.join(style.dir, 'card.png'), canvas.toBuffer('image/png'));
      if (!ff.stdin.write(canvas.data())) await new Promise((r) => ff.stdin.once('drain', r));
    }
  }
  ff.stdin.end();
  if ((await closed) !== 0) throw new Error(`Preview encode failed: ${stderr}`);
  fs.renameSync(partial, out);
  return { preview: out, card: path.join(style.dir, 'card.png') };
}

module.exports = { stylePreview };
