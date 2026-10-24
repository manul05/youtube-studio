'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readJson, writeJson, ensureDir, sha256File, sha256Text } = require('../util/files.cjs');
const { run, ffmpegPath } = require('../util/proc.cjs');
const { channel, models, loadEnv } = require('../config.cjs');
const { spokenText, wordCount } = require('../words/text.cjs');
const { PARAGRAPH_ID } = require('../words/script.cjs');
const { tts, RateLimited } = require('./gemini.cjs');

const SAMPLE_INTRO_WORDS = 110;


/** "c03" for chapter 3. Ids come from agent-written JSON, so they are validated before use. */
function chapterId(chapter) {
  const n = Number(chapter.id);
  if (!Number.isInteger(n) || n < 1 || n > 99) {
    throw new Error(`Invalid chapter id "${chapter.id}" (use a whole number 1–99).`);
  }
  return `c${String(n).padStart(2, '0')}`;
}

function assertParagraphId(id) {
  if (!PARAGRAPH_ID.test(String(id))) {
    throw new Error(`Invalid paragraph id "${id}" (expected the form c03p02).`);
  }
}

/** Voice settings: the channel default, overridden by brief.voice when present. */
function voiceSettings(project) {
  const brief = project.brief;
  const voice = { ...channel(brief.channel).voice, ...(brief.voice || {}) };
  return { voice: voice.name, style: voice.style, language: brief.language, model: models().tts };
}

function pronunciations(project) {
  const file = project.path('pronunciations.json');
  return fs.existsSync(file) ? readJson(file) : {};
}

/** Convert provider audio to the studio's working format without changing its duration. */
function toStudioWav(bytes, dest) {
  ensureDir(path.dirname(dest));
  const raw = `${dest}.partial.src.wav`;
  const partial = `${dest}.partial.wav`;
  fs.writeFileSync(raw, bytes);
  try {
    run(ffmpegPath(), [
      '-v',
      'error',
      '-y',
      '-i',
      raw,
      '-ar',
      '48000',
      '-ac',
      '2',
      '-c:a',
      'pcm_s16le',
      partial,
    ]);
    fs.renameSync(partial, dest);
  } finally {
    fs.rmSync(raw, { force: true });
    fs.rmSync(partial, { force: true });
  }
}

/** Synthesise text into dest unless the cached file already matches. Returns true if it called. */
async function synthOnce(dest, text, settings, { fetch, apiKey }) {
  const meta = `${dest.slice(0, -4)}.json`;
  const inputHash = sha256Text(
    [text, settings.voice, settings.style, settings.model, settings.language].join('␞'),
  );
  if (fs.existsSync(dest) && fs.existsSync(meta)) {
    const cached = readJson(meta);
    if (cached.inputHash === inputHash && cached.wavSha === sha256File(dest)) return false;
  }
  const bytes = await tts({ text, ...settings }, { fetch, apiKey });
  toStudioWav(bytes, dest);
  writeJson(meta, {
    inputHash,
    wavSha: sha256File(dest),
    text,
    ...settings,
    at: new Date().toISOString(),
  });
  return true;
}

function providerOptions(opts = {}) {
  return { fetch: opts.fetch || globalThis.fetch, apiKey: opts.apiKey || loadEnv().GEMINI_API_KEY };
}

/**
 * One Gemini call per chapter (keeps free-tier request counts low). Cached chapters are skipped;
 * on a rate limit the run stops, records the pending chapters and can simply be re-run later.
 */
