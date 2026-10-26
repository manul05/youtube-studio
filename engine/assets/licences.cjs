'use strict';

/**
 * Photo licences a monetised video may use: public domain, CC0, CC BY and CC BY-SA (with
 * credit), and the Pixabay Content License. Non-commercial (NC), no-derivatives (ND), "fair use"
 * and unknown licences are refused.
 */
function licenceAllowed(licence) {
  const l = String(licence || '')
    .trim()
    .toLowerCase();
  if (!l || /\bnc\b|\bnd\b|non-?commercial|no-?deriv|fair use/.test(l)) return false;
  return (
    /^cc0\b/.test(l) ||
    /public domain|^pd\b|^pd-/.test(l) ||
    /^cc[ -]by(-sa)?( \d(\.\d)?)?\b/.test(l) ||
    l === 'pixabay content license'
  );
}

/** CC BY and CC BY-SA always need a credit line. */
function needsCredit(licence) {
  return /^cc[ -]by/i.test(String(licence || '').trim());
}

module.exports = { licenceAllowed, needsCredit };
