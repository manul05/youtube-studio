'use strict';

// Evidence Board: pinned paper cards on cork with red circling, and a case-file chapter card.
const s = require('../base/components/shared.cjs');

const PAPER = '#f2ead8';
const PAPER_INK = '#1f1a14';

function cork(ctx, env, t) {
  s.fill(ctx, env, s.palette(env).bg);
  s.grain(ctx, env, 0.12, t);
}

function pin(ctx, x, y, u, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, 14 * u, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.beginPath();
  ctx.arc(x - 4 * u, y - 4 * u, 4 * u, 0, Math.PI * 2);
  ctx.fill();
}

/** A paper card, slightly rotated, dropped onto the board. Returns the card rectangle. */
function card(ctx, env, t, { w, h, angle }) {
  const u = s.unit(env);
  const a = s.reveal(t, 0, 0.5);
  const x = (env.width - w) / 2;
  const y = (env.height - h) / 2 - 30 * u + (1 - a) * 40 * u;
  ctx.translate(env.width / 2, env.height / 2);
  ctx.rotate(angle);
  ctx.translate(-env.width / 2, -env.height / 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x + 12 * u, y + 14 * u, w, h);
  ctx.fillStyle = PAPER;
  ctx.fillRect(x, y, w, h);
  pin(ctx, x + w / 2, y + 24 * u, u, s.palette(env).accent);
  return { x, y, w, h };
}

function documentCard(ctx, beat, t, assets, env) {
  const { title, lines, highlight = [] } = beat.fields;
  const u = s.unit(env);
  const safe = ctx.__safe;
  cork(ctx, env, t);
  ctx.save();
  const box = card(ctx, env, t, {
    w: Math.min(1050 * u, (safe.x1 - safe.x0) * 0.9),
    h: (safe.y1 - safe.y0) * 0.8,
    angle: -0.012,
  });
  s.drawText(ctx, title, {
    x: box.x + 60 * u,
    y: box.y + 70 * u,
    width: box.w - 120 * u,
    size: Math.round(48 * u),
    minSize: Math.round(34 * u),
    maxLines: 2,
    font: 'SerifBold',
    color: PAPER_INK,
  });
  lines.forEach((line, i) => {
    const y = box.y + 200 * u + i * 100 * u;
    if (highlight.includes(i)) {
      const p = s.easeOut((t - 0.8 - i * 0.6) / 0.7);
      ctx.strokeStyle = s.palette(env).accent;
      ctx.lineWidth = 6 * u;
      ctx.beginPath();
      ctx.ellipse(
        box.x + box.w / 2,
        y + 22 * u,
        Math.max(1, (box.w / 2 - 40 * u) * p),
        Math.max(1, 46 * u * p),
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }
    s.drawText(ctx, line, {
      x: box.x + 60 * u,
      y,
      width: box.w - 120 * u,
      size: Math.round(38 * u),
      minSize: Math.round(28 * u),
      maxLines: 2,
      font: 'Serif',
      color: PAPER_INK,
    });
  });
  ctx.restore();
  s.illustrationTag(ctx, env, 'RECREATED · ILLUSTRATION');
}

function quote(ctx, beat, t, assets, env) {
  const { text, speaker, source, date } = beat.fields;
  if (!date) throw new Error('quote: date required (YYYY-MM-DD).');
  const u = s.unit(env);
  const safe = ctx.__safe;
  cork(ctx, env, t);
  ctx.save();
  const box = card(ctx, env, t, {
    w: Math.min(1200 * u, (safe.x1 - safe.x0) * 0.92),
    h: (safe.y1 - safe.y0) * 0.7,
    angle: 0.01,
  });
  s.drawText(ctx, `“${text}”`, {
    x: box.x + 70 * u,
    y: box.y + 80 * u,
    width: box.w - 140 * u,
    size: Math.round(56 * u),
    minSize: Math.round(34 * u),
    maxLines: 6,
    font: 'Serif',
    color: PAPER_INK,
  });
  ctx.globalAlpha = s.reveal(t, 0.9);
  s.drawText(ctx, `— ${speaker} · ${source}, ${date}`, {
    x: box.x + 70 * u,
    y: box.y + box.h - 100 * u,
    width: box.w - 140 * u,
    size: Math.round(32 * u),
    minSize: Math.round(24 * u),
    maxLines: 2,
    font: 'Mono',
    color: s.palette(env).accent,
  });
  ctx.restore();
}

function chapter(ctx, beat, t, assets, env) {
  const pal = s.palette(env);
  const u = s.unit(env);
  const safe = ctx.__safe;
  cork(ctx, env, t);
  ctx.save();
  const box = card(ctx, env, t, {
    w: Math.min(1000 * u, (safe.x1 - safe.x0) * 0.85),
    h: 360 * u,
    angle: -0.02,
  });
  s.drawText(ctx, `CASE FILE ${String(beat.fields.number).padStart(2, '0')}`, {
    x: box.x + 60 * u,
    y: box.y + 70 * u,
    width: box.w - 120 * u,
    size: Math.round(32 * u),
    maxLines: 1,
    font: 'Mono',
    color: pal.accent,
  });
  s.drawText(ctx, beat.fields.title, {
    x: box.x + 60 * u,
    y: box.y + 130 * u,
    width: box.w - 120 * u,
    size: Math.round(72 * u),
    minSize: Math.round(44 * u),
    maxLines: 2,
    font: 'SansBold',
    color: PAPER_INK,
  });
  ctx.restore();
}

module.exports = { document: documentCard, quote, chapter };
