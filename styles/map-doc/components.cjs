'use strict';

// Map Documentary: a faint latitude/longitude grid over maps and timelines; coordinate-style
// chapter cards.
const s = require('../base/components/shared.cjs');
const base = require('../base/components/index.cjs');

function grid(ctx, env, alpha) {
  const u = s.unit(env);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = s.palette(env).accent2;
  ctx.lineWidth = Math.max(1, u);
  const step = 120 * u;
  ctx.beginPath();
  for (let x = 0; x <= env.width; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, env.height);
  }
  for (let y = 0; y <= env.height; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(env.width, y);
  }
  ctx.stroke();
  ctx.restore();
}

function map(ctx, beat, t, assets, env) {
  base.map(ctx, beat, t, assets, env);
  grid(ctx, env, 0.07);
}

function timeline(ctx, beat, t, assets, env) {
  base.timeline(ctx, beat, t, assets, env);
  grid(ctx, env, 0.05);
}

function chapter(ctx, beat, t, assets, env) {
  const pal = s.palette(env);
  const u = s.unit(env);
  const safe = ctx.__safe;
  s.fill(ctx, env, pal.bg);
  grid(ctx, env, 0.1);
  ctx.save();
  ctx.globalAlpha = s.reveal(t, 0.1, 0.6);
  s.drawText(ctx, `CHAPTER ${String(beat.fields.number).padStart(2, '0')}`, {
    x: safe.x0 + 40 * u,
    y: env.height * 0.36,
    width: 700 * u,
    size: Math.round(36 * u),
    maxLines: 1,
    font: s.fonts(env).mono,
    color: pal.accent2,
  });
  s.drawText(ctx, beat.fields.title, {
    x: safe.x0 + 40 * u,
    y: env.height * 0.36 + 60 * u,
    width: safe.x1 - safe.x0 - 80 * u,
    size: Math.round(100 * u),
    minSize: Math.round(60 * u),
    maxLines: 2,
    font: s.fonts(env).display,
    color: pal.ink,
  });
  ctx.restore();
  ctx.strokeStyle = pal.accent;
  ctx.lineWidth = 4 * u;
  ctx.beginPath();
  ctx.arc(
    safe.x1 - 200 * u,
    env.height * 0.2,
    90 * u,
    -Math.PI / 2,
    -Math.PI / 2 + Math.PI * 2 * s.easeOut(t / 1.2),
  );
  ctx.stroke();
}

module.exports = { map, timeline, chapter };
