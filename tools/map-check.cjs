#!/usr/bin/env node
'use strict';

/**
 * Render the India map exactly as videos draw it, once per main style, into library/maps/ so
 * the owner can compare it with the official Survey of India map before the first map video.
 * Usage: npm run maps:check
 */

const fs = require('node:fs');
const path = require('node:path');
const { createFrameCanvas } = require('../engine/render/context.cjs');
const { loadStyle } = require('../engine/styles/loader.cjs');
const { rootPath } = require('../engine/util/files.cjs');

const STYLES = ['map-doc', 'editorial', 'evidence'];

function renderMapCheck(outDir = rootPath('library', 'maps')) {
  fs.mkdirSync(outDir, { recursive: true });
  const files = [];
  for (const id of STYLES) {
    const style = loadStyle(id);
    const beat = {
      id: 'mapcheck',
      type: 'map',
      fields: { region: 'india', highlight: [], pins: [] },
      illustration: false,
    };
    const env = { width: 1920, height: 1080, format: 'long', fps: 30, style, beat, duration: 6 };
    env.words = [];
    const { canvas, ctx } = createFrameCanvas(1920, 1080, 'long');
    const draw = style.components.map || loadStyle('base').components.map;
    draw(ctx, beat, 6, {}, env);
    const file = path.join(outDir, `india_check_${id}.png`);
    fs.writeFileSync(file, canvas.toBuffer('image/png'));
    files.push(file);
  }
  return files;
}

if (require.main === module) {
  for (const file of renderMapCheck()) console.log(`Wrote ${file}`);
  console.log(
    'Compare these with the official Survey of India political map (surveyofindia.gov.in). ' +
      'If they match, write your name and date on the "Owner confirmation" line in library/maps/SOURCES.md.',
  );
}

module.exports = { renderMapCheck };
