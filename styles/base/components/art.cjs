'use strict';

const s = require('./shared.cjs');

const MOVE_SEC = 0.5; // eased move between tour crops
const HOLD_PUSH = 0.04; // slow push-in while a crop holds

function artFocus(ctx, beat, t, assets, env) {
  const aspect = env.width / env.height;
  const full = s.cropFor(assets.image, [0, 0, 1, 1], aspect);
  const focus = s.cropFor(assets.image, beat.fields.focus, aspect);
  const p = s.easeInOut(t / env.duration);
  const [from, to] = beat.fields.reverse ? [focus, full] : [full, focus];
  s.drawCrop(ctx, assets.image, s.lerpCrop(from, to, p), env);
  s.vignette(ctx, env, 0.3);
  if (beat.illustration) s.illustrationTag(ctx, env);
}

function artTour(ctx, beat, t, assets, env) {
  const aspect = env.width / env.height;
  const crops = beat.fields.crops.map((c) => s.cropFor(assets.image, c, aspect));
  const share = env.duration / crops.length;
  const k = Math.min(crops.length - 1, Math.floor(t / share));
  const local = t - k * share;
  const from = k === 0 ? crops[0] : crops[k - 1];
  const moved = k === 0 ? 1 : s.easeInOut(local / MOVE_SEC);
  const crop = s.zoomCrop(s.lerpCrop(from, crops[k], moved), HOLD_PUSH * s.clamp(local / share));
  s.drawCrop(ctx, assets.image, crop, env);
  s.vignette(ctx, env, 0.3);
  if (beat.illustration) s.illustrationTag(ctx, env);
}

function stock(ctx, beat, t, assets, env) {
  const grade = env.style.meta.stockGrade || {};
  const pal = s.palette(env);
  if (assets.videoFrame) {
    ctx.save();
    ctx.filter =
      `saturate(${grade.saturate ?? 1}) contrast(${grade.contrast ?? 1}) ` +
      `brightness(${grade.brightness ?? 1})`;
    ctx.drawImage(assets.videoFrame, 0, 0, env.width, env.height);
    ctx.restore();
  } else {
    s.fill(ctx, env, pal.bg);
  }
  if (grade.tint && grade.tintAlpha) {
    ctx.save();
    ctx.globalAlpha = grade.tintAlpha;
    s.fill(ctx, env, grade.tint);
    ctx.restore();
  }
  s.vignette(ctx, env, grade.vignette || 0);
  s.grain(ctx, env, grade.grain || 0, t);
  if (beat.fields.lowerThird) {
    const u = s.unit(env);
    const safe = ctx.__safe;
    const a = s.reveal(t, 0.4);
    const y = safe.y1 - 120 * u;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = pal.accent;
    ctx.fillRect(safe.x0, y, 8 * u, 84 * u);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(safe.x0 + 8 * u, y, env.width * 0.42 * s.easeOut((t - 0.4) / 0.5), 84 * u);
    s.drawText(ctx, beat.fields.lowerThird, {
      x: safe.x0 + 32 * u,
      y: y + 20 * u,
      width: env.width * 0.4,
      size: Math.round(40 * u),
      maxLines: 1,
      font: s.fonts(env).display,
      color: '#ffffff', // always light: the bar is dark in every pack
    });
    ctx.restore();
  }
}

module.exports = { 'art-focus': artFocus, 'art-tour': artTour, stock };
