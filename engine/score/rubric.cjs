'use strict';

/** Rubric categories and weights (design §9 and §9.5). */
const NAMES = {
  A: 'Hook and first seconds',
  B: 'Story and script',
  C: 'Facts and safety',
  D: 'Voice',
  E: 'Audio mix',
  F: 'Visual quality and style coherence',
  G: 'Pacing and motion',
  H: 'Captions and readability',
  I: 'Packaging',
  J: 'Technical delivery',
};

const RUBRIC = {
  long: { A: 10, B: 15, C: 10, D: 10, E: 5, F: 15, G: 15, H: 5, I: 10, J: 5 },
  short: { A: 20, B: 15, C: 10, D: 10, E: 5, F: 15, G: 15, H: 5, J: 5 },
};

/** Categories the independent AI review scores (it sees frames and text, not sound). */
const AI_CATEGORIES = { long: ['A', 'B', 'C', 'F', 'G', 'I'], short: ['A', 'B', 'C', 'F', 'G'] };
/** Categories only code measures. */
const CODE_ONLY = ['E', 'H', 'J'];
/** Owner questions → categories. "BG" (interest throughout) feeds both story and pacing. */
const OWNER_MAP = { A: ['A'], BG: ['B', 'G'], D: ['D'], F: ['F'], I: ['I'] };
const LEVELS = { Excellent: 1, Good: 0.9, OK: 0.75, Weak: 0.5, Bad: 0 };

/** Category names for a presenter mode: with the owner's own voice, D judges their delivery. */
function namesFor(mode = 'ai') {
  return mode === 'ai' ? NAMES : { ...NAMES, D: 'Delivery' };
}

module.exports = { NAMES, namesFor, RUBRIC, AI_CATEGORIES, CODE_ONLY, OWNER_MAP, LEVELS };
