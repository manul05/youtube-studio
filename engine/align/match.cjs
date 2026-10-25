'use strict';

const { phonetic } = require('./phonetic.cjs');
const { spellNumber, isDigitToken } = require('./numbers.cjs');
const { wordRegex } = require('../words/text.cjs');

/** Lower-case letters, marks and digits only (keeps Devanagari; drops punctuation). */
function canon(token) {
  return String(token)
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]/gu, '');
}

const ANCHOR_SHARE = 0.5; // a word is anchored when half its sounds-like letters match…
const ANCHOR_DENSITY = 0.5; // …and those matches sit close together in the recording

/** Concatenate sounds-like spellings, remembering which token owns each character. */
function layout(texts) {
  let joined = '';
  const spans = texts.map((text) => {
    const p = phonetic(spellNumber(text));
    const span = { from: joined.length, to: joined.length + p.length };
    joined += p;
    return span;
  });
  return { joined, spans };
}

/** Longest common subsequence pairs between two strings: Map(indexInA → indexInB). */
function lcsPairs(a, b) {
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const table = new Uint16Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        a[i] === b[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const pairs = new Map();
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.set(i, j);
      i += 1;
      j += 1;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) i += 1;
    else j += 1;
  }
  return pairs;
}

/**
 * Give every source token a start/end time from recogniser words.
 * Returns { words: [{id, text, start, end, interpolated, split, matchable}], interpolatedRatio,
 * split }.
 * interpolatedRatio counts only tokens that could have matched but did not (tokens with no
 * sounds-like letters, such as "a", are timed from neighbours but not counted).
 */
function matchWords(sourceTokens, asrWords, { idPrefix = 'w' } = {}) {
  const src = layout(sourceTokens);
  const asr = layout(asrWords.map((w) => w.text));
  const owner = new Int32Array(asr.joined.length);
  asr.spans.forEach((span, w) => owner.fill(w, span.from, span.to));
  const pairs = lcsPairs(src.joined, asr.joined);

  const timeAt = (j, edge) => {
    const w = owner[j];
    const span = asr.spans[w];
    const word = asrWords[w];
    const len = span.to - span.from;
    const offset = j - span.from + (edge === 'end' ? 1 : 0);
    return word.start + ((word.end - word.start) * offset) / len;
  };

  const words = sourceTokens.map((text, k) => {
    const span = src.spans[k];
    const matched = [];
    for (let i = span.from; i < span.to; i += 1) if (pairs.has(i)) matched.push(pairs.get(i));
    const length = span.to - span.from;
    const word = { id: `${idPrefix}${k}`, text, start: null, end: null, interpolated: true };
    const first = matched[0];
    const last = matched[matched.length - 1];
    const dense = matched.length && matched.length / (last - first + 1) >= ANCHOR_DENSITY;
    if (length && matched.length >= length * ANCHOR_SHARE && dense) {
      word.start = timeAt(first, 'start');
      word.end = timeAt(last, 'end');
      word.interpolated = false;
      word.split = asr.spans[owner[first]].from !== first || asr.spans[owner[last]].to !== last + 1;
    }
    word.matchable = length > 0;
    return word;
  });

  excuseNumberGaps(words, asrWords);
  fillGaps(words, asrWords);
  const countable = words.filter((w) => w.matchable);
  const missed = countable.filter((w) => w.interpolated).length;
  return {
    words,
    interpolatedRatio: countable.length ? missed / countable.length : 0,
    split: words.filter((w) => w.split).length,
  };
}

/**
 * Number words are only spelled out in English, so "पंद्रह" in the script cannot match a "15" from
 * the recogniser. An unmatched run facing only digit tokens in the same time gap is the number,
 * said as written: it is timed from the gap but not counted as a missed word.
 */
function excuseNumberGaps(words, asrWords) {
  let k = 0;
  while (k < words.length) {
    if (words[k].start !== null) {
      k += 1;
      continue;
    }
    let end = k;
    while (end < words.length && words[end].start === null) end += 1;
    const from = k > 0 ? words[k - 1].end : -Infinity;
    const to = end < words.length ? words[end].start : Infinity;
    const inGap = asrWords.filter((w) => w.start >= from - 0.02 && w.end <= to + 0.02);
    if (inGap.length && inGap.every((w) => isDigitToken(w.text))) {
      for (let i = k; i < end; i += 1) words[i].matchable = false;
    }
    k = end;
  }
}

