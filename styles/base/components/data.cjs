'use strict';

const s = require('./shared.cjs');
const { loadGeo, bboxOf, project, tracePath } = require('../../../engine/render/geo.cjs');

const STEP_MAX = 2.5; // compare and list: a new item at least every 2.5 s
const TIMELINE_STEP_MAX = 3;

/** Reveal times for compare: the i-th point of each side appears together. */
function compareSchedule(fields, duration) {
  const n = Math.max(fields.left.points.length, fields.right.points.length);
  const step = Math.min(STEP_MAX, (duration * 0.75 - 0.6) / Math.max(1, n));
  return Array.from({ length: n }, (_, i) => 0.6 + i * step);
}

function timelineSchedule(events, duration) {
  const step = Math.min(TIMELINE_STEP_MAX, (duration - 1.5) / Math.max(1, events.length - 1));
  return events.map((_, i) => 0.5 + i * step);
}

function listSchedule(items, duration) {
  const step = Math.min(STEP_MAX, (duration * 0.75 - 0.4) / Math.max(1, items.length));
  return items.map((_, i) => 0.4 + i * step);
}

const fmtNumber = (n) => Math.round(n).toLocaleString('en-IN');

function heading(ctx, env, text, y) {
  const u = s.unit(env);
  const safe = ctx.__safe;
  s.drawText(ctx, text, {
    x: safe.x0 + 40 * u,
    y,
    width: safe.x1 - safe.x0 - 80 * u,
    size: Math.round(64 * u),
    minSize: Math.round(44 * u),
    maxLines: 2,
    font: s.fonts(env).display,
    color: s.palette(env).ink,
  });
}

function sourceLine(ctx, env, text) {
  const u = s.unit(env);
  const safe = ctx.__safe;
  s.drawText(ctx, `Source: ${text}`, {
    x: safe.x0 + 40 * u,
    y: safe.y1 - 60 * u,
    width: safe.x1 - safe.x0 - 80 * u,
    size: Math.round(30 * u),
    maxLines: 1,
    font: s.fonts(env).mono,
    color: s.palette(env).muted,
  });
}

function stat(ctx, beat, t, assets, env) {
  const { value, unit = '', label, source } = beat.fields;
  const pal = s.palette(env);
  const u = s.unit(env);
  const safe = ctx.__safe;
  s.fill(ctx, env, pal.bg);
  const shown = Number(value) * s.easeOut(t / 1.2);
  s.drawText(ctx, `${fmtNumber(shown)}${unit}`, {
    x: env.width / 2,
    y: env.height * 0.3,
    width: safe.x1 - safe.x0 - 80 * u,
    size: Math.round(200 * u),
    minSize: Math.round(110 * u),
    maxLines: 1,
    align: 'center',
    font: s.fonts(env).display,
    color: pal.accent,
  });
  ctx.save();
  ctx.globalAlpha = s.reveal(t, 0.6);
  s.drawText(ctx, label, {
    x: env.width / 2,
    y: env.height * 0.3 + 240 * u,
    width: (safe.x1 - safe.x0) * 0.8,
    size: Math.round(56 * u),
    minSize: Math.round(40 * u),
    maxLines: 2,
    align: 'center',
    font: s.fonts(env).body,
    color: pal.ink,
  });
  ctx.restore();
  ctx.__textLog.add(`${fmtNumber(Number(value))}${unit}`);
  sourceLine(ctx, env, source);
}

