'use strict';

const DEVANAGARI = /\p{Script=Devanagari}/u;

function wrap(ctx, text, width) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    let current = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = current ? `${current} ${word}` : word;
      if (current && ctx.measureText(next).width > width) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    lines.push(current);
  }
  return lines;
}

/**
 * The only way components draw text. It wraps and shrinks text to fit `width` within
 * `maxLines` (down to `minSize`), switches to the Devanagari font when needed, records the
 * string in the frame's text audit log, and reports any corner outside the safe area (after
 * the current transform) as a layout issue.
 * Returns { height, size, lines }.
 */
function drawText(ctx, str, opts = {}) {
  const {
    x,
    y,
    width,
    maxLines = 3,
    size = 60,
    minSize = Math.round(size * 0.6),
    font = 'Sans',
    color = '#ffffff',
    align = 'left',
    leading = 1.18,
    safe = ctx.__safe,
  } = opts;
  const text = String(str);
  let family = font;
  if (DEVANAGARI.test(text)) family = /Bold/.test(font) ? 'DevaBold' : 'Deva';

  let px = size;
  let lines;
  for (;;) {
    ctx.font = `${px}px ${family}`;
    lines = wrap(ctx, text, width);
    const fits = lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= width);
    if (fits || px <= minSize) break;
    px = Math.max(minSize, px - 2);
  }
  if (lines.length > maxLines || lines.some((l) => ctx.measureText(l).width > width)) {
    ctx.__layoutIssues?.push(`Text cannot fit at ${minSize}px: "${text.slice(0, 60)}"`);
  }

  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'top';
  const lineHeight = px * leading;
  const m = ctx.getTransform();
  lines.forEach((line, i) => {
    const yy = Math.round(y + i * lineHeight);
    ctx.fillText(line, Math.round(x), yy);
    if (!safe) return;
    const w = ctx.measureText(line).width;
    const left = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x;
    const corners = [
      [left, yy],
      [left + w, yy],
      [left, yy + px],
      [left + w, yy + px],
    ].map(([cx, cy]) => ({ x: m.a * cx + m.c * cy + m.e, y: m.b * cx + m.d * cy + m.f }));
    if (corners.some((p) => p.x < safe.x0 || p.x > safe.x1 || p.y < safe.y0 || p.y > safe.y1)) {
      ctx.__layoutIssues?.push(`Text outside safe area: "${line.slice(0, 60)}"`);
    }
  });
  ctx.textAlign = 'left';
  ctx.__textLog?.add(text);
  return { height: lines.length * lineHeight, size: px, lines };
}

module.exports = { drawText, wrap };
