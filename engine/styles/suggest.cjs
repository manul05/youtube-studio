'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readJson } = require('../util/files.cjs');
const { styleDirs } = require('./loader.cjs');

/** Every pack folder with a style.json, with its settings and last check result. */
function listPacks() {
  const packs = new Map();
  for (const dir of styleDirs()) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const metaFile = path.join(dir, entry.name, 'style.json');
      if (!entry.isDirectory() || packs.has(entry.name) || !fs.existsSync(metaFile)) continue;
      const checkFile = path.join(dir, entry.name, 'check.json');
      packs.set(entry.name, {
        id: entry.name,
        dir: path.join(dir, entry.name),
        meta: readJson(metaFile),
        check: fs.existsSync(checkFile) ? readJson(checkFile) : null,
      });
    }
  }
  return [...packs.values()];
}

/**
 * Three main-style suggestions for a brief: packs that passed style:check, support the brief's
 * formats and are not accent-only, ranked by how many of their bestFor tags appear in the
 * topic, angle and audience.
 */
function suggestStyles(brief) {
  const text = [brief.topic, brief.angle, brief.audience].join(' ').toLowerCase();
  const formats = brief.formats && brief.formats.length ? brief.formats : ['long'];
  const candidates = listPacks().filter(
    (p) =>
      p.id !== 'base' &&
      p.meta.role !== 'accent' &&
      p.check &&
      p.check.passed &&
      formats.filter((f) => f === 'long').every((f) => (p.meta.formats || []).includes(f)),
  );
  const scored = candidates.map((p) => {
    const hits = (p.meta.bestFor || []).filter((tag) => text.includes(String(tag).toLowerCase()));
    return { id: p.id, name: p.meta.name, score: hits.length, hits };
  });
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return scored.slice(0, 3).map((p) => ({
    id: p.id,
    name: p.name,
    reason: p.hits.length ? `Fits: ${p.hits.join(', ')}` : 'General-purpose alternative',
  }));
}

module.exports = { suggestStyles, listPacks };
