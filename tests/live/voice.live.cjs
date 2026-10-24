'use strict';

// Live check against the real Gemini API. Run with: npm run test:live (needs GEMINI_API_KEY).
// Writes English and Hindi one-sentence WAVs to tests/live/out/ for the alignment live test.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadEnv, models, channel } = require('../../engine/config.cjs');
const { tts } = require('../../engine/voice/gemini.cjs');
const { probe, run, ffmpegPath } = require('../../engine/util/proc.cjs');

const OUT = path.join(__dirname, 'out');
const env = loadEnv();
const skip = env.GEMINI_API_KEY ? false : 'GEMINI_API_KEY not set';

const samples = [
  ['en', 'en-placeholder', 'The Supreme Court heard the case on the fifteenth of May.'],
  ['hi', 'hi-placeholder', 'सुप्रीम कोर्ट ने पंद्रह मई को इस मामले की सुनवाई की।'],
];

for (const [lang, channelId, text] of samples) {
  test(`Gemini TTS speaks a ${lang} sentence`, { skip }, async () => {
    const voice = channel(channelId).voice;
    const bytes = await tts(
      { text, voice: voice.name, style: voice.style, model: models().tts },
      { apiKey: env.GEMINI_API_KEY },
    );
    fs.mkdirSync(OUT, { recursive: true });
    const raw = path.join(OUT, `${lang}.src.wav`);
    const wav = path.join(OUT, `${lang}.wav`);
    fs.writeFileSync(raw, bytes);
    run(ffmpegPath(), ['-v', 'error', '-y', '-i', raw, '-ar', '48000', '-ac', '2', wav]);
    fs.writeFileSync(path.join(OUT, `${lang}.txt`), text);
    const duration = Number(probe(wav).format.duration);
    assert.ok(duration > 1, `decoded duration ${duration} s`);
  });
}
