'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createProject, openProject } = require('../engine/project.cjs');
const { synthesizeChapters, synthesizeSample } = require('../engine/voice/synthesize.cjs');

/** A short mono 24 kHz 16-bit WAV (a quiet tone), as Gemini returns. */
function wavBytes(seconds = 0.5) {
  const rate = 24000;
  const samples = Math.round(rate * seconds);
  const buf = Buffer.alloc(44 + samples * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples * 2, 40);
  for (let i = 0; i < samples; i += 1) {
    buf.writeInt16LE(Math.round(3000 * Math.sin((2 * Math.PI * 220 * i) / rate)), 44 + i * 2);
  }
  return buf;
}

function okResponse() {
  const body = {
    steps: [
      {
        type: 'model_output',
        content: [{ type: 'audio', mime_type: 'audio/wav', data: wavBytes().toString('base64') }],
      },
    ],
  };
  return {
    ok: true,
    status: 200,
    headers: new Map(),
    json: async () => body,
    text: async () => '',
  };
}

function limitedResponse() {
  return {
    ok: false,
    status: 429,
    headers: new Map([['retry-after', '60']]),
    json: async () => ({}),
    text: async () => 'quota',
  };
}

function fakeGemini(plan = () => okResponse()) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return plan(calls.length);
  };
  return { fetch, calls };
}

function projectWithChapters(count = 3) {
  const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-voice-'));
  const dir = createProject('demo', { channel: 'en-placeholder', date: '2026-10-25', projectsDir });
  const script = {
    chapters: Array.from({ length: count }, (_, i) => ({
      id: i + 1,
      title: `Chapter ${i + 1}`,
      paragraphs: [
        {
          id: `c0${i + 1}p01`,
          text: `Chapter ${i + 1} opens with Surya Kant. [[analysis]] It continues here. [[analysis]]`,
          hold: 0.4,
        },
      ],
    })),
  };
  fs.writeFileSync(path.join(dir, 'script.json'), JSON.stringify(script, null, 2));
  fs.writeFileSync(
    path.join(dir, 'pronunciations.json'),
    JSON.stringify({ 'Surya Kant': 'Soor-ya Kaant' }),
  );
  return openProject(dir);
}

const options = (gemini) => ({ fetch: gemini.fetch, apiKey: 'test-key' });

test('a rate limit stops after finished chapters and the next run resumes the rest', async () => {
  const project = projectWithChapters(3);
  const first = fakeGemini((n) => (n === 2 ? limitedResponse() : okResponse()));
  const result = await synthesizeChapters(project, options(first));
  assert.deepEqual(result.done, ['c01']);
  assert.deepEqual(result.pending, ['c02', 'c03']);
  assert.equal(result.rateLimited, true);
  assert.ok(fs.existsSync(project.path('work', 'voice', 'resume.json')));

  const second = fakeGemini();
  const resumed = await synthesizeChapters(project, options(second));
  assert.equal(second.calls.length, 2);
  assert.deepEqual(resumed.pending, []);
  assert.ok(!fs.existsSync(project.path('work', 'voice', 'resume.json')));
});

test('changing one chapter re-synthesises only that chapter', async () => {
  const project = projectWithChapters(3);
  await synthesizeChapters(project, options(fakeGemini()));
  const script = JSON.parse(fs.readFileSync(project.path('script.json'), 'utf8'));
  script.chapters[2].paragraphs[0].text = 'A changed sentence. [[analysis]]';
  fs.writeFileSync(project.path('script.json'), JSON.stringify(script));
  const again = fakeGemini();
  await synthesizeChapters(project, options(again));
  assert.equal(again.calls.length, 1);
});

test('requests carry clean spoken text with style outside the transcript', async () => {
  const project = projectWithChapters(1);
  const gemini = fakeGemini();
  await synthesizeChapters(project, options(gemini));
  const body = gemini.calls[0].body;
  const content = body.input[0].content[0];
  assert.ok(!content.text.includes('[['), 'tags stripped');
  assert.match(content.text, /Soor-ya Kaant/, 'pronunciation applied');
  const style = content.annotations.find((a) => a.type === 'speech_metadata').style;
  assert.ok(style.length > 0);
  assert.ok(!content.text.includes(style), 'style is not inside the transcript');
  assert.equal(body.generation_config.speech_config[0].voice, 'Charon');
  assert.equal(
    gemini.calls[0].url,
    'https://generativelanguage.googleapis.com/v1beta/interactions',
  );
});

test('stored chapter audio is 48 kHz stereo and never time-stretched', async () => {
  const project = projectWithChapters(1);
  await synthesizeChapters(project, options(fakeGemini()));
  const { probe } = require('../engine/util/proc.cjs');
  const meta = probe(project.path('work', 'voice', 'chapters', 'c01.wav'));
  const audio = meta.streams[0];
  assert.equal(Number(audio.sample_rate), 48000);
  assert.equal(audio.channels, 2);
  assert.ok(Math.abs(Number(meta.format.duration) - 0.5) < 0.02, 'duration unchanged');
});

test('the voice sample includes the opening, the names and the Shorts hooks', async () => {
  const project = projectWithChapters(2);
  fs.writeFileSync(
    project.path('shorts.json'),
    JSON.stringify([
      {
        id: 's1',
        hookLine: 'This changed everything.',
        fromSentence: 'c01p01s1',
        toSentence: 'c01p01s2',
      },
    ]),
  );
  const gemini = fakeGemini();
  await synthesizeSample(project, options(gemini));
  for (const name of ['intro.wav', 'names.wav', 'hooks.wav', 'manifest.json']) {
    assert.ok(fs.existsSync(project.path('work', 'voice', 'sample', name)), name);
  }
  const texts = gemini.calls.map((c) => c.body.input[0].content[0].text).join('\n');
  assert.match(texts, /Soor-ya Kaant/);
  assert.match(texts, /This changed everything\./);
});

test('the voice command exits 75 with a resume message when rate limited', async () => {
  const { main } = require('../tools/studio.cjs');
  const project = projectWithChapters(2);
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.GEMINI_API_KEY;
  const lines = [];
  const originalLog = console.log;
  globalThis.fetch = async () => limitedResponse();
  process.env.GEMINI_API_KEY = 'test-key';
  console.log = (line) => lines.push(String(line));
  try {
    assert.equal(await main(['voice', project.dir]), 75);
  } finally {
    globalThis.fetch = originalFetch;
    console.log = originalLog;
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = originalKey;
  }
  assert.match(lines.join('\n'), /run .*voice.* again later/i);
});

test('chapter and paragraph ids cannot steer files outside the project', async () => {
  const project = projectWithChapters(1);
  const script = JSON.parse(fs.readFileSync(project.path('script.json'), 'utf8'));
  script.chapters[0].id = '../../evil';
  fs.writeFileSync(project.path('script.json'), JSON.stringify(script));
  await assert.rejects(() => synthesizeChapters(project, options(fakeGemini())), /chapter id/i);

  const { retakeParagraph } = require('../engine/voice/synthesize.cjs');
  await assert.rejects(
    () => retakeParagraph(project, '..\..\evil', options(fakeGemini())),
    /paragraph id/i,
  );
});
