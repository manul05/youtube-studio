'use strict';

// Minimal test components: a flat colour that brightens over the beat, plus one line of text.
const { drawText } = require('../../../../engine/render/text.cjs');

function flat(ctx, beat, t, assets, env) {
  const p = Math.min(1, t / Math.max(0.001, env.duration));
  const shade = Math.round(30 + 120 * p);
  ctx.fillStyle = `rgb(${shade}, 40, 60)`;
  ctx.fillRect(0, 0, env.width, env.height);
  if (beat.fields.text) {
    drawText(ctx, beat.fields.text, {
      x: env.width * 0.1,
      y: env.height * 0.4,
      width: env.width * 0.8,
      size: 64,
      font: 'SansBold',
      color: '#ffffff',
    });
  }
}

/** Deliberately draws text in the unsafe bottom strip, to test layout failures. */
function unsafe(ctx, beat, t, assets, env) {
  flat(ctx, beat, t, assets, env);
  drawText(ctx, 'Too low', { x: 100, y: env.height - 40, width: 400, size: 30 });
}

module.exports = { 'art-focus': flat, kinetic: flat, endcard: flat, chapter: flat, list: unsafe };
