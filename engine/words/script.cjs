'use strict';

const { sentences, spokenText, wordCount } = require('./text.cjs');

const DEFAULT_WPM = 155;
const LENGTH_TOLERANCE = 0.15;
const SHORT_MIN = 30;
const SHORT_MAX = 59;
const PARAGRAPH_ID = /^c\d{2}p\d{2}$/;

function allSentences(script) {
  const out = [];
  for (const chapter of script.chapters || []) {
    for (const paragraph of chapter.paragraphs || []) {
      out.push(...sentences(paragraph.text, paragraph.id));
    }
  }
  return out;
}

const seconds = (words, wpm) => (words / wpm) * 60;
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

/** Each Short: hook line plus a sentence span, estimated at the channel's speaking rate. */
function shortsIssues(shorts, script, { wpm = DEFAULT_WPM, required = 3 } = {}) {
  const issues = [];
  if (!Array.isArray(shorts) || shorts.length !== required) {
    issues.push(`shorts.json needs exactly ${required} Shorts.`);
    if (!Array.isArray(shorts)) return issues;
  }
  const order = allSentences(script);
  const index = new Map(order.map((s, i) => [s.id, i]));
  for (const short of shorts) {
    if (!String(short.hookLine || '').trim()) issues.push(`${short.id}: needs a hookLine.`);
    const from = index.get(short.fromSentence);
    const to = index.get(short.toSentence);
    if (from === undefined || to === undefined) {
      issues.push(
        `${short.id}: unknown sentence id (${short.fromSentence} → ${short.toSentence}).`,
      );
      continue;
    }
    if (to < from) {
      issues.push(`${short.id}: toSentence comes before fromSentence.`);
      continue;
    }
    const words =
      wordCount(short.hookLine || '') +
      order.slice(from, to + 1).reduce((n, s) => n + wordCount(s.spoken), 0);
    const estimate = seconds(words, wpm);
    if (estimate < SHORT_MIN || estimate > SHORT_MAX) {
      issues.push(
        `${short.id}: estimated ${Math.round(estimate)} s; a Short must be ${SHORT_MIN}–${SHORT_MAX} s.`,
      );
    }
  }
  return issues;
}

/** Structure, estimated length and Shorts checks for script.json. */
function scriptIssues(script, brief, channelProfile = {}, shorts = []) {
  const issues = [];
  const wpm = channelProfile.wpm || DEFAULT_WPM;
  const seen = new Set();
  let words = 0;
  let holds = 0;
  for (const chapter of script.chapters || []) {
    if (!chapter.title) issues.push(`Chapter ${chapter.id} needs a title.`);
    for (const paragraph of chapter.paragraphs || []) {
      if (!PARAGRAPH_ID.test(paragraph.id || '')) {
        issues.push(`Paragraph id "${paragraph.id}" must look like c01p01.`);
      }
      if (seen.has(paragraph.id)) issues.push(`Paragraph id ${paragraph.id} is used twice.`);
      seen.add(paragraph.id);
      words += wordCount(spokenText(paragraph).captions);
      holds += paragraph.hold ?? 0.4;
    }
  }
  if (!seen.size) issues.push('The script has no paragraphs.');

  const target = (brief.lengthTargetMin || 0) * 60;
  const estimate = seconds(words, wpm) + holds;
  if (target && Math.abs(estimate - target) > target * LENGTH_TOLERANCE) {
    issues.push(
      `Estimated length ${fmt(estimate)} is outside ±15% of the length target ${fmt(target)} ` +
        `(${words} words at ${wpm} wpm).`,
    );
  }
  if ((brief.formats || []).includes('short')) {
    issues.push(...shortsIssues(shorts, script, { wpm, required: 3 }));
  }
  return issues;
}

module.exports = { scriptIssues, shortsIssues, allSentences, DEFAULT_WPM, PARAGRAPH_ID };
