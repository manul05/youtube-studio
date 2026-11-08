'use strict';

/**
 * The owner's recordings contain restarts, repeated sentences, long pauses and unscripted
 * remarks. For each chapter: find every take of every script sentence in the recogniser words,
 * keep the last complete take, cut everything else, shorten long pauses, and list unscripted
 * passages (ad-libs) for the owner. An ad-lib is kept only by adding it to the script, so its
 * facts are checked, it is captioned and the owner approves it at the script stop.
 */

const fs = require('node:fs');
const path = require('node:path');
const { readJson, writeJson, ensureDir } = require('../util/files.cjs');
const { run, ffmpegPath, probe } = require('../util/proc.cjs');
const { sentences } = require('../words/text.cjs');
const { matchWords } = require('../align/match.cjs');
const { phonetic } = require('../align/phonetic.cjs');
const { spellNumber } = require('../align/numbers.cjs');

const TAKE_SHARE = 0.7; // share of a sentence's matchable words a take must contain
const PAD = 0.12; // seconds kept before the first and after the last word of the chapter
const MAX_PAUSE = 0.35; // longest pause left between kept speech
const ADLIB_WORDS = 4; // unscripted runs this long are listed; shorter ones are stumbles
const LENGTHS = [0.8, 1, 1.2]; // window lengths tried, relative to the sentence

const sound = (token) => phonetic(spellNumber(token));

/** Script sentences of a chapter, each with its words in real spelling. */
function scriptSentences(chapter) {
  return chapter.paragraphs.flatMap((p) =>
    sentences(p.text, p.id).map((s) => ({
      id: s.id,
      paragraph: p.id,
      tokens: s.spoken.split(/\s+/).filter(Boolean),
    })),
  );
}

/** Every place in the recogniser words where the sentence was said (best take per place). */
function occurrences(tokens, asr) {
  const firstSounds = tokens
    .slice(0, 3)
    .map((t, j) => ({ j, s: sound(t) }))
    .filter((x) => x.s);
  const found = [];
  const tried = new Set();
  for (let i = 0; i < asr.length; i += 1) {
    const s = sound(asr[i].text);
    if (!s) continue;
    for (const { j, s: want } of firstSounds) {
      if (want !== s) continue;
      const from = Math.max(0, i - j);
      for (const scale of LENGTHS) {
        const length = Math.max(1, Math.round(tokens.length * scale));
        const key = `${from}:${length}`;
        if (tried.has(key)) continue;
        tried.add(key);
        const window = asr.slice(from, from + length);
        const match = matchWords(tokens, window).words;
        const countable = match.filter((w) => w.matchable);
        const hits = countable.filter((w) => !w.interpolated);
        if (!countable.length || hits.length / countable.length < TAKE_SHARE) continue;
        found.push({
          start: hits[0].start,
          end: hits[hits.length - 1].end,
          share: hits.length / countable.length,
        });
      }
    }
  }
  // Windows that start a word apart describe the same take: keep the best of overlapping ones.
  found.sort((a, b) => a.start - b.start || b.share - a.share);
  const takes = [];
  for (const take of found) {
    const last = takes[takes.length - 1];
    const overlap = last ? Math.min(last.end, take.end) - Math.max(last.start, take.start) : 0;
    if (last && overlap > 0.5 * Math.min(last.end - last.start, take.end - take.start)) {
      if (take.share > last.share || (take.share === last.share && take.end > last.end)) {
        takes[takes.length - 1] = take;
      }
    } else {
      takes.push(take);
    }
  }
  return takes;
}

/**
 * Choose one take per sentence, in script order: the last take of a sentence said before the
 * next sentence begins. Returns { kept, retakes, missing, adlibs }; kept[k] is null when
 * sentence k was not found.
 */
function chooseTakes(scriptSents, asr) {
  const all = scriptSents.map((s) => occurrences(s.tokens, asr));
  const kept = [];
  const retakes = [];
  const missing = [];
  let floor = -Infinity;
  scriptSents.forEach((s, k) => {
    const mine = all[k].filter((t) => t.start >= floor - 0.05);
    if (!mine.length) {
      kept.push(null);
      missing.push(s.id);
      return;
    }
    const first = mine[0];
    const next = (all[k + 1] || []).find((t) => t.start > first.start);
    const before = mine.filter((t) => t.start < (next ? next.start : Infinity));
    const chosen = before[before.length - 1];
    kept.push({ id: s.id, paragraph: s.paragraph, start: chosen.start, end: chosen.end });
    for (const t of before)
      if (t !== chosen) retakes.push({ id: s.id, start: t.start, end: t.end });
    floor = chosen.end;
  });
  const inside = (w, spans) =>
    spans.some((t) => w.start >= t.start - 0.05 && w.end <= t.end + 0.05);
  const keptSpans = kept.filter(Boolean);
  const adlibs = [];
  let run = [];
  const flush = () => {
    if (run.length >= ADLIB_WORDS) {
      adlibs.push({
        text: run.map((w) => w.text).join(' '),
        start: run[0].start,
        end: run[run.length - 1].end,
      });
    }
    run = [];
  };
  for (const w of asr) {
    if (inside(w, keptSpans) || inside(w, retakes)) flush();
    else run.push(w);
  }
  flush();
  return { kept, retakes, missing, adlibs };
}

