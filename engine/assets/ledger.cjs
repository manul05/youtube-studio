'use strict';

const fs = require('node:fs');
const { readJson, writeJson, sha256File } = require('../util/files.cjs');
const { readPrompts } = require('./prompts.cjs');

const ORIGIN = /^(agent-generated:[a-z0-9-]+|owner-supplied|legacy-antigravity)$/;

function readLedger(project) {
  const file = project.path('assets', 'ledger.json');
  return fs.existsSync(file) ? readJson(file) : { images: {}, stock: {} };
}

function writeLedger(project, ledger) {
  writeJson(project.path('assets', 'ledger.json'), ledger);
}

/** Record origin, prompt and hash for every present image that is not yet in the ledger. */
function recordImages(project, { origin }) {
  if (!ORIGIN.test(String(origin))) {
    throw new Error(
      'origin must be agent-generated:<agent> (e.g. agent-generated:antigravity), owner-supplied ' +
        'or legacy-antigravity.',
    );
  }
  const ledger = readLedger(project);
  let added = 0;
  for (const entry of readPrompts(project)) {
    const rel = `assets/images/${entry.file}`;
    if (!fs.existsSync(project.path(rel))) continue;
    const sha = sha256File(project.path(rel));
    const existing = ledger.images[entry.file];
    if (existing && existing.sha256 === sha) continue;
    ledger.images[entry.file] = { file: rel, origin, prompt: entry.prompt, sha256: sha };
    added += 1;
  }
  writeLedger(project, ledger);
  return added;
}

/** Every image and clip the plan uses must be recorded with its origin or licence. */
function ledgerIssues(project) {
  const plan = readJson(project.path('beats.json'));
  const ledger = readLedger(project);
  const issues = [];
  for (const beat of plan.beats) {
    if (beat.fields && beat.fields.imagePrompt) {
      const name = `img_${beat.id}.png`;
      const entry = ledger.images[name];
      const file = project.path('assets', 'images', name);
      if (!entry || !ORIGIN.test(entry.origin || '')) {
        issues.push(
          `${beat.id}: image has no ledger entry with its origin (npm run images:record).`,
        );
      } else if (fs.existsSync(file) && sha256File(file) !== entry.sha256) {
        issues.push(`${beat.id}: image changed since it was recorded (npm run images:record).`);
      }
    }
    if (beat.type === 'stock') {
      const clip = (ledger.stock || {})[beat.id];
      if (!clip) {
        issues.push(`${beat.id}: no stock clip picked (npm run stock:search, then stock:pick).`);
        continue;
      }
      const inSec = Number(beat.fields.inSec) || 0;
      const beatSec = beat.frames / plan.fps;
      if (clip.durationSec + 1e-6 < inSec + beatSec) {
        issues.push(
          `${beat.id}: clip too short (${clip.durationSec.toFixed(1)} s for a ` +
            `${beatSec.toFixed(1)} s beat starting at ${inSec} s into the clip).`,
        );
      }
      if (!clip.licence) issues.push(`${beat.id}: stock clip has no licence recorded.`);
    }
  }
  return issues;
}

module.exports = { readLedger, writeLedger, recordImages, ledgerIssues, ORIGIN };
