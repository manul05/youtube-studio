'use strict';

const fs = require('node:fs');
const { rootPath, readJson } = require('../util/files.cjs');

/** Douglas–Peucker line simplification (tolerance in degrees). Keeps both end points. */
function simplify(points, tolerance) {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = points[a];
    const [bx, by] = points[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    let best = -1;
    let index = -1;
    for (let i = a + 1; i < b; i += 1) {
      // Distance to the chord a→b, or to point a when the chord has no length (closed rings).
      const d =
        len > 1e-12
          ? Math.abs(dy * points[i][0] - dx * points[i][1] + bx * ay - by * ax) / len
          : Math.hypot(points[i][0] - ax, points[i][1] - ay);
      if (d > best) {
        best = d;
        index = i;
      }
    }
    if (best > tolerance) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Outer rings and holes of a Polygon or MultiPolygon feature, as [[lon, lat], …] arrays. */
function rings(feature) {
  const g = feature.geometry;
  if (!g) return [];
  if (g.type === 'Polygon') return g.coordinates;
  if (g.type === 'MultiPolygon') return g.coordinates.flat();
  return [];
}

function bboxOf(collection) {
  const box = { minLon: Infinity, maxLon: -Infinity, minLat: Infinity, maxLat: -Infinity };
  const features = collection.features || [collection];
  for (const f of features) {
    for (const ring of rings(f)) {
      for (const [lon, lat] of ring) {
        box.minLon = Math.min(box.minLon, lon);
        box.maxLon = Math.max(box.maxLon, lon);
        box.minLat = Math.min(box.minLat, lat);
        box.maxLat = Math.max(box.maxLat, lat);
      }
    }
  }
  return box;
}

/**
 * Equirectangular projection, scaled by cos(mid latitude) so shapes keep their proportions,
 * fitted and centred inside a w×h box. Returns [x, y] in that box.
 */
function project(lon, lat, box, w, h) {
  const k = Math.cos((((box.minLat + box.maxLat) / 2) * Math.PI) / 180);
  const spanX = (box.maxLon - box.minLon) * k;
  const spanY = box.maxLat - box.minLat;
  const scale = Math.min(w / spanX, h / spanY);
  const offX = (w - spanX * scale) / 2;
  const offY = (h - spanY * scale) / 2;
  return [offX + (lon - box.minLon) * k * scale, offY + (box.maxLat - lat) * scale];
}

const cache = new Map();
/** Load library/maps/<name>.geojson (see library/maps/SOURCES.md for provenance). */
function loadGeo(name) {
  if (!/^[a-z0-9_]+$/.test(name)) throw new Error(`Invalid map name "${name}".`);
  if (!cache.has(name)) {
    const file = rootPath('library', 'maps', `${name}.geojson`);
    if (!fs.existsSync(file)) throw new Error(`Map data missing: library/maps/${name}.geojson`);
    cache.set(name, readJson(file));
  }
  return cache.get(name);
}

/** Trace a feature's rings as one canvas path using a projection function. */
function tracePath(ctx, feature, toXY) {
  ctx.beginPath();
  for (const ring of rings(feature)) {
    ring.forEach(([lon, lat], i) => {
      const [x, y] = toXY(lon, lat);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
  }
}

module.exports = { simplify, rings, bboxOf, project, loadGeo, tracePath };
