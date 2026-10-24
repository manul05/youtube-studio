'use strict';

// Live check: faster-whisper on the committed Edge TTS fixtures, matched to their scripts.
// Run with: npm run test:live (needs the .venv with faster-whisper; downloads the model once).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runWhisper } = require('../../engine/align/whisper.cjs');
const { matchWords } = require('../../engine/align/match.cjs');
const samples = require('../fixtures/audio/asr-samples.json');

for (const lang of ['en', 'hi']) {
  test(`faster-whisper output for the ${lang} fixture aligns within 5%`, () => {
    const cache = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-asr-'));
    const audio = path.join(__dirname, '..', 'fixtures', 'audio', `${lang}.mp3`);
    const words = runWhisper(audio, lang, cache);
    assert.ok(words.length > 5, 'recogniser returned words');
    const tokens = samples[lang].text.split(/\s+/).filter(Boolean);
    const { interpolatedRatio } = matchWords(tokens, words);
    assert.ok(interpolatedRatio <= 0.05, `interpolated ${interpolatedRatio}`);
  });
}
