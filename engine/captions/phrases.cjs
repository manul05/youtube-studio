'use strict';

const { createCanvas } = require('@napi-rs/canvas');
const { registerFonts } = require('../util/fonts.cjs');
const { qc } = require('../config.cjs');

const SENTENCE_END = /[.!?;:।]["'”’)\]]*$/u;
const MAX_CUE_SECONDS = 5;
const MEASURE_SIZE = 48;

let measureCtx = null;
function measurer() {
  if (!measureCtx) {
    registerFonts();
    measureCtx = createCanvas(16, 16).getContext('2d');
  }
  return measureCtx;
}

/** Width allowed for one Devanagari caption line: the width of `chars` Latin "n" characters. */
function devanagariLineWidth(chars = qc().captionMaxCharsLatin) {
  const ctx = measurer();
  ctx.font = `${MEASURE_SIZE}px Sans`;
  return ctx.measureText('n'.repeat(chars)).width;
}

/** Whether a caption line fits: `chars` Latin characters (42 long-form; Shorts use fewer). */
function lineFits(line, script, chars = qc().captionMaxCharsLatin) {
  if (script === 'deva') {
    const ctx = measurer();
    ctx.font = `${MEASURE_SIZE}px Deva`;
    return ctx.measureText(line).width <= devanagariLineWidth(chars);
  }
  return [...line].length <= chars;
}

/** Greedy word wrap into caption lines. */
function wrapLines(text, script, chars) {
  const lines = [];
  let current = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = current ? `${current} ${word}` : word;
    if (current && !lineFits(next, script, chars)) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
function graphemeCount(text) {
  return [...segmenter.segment(text)].length;
}

function makeCue(group, script, chars) {
  const text = group.map((w) => w.text).join(' ');
  return {
    start: group[0].start,
    end: group[group.length - 1].end,
    text,
    lines: wrapLines(text, script, chars),
    tokenIds: group.map((w) => w.id),
    tokens: group.map((w) => ({ id: w.id, start: w.start, end: w.end })),
  };
}

function mergeCues(a, b, script, chars) {
  const text = `${a.text} ${b.text}`;
  return {
    start: a.start,
    end: Math.max(a.end, b.end),
    text,
    lines: wrapLines(text, script, chars),
    tokenIds: [...a.tokenIds, ...b.tokenIds],
    tokens: [...a.tokens, ...b.tokens],
  };
}

/**
 * Group timed words into caption cues: break after sentence punctuation, before a cue would
 * need a third line, or after 5 s. Cues shorter than the minimum are stretched into the gap
 * that follows, or merged with a neighbour when there is no room.
 */
function phrases(words, { script = 'latin', lineChars } = {}) {
  const chars = lineChars || qc().captionMaxCharsLatin;
  const minimum = qc().captionMinDuration;
  const cues = [];
  let group = [];
  const flush = () => {
    if (group.length) cues.push(makeCue(group, script, chars));
    group = [];
  };
  for (const word of words) {
    if (!(word.end > word.start)) throw new Error(`Invalid word timing for "${word.text}".`);
    const candidate = [...group, word];
    const text = candidate.map((w) => w.text).join(' ');
    if (
      group.length &&
      (wrapLines(text, script, chars).length > qc().captionMaxLines ||
        word.end - group[0].start > MAX_CUE_SECONDS)
    ) {
      flush();
    }
    group.push(word);
    if (SENTENCE_END.test(word.text)) flush();
  }
  flush();

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < cues.length; i += 1) {
      const cue = cues[i];
      if (cue.end - cue.start >= minimum - 1e-9) continue;
      const limit = i + 1 < cues.length ? cues[i + 1].start : Infinity;
      cue.end = Math.min(cue.start + minimum, limit);
      if (cue.end - cue.start >= minimum - 1e-9) continue;
      const withNext = i + 1 < cues.length ? mergeCues(cue, cues[i + 1], script, chars) : null;
      if (withNext && withNext.lines.length <= qc().captionMaxLines) {
        cues.splice(i, 2, withNext);
      } else if (i > 0) {
        cues.splice(i - 1, 2, mergeCues(cues[i - 1], cue, script, chars));
      } else {
        continue;
      }
      changed = true;
      break;
    }
  }
  return cues.map((cue, id) => ({ id, ...cue }));
}

module.exports = { phrases, wrapLines, graphemeCount, lineFits, devanagariLineWidth };
