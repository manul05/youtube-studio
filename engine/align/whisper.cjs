'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readJson, writeJson, ensureDir, sha256File } = require('../util/files.cjs');
const { run, pythonPath } = require('../util/proc.cjs');

const SCRIPT = path.join(__dirname, 'whisper_words.py');
const MODEL = 'small';

/** Recogniser language for a brief language: Hinglish speech is recognised as Hindi. */
function asrLanguage(language) {
  return language === 'en' ? 'en' : 'hi';
}

/**
 * Word timings for an audio file, cached by the audio's content hash, language and model in
 * <cacheDir>. The first run downloads the faster-whisper model (~0.5 GB) once.
 */
function runWhisper(audioPath, language, cacheDir) {
  ensureDir(cacheDir);
  const key = `${path.basename(audioPath, path.extname(audioPath))}.${language}.${MODEL}`;
  const cacheFile = path.join(cacheDir, `${key}.json`);
  const sha = sha256File(audioPath);
  if (fs.existsSync(cacheFile)) {
    const cached = readJson(cacheFile);
    if (cached.sha === sha) return cached.words;
  }
  const out = `${cacheFile}.partial.words.json`;
  try {
    run(pythonPath(), ['-I', SCRIPT, audioPath, language, out, MODEL]);
    const words = readJson(out);
    writeJson(cacheFile, { sha, language, model: MODEL, words });
    return words;
  } finally {
    fs.rmSync(out, { force: true });
  }
}

module.exports = { runWhisper, asrLanguage };
