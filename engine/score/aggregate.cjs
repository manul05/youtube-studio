'use strict';

const fs = require('node:fs');
const { readJson, writeJson } = require('../util/files.cjs');
const { RUBRIC, AI_CATEGORIES, CODE_ONLY, OWNER_MAP, LEVELS, NAMES } = require('./rubric.cjs');

/** The release bar from the design (§9). Fixed in code so an edited config file cannot lower it. */
const RELEASE_BAR = Object.freeze({ releaseMin: 95, categoryFloor: 0.8, hardFailCap: 59 });

const round1 = (x) => Math.round(x * 10) / 10;

/** Owner levels as fractions per category (BG feeds B and G). */
function ownerFractions(owner) {
  const out = {};
  if (!owner) return out;
  for (const [question, categories] of Object.entries(OWNER_MAP)) {
    if (owner[question] in LEVELS) for (const c of categories) out[c] = LEVELS[owner[question]];
  }
  return out;
}

/**
 * Score one video. Each category's fraction is the lowest of its available sources: the AI
 * review, the owner's rating, and — for any category with a blocking QC finding — zero.
 * Categories only code measures score 1 when QC found nothing in them. A subjective category
 * with no AI or owner score yet scores 0 (it cannot pass by being unreviewed).
 */
function scoreOne({ kind, ai, owner, qcFindings }) {
  const limits = RELEASE_BAR;
  const weights = RUBRIC[kind];
  const ownerScores = ownerFractions(owner);
  const blocked = new Set(qcFindings.map((f) => f.category));
  const categories = {};
  const explanation = [];
  for (const [c, weight] of Object.entries(weights)) {
    const sources = {};
    let fraction;
    if (CODE_ONLY.includes(c)) {
      fraction = blocked.has(c) ? 0 : 1;
      sources.measured = fraction;
    } else {
      const values = [];
      if (AI_CATEGORIES[kind].includes(c) && ai && ai[c] && Number.isFinite(ai[c].score)) {
        sources.ai = ai[c].score / 100;
        values.push(sources.ai);
      }
      if (c in ownerScores) {
        sources.owner = ownerScores[c];
        values.push(sources.owner);
      }
      if (blocked.has(c)) {
        sources.measured = 0;
        values.push(0);
      }
      fraction = values.length ? Math.min(...values) : 0;
      if (!values.length) explanation.push(`${c} (${NAMES[c]}) has no review yet.`);
    }
    categories[c] = { fraction, points: round1(weight * fraction), weight, sources };
  }
  const hardFails = qcFindings.filter((f) => f.hard);
  let total = round1(Object.values(categories).reduce((n, x) => n + x.points, 0));
  if (hardFails.length) {
    total = Math.min(total, limits.hardFailCap);
    explanation.push(`${hardFails.length} hard failure(s): score capped at ${limits.hardFailCap}.`);
  }
  const floorsFailed = Object.keys(categories).filter(
    (c) => categories[c].fraction < limits.categoryFloor,
  );
  for (const c of floorsFailed)
    explanation.push(`${c} (${NAMES[c]}) is below ${limits.categoryFloor * 100}%.`);
  const releasable = total >= limits.releaseMin && !floorsFailed.length && !hardFails.length;
  return { total, categories, hardFails, floorsFailed, releasable, explanation };
}

/** Score the long-form video and each Short; weak Shorts are dropped, not blocking. */
function aggregateScores({ ai, owner, qcReport }) {
  const longFindings = [...qcReport.hardFails, ...qcReport.issues];
  const result = scoreOne({
    kind: 'long',
    ai: ai && ai.categories,
    owner,
    qcFindings: longFindings,
  });
  const shorts = {};
  const droppedShorts = [];
  for (const [id, sqc] of Object.entries(qcReport.shorts || {})) {
    const s = scoreOne({
      kind: 'short',
      ai: ai && ai.shorts && ai.shorts[id] && ai.shorts[id].categories,
      owner: owner && owner.shorts && owner.shorts[id],
      qcFindings: [...sqc.hardFails, ...sqc.issues],
    });
    shorts[id] = s;
    if (!s.releasable) droppedShorts.push({ id, total: s.total, reasons: s.explanation });
  }
  return { ...result, shorts, droppedShorts };
}

/** Ratings count only when saved through the review server (signed); release checks the signature. */
const signedOrNull = (owner) => (owner && owner.sig ? owner : null);

/** Read ai.json, owner.json and qc.json and write outputs/score/score.json. */
function aggregate(project) {
  const read = (...p) => (fs.existsSync(project.path(...p)) ? readJson(project.path(...p)) : null);
  const qcReport = read('outputs', 'qc', 'qc.json');
  if (!qcReport) throw new Error('Run npm run qc first.');
  const score = aggregateScores({
    ai: read('outputs', 'score', 'ai.json'),
    owner: signedOrNull(read('outputs', 'score', 'owner.json')),
    qcReport,
  });
  // No timestamp: re-scoring unchanged inputs must not void the stop-5 approval.
  writeJson(project.path('outputs', 'score', 'score.json'), score);
  return score;
}

module.exports = { aggregateScores, aggregate, scoreOne, RELEASE_BAR };
