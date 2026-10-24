'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { canon, phonetic, matchWords, mapSubstitutions } = require('../engine/align/match.cjs');
const samples = require('./fixtures/audio/asr-samples.json');

const tokens = (text) => text.split(/\s+/).filter(Boolean);

test('canon keeps Devanagari letters and strips punctuation', () => {
  assert.equal(canon('कॉकरोच,'), 'कॉकरोच');
  assert.equal(canon('Don’t!'), 'dont');
});

test('phonetic spelling makes common Hindi ASR spellings agree', () => {
  assert.equal(phonetic('पंद्रह'), phonetic('पन्द्रा'));
  assert.equal(phonetic('टिप्पणी'), phonetic('तिप्पनी'));
  assert.equal(phonetic('भारतीय'), phonetic('भार्तिया'));
  assert.equal(phonetic('जनता'), phonetic('जंता'));
  assert.equal(phonetic('Party'), phonetic('पार्टी'));
});

test('real English whisper output aligns with at most 5% interpolated words', () => {
  const { words, interpolatedRatio } = matchWords(tokens(samples.en.text), samples.en.asr);
  assert.equal(words.length, 20);
  assert.ok(interpolatedRatio <= 0.05, `ratio ${interpolatedRatio}`);
  const surya = words.find((w) => w.text === 'Surya');
  assert.equal(surya.start, 2.0);
  const fifteenth = words.find((w) => w.text === 'fifteenth');
  assert.ok(
    fifteenth.start >= 0.3 && fifteenth.end <= 0.98,
    'number interpolated between neighbours',
  );
});

test('real Hindi whisper output aligns despite spelling drift', () => {
  const { words, interpolatedRatio } = matchWords(tokens(samples.hi.text), samples.hi.asr);
  assert.ok(interpolatedRatio <= 0.05, `ratio ${interpolatedRatio}`);
  const party = words.find((w) => w.text === 'कॉकरोच');
  assert.ok(Math.abs(party.start - 8.1) < 0.05, `कॉकरोच starts at ${party.start}`);
  const kant = words.find((w) => w.text === 'कांत');
  assert.ok(kant.start > 2.18 && kant.end <= 3.02 + 1e-9, 'split from the merged ASR word');
});

test('a merged ASR word gives proportional timings without counting as interpolated', () => {
  const asr = [
    { text: 'कॉकरोच जनता', start: 0, end: 1 },
    { text: 'पार्टी', start: 1, end: 1.5 },
  ];
  const out = matchWords(['कॉकरोच', 'जनता', 'पार्टी'], asr);
  assert.equal(out.words.length, 3);
  assert.equal(out.words[2].start, 1);
  assert.equal(out.interpolatedRatio, 0);
  assert.ok(out.split > 0);
});

test('unmatched words are interpolated between neighbours instead of throwing', () => {
  const asr = [
    { text: 'मोबाइल', start: 0, end: 0.5 },
    { text: 'की', start: 0.5, end: 0.7 },
    { text: 'घड़ी', start: 0.7, end: 1.2 },
  ];
  const out = matchWords(['Xylophone', 'की', 'zebra'], asr);
  assert.ok(out.words[0].interpolated && out.words[2].interpolated);
  assert.equal(out.words[0].start, 0);
  assert.equal(out.words[2].end, 1.2);
});

test('a completely different transcript has a high interpolated ratio', () => {
  const out = matchWords(tokens('One fact about bananas.'), samples.hi.asr);
  assert.ok(out.interpolatedRatio > 0.05);
});

test('pronunciation substitutions map spoken timing back onto caption words', () => {
  const tts = [
    { text: 'Chief', start: 0, end: 0.3 },
    { text: 'Justice', start: 0.3, end: 0.8 },
    { text: 'Soor-ya', start: 0.8, end: 1.2 },
    { text: 'Kaant', start: 1.2, end: 1.6 },
    { text: 'spoke.', start: 1.6, end: 2.0 },
  ];
  const out = mapSubstitutions(tts, 'Chief Justice Surya Kant spoke.', {
    'Surya Kant': 'Soor-ya Kaant',
  });
  assert.deepEqual(
    out.map((w) => w.text),
    ['Chief', 'Justice', 'Surya', 'Kant', 'spoke.'],
  );
  assert.equal(out[2].start, 0.8);
  assert.equal(out[3].end, 1.6);
});