async function synthesizeChapters(project, opts = {}) {
  const provider = providerOptions(opts);
  const settings = voiceSettings(project);
  const pron = pronunciations(project);
  const script = readJson(project.path('script.json'));
  const dir = project.path('work', 'voice', 'chapters');
  const resumeFile = project.path('work', 'voice', 'resume.json');
  ensureDir(dir);

  const ids = script.chapters.map(chapterId);
  for (const name of fs.readdirSync(dir)) {
    if (!ids.includes(name.replace(/\.(wav|json)$/, ''))) fs.rmSync(path.join(dir, name));
  }

  const done = [];
  for (let i = 0; i < script.chapters.length; i += 1) {
    const chapter = script.chapters[i];
    const text = chapter.paragraphs.map((p) => spokenText(p, pron).tts).join('\n\n');
    try {
      await synthOnce(path.join(dir, `${ids[i]}.wav`), text, settings, provider);
      done.push(ids[i]);
    } catch (err) {
      if (!(err instanceof RateLimited)) throw err;
      const pending = ids.slice(i);
      writeJson(resumeFile, {
        pending,
        retryAfterSec: err.retryAfterSec,
        at: new Date().toISOString(),
      });
      return { done, pending, rateLimited: true, retryAfterSec: err.retryAfterSec };
    }
  }
  fs.rmSync(resumeFile, { force: true });
  return { done, pending: [], rateLimited: false };
}

/** Stop 3 material: the opening (~45 s), every name with a pronunciation hint, the Shorts hooks. */
async function synthesizeSample(project, opts = {}) {
  const provider = providerOptions(opts);
  const settings = voiceSettings(project);
  const pron = pronunciations(project);
  const script = readJson(project.path('script.json'));
  const dir = project.path('work', 'voice', 'sample');
  ensureDir(dir);

  const introParts = [];
  let words = 0;
  for (const paragraph of script.chapters.flatMap((c) => c.paragraphs)) {
    if (words >= SAMPLE_INTRO_WORDS) break;
    const text = spokenText(paragraph, pron).tts;
    introParts.push(text);
    words += wordCount(text);
  }
  const items = [{ file: 'intro.wav', kind: 'intro', text: introParts.join('\n\n') }];

  const names = Object.entries(pron).map(([name, spoken]) => ({ name, spoken }));
  if (names.length) {
    items.push({
      file: 'names.wav',
      kind: 'names',
      text: names.map((n) => `${n.spoken}.`).join(' '),
      names,
    });
  }
  const shortsFile = project.path('shorts.json');
  const shorts = fs.existsSync(shortsFile) ? readJson(shortsFile) : [];
  if (shorts.length) {
    items.push({
      file: 'hooks.wav',
      kind: 'hooks',
      text: shorts.map((s) => s.hookLine).join('\n\n'),
      hooks: shorts.map((s) => ({ id: s.id, text: s.hookLine })),
    });
  }

  const wanted = new Set([...items.map((i) => i.file), 'manifest.json']);
  for (const name of fs.readdirSync(dir)) {
    if (!wanted.has(name) && !wanted.has(name.replace(/\.json$/, '.wav'))) {
      fs.rmSync(path.join(dir, name));
    }
  }
  for (const item of items) {
    try {
      await synthOnce(path.join(dir, item.file), item.text, settings, provider);
    } catch (err) {
      if (err instanceof RateLimited)
        return { rateLimited: true, retryAfterSec: err.retryAfterSec };
      throw err;
    }
  }
  writeJson(path.join(dir, 'manifest.json'), { voice: settings, items });
  return { rateLimited: false, items };
}

/** Re-record one paragraph on its own; alignment uses it in place of the chapter's version. */
async function retakeParagraph(project, paragraphId, opts = {}) {
  assertParagraphId(paragraphId);
  const script = readJson(project.path('script.json'));
  const paragraph = script.chapters.flatMap((c) => c.paragraphs).find((p) => p.id === paragraphId);
  if (!paragraph) throw new Error(`No paragraph ${paragraphId} in script.json.`);
  const text = spokenText(paragraph, pronunciations(project)).tts;
  const dest = project.path('work', 'voice', 'overrides', `${paragraphId}.wav`);
  try {
    await synthOnce(dest, text, voiceSettings(project), providerOptions(opts));
  } catch (err) {
    if (err instanceof RateLimited) return { rateLimited: true, retryAfterSec: err.retryAfterSec };
    throw err;
  }
  return { rateLimited: false, file: dest };
}

module.exports = {
  synthesizeChapters,
  synthesizeSample,
  retakeParagraph,
  voiceSettings,
  chapterId,
  assertParagraphId,
};