/**
 * Source segments [start, end] to keep: every kept take, with pauses longer than MAX_PAUSE
 * shortened to MAX_PAUSE. A missing sentence keeps the whole stretch between its neighbours,
 * so nothing the owner said is lost because the recogniser misheard it.
 */
function editList(kept, duration) {
  const spans = [];
  kept.forEach((take, k) => {
    if (take) {
      spans.push({ start: take.start, end: take.end });
      return;
    }
    const prev = kept.slice(0, k).reverse().find(Boolean);
    const next = kept.slice(k + 1).find(Boolean);
    spans.push({ start: prev ? prev.end : 0, end: next ? next.start : duration });
  });
  spans.sort((a, b) => a.start - b.start);
  const segments = [];
  for (const span of spans) {
    const last = segments[segments.length - 1];
    if (last && span.start - last.speechEnd <= MAX_PAUSE) {
      last.speechEnd = Math.max(last.speechEnd, span.end);
      continue;
    }
    if (last) last.end = last.speechEnd + MAX_PAUSE / 2;
    segments.push({
      start: last ? span.start - MAX_PAUSE / 2 : Math.max(0, span.start - PAD),
      speechEnd: span.end,
    });
  }
  const tail = segments[segments.length - 1];
  if (tail) tail.end = Math.min(duration, tail.speechEnd + PAD);
  return segments.map((s) => [round(s.start), round(s.end)]);
}

const round = (x) => Math.round(x * 1000) / 1000;

/** Recogniser words inside the kept segments, moved to their time in the edited audio. */
function mapWords(asr, segments) {
  const out = [];
  let offset = 0;
  for (const [a, b] of segments) {
    for (const w of asr) {
      if (w.start >= a - 1e-6 && w.end <= b + 1e-6) {
        out.push({ ...w, start: w.start - a + offset, end: w.end - a + offset });
      }
    }
    offset += b - a;
  }
  return out;
}

/** Write the kept segments of `source` to `dest`, with 10 ms fades at every cut. */
function applyEdit(source, dest, segments, { video = false } = {}) {
  const parts = [];
  const labels = [];
  segments.forEach(([a, b], i) => {
    const len = b - a;
    const fade = Math.min(0.01, len / 4);
    parts.push(
      `[0:a]atrim=start=${a}:end=${b},asetpts=PTS-STARTPTS,` +
        `afade=t=in:d=${fade},afade=t=out:st=${round(len - fade)}:d=${fade}[a${i}]`,
    );
    if (video) parts.push(`[0:v]trim=start=${a}:end=${b},setpts=PTS-STARTPTS[v${i}]`);
    labels.push(video ? `[v${i}][a${i}]` : `[a${i}]`);
  });
  const outs = video ? '[v][a]' : '[a]';
  parts.push(`${labels.join('')}concat=n=${segments.length}:v=${video ? 1 : 0}:a=1${outs}`);
  const script = `${dest}.filter.txt`;
  fs.writeFileSync(script, parts.join(';\n'));
  const partial = `${dest}.partial${path.extname(dest)}`;
  const map = video ? ['-map', '[v]', '-map', '[a]'] : ['-map', '[a]'];
  const codec = video
    ? ['-c:v', 'libx264', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'pcm_s16le']
    : ['-c:a', 'pcm_s16le'];
  try {
    run(ffmpegPath(), [
      '-v',
      'error',
      '-y',
      '-i',
      source,
      '-/filter_complex',
      script,
      ...map,
      ...codec,
      partial,
    ]);
    fs.renameSync(partial, dest);
  } finally {
    fs.rmSync(script, { force: true });
  }
}

/**
 * Edit one chapter recording: returns the edited audio file and the recogniser words on its
 * timeline. Writes work/takes/<cid>.wav, <cid>.edl.json and <cid>.adlibs.json.
 */
function editChapter(project, chapter, cid, rawSource, asr) {
  const dir = project.path('work', 'takes');
  ensureDir(dir);
  const duration = Number(probe(rawSource).format.duration);
  const { kept, retakes, missing, adlibs } = chooseTakes(scriptSentences(chapter), asr);
  const segments = editList(kept, duration);
  const file = path.join(dir, `${cid}.wav`);
  applyEdit(rawSource, file, segments);
  writeJson(path.join(dir, `${cid}.edl.json`), { chapter: cid, segments, retakes, missing });
  writeJson(path.join(dir, `${cid}.adlibs.json`), { chapter: cid, adlibs });
  return { file, words: mapWords(asr, segments), adlibs, missing };
}

/** Every listed ad-lib of a project, with its chapter. */
function readAdlibs(project) {
  const dir = project.path('work', 'takes');
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.adlibs.json'))
    .sort()
    .flatMap((f) =>
      readJson(path.join(dir, f)).adlibs.map((a) => ({ chapter: f.slice(0, 3), ...a })),
    );
}

module.exports = {
  scriptSentences,
  occurrences,
  chooseTakes,
  editList,
  mapWords,
  applyEdit,
  editChapter,
  readAdlibs,
  MAX_PAUSE,
};
