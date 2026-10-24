'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { rootPath, readJson } = require('../util/files.cjs');

const PACK_ID = /^[a-z0-9][a-z0-9-]*$/;
const cache = new Map();

/** Folders searched for style packs: STUDIO_STYLES_DIRS (tests, experiments), then styles/. */
function styleDirs() {
  const extra = (process.env.STUDIO_STYLES_DIRS || '').split(path.delimiter).filter(Boolean);
  return [...extra, rootPath('styles')];
}

function packDir(id) {
  if (!PACK_ID.test(String(id))) throw new Error(`Invalid style pack id "${id}".`);
  for (const dir of styleDirs()) {
    const candidate = path.join(dir, id);
    if (fs.existsSync(path.join(candidate, 'style.json'))) return candidate;
  }
  throw new Error(`Style pack "${id}" not found (looked in ${styleDirs().join(', ')}).`);
}

function packExists(id) {
  try {
    packDir(id);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load a pack: its style.json plus its components, layered over the base pack's components so
 * any beat type a pack does not override falls back to the base drawing.
 */
function loadStyle(id) {
  if (cache.has(id)) return cache.get(id);
  const dir = packDir(id);
  const meta = readJson(path.join(dir, 'style.json'));
  const components = id !== 'base' && packExists('base') ? { ...loadStyle('base').components } : {};
  const own = path.join(dir, 'components.cjs');
  if (fs.existsSync(own)) Object.assign(components, require(own));
  const style = { id, dir, meta, components };
  cache.set(id, style);
  return style;
}

/**
 * The pack that draws each beat type for this brief. An accent pack keeps its own drawing but
 * takes the main pack's palette and caption style, so a mixed video stays coherent.
 */
function resolveStyle(brief) {
  const main = loadStyle(brief.style.main);
  const accents = brief.style.accents || {};
  return (beatType) => {
    const accentId = accents[beatType];
    if (!accentId) return main;
    const accent = loadStyle(accentId);
    return {
      ...accent,
      meta: { ...accent.meta, palette: main.meta.palette, captionStyle: main.meta.captionStyle },
    };
  };
}

/**
 * The pack recorded on a compiled beat. When it is an accent (not the main pack), it takes the
 * main pack's palette and caption style.
 */
function styleForBeat(beat, brief) {
  const style = loadStyle(beat.style);
  const main = brief && brief.style && brief.style.main;
  if (!main || main === beat.style || !packExists(main)) return style;
  const mainStyle = loadStyle(main);
  return {
    ...style,
    meta: {
      ...style.meta,
      palette: mainStyle.meta.palette,
      captionStyle: mainStyle.meta.captionStyle,
    },
  };
}

module.exports = { loadStyle, resolveStyle, styleForBeat, packDir, packExists, styleDirs };
