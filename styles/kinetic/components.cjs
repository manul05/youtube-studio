'use strict';

// Kinetic Typography (accent): punchy word-by-word type that lands on the voice; the longest
// word lands in the accent colour.
const s = require('../base/components/shared.cjs');
const { wrap } = require('../../engine/render/text.cjs');

function longestIndex(words) {
  let best = 0;
  words.forEach((w, i) => {
    if (w.length > words[best].length) best = i;
  });
  return best;
}

/** Lay the words out centred, each scaling down into place at its time. */
function slam(ctx, text, t, env, times) {
  const pal = s.palette(env);
  const u = s.unit(env);
  const safe = ctx.__safe;
  const words = String(text).split(/\s+/).filter(Boolean);
  const key = longestIndex(words);
  const deva = /\p{Script=Devanagari}/u.test(text);
  const font = deva ? 'DevaBold' : 'SansBold';
  const width = (safe.x1 - safe.x0) * 0.9;
  let size = Math.round((env.format === 'short' ? 100 : 124) * u);
  let lines;
  for (;;) {
    ctx.font = `${size}px ${font}`;
    lines = wrap(ctx, text, width);
    if (lines.length <= 4 || size <= 56 * u) break;
    size -= 4;
  }
  const lineHeight = size * 1.2;
  const top = (safe.y0 + safe.y1) / 2 - (lines.length * lineHeight) / 2;
  let index = 0;
  lines.forEach((line, li) => {
    ctx.font = `${size}px ${font}`;
    const lineWidth = ctx.measureText(line).width;
    const space = ctx.measureText(' ').width;
    let x = (env.width - lineWidth) / 2;
    for (const word of line.split(' ')) {
      ctx.font = `${size}px ${font}`;
      const ww = ctx.measureText(word).width;
      const a = s.reveal(t, times[index] ?? 0, 0.2);
      const y = top + li * lineHeight;
      ctx.save();
      ctx.globalAlpha = a;
      const scale = 1 + (1 - a) * 0.35;
      ctx.translate(x + ww / 2, y + size / 2);
      ctx.scale(scale, scale);
      ctx.translate(-(x + ww / 2), -(y + size / 2));
      s.drawText(ctx, word, {
        x,
        y,
        width: ww + 4,
        size,
        minSize: size,
        maxLines: 1,
        font,
        color: index === key ? pal.accent : pal.ink,
        // Words scale up while entering; check placement at rest, not mid-animation.
        safe: a >= 0.999 ? ctx.__safe : null,
      });
      ctx.restore();
      x += ww + space;
      index += 1;
    }
  });
  ctx.__textLog.add(text);
}

function kinetic(ctx, beat, t, assets, env) {
  s.fill(ctx, env, s.palette(env).bg);
  const { times } = s.wordTimes(beat.fields.text, env.words || [], env.duration);
  slam(ctx, beat.fields.text, t, env, times);
}

function quote(ctx, beat, t, assets, env) {
  const { text, speaker, source, date } = beat.fields;
  if (!date) throw new Error('quote: date required (YYYY-MM-DD).');
  const pal = s.palette(env);
  const u = s.unit(env);
  const safe = ctx.__safe;
  s.fill(ctx, env, pal.bg);
  const { times } = s.wordTimes(text, env.words || [], env.duration * 0.8);
  slam(ctx, text, t, env, times);
  ctx.save();
  ctx.globalAlpha = s.reveal(t, Math.min(1.5, env.duration * 0.5));
  s.drawText(ctx, `— ${speaker}, ${source} (${date})`, {
    x: env.width / 2,
    y: safe.y1 - 90 * u,
    width: (safe.x1 - safe.x0) * 0.9,
    size: Math.round(36 * u),
    minSize: Math.round(26 * u),
    maxLines: 2,
    align: 'center',
    font: 'Mono',
    color: pal.muted,
  });
  ctx.restore();
}

module.exports = { kinetic, quote };
