#!/usr/bin/env node
'use strict';

/**
 * One-time builder for library/maps from Natural Earth GeoJSON (public domain).
 * Usage: node tools/build-maps.cjs <ne_10m_admin_0_countries_ind.geojson> <ne_10m_admin_1_states_provinces.geojson>
 * Uses the India point-of-view country file so India's outline follows India's official claims.
 */

const fs = require('node:fs');
const path = require('node:path');
const { simplify } = require('../engine/render/geo.cjs');
const { rootPath, writeJson } = require('../engine/util/files.cjs');

const round = (n) => Math.round(n * 1000) / 1000;

function simplifyGeometry(geometry, tolerance, minPoints = 4) {
  const ring = (r) => simplify(r, tolerance).map(([x, y]) => [round(x), round(y)]);
  const polygon = (p) => p.map(ring).filter((r) => r.length >= minPoints);
  if (geometry.type === 'Polygon')
    return { type: 'Polygon', coordinates: polygon(geometry.coordinates) };
  const parts = geometry.coordinates.map(polygon).filter((p) => p.length);
  return { type: 'MultiPolygon', coordinates: parts };
}

function main() {
  const [countriesFile, statesFile] = process.argv.slice(2);
  if (!countriesFile || !statesFile)
    throw new Error('Usage: node tools/build-maps.cjs <countries_ind> <states>');
  const countries = JSON.parse(fs.readFileSync(countriesFile, 'utf8'));
  const states = JSON.parse(fs.readFileSync(statesFile, 'utf8'));

  const world = {
    type: 'FeatureCollection',
    features: countries.features.map((f) => ({
      type: 'Feature',
      properties: { iso3: f.properties.ADM0_A3, name: f.properties.NAME },
      geometry: simplifyGeometry(f.geometry, 0.08),
    })),
  };
  const indiaOutline = countries.features.find((f) => f.properties.ADM0_A3 === 'IND');
  const india = {
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { kind: 'outline', name: 'India' },
        geometry: simplifyGeometry(indiaOutline.geometry, 0.01),
      },
      ...states.features
        .filter((f) => f.properties.adm0_a3 === 'IND')
        .map((f) => ({
          type: 'Feature',
          properties: { kind: 'state', name: f.properties.name },
          geometry: simplifyGeometry(f.geometry, 0.01),
        })),
    ],
  };
  const dir = rootPath('library', 'maps');
  writeJson(path.join(dir, 'world_countries.geojson'), world);
  writeJson(path.join(dir, 'india_states.geojson'), india);
  console.log(
    `world: ${world.features.length} countries; india: ${india.features.length - 1} states + outline`,
  );
}

main();
