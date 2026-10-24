'use strict';

// Editorial: newspaper section headers and a big figure with ruled lines.
const s = require('../base/components/shared.cjs');
const base = require('../base/components/index.cjs');

function rules(ctx, env, y, width) {
  const u = s.unit(env);
  ctx.fillStyle = s.palette(env).ink;
  ctx.fillRect(ctx.__safe.x0 + 40 * u, y, width, 4 * u);
  ctx.fillRect(ctx.__safe.x0 + 40 * u, y + 10 * u, width, 1.5 * u);
}

function chapter(ctx, beat, t, assets, env) {
  const pal = s.palette(env);
  const u = s.unit(env);
  const safe = ctx.__safe;
  s.fill(ctx, env, pal.bg);
  rules(ctx, env, env.height * 0.32, (safe.x1 - safe.x0 - 80 * u) * s.easeOut(t / 0.7));
  ctx.save();
  ctx.globalAlpha = s.reveal(t, 0.15, 0.5);
  s.drawText(ctx, `PART ${beat.fields.number}`, {
    x: safe.x0 + 40 * u,
    y: env.height * 0.32 + 40 * u,
    width: 600 * u,
    size: Math.round(34 * u),
    maxLines: 1,
    font: s.fonts(env).mono,
    color: pal.accent,
  });
  s.drawText(ctx, beat.fields.title, {
    x: safe.x0 + 40 * u,
    y: env.height * 0.32 + 100 * u,
    width: safe.x1 - safe.x0 - 80 * u,
    size: Math.round(104 * u),
    minSize: Math.round(60 * u),
    maxLines: 2,
    font: s.fonts(env).display,
    color: pal.ink,
  });
  ctx.restore();
}

function stat(ctx, beat, t, assets, env) {
  base.stat(ctx, beat, t, assets, env);
  const u = s.unit(env);
  const safe = ctx.__safe;
  rules(ctx, env, env.height * 0.24, (safe.x1 - safe.x0 - 80 * u) * s.easeOut(t / 0.8));
}

module.exports = { chapter, stat };
