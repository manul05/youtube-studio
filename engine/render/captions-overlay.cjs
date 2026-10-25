'use strict';

const { drawText } = require('./text.cjs');

const canon = (w) =>
  String(w)
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]/gu, '');

/**
 * Burned-in captions for Shorts: the current cue in a dark box at the bottom of the safe area,
 * with the word being spoken in the highlight colour. `t` is seconds from the start of the Short.
 */
function drawCaptions(ctx, cues, t, style, env) {
  const cue = cues.find((c) => t >= c.start && t < c.end);
  if (!cue) return;
  const cs = style.meta.captionStyle || {};
  const u = env.width / 760;
  const size = Math.round((cs.size || 64) * u * 0.8);
  const lineHeight = size * 1.2;
  const safe = ctx.__safe;
  const width = safe.x1 - safe.x0 - 40 * u;
  const height = cue.lines.length * lineHeight + 30 * u;
  const top = safe.y1 - height - 10 * u;
  ctx.save();
  ctx.fillStyle = cs.bg || 'rgba(0,0,0,0.75)';
  ctx.fillRect(safe.x0, top, safe.x1 - safe.x0, height);
  const spoken = (cue.tokens || []).filter((w) => t >= w.start).pop();
  const font = 'SansBold';
  cue.lines.forEach((line, i) => {
    const y = top + 15 * u + i * lineHeight;
    const drawn = drawText(ctx, line, {
      x: env.width / 2,
      y,
      width,
      size,
      minSize: Math.round(size * 0.55),
      maxLines: 1,
      align: 'center',
      font,
      color: cs.ink || '#ffffff',
    });
    if (!spoken) return;
    // Over-paint the word being spoken in the highlight colour.
    const words = line.split(' ');
    const k = words.findIndex((w) => canon(w) === canon(spoken.text));
    if (k < 0) return;
    ctx.font = `${drawn.size}px ${/\p{Script=Devanagari}/u.test(line) ? 'DevaBold' : font}`;
    const full = ctx.measureText(line).width;
    const before = ctx.measureText(words.slice(0, k).join(' ') + (k ? ' ' : '')).width;
    ctx.fillStyle = cs.highlight || '#ffcc00';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(words[k], env.width / 2 - full / 2 + before, Math.round(y));
  });
  ctx.restore();
}

module.exports = { drawCaptions };
