'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { sha256File, sha256Text, readJson, writeJson } = require('./util/files.cjs');

/** Expand one project-relative pattern into sorted relative file paths (files only). */
function expand(project, pattern) {
  const recursive = pattern.endsWith('/**');
  const clean = recursive ? pattern.slice(0, -3) : pattern;
  const slash = clean.lastIndexOf('/');
  const dirRel = recursive ? clean : slash >= 0 ? clean.slice(0, slash) : '';
  const last = recursive ? '*' : clean.slice(slash + 1);
  if (!recursive && !last.includes('*')) return [clean];

  const dirAbs = project.path(dirRel);
  if (!fs.existsSync(dirAbs)) return [];
  const matcher = new RegExp(`^${last.split('*').map(escapeRegex).join('.*')}$`);
  const found = [];
  const walk = (absDir, relDir) => {
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (recursive) walk(path.join(absDir, entry.name), rel);
      } else if (recursive || matcher.test(entry.name)) {
        found.push(rel);
      }
    }
  };
  walk(dirAbs, dirRel);
  return found.sort();
}

function escapeRegex(text) {
  return text.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Hash files with a per-project cache keyed by size and modification time, so large media
 * (a 900 MB master) is not re-read on every `next` call. The cache is only a speed hint for
 * routing: anything that grants trust (writing or verifying approvals, release) passes
 * { useCache: false } so every file is read by content.
 */
function hasher(project, { useCache = true } = {}) {
  const cacheFile = project.path('work', 'stamps', '.hashcache.json');
  let cache = {};
  if (useCache) {
    try {
      cache = readJson(cacheFile);
    } catch {
      cache = {};
    }
  }
  let dirty = false;
  const hash = (rel) => {
    const abs = project.path(rel);
    if (!fs.existsSync(abs)) return 'missing';
    const stat = fs.statSync(abs);
    const key = `${stat.size}:${stat.mtimeMs}`;
    if (cache[rel] && cache[rel].key === key) return cache[rel].sha;
    const sha = sha256File(abs);
    cache[rel] = { key, sha };
    dirty = true;
    return sha;
  };
  const save = () => {
    if (dirty && useCache) writeJson(cacheFile, cache);
  };
  return { hash, save };
}

/** Map of relative path → sha for every file the patterns cover. */
function hashPatterns(project, patterns, h) {
  const out = {};
  for (const pattern of patterns) {
    for (const rel of expand(project, pattern)) out[rel] = h.hash(rel);
  }
  return out;
}

function digest(map) {
  return sha256Text(
    Object.keys(map)
      .sort()
      .map((k) => `${k}\n${map[k]}`)
      .join('\n'),
  );
}

function stampFile(project, stepId) {
  return project.path('work', 'stamps', `${stepId}.json`);
}

function approvalFile(project, gateId) {
  return project.path('approvals', `${gateId.replace(':', '_')}.json`);
}

module.exports = { expand, hasher, hashPatterns, digest, stampFile, approvalFile };
