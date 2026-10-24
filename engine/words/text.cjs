'use strict';

/**
 * Script text conventions. Every sentence ends with terminal punctuation (. ? ! or the
 * Devanagari danda ।) followed by a tag: [[CL03]] / [[CL03,CL07]] for factual sentences or
 * [[analysis]] for the narrator's own analysis. Tags are never spoken or shown.
 */

const TAG_SPLIT = /\[\[([^\]]+)\]\]/;
const TAG_GLOBAL = /\[\[[^\]]+\]\]/g;
// A sentence boundary: terminal punctuation (optionally followed by closing quotes/brackets)
// and then whitespace.
const BOUNDARY = /(?<=[.?!।]["'”’)\]]*)\s+/u;
const WORD_EDGE_BEFORE = '(?<![\\p{L}\\p{M}\\p{N}])';
const WORD_EDGE_AFTER = '(?![\\p{L}\\p{M}\\p{N}])';

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Split paragraph text into sentences with their tags. Untagged sentences get tags: []. */
function sentences(text, paragraphId = '') {
  const parts = String(text).split(TAG_SPLIT);
  const out = [];
  for (let i = 0; i < parts.length; i += 2) {
    const chunk = parts[i].trim();
    const tag = parts[i + 1];
    const pieces = chunk ? chunk.split(BOUNDARY).filter(Boolean) : [];
    if (tag === undefined) {
      for (const piece of pieces) out.push({ spoken: piece, tags: [] });
      continue;
    }
    if (!pieces.length) continue;
    const last = pieces.pop();
    for (const piece of pieces) out.push({ spoken: piece, tags: [] });
    out.push({
      spoken: last,
      tags: tag
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    });
  }
  return out.map((s, index) => ({ id: `${paragraphId}s${index + 1}`, ...s }));
}

/** A whole-word, Unicode-aware matcher (works for Devanagari, where \b does not). */
function wordRegex(phrase, flags = 'gu') {
  return new RegExp(`${WORD_EDGE_BEFORE}${escapeRegex(phrase)}${WORD_EDGE_AFTER}`, flags);
}

/** Captions keep the original spelling; the voice text applies pronunciation hints. */
function spokenText(paragraph, pronunciations = {}) {
  const captions = String(paragraph.text).replace(TAG_GLOBAL, ' ').replace(/\s+/g, ' ').trim();
  let tts = captions;
  const names = Object.keys(pronunciations).sort((a, b) => b.length - a.length);
  for (const name of names) tts = tts.replace(wordRegex(name), pronunciations[name]);
  return { tts, captions };
}

function wordCount(text) {
  return String(text).split(/\s+/).filter(Boolean).length;
}

module.exports = { sentences, spokenText, wordRegex, wordCount, escapeRegex };
