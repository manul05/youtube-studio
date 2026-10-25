'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { aggregateScores } = require('../engine/score/aggregate.cjs');
const { requestReview } = require('../engine/score/ai-review.cjs');
const { RateLimited } = require('../engine/voice/gemini.cjs');

const allAi = (score) =>
  Object.fromEntries(['A', 'B', 'C', 'F', 'G', 'I'].map((c) => [c, { score, reasons: [] }]));
const owner = (overrides = {}) => ({
  A: 'Excellent',
  BG: 'Excellent',
  D: 'Excellent',
  F: 'Excellent',
  I: 'Excellent',
  ...overrides,
});
const cleanQc = { hardFails: [], issues: [], shorts: {} };

test('AI 96 everywhere, owner Excellent, clean QC gives 97 (code-only categories full) and releasable', () => {
  const s = aggregateScores({ ai: { categories: allAi(96) }, owner: owner(), qcReport: cleanQc });
  assert.equal(s.total, 97);
  assert.equal(s.releasable, true);
});

test('the owner rating caps a category: Good is 90% even when the AI gives 100', () => {
  const s = aggregateScores({
    ai: { categories: allAi(100) },
    owner: owner({ F: 'Good' }),
    qcReport: cleanQc,
  });
  assert.equal(s.categories.F.fraction, 0.9);
});

test('an OK rating for interest drops both story and pacing below the floor', () => {
  const s = aggregateScores({
    ai: { categories: allAi(100) },
    owner: owner({ BG: 'OK' }),
    qcReport: cleanQc,
  });
  assert.deepEqual(s.floorsFailed.sort(), ['B', 'G']);
  assert.equal(s.releasable, false);
});

test('one hard failure caps the total at 59', () => {
  const qcReport = {
    ...cleanQc,
    hardFails: [{ category: 'J', hard: true, message: 'Debug text' }],
  };
  const s = aggregateScores({ ai: { categories: allAi(100) }, owner: owner(), qcReport });
  assert.equal(s.total, 59);
  assert.equal(s.releasable, false);
});

test('a missing owner rating scores zero rather than passing', () => {
  const s = aggregateScores({ ai: { categories: allAi(100) }, owner: null, qcReport: cleanQc });
  assert.equal(s.categories.D.fraction, 0);
  assert.equal(s.releasable, false);
});

test('a weak Short is dropped while the long video stays releasable', () => {
  const s = aggregateScores({
    ai: {
      categories: allAi(97),
      shorts: { s1: { categories: { ...allAi(97), A: { score: 70, reasons: [] } } } },
    },
    owner: {
      ...owner(),
      shorts: { s1: { A: 'Excellent', BG: 'Excellent', D: 'Excellent', F: 'Excellent' } },
    },
    qcReport: { ...cleanQc, shorts: { s1: { hardFails: [], issues: [], metrics: {} } } },
  });
  assert.equal(s.releasable, true);
  assert.deepEqual(
    s.droppedShorts.map((d) => d.id),
    ['s1'],
  );
});

test('a review response that does not match the schema is refused', async () => {
  const fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: '{"categories":{"A":{"score":"great"}}}' }] } }],
    }),
  });
  await assert.rejects(
    () =>
      requestReview({ parts: [{ text: 'x' }], categories: ['A'], fetch, apiKey: 'k', model: 'm' }),
    /schema/,
  );
});

test('a rate-limited review reports RateLimited so the command can exit 75', async () => {
  const fetch = async () => ({ ok: false, status: 429, headers: new Map(), text: async () => '' });
  await assert.rejects(
    () =>
      requestReview({ parts: [{ text: 'x' }], categories: ['A'], fetch, apiKey: 'k', model: 'm' }),
    (err) => err instanceof RateLimited,
  );
});
