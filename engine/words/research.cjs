'use strict';

const { sentences, wordRegex } = require('./text.cjs');

const STATUSES = ['verified', 'attributed', 'disputed', 'removed', 'unverified'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const RELATIVE_EN = [
  'today',
  'yesterday',
  'tomorrow',
  'last week',
  'this week',
  'next week',
  'last month',
  'this month',
  'recently',
];
const RELATIVE_HI = ['आज', 'कल', 'परसों', 'पिछले हफ्ते', 'इस हफ्ते', 'पिछले महीने', 'हाल ही में'];

/** Problems inside research.json itself (run at the research step). */
function ledgerIssues(research) {
  const issues = [];
  const sourceIds = new Set();
  for (const s of research.sources || []) {
    if (sourceIds.has(s.id)) issues.push(`Source ${s.id} is listed twice.`);
    sourceIds.add(s.id);
    if (!/^https?:\/\//.test(s.url || '')) issues.push(`Source ${s.id} needs a full URL.`);
    if (!s.publisher) issues.push(`Source ${s.id} needs a publisher.`);
    if (!DATE.test(s.published || ''))
      issues.push(`Source ${s.id} needs a published date (YYYY-MM-DD).`);
    if (!DATE.test(s.accessed || ''))
      issues.push(`Source ${s.id} needs an accessed date (YYYY-MM-DD).`);
    if (!s.excerpt) issues.push(`Source ${s.id} needs a short supporting excerpt.`);
  }
  const claimIds = new Set();
  for (const c of research.claims || []) {
    if (claimIds.has(c.id)) issues.push(`Claim ${c.id} is listed twice.`);
    claimIds.add(c.id);
    if (!STATUSES.includes(c.status)) {
      issues.push(`Claim ${c.id} has unknown status "${c.status}" (use ${STATUSES.join(', ')}).`);
    }
    if (c.status === 'unverified') {
      issues.push(`Claim ${c.id} is still unverified; check it against its source or remove it.`);
    }
    const sources = c.sources || [];
    if (c.status !== 'removed' && !sources.length) issues.push(`Claim ${c.id} cites no source.`);
    for (const id of sources) {
      if (!sourceIds.has(id)) issues.push(`Claim ${c.id} cites unknown source ${id}.`);
    }
    if (c.contested && c.status !== 'removed' && sources.length < 2) {
      issues.push(
        `Claim ${c.id} is contested and needs at least 2 sources (has ${sources.length}).`,
      );
    }
  }
  return issues;
}

function relativeDates(spoken) {
  const found = [];
  for (const phrase of RELATIVE_EN) {
    if (wordRegex(phrase, 'iu').test(spoken)) found.push(phrase);
  }
  for (const phrase of RELATIVE_HI) {
    if (wordRegex(phrase, 'u').test(spoken)) found.push(phrase);
  }
  return found;
}

/** Ledger problems plus every script sentence's tag, claim and date problems. */
function researchIssues(script, research) {
  const issues = ledgerIssues(research);
  const claims = new Map((research.claims || []).map((c) => [c.id, c]));
  for (const chapter of script.chapters || []) {
    for (const paragraph of chapter.paragraphs || []) {
      for (const s of sentences(paragraph.text, paragraph.id)) {
        if (!s.tags.length) {
          issues.push(`${s.id}: sentence has no [[claim]] or [[analysis]] tag: "${s.spoken}"`);
        }
        for (const tag of s.tags) {
          if (tag === 'analysis') continue;
          const claim = claims.get(tag);
          if (!claim) issues.push(`${s.id}: cites unknown claim ${tag}.`);
          else if (claim.status === 'removed') issues.push(`${s.id}: cites removed claim ${tag}.`);
        }
        for (const phrase of relativeDates(s.spoken)) {
          issues.push(`${s.id}: relative date "${phrase}" — use an absolute date instead.`);
        }
      }
    }
  }
  return issues;
}

module.exports = { STATUSES, ledgerIssues, researchIssues, relativeDates };
