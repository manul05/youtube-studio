'use strict';

const fs = require('node:fs');
const { readJson } = require('../util/files.cjs');
const { sentences } = require('../words/text.cjs');

const SHORT_MIN = 30;
const SHORT_MAX = 59;
const PAD_BEFORE = 0.12;
const PAD_AFTER = 0.2;
const HOOK_GAP = 0.3;

/** Every script sentence in order, with the aligned word range it covers in its paragraph. */
function sentenceIndex(project) {
  const script = readJson(project.path('script.json'));
  const list = [];
  for (const chapter of script.chapters) {
    for (const p of chapter.paragraphs) {
      let word = 0;
      for (const s of sentences(p.text, p.id)) {
        const count = s.spoken.split(/\s+/).filter(Boolean).length;
        list.push({ id: s.id, paragraph: p.id, fromWord: word, toWord: word + count - 1 });
        word += count;
      }
    }
  }
  return list;
}

/**
 * The audio pieces a Short uses: consecutive sentences grouped by paragraph, each cut from the
 * paragraph recording just before its first word and just after its last. Throws on an unknown
 * or reversed sentence range.
 */
function spanSegments(project, short) {
  const index = sentenceIndex(project);
  const from = index.findIndex((s) => s.id === short.fromSentence);
  const to = index.findIndex((s) => s.id === short.toSentence);
  if (from < 0 || to < 0) {
    throw new Error(`${short.id}: unknown sentence (${short.fromSentence} → ${short.toSentence}).`);
  }
  if (to < from) throw new Error(`${short.id}: toSentence comes before fromSentence.`);
  const groups = [];
  for (const s of index.slice(from, to + 1)) {
    const last = groups[groups.length - 1];
    if (last && last.paragraph === s.paragraph) last.toWord = s.toWord;
    else groups.push({ paragraph: s.paragraph, fromWord: s.fromWord, toWord: s.toWord });
  }
  return groups.map((g) => {
    const align = readJson(project.path('work', 'align', `${g.paragraph}.json`));
    const words = align.words.slice(g.fromWord, g.toWord + 1);
    return {
      ...g,
      words,
      start: Math.max(0, words[0].start - PAD_BEFORE),
      end: Math.min(align.durationSec, words[words.length - 1].end + PAD_AFTER),
    };
  });
}

/** Where the Short's hook line sits in the stop-3 hooks recording. */
function hookSpan(project, short) {
  const file = project.path('work', 'voice', 'sample', 'alignment.json');
  if (!fs.existsSync(file))
    throw new Error(`${short.id}: no hook recording yet (npm run voice:sample).`);
  const hook = readJson(file).hooks.find((h) => h.id === short.id);
  if (!hook) throw new Error(`${short.id}: its hook line was not found in the hook recording.`);
  return { ...hook, path: project.path('work', 'voice', 'sample', hook.file) };
}

function measuredSeconds(project, short) {
  const segments = spanSegments(project, short);
  const hook = hookSpan(project, short);
  return hook.end - hook.start + HOOK_GAP + segments.reduce((n, s) => n + (s.end - s.start), 0);
}

/** Shorts problems using the real recordings: count, sentence ids and 30–59 s length. */
function shortsMeasuredIssues(shorts, project, { required = 3 } = {}) {
  const issues = [];
  if (shorts.length !== required) issues.push(`shorts.json needs exactly ${required} Shorts.`);
  for (const short of shorts) {
    try {
      const seconds = measuredSeconds(project, short);
      if (seconds < SHORT_MIN || seconds > SHORT_MAX) {
        issues.push(
          `${short.id}: measures ${seconds.toFixed(1)} s; a Short must be ${SHORT_MIN}–${SHORT_MAX} s.`,
        );
      }
    } catch (err) {
      issues.push(err.message);
    }
  }
  return issues;
}

module.exports = {
  sentenceIndex,
  spanSegments,
  hookSpan,
  measuredSeconds,
  shortsMeasuredIssues,
  HOOK_GAP,
};