test('splitChapter cuts paragraphs at the midpoint of the pause between them', async () => {
  const { createProject, openProject } = require('../engine/project.cjs');
  const { splitChapter } = require('../engine/align/split.cjs');
  const { run, ffmpegPath, probe } = require('../engine/util/proc.cjs');
  const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-align-'));
  const dir = createProject('demo', { channel: 'en-placeholder', date: '2026-10-25', projectsDir });
  const project = openProject(dir);
  const script = {
    chapters: [
      {
        id: 1,
        title: 'One',
        paragraphs: [
          { id: 'c01p01', text: 'Alpha beta gamma. [[analysis]]', hold: 0.4 },
          { id: 'c01p02', text: 'Delta epsilon. [[analysis]]', hold: 0.4 },
        ],
      },
    ],
  };
  fs.writeFileSync(project.path('script.json'), JSON.stringify(script));
  const wav = project.path('work', 'voice', 'chapters', 'c01.wav');
  fs.mkdirSync(path.dirname(wav), { recursive: true });
  run(ffmpegPath(), [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=f=220:d=4',
    '-ar',
    '48000',
    '-ac',
    '2',
    wav,
  ]);
  const asr = [
    { text: 'Alpha', start: 0.1, end: 0.5 },
    { text: 'beta', start: 0.5, end: 0.9 },
    { text: 'gamma.', start: 0.9, end: 1.4 },
    { text: 'Delta', start: 2.4, end: 2.9 },
    { text: 'epsilon.', start: 2.9, end: 3.6 },
  ];
  const result = await splitChapter(project, 1, { asr: async () => asr });
  assert.deepEqual(result.issues, []);
  const second = JSON.parse(fs.readFileSync(project.path('work', 'align', 'c01p02.json'), 'utf8'));
  assert.ok(Math.abs(second.words[0].start - 0.5) < 0.01, 'times relative to the 1.9 s cut');
  const firstWav = probe(project.path('work', 'voice', 'paragraphs', 'c01p01.wav'));
  assert.ok(Math.abs(Number(firstWav.format.duration) - 1.9) < 0.02);
});

test('voiceIssues flags long pauses inside a paragraph and an English pace outside 145–165', () => {
  const { pacingIssues } = require('../engine/align/voice-check.cjs');
  const words = (n, gapAt) =>
    Array.from({ length: n }, (_, i) => {
      const start = i * 0.3 + (gapAt !== undefined && i > gapAt ? 0.9 : 0);
      return { text: `w${i}`, start, end: start + 0.25 };
    });
  const paragraphs = [
    { id: 'c01p01', words: words(40, 10) },
    { id: 'c01p02', words: words(40) },
  ];
  const issues = pacingIssues(paragraphs, { language: 'en', channelWpm: null }).issues.join('\n');
  assert.match(issues, /c01p01.*pause/);
  assert.match(issues, /words per minute/);
});

test('alignment refuses paragraph ids that could escape the project folder', async () => {
  const { createProject, openProject } = require('../engine/project.cjs');
  const { alignProject } = require('../engine/align/split.cjs');
  const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-align-'));
  const project = openProject(
    createProject('demo', { channel: 'en-placeholder', date: '2026-10-25', projectsDir }),
  );
  const script = {
    chapters: [
      { id: 1, title: 'One', paragraphs: [{ id: '../../evil', text: 'x. [[analysis]]' }] },
    ],
  };
  fs.writeFileSync(project.path('script.json'), JSON.stringify(script));
  await assert.rejects(() => alignProject(project, { asr: async () => [] }), /paragraph id/i);
});
