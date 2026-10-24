'use strict';

const fs = require('node:fs');
const { readJson, writeJson, ensureDir } = require('../util/files.cjs');
const { run, ffmpegPath, probe } = require('../util/proc.cjs');
const { qc } = require('../config.cjs');
const { spokenText } = require('../words/text.cjs');
const { chapterId, assertParagraphId } = require('../voice/synthesize.cjs');
const { matchWords, mapSubstitutions } = require('./match.cjs');
const { runWhisper, asrLanguage } = require('./whisper.cjs');

const round = (x) => Math.round(x * 1000) / 1000;

function pronunciations(project) {
  const file = project.path('pronunciations.json');
  return fs.existsSync(file) ? readJson(file) : {};
}

function defaultAsr(project) {
  const language = asrLanguage(project.brief.language);
  const cacheDir = project.path('work', 'align', 'asr');
  return async (audioPath) => runWhisper(audioPath, language, cacheDir);
}

function cut(source, dest, start, end) {
  ensureDir(require('node:path').dirname(dest));
  const partial = `${dest}.partial.wav`;
  const args = ['-v', 'error', '-y', '-i', source, '-ss', start.toFixed(3)];
  if (end !== null) args.push('-to', end.toFixed(3));
  run(ffmpegPath(), [...args, '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', partial]);
  fs.renameSync(partial, dest);
}

/** Timed caption words for one paragraph's spoken text against recogniser words. */
function timeParagraph(paragraph, pron, asrWords) {
  const { tts, captions } = spokenText(paragraph, pron);
  const ttsTokens = tts.split(/\s+/).filter(Boolean);
  const matched = matchWords(ttsTokens, asrWords);
  return { spoken: matched.words, captions, ratio: matched.interpolatedRatio };
}

/**
 * Align one chapter recording to its script and cut it into paragraph files at the midpoint of
 * the pauses between paragraphs. A paragraph with a retake in work/voice/overrides/ uses that
 * file instead. Writes work/voice/paragraphs/<id>.wav and work/align/<id>.json.
 */
async function splitChapter(project, chapterNumber, { asr = defaultAsr(project) } = {}) {
  const script = readJson(project.path('script.json'));
  const chapter = script.chapters.find((c) => Number(c.id) === Number(chapterNumber));
  if (!chapter) throw new Error(`No chapter ${chapterNumber} in script.json.`);
  const cid = chapterId(chapter);
  chapter.paragraphs.forEach((p) => assertParagraphId(p.id));
  const source = project.path('work', 'voice', 'chapters', `${cid}.wav`);
  if (!fs.existsSync(source)) return { issues: [`${cid}: no recording yet (run npm run voice).`] };

  const pron = pronunciations(project);
  const maxRatio = qc().alignMaxInterpolated;
  const issues = [];

  // Time every paragraph inside the chapter recording.
  const asrWords = await asr(source);
  const paragraphs = chapter.paragraphs;
  const tokenCounts = paragraphs.map(
    (p) => spokenText(p, pron).tts.split(/\s+/).filter(Boolean).length,
  );
  const allTokens = paragraphs.flatMap((p) => spokenText(p, pron).tts.split(/\s+/).filter(Boolean));
  const chapterMatch = matchWords(allTokens, asrWords);
  const perParagraph = [];
  let offset = 0;
  for (let i = 0; i < paragraphs.length; i += 1) {
    const words = chapterMatch.words.slice(offset, offset + tokenCounts[i]);
    offset += tokenCounts[i];
    const countable = words.filter((w) => w.text.replace(/[^\p{L}\p{N}]/gu, '').length);
    const missed = countable.filter((w) => w.interpolated).length;
    perParagraph.push({ words, ratio: countable.length ? missed / countable.length : 0 });
  }

  const duration = Number(probe(source).format.duration);
  for (let i = 0; i < paragraphs.length; i += 1) {
    const paragraph = paragraphs[i];
    const override = project.path('work', 'voice', 'overrides', `${paragraph.id}.wav`);
    const wavOut = project.path('work', 'voice', 'paragraphs', `${paragraph.id}.wav`);
    let spoken;
    let ratio;
    let start = 0;
    let sourceKind = 'chapter';

    if (fs.existsSync(override)) {
      const timed = timeParagraph(paragraph, pron, await asr(override));
      spoken = timed.spoken;
      ratio = timed.ratio;
      cut(override, wavOut, 0, null);
      sourceKind = 'override';
    } else {
      spoken = perParagraph[i].words;
      ratio = perParagraph[i].ratio;
      const prev = perParagraph[i - 1];
      const next = perParagraph[i + 1];
      const first = spoken[0];
      const last = spoken[spoken.length - 1];
      start = prev ? (prev.words[prev.words.length - 1].end + first.start) / 2 : 0;
      const end = next ? (last.end + next.words[0].start) / 2 : duration;
      cut(source, wavOut, start, end);
    }

    const captions = mapSubstitutions(spoken, spokenText(paragraph, pron).captions, pron);
    const words = captions.map((w, n) => ({
      id: `${paragraph.id}-w${n}`,
      text: w.text,
      start: round(w.start - start),
      end: round(w.end - start),
      interpolated: w.interpolated,
    }));
    writeJson(project.path('work', 'align', `${paragraph.id}.json`), {
      paragraph: paragraph.id,
      chapter: cid,
      source: sourceKind,
      words,
      interpolatedRatio: round(ratio),
      durationSec: round(Number(probe(wavOut).format.duration)),
    });
    if (ratio > maxRatio) {
      issues.push(
        `${paragraph.id}: ${Math.round(ratio * 100)}% of words could not be matched to the ` +
          `recording (max ${Math.round(maxRatio * 100)}%). Re-record it with ` +
          `npm run voice:retake -- ${project.name} ${paragraph.id}`,
      );
    }
  }
  return { issues, paragraphs: paragraphs.map((p) => p.id) };
}

/** Align every chapter; remove paragraph files that no longer exist in the script. */
async function alignProject(project, opts = {}) {
  const script = readJson(project.path('script.json'));
  script.chapters.forEach((c) => c.paragraphs.forEach((p) => assertParagraphId(p.id)));
  const keep = new Set(script.chapters.flatMap((c) => c.paragraphs.map((p) => p.id)));
  for (const dir of [project.path('work', 'voice', 'paragraphs'), project.path('work', 'align')]) {
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      const id = name.replace(/\.(wav|json)$/, '');
      if (/\.(wav|json)$/.test(name) && !keep.has(id)) fs.rmSync(`${dir}/${name}`);
    }
  }
  const issues = [];
  for (const chapter of script.chapters) {
    issues.push(...(await splitChapter(project, chapter.id, opts)).issues);
  }
  return { issues };
}

module.exports = { splitChapter, alignProject };