const MIN_FILLED_WORD = 0.08;

/** Spread runs of untimed words evenly between their timed neighbours. */
function fillGaps(words, asrWords) {
  const first = asrWords.length ? asrWords[0].start : 0;
  const last = asrWords.length ? asrWords[asrWords.length - 1].end : 0;
  let k = 0;
  while (k < words.length) {
    if (words[k].start !== null) {
      k += 1;
      continue;
    }
    let end = k;
    while (end < words.length && words[end].start === null) end += 1;
    const prev = k > 0 ? words[k - 1] : null;
    const next = end < words.length ? words[end] : null;
    let from = prev ? prev.end : first;
    let to = next ? next.start : Math.max(last, from);
    // Recogniser words usually touch, so a missed word can have no room at all: borrow up to half
    // of each neighbour so every word keeps a real duration.
    let deficit = (end - k) * MIN_FILLED_WORD - (to - from);
    if (deficit > 0 && prev) {
      const take = Math.min(next ? deficit / 2 : deficit, (prev.end - prev.start) / 2);
      from -= take;
      prev.end = from;
      deficit -= take;
    }
    if (deficit > 0 && next) {
      const take = Math.min(deficit, (next.end - next.start) / 2);
      to += take;
      next.start = to;
      deficit -= take;
    }
    if (deficit > 0 && prev) {
      const take = Math.min(deficit, prev.end - prev.start - MIN_FILLED_WORD);
      if (take > 0) {
        from -= take;
        prev.end = from;
        deficit -= take;
      }
    }
    if (deficit > 0 && !next) to += deficit;
    const step = (to - from) / (end - k);
    for (let i = k; i < end; i += 1) {
      words[i].start = from + step * (i - k);
      words[i].end = from + step * (i - k + 1);
    }
    k = end;
  }
}

/** A caption token is the name's word, allowing a possessive ("Modi's", "Kant’s"). */
function sameName(token, part) {
  const want = canon(part);
  return canon(token) === want || canon(String(token).replace(/['’]s?(?=\P{L}*$)/u, '')) === want;
}

/**
 * The voice spoke the pronunciation text ("Soor-ya Kaant"); captions show the real spelling
 * ("Surya Kant"). Map timed spoken words back onto caption tokens, sharing a substituted span
 * across its caption words by length.
 */
function mapSubstitutions(spokenWords, captionsText, pronunciations = {}) {
  const captionTokens = String(captionsText).split(/\s+/).filter(Boolean);
  const names = Object.keys(pronunciations).sort((a, b) => b.length - a.length);
  const groups = [];
  let i = 0;
  while (i < captionTokens.length) {
    let matched = null;
    for (const name of names) {
      const parts = name.split(/\s+/);
      const slice = captionTokens.slice(i, i + parts.length);
      if (
        slice.length === parts.length &&
        slice.every((tok, n) => sameName(tok, parts[n])) &&
        wordRegex(name, 'u').test(slice.join(' '))
      ) {
        matched = { caption: slice, spoken: pronunciations[name].split(/\s+/).length };
        break;
      }
    }
    if (!matched) matched = { caption: [captionTokens[i]], spoken: 1 };
    groups.push(matched);
    i += matched.caption.length;
  }
  const needed = groups.reduce((n, g) => n + g.spoken, 0);
  if (needed !== spokenWords.length) {
    throw new Error(
      `Caption and spoken word counts differ (${needed} vs ${spokenWords.length}); ` +
        'check pronunciations.json.',
    );
  }
  const out = [];
  let s = 0;
  for (const group of groups) {
    const spoken = spokenWords.slice(s, s + group.spoken);
    s += group.spoken;
    const start = spoken[0].start;
    const end = spoken[spoken.length - 1].end;
    const interpolated = spoken.some((w) => w.interpolated);
    const total = group.caption.reduce((n, tok) => n + Math.max(1, canon(tok).length), 0);
    let at = start;
    for (const tok of group.caption) {
      const share = ((end - start) * Math.max(1, canon(tok).length)) / total;
      out.push({ text: tok, start: at, end: at + share, interpolated });
      at += share;
    }
    out[out.length - 1].end = end;
  }
  return out;
}

module.exports = { canon, phonetic, matchWords, mapSubstitutions, lcsPairs };