function compare(ctx, beat, t, assets, env) {
  const { left, right } = beat.fields;
  const pal = s.palette(env);
  const u = s.unit(env);
  const safe = ctx.__safe;
  s.fill(ctx, env, pal.bg);
  const times = compareSchedule(beat.fields, env.duration);
  const gap = 40 * u;
  const colW = (safe.x1 - safe.x0 - gap) / 2;
  [left, right].forEach((side, k) => {
    const x = safe.x0 + k * (colW + gap);
    ctx.globalAlpha = s.reveal(t, 0.1 + k * 0.15);
    ctx.fillStyle = k === 0 ? pal.surface : pal.surface;
    ctx.fillRect(x, safe.y0 + 40 * u, colW, safe.y1 - safe.y0 - 80 * u);
    ctx.fillStyle = k === 0 ? pal.accent2 : pal.accent;
    ctx.fillRect(x, safe.y0 + 40 * u, colW, 10 * u);
    s.drawText(ctx, side.title, {
      x: x + 40 * u,
      y: safe.y0 + 90 * u,
      width: colW - 80 * u,
      size: Math.round(60 * u),
      minSize: Math.round(40 * u),
      maxLines: 1,
      font: s.fonts(env).display,
      color: pal.ink,
    });
    ctx.globalAlpha = 1;
    side.points.forEach((point, i) => {
      const a = s.reveal(t, times[i] ?? 0);
      ctx.save();
      ctx.globalAlpha = a;
      s.drawText(ctx, point, {
        x: x + 40 * u + (1 - a) * 20 * u,
        y: safe.y0 + 220 * u + i * 150 * u,
        width: colW - 80 * u,
        size: Math.round(46 * u),
        minSize: Math.round(34 * u),
        maxLines: 2,
        font: s.fonts(env).body,
        color: pal.ink,
      });
      ctx.restore();
    });
  });
}

function timeline(ctx, beat, t, assets, env) {
  const events = beat.fields.events;
  const pal = s.palette(env);
  const u = s.unit(env);
  const safe = ctx.__safe;
  s.fill(ctx, env, pal.bg);
  const times = timelineSchedule(events, env.duration);
  const y = env.height * 0.45;
  const x0 = safe.x0 + 60 * u;
  const x1 = safe.x1 - 60 * u;
  const step = events.length > 1 ? (x1 - x0) / (events.length - 1) : 0;
  const progress =
    events.length > 1 ? s.clamp((t - times[0]) / (times[times.length - 1] - times[0] + 0.5)) : 1;
  ctx.fillStyle = pal.muted;
  ctx.fillRect(x0, y - 2 * u, x1 - x0, 4 * u);
  ctx.fillStyle = pal.accent;
  ctx.fillRect(x0, y - 3 * u, (x1 - x0) * progress, 6 * u);
  const colW = Math.min(420 * u, step || 600 * u);
  events.forEach((event, i) => {
    const a = s.reveal(t, times[i]);
    const x = x0 + i * step;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = pal.accent;
    ctx.beginPath();
    ctx.arc(x, y, 16 * u * a, 0, Math.PI * 2);
    ctx.fill();
    const above = i % 2 === 0;
    const labelX = Math.min(Math.max(x - colW / 2, safe.x0), safe.x1 - colW);
    s.drawText(ctx, event.date, {
      x: labelX,
      y: above ? y - 170 * u : y + 50 * u,
      width: colW,
      size: Math.round(34 * u),
      maxLines: 1,
      font: s.fonts(env).mono,
      color: pal.accent,
    });
    s.drawText(ctx, event.label, {
      x: labelX,
      y: above ? y - 120 * u : y + 100 * u,
      width: colW,
      size: Math.round(38 * u),
      minSize: Math.round(30 * u),
      maxLines: 2,
      font: s.fonts(env).body,
      color: pal.ink,
    });
    ctx.restore();
  });
}

