'use strict';

const s = require('./shared.cjs');
const { wrap } = require('../../../engine/render/text.cjs');

const DEVANAGARI = /\p{Script=Devanagari}/u;
const family = (text, latin) =>
  DEVANAGARI.test(text) ? (/Bold/.test(latin) ? 'DevaBold' : 'Deva') : latin;

/** Choose the largest size (down to minSize) at which text wraps into maxLines within width. */
function fit(ctx, text, font, width, size, minSize, maxLines) {
  let px = size;
  for (;;) {
    ctx.font = `${px}px ${family(text, font)}`;
    const lines = wrap(ctx, text, width);
    if (
      (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= width)) ||
      px <= minSize
    ) {
      return { px, lines };
    }
    px -= 2;
  }
}

/** A key phrase as big type; each word rises in as the narrator says it. */
function kinetic(ctx, beat, t, assets, env) {
  const pal = s.palette(env);
  const u = s.unit(env);
  const safe = ctx.__safe;
  s.fill(ctx, env, pal.bg);
  const font = s.fonts(env).display;
  const width = (safe.x1 - safe.x0) * 0.92;
  const { px, lines } = fit(
    ctx,
    beat.fields.text,
    font,
    width,
    Math.round(130 * u),
    Math.round(64 * u),
    3,
  );
  const { times } = s.wordTimes(beat.fields.text, env.words || [], env.duration);
  const lineHeight = px * 1.12;
  const top = (safe.y0 + safe.y1) / 2 - (lines.length * lineHeight) / 2;
  ctx.font = `${px}px ${family(beat.fields.text, font)}`;
  const space = ctx.measureText(' ').width;
  let index = 0;
  lines.forEach((line, li) => {
    const words = line.split(' ');
    const lineWidth = ctx.measureText(line).width;
    let x = (env.width - lineWidth) / 2;
    for (const word of words) {
      const a = s.reveal(t, times[index] ?? 0, 0.3);
      ctx.save();
      ctx.globalAlpha = a;
      s.drawText(ctx, word, {
        x,
        y: top + li * lineHeight + (1 - a) * 24 * u,
        width: lineWidth + px,
        size: px,
        minSize: px,
        maxLines: 1,
        font,
        color: pal.ink,
      });
      ctx.restore();
      ctx.font = `${px}px ${family(beat.fields.text, font)}`;
      x += ctx.measureText(word).width + space;
      index += 1;
    }
  });
  const bar = s.easeOut(t / 0.6);
  ctx.fillStyle = pal.accent;
  ctx.fillRect(
    env.width / 2 - (width / 4) * bar,
    top + lines.length * lineHeight + (DEVANAGARI.test(beat.fields.text) ? 0.35 * px : 18 * u),
    (width / 2) * bar,
    8 * u,
  );
  ctx.__textLog.add(beat.fields.text);
}

/** An attributed quotation, revealed line by line as it is read. */
function quote(ctx, beat, t, assets, env) {
  const { text, speaker, source, date } = beat.fields;
  if (!date) throw new Error('quote: date required (YYYY-MM-DD).');
  if (!source) throw new Error('quote: source required.');
  const pal = s.palette(env);
  const u = s.unit(env);
  const safe = ctx.__safe;
  s.fill(ctx, env, pal.surface);
  const left = safe.x0 + 120 * u;
  const width = (safe.x1 - left) * 0.88;
  ctx.fillStyle = pal.accent;
  ctx.font = `${Math.round(220 * u)}px ${s.fonts(env).serif}`;
  ctx.globalAlpha = s.reveal(t, 0);
  ctx.textBaseline = 'top';
  ctx.fillText('“', safe.x0, safe.y0 + 40 * u);
  ctx.globalAlpha = 1;
  const font = s.fonts(env).serif;
  const { px, lines } = fit(ctx, text, font, width, Math.round(84 * u), Math.round(44 * u), 5);
  const { times } = s.wordTimes(text, env.words || [], env.duration * 0.85);
  let wordIndex = 0;
  const blockHeight = lines.length * px * 1.3 + 140 * u;
  const top = Math.max(safe.y0 + 150 * u, (safe.y0 + safe.y1) / 2 - blockHeight / 2);
  lines.forEach((line, i) => {
    const at = times[wordIndex] ?? 0;
    wordIndex += line.split(' ').length;
    ctx.save();
    ctx.globalAlpha = s.reveal(t, at, 0.35);
    s.drawText(ctx, line, {
      x: left,
      y: top + i * px * 1.3,
      width,
      size: px,
      minSize: px,
      maxLines: 1,
      font,
      color: pal.ink,
    });
    ctx.restore();
  });
  ctx.__textLog.add(text);
  ctx.save();
  ctx.globalAlpha = s.reveal(t, Math.min(1.2, env.duration * 0.3));
  s.drawText(ctx, `— ${speaker}`, {
    x: left,
    y: top + lines.length * px * 1.3 + 30 * u,
    width,
    size: Math.round(44 * u),
    maxLines: 1,
    font: s.fonts(env).display,
    color: pal.accent,
  });
  s.drawText(ctx, `${source} · ${date}`, {
    x: left,
    y: top + lines.length * px * 1.3 + 92 * u,
    width,
    size: Math.round(36 * u),
    maxLines: 1,
    font: s.fonts(env).mono,
    color: pal.muted,
  });
  ctx.restore();
}

