'use strict';

const { PRESENTER_MODES } = require('../steps.cjs');

const LANGUAGES = ['en', 'hi', 'hinglish'];
const SCRIPTS = ['latin', 'deva'];
const FORMATS = ['long', 'short'];
const TITLE_MAX = 60;
const THUMB_MAX_WORDS = 4;

const words = (text) => String(text).split(/\s+/).filter(Boolean);
const same = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

function briefIssues(brief) {
  const issues = [];
  for (const field of ['topic', 'angle', 'audience', 'promise', 'hook', 'channel']) {
    if (!String(brief[field] || '').trim()) issues.push(`brief.${field} is empty.`);
  }
  if (!LANGUAGES.includes(brief.language)) {
    issues.push(`brief.language must be one of ${LANGUAGES.join(', ')}.`);
  }
  if (!SCRIPTS.includes(brief.captionScript)) {
    issues.push(`brief.captionScript must be one of ${SCRIPTS.join(', ')}.`);
  }
  if (!(brief.lengthTargetMin > 0)) issues.push('brief.lengthTargetMin must be a positive number.');

  const titles = brief.titles || [];
  if (titles.length !== 3) issues.push('brief.titles needs exactly 3 title options.');
  titles.forEach((title, i) => {
    if (!String(title).trim()) issues.push(`Title ${i + 1} is empty.`);
    if (String(title).length > TITLE_MAX) {
      issues.push(`Title ${i + 1} is ${String(title).length} characters (max ${TITLE_MAX}).`);
    }
  });

  const thumbs = brief.thumbTexts || [];
  if (thumbs.length !== 3) issues.push('brief.thumbTexts needs exactly 3 thumbnail texts.');
  thumbs.forEach((text, i) => {
    const n = words(text).length;
    if (!n) issues.push(`Thumbnail text ${i + 1} is empty.`);
    if (n > THUMB_MAX_WORDS) {
      issues.push(`Thumbnail text ${i + 1} has ${n} words (max ${THUMB_MAX_WORDS}).`);
    }
    if (titles.some((title) => same(title, text))) {
      issues.push(`Thumbnail text ${i + 1} is the same as a title; make it add something.`);
    }
  });

  if (!brief.style || !String(brief.style.main || '').trim()) {
    issues.push('brief.style.main must name the main style pack.');
  }
  const accents = Object.keys((brief.style && brief.style.accents) || {});
  if (accents.length > 2)
    issues.push(`At most 2 accent styles are allowed (found ${accents.length}).`);

  const formats = brief.formats || [];
  if (!formats.length || formats.some((f) => !FORMATS.includes(f))) {
    issues.push(`brief.formats must list ${FORMATS.join(' and/or ')}.`);
  }
  const mode = brief.presenter && brief.presenter.mode;
  if (brief.presenter !== undefined && !PRESENTER_MODES.includes(mode)) {
    issues.push(`brief.presenter.mode must be one of ${PRESENTER_MODES.join(', ')}.`);
  }
  return issues;
}

module.exports = { briefIssues, LANGUAGES, TITLE_MAX };