function map(ctx, beat, t, assets, env) {
  const { region, highlight = [], pins = [], route = null } = beat.fields;
  const pal = s.palette(env);
  const u = s.unit(env);
  const safe = ctx.__safe;
  s.fill(ctx, env, pal.bg);
  const data = loadGeo(region === 'world' ? 'world_countries' : 'india_states');
  const box =
    region === 'world'
      ? { minLon: -170, maxLon: 180, minLat: -58, maxLat: 80 }
      : bboxOf(data.features.find((f) => f.properties.kind === 'outline'));
  const area = {
    x: safe.x0 + 20 * u,
    y: safe.y0 + 20 * u,
    w: safe.x1 - safe.x0 - 40 * u,
    h: safe.y1 - safe.y0 - 40 * u,
  };
  const toXY = (lon, lat) => {
    const [x, y] = project(lon, lat, box, area.w, area.h);
    return [area.x + x, area.y + y];
  };
  const isHighlighted = (f) =>
    highlight.includes(f.properties.name) || highlight.includes(f.properties.iso3);
  const glow = s.reveal(t, 0.5, 0.8);
  for (const f of data.features) {
    tracePath(ctx, f, toXY);
    if (f.properties.kind === 'outline') {
      ctx.fillStyle = pal.surface;
      ctx.fill('evenodd');
      continue;
    }
    ctx.fillStyle = region === 'world' ? pal.surface : 'rgba(0,0,0,0)';
    if (region === 'world') ctx.fill('evenodd');
    if (isHighlighted(f)) {
      ctx.save();
      ctx.globalAlpha = glow;
      ctx.fillStyle = pal.accent;
      ctx.fill('evenodd');
      ctx.restore();
    }
    ctx.strokeStyle = pal.muted;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = Math.max(1, 1.5 * u);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  if (route && route.length > 1) {
    const p = s.easeInOut((t - 0.8) / Math.max(1, env.duration * 0.5));
    const pts = route.map(([lon, lat]) => toXY(lon, lat));
    const total = pts
      .slice(1)
      .reduce((n, pt, i) => n + Math.hypot(pt[0] - pts[i][0], pt[1] - pts[i][1]), 0);
    let left = total * p;
    ctx.strokeStyle = pal.accent2;
    ctx.lineWidth = 7 * u;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(...pts[0]);
    for (let i = 1; i < pts.length && left > 0; i += 1) {
      const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      const f = Math.min(1, left / seg);
      ctx.lineTo(
        pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f,
        pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f,
      );
      left -= seg;
    }
    ctx.stroke();
  }
  const pinTimes = pins.map(
    (_, i) => 0.8 + i * Math.min(2.5, (env.duration * 0.7) / Math.max(1, pins.length)),
  );
  pins.forEach((pin, i) => {
    const a = s.reveal(t, pinTimes[i]);
    if (!a) return;
    const [x, y] = toXY(pin.lon, pin.lat);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = pal.accent;
    ctx.beginPath();
    ctx.arc(x, y, 14 * u, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = pal.ink;
    ctx.lineWidth = 3 * u;
    ctx.stroke();
    ctx.font = `${Math.round(34 * u)}px ${s.fonts(env).display}`;
    const labelW = Math.min(340 * u, ctx.measureText(pin.label).width) + 20 * u;
    const lx = x + 24 * u + labelW > safe.x1 ? x - 24 * u - labelW : x + 24 * u;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(lx - 10 * u, y - 26 * u, labelW, 52 * u);
    s.drawText(ctx, pin.label, {
      x: lx,
      y: y - 20 * u,
      width: 340 * u,
      size: Math.round(34 * u),
      maxLines: 1,
      font: s.fonts(env).display,
      color: pal.ink,
    });
    ctx.restore();
  });
}

function documentCard(ctx, beat, t, assets, env) {
  const { title, lines, highlight = [] } = beat.fields;
  const pal = s.palette(env);
  const u = s.unit(env);
  const safe = ctx.__safe;
  s.fill(ctx, env, pal.bg);
  const w = Math.min(1100 * u, safe.x1 - safe.x0);
  const x = (env.width - w) / 2;
  const top = safe.y0 + 30 * u;
  const h = safe.y1 - safe.y0 - 60 * u;
  const drop = (1 - s.reveal(t, 0, 0.6)) * 40 * u;
  ctx.fillStyle = '#f4f1e8';
  ctx.fillRect(x, top + drop, w, h);
  s.drawText(ctx, title, {
    x: x + 60 * u,
    y: top + drop + 50 * u,
    width: w - 120 * u,
    size: Math.round(52 * u),
    minSize: Math.round(36 * u),
    maxLines: 2,
    font: s.fonts(env).serif,
    color: '#1b1b1b',
  });
  const lineTimes = lines.map(
    (_, i) => 0.6 + i * Math.min(2.5, (env.duration * 0.7) / Math.max(1, lines.length)),
  );
  lines.forEach((line, i) => {
    const y = top + drop + 180 * u + i * 110 * u;
    if (highlight.includes(i)) {
      const p = s.easeOut((t - lineTimes[i]) / 0.8);
      ctx.fillStyle = 'rgba(255, 196, 0, 0.55)';
      ctx.fillRect(x + 50 * u, y - 8 * u, (w - 100 * u) * p, 64 * u);
    }
    s.drawText(ctx, line, {
      x: x + 60 * u,
      y,
      width: w - 120 * u,
      size: Math.round(40 * u),
      minSize: Math.round(30 * u),
      maxLines: 2,
      font: s.fonts(env).serif,
      color: '#2b2b2b',
    });
  });
  s.illustrationTag(ctx, env, 'RECREATED · ILLUSTRATION');
}

function list(ctx, beat, t, assets, env) {
  const items = beat.fields.items;
  const pal = s.palette(env);
  const u = s.unit(env);
  const safe = ctx.__safe;
  s.fill(ctx, env, pal.bg);
  const times = listSchedule(items, env.duration);
  const rowH = Math.min(180 * u, (safe.y1 - safe.y0 - 80 * u) / items.length);
  const top = (safe.y0 + safe.y1) / 2 - (rowH * items.length) / 2;
  items.forEach((item, i) => {
    const a = s.reveal(t, times[i]);
    ctx.save();
    ctx.globalAlpha = a;
    const y = top + i * rowH;
    ctx.fillStyle = pal.surface;
    ctx.fillRect(safe.x0 + 40 * u + (1 - a) * 40 * u, y, safe.x1 - safe.x0 - 80 * u, rowH - 24 * u);
    s.drawText(ctx, String(i + 1).padStart(2, '0'), {
      x: safe.x0 + 80 * u,
      y: y + rowH / 2 - 44 * u,
      width: 140 * u,
      size: Math.round(52 * u),
      maxLines: 1,
      font: s.fonts(env).mono,
      color: pal.accent,
    });
    s.drawText(ctx, item, {
      x: safe.x0 + 240 * u,
      y: y + rowH / 2 - 44 * u,
      width: safe.x1 - safe.x0 - 320 * u,
      size: Math.round(56 * u),
      minSize: Math.round(38 * u),
      maxLines: 1,
      font: s.fonts(env).display,
      color: pal.ink,
    });
    ctx.restore();
  });
}

function chart(ctx, beat, t, assets, env) {
  const { kind, series, source } = beat.fields;
  if (series.some((p) => !(Number(p.value) >= 0)))
    throw new Error('chart: values must be non-negative numbers.');
  const pal = s.palette(env);
  const u = s.unit(env);
  const safe = ctx.__safe;
  s.fill(ctx, env, pal.bg);
  const max = Math.max(...series.map((p) => Number(p.value)), 1);
  const left = safe.x0 + 80 * u;
  const right = safe.x1 - 80 * u;
  const bottom = safe.y1 - 140 * u;
  const top = safe.y0 + 80 * u;
  const slot = (right - left) / series.length;
  const grow = (i) => s.easeOut((t - 0.4 - i * 0.25) / 0.8);
  ctx.fillStyle = pal.muted;
  ctx.fillRect(left, bottom, right - left, 3 * u);
  if (kind === 'line') {
    ctx.strokeStyle = pal.accent;
    ctx.lineWidth = 8 * u;
    ctx.beginPath();
    series.forEach((p, i) => {
      const x = left + slot * (i + 0.5);
      const y = bottom - ((bottom - top) * Number(p.value) * grow(0)) / max;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  series.forEach((p, i) => {
    const x = left + slot * i;
    const h = ((bottom - top) * Number(p.value) * grow(i)) / max;
    if (kind !== 'line') {
      ctx.fillStyle = i === series.length - 1 ? pal.accent : pal.accent2;
      ctx.fillRect(x + slot * 0.18, bottom - h, slot * 0.64, h);
    }
    s.drawText(ctx, p.label, {
      x: x + slot / 2,
      y: bottom + 20 * u,
      width: slot * 0.9,
      size: Math.round(34 * u),
      maxLines: 1,
      align: 'center',
      font: s.fonts(env).body,
      color: pal.ink,
    });
    if (grow(i) > 0.95) {
      s.drawText(ctx, fmtNumber(Number(p.value)), {
        x: x + slot / 2,
        y: bottom - h - 60 * u,
        width: slot * 0.9,
        size: Math.round(40 * u),
        maxLines: 1,
        align: 'center',
        font: s.fonts(env).display,
        color: pal.ink,
      });
    }
  });
  sourceLine(ctx, env, source);
}

module.exports = {
  stat,
  compare,
  timeline,
  map,
  document: documentCard,
  list,
  chart,
  compareSchedule,
  timelineSchedule,
  listSchedule,
  heading,
};