/** Chapter title card. */
function chapter(ctx, beat, t, assets, env) {
  const pal = s.palette(env);
  const u = s.unit(env);
  const safe = ctx.__safe;
  s.fill(ctx, env, pal.bg);
  const a = s.reveal(t, 0.1, 0.5);
  const number = String(beat.fields.number).padStart(2, '0');
  ctx.save();
  ctx.globalAlpha = a;
  s.drawText(ctx, number, {
    x: safe.x0 + 40 * u,
    y: env.height * 0.3 - (1 - a) * 30 * u,
    width: 400 * u,
    size: Math.round(140 * u),
    maxLines: 1,
    font: s.fonts(env).mono,
    color: pal.accent,
  });
  ctx.restore();
  ctx.save();
  ctx.globalAlpha = s.reveal(t, 0.35, 0.5);
  s.drawText(ctx, beat.fields.title, {
    x: safe.x0 + 40 * u,
    y: env.height * 0.3 + 170 * u,
    width: (safe.x1 - safe.x0) * 0.85,
    size: Math.round(96 * u),
    minSize: Math.round(56 * u),
    maxLines: 2,
    font: s.fonts(env).display,
    color: pal.ink,
  });
  ctx.restore();
  ctx.fillStyle = pal.accent;
  ctx.fillRect(
    safe.x0 + 40 * u,
    env.height * 0.3 + 150 * u,
    240 * u * s.easeOut((t - 0.2) / 0.6),
    6 * u,
  );
}

/**
 * YouTube end screen (20 s). The two video boxes and the subscribe circle are left plain so
 * YouTube's own end-screen elements sit on a clean background.
 */
function endcard(ctx, beat, t, assets, env) {
  const pal = s.palette(env);
  const u = s.unit(env);
  s.fill(ctx, env, pal.bg);
  s.drawText(ctx, 'Thanks for watching', {
    x: 120 * u,
    y: 120 * u,
    width: 800 * u,
    size: Math.round(64 * u),
    maxLines: 1,
    font: s.fonts(env).display,
    color: pal.ink,
  });
  s.drawText(ctx, env.channel ? env.channel.name : '', {
    x: 120 * u,
    y: 770 * u,
    width: 780 * u,
    size: Math.round(44 * u),
    maxLines: 1,
    font: s.fonts(env).display,
    color: pal.accent,
  });
  if (assets.logo) ctx.drawImage(assets.logo, 120 * u, 850 * u, 90 * u, 90 * u);
  s.drawText(ctx, 'Watch next', {
    x: 1056 * u,
    y: 70 * u,
    width: 600 * u,
    size: Math.round(36 * u),
    maxLines: 1,
    font: s.fonts(env).mono,
    color: pal.muted,
  });
  ctx.fillStyle = pal.accent;
  ctx.fillRect(0, 1030 * u, env.width * s.easeOut(t / 1.2), 6 * u);
}

module.exports = { kinetic, quote, chapter, endcard };
