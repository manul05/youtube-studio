'use strict';

// End-to-end: a complete short project, in English and in Hindi, through every step to release.
// Gemini (voice and review) and speech recognition are simulated; everything else is real:
// planning, image checks, storyboard, rendering, mixing, Shorts, packaging, QC, scoring, PIN
// approvals and release. Run with: npm run test:e2e (takes several minutes).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createCanvas } = require('@napi-rs/canvas');

const LIBRARY = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-e2e-library-'));
process.env.STUDIO_LIBRARY_DIR = LIBRARY;
const PIN_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'studio-e2e-pin-')), 'pin.json');
const PIN = '246810';

const { run, ffmpegPath, probe } = require('../../engine/util/proc.cjs');
const { readJson } = require('../../engine/util/files.cjs');
const { main } = require('../../tools/studio.cjs');
const { createProject, openProject } = require('../../engine/project.cjs');
const { nextAction, writeStamp } = require('../../engine/next.cjs');
const { setPin, deriveKey } = require('../../engine/review/pin.cjs');
const { writeApproval } = require('../../engine/review/approvals.cjs');
const { startServer } = require('../../engine/review/server.cjs');
const { synthesizeSample, synthesizeChapters } = require('../../engine/voice/synthesize.cjs');
const { alignSample } = require('../../engine/align/sample.cjs');
const { alignProject } = require('../../engine/align/split.cjs');
const { voiceIssues } = require('../../engine/align/voice-check.cjs');
const { aiReview } = require('../../engine/score/ai-review.cjs');
const { aggregate } = require('../../engine/score/aggregate.cjs');
const { release } = require('../../engine/release.cjs');

const SECONDS_PER_WORD = 0.38;
setPin(PIN, { pinFile: PIN_FILE });
const KEY = deriveKey(PIN, { pinFile: PIN_FILE });

// ---------- simulated services ----------

function speechWav(seconds) {
  const rate = 24000;
  const n = Math.round(rate * seconds);
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVEfmt ', 8);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i += 1) {
    const t = i / rate;
    const syllable = t % SECONDS_PER_WORD < SECONDS_PER_WORD * 0.75 ? 0.5 : 0.08;
    buf.writeInt16LE(Math.round(9000 * syllable * Math.sin(2 * Math.PI * 170 * t)), 44 + i * 2);
  }
  return buf;
}

const words = (text) => text.split(/\s+/).filter(Boolean);

async function fakeGemini(url, init) {
  const body = JSON.parse(init.body);
  if (url.endsWith('/interactions')) {
    const text = body.input[0].content[0].text;
    const seconds = words(text).length * SECONDS_PER_WORD + 0.3;
    const data = speechWav(seconds).toString('base64');
    return {
      ok: true,
      status: 200,
      json: async () => ({
        steps: [
          { type: 'model_output', content: [{ type: 'audio', mime_type: 'audio/wav', data }] },
        ],
      }),
    };
  }
  if (url.includes(':generateContent')) {
    const cats = body.generationConfig.responseSchema.properties.categories.required;
    const categories = Object.fromEntries(
      cats.map((c) => [c, { score: 97, reasons: [{ t: 1, note: 'Strong.' }] }]),
    );
    return {
      ok: true,
      status: 200,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: JSON.stringify({ categories }) }] } }],
      }),
    };
  }
  throw new Error(`Unexpected request ${url}`);
}

/** Simulated recogniser: the words the voice was given, spread evenly over the audio. */
async function fakeAsr(audioPath) {
  const meta = `${audioPath.slice(0, -4)}.json`;
  const text = fs.existsSync(meta) ? readJson(meta).text : '';
  const tokens = words(text);
  const duration = Number(probe(audioPath).format.duration);
  const step = (duration - 0.3) / Math.max(1, tokens.length);
  return tokens.map((t, i) => ({ text: t, start: 0.15 + i * step, end: 0.15 + (i + 0.8) * step }));
}

// ---------- fixture content ----------

function setupLibrary() {
  const music = path.join(LIBRARY, 'music');
  fs.mkdirSync(music, { recursive: true });
  for (const [i, f] of [220, 277].entries()) {
    run(ffmpegPath(), [
      '-v',
      'error',
      '-y',
      '-f',
      'lavfi',
      '-i',
      `sine=f=${f}:d=20`,
      '-af',
      'volume=0.3',
      '-ar',
      '48000',
      '-ac',
      '2',
      path.join(music, `bed${i}.wav`),
    ]);
  }
  fs.writeFileSync(
    path.join(music, 'index.json'),
    JSON.stringify(
      [0, 1].map((i) => ({
        file: `bed${i}.wav`,
        moods: ['documentary'],
        licence: 'YouTube Audio Library',
      })),
    ),
  );
  for (const [id, language, captionScript] of [
    ['real-en', 'en', 'latin'],
    ['real-hi', 'hi', 'deva'],
  ]) {
    const dir = path.join(LIBRARY, 'channels', id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'channel.json'),
      JSON.stringify({
        name: `Real ${language}`,
        handle: `@real${language}`,
        language,
        captionScript,
        voice: { name: 'Charon', style: 'calm' },
        musicMoods: ['documentary'],
        placeholder: false,
      }),
    );
  }
}

const CONTENT = {
  en: {
    channel: 'real-en',
    language: 'en',
    captionScript: 'latin',
    titles: [
      'How one word became a movement',
      'The cockroach party explained',
      'Why a remark went viral',
    ],
    thumbTexts: ['ONE WORD', 'WHY?', 'LAUGH'],
    sentence: (n) =>
      `In May ${2020 + n} a single remark in a crowded courtroom travelled across the country faster than anyone in that room expected it could.`,
    analysis:
      'That speed tells us something important about how young people now share their anger together online.',
    quote: {
      text: 'We are not going anywhere.',
      speaker: 'A student organiser',
      source: 'Example News',
      date: '2026-05-21',
    },
  },
  hi: {
    channel: 'real-hi',
    language: 'hi',
    captionScript: 'deva',
    titles: [
      'एक शब्द कैसे आंदोलन बन गया',
      'कॉकरोच पार्टी की पूरी कहानी',
      'एक टिप्पणी क्यों वायरल हुई',
    ],
    thumbTexts: ['एक शब्द', 'क्यों?', 'हँसी'],
    sentence: (n) =>
      `मई ${2020 + n} में अदालत की एक टिप्पणी पूरे देश में इतनी तेज़ी से फैली कि वहाँ बैठे किसी ने भी इसकी उम्मीद नहीं की थी।`,
    analysis: 'यह रफ़्तार बताती है कि नई पीढ़ी के युवा अपनी नाराज़गी को ऑनलाइन मिलकर कैसे साझा करते हैं।',
    quote: {
      text: 'हम कहीं नहीं जा रहे हैं।',
      speaker: 'एक छात्र आयोजक',
      source: 'Example News',
      date: '2026-05-21',
    },
  },
};

function picture(file, seed, busy = true) {
  const c = createCanvas(1600, 900);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 1600, 900);
  grad.addColorStop(0, `hsl(${seed * 53}, 45%, 25%)`);
  grad.addColorStop(1, `hsl(${seed * 53 + 60}, 50%, 55%)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 1600, 900);
  if (busy) {
    for (let i = 0; i < 25; i += 1) {
      g.fillStyle = `hsl(${(i * 37 + seed * 71) % 360}, 65%, ${30 + (i % 5) * 9}%)`;
      g.beginPath();
      g.arc(
        (i * 211 + seed * 97) % 1600,
        (i * 131 + seed * 53) % 900,
        40 + ((i * seed) % 7) * 18,
        0,
        Math.PI * 2,
      );
      g.fill();
    }
  } else {
    g.fillStyle = `hsl(${seed * 53 + 180}, 60%, 50%)`;
    g.beginPath();
    g.arc(900 + (seed % 3) * 220, 250 + (seed % 2) * 400, 160 + (seed % 4) * 60, 0, Math.PI * 2);
    g.fill();
    g.fillRect(seed % 2 ? 1200 : 700, seed % 3 ? 650 : 80, 300, 160);
  }
  fs.writeFileSync(file, c.toBuffer('image/png'));
}

async function quietly(fn) {
  const log = console.log;
  const lines = [];
  console.log = (...a) => lines.push(a.join(' '));
  try {
    return { result: await fn(), lines };
  } finally {
    console.log = log;
  }
}

async function cli(args) {
  const { result, lines } = await quietly(() => main(args));
  assert.equal(result, 0, `npm run ${args.join(' ')} failed:\n${lines.join('\n')}`);
  return lines;
}

function approve(project, gate) {
  assert.equal(nextAction(project).stepId, gate, `${gate} should be the next action`);
  writeApproval(project, gate, KEY, { decision: 'approve', pinFile: PIN_FILE });
}

function writeFile(project, rel, value) {
  fs.writeFileSync(project.path(rel), `${JSON.stringify(value, null, 2)}\n`);
}

function post(url, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      url,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data || '{}') }));
      },
    );
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

// ---------- the run ----------

async function produce(lang) {
  const c = CONTENT[lang];
  const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), `studio-e2e-${lang}-`));
  const project = openProject(
    createProject(`e2e-${lang}`, { channel: c.channel, date: '2026-10-25', projectsDir }),
  );

  // Words: 3 chapters × 2 paragraphs, each paragraph two tagged sentences.
  const paragraphs = [];
  const script = { chapters: [] };
  // Three beats per paragraph, at one third and two thirds of its words.
  const art = (extra) => ({ type: 'art-focus', focus: [0.2, 0.2, 0.6, 0.6], ...extra });
  const tour = {
    type: 'art-tour',
    crops: [
      [0, 0, 0.6, 0.6],
      [0.4, 0.2, 0.6, 0.6],
      [0.2, 0.4, 0.6, 0.6],
    ],
  };
  const kinetic = (text) => ({ type: 'kinetic', text });
  const list = { type: 'list', items: c.thumbTexts };
  const stat = {
    type: 'stat',
    value: 2000000,
    label: c.thumbTexts[0],
    source: 'Example News',
    claim: 'CL01',
  };
  const quote = { type: 'quote', ...c.quote, claim: 'CL01' };
  const compare = {
    type: 'compare',
    left: { title: c.thumbTexts[0], points: [c.thumbTexts[1]] },
    right: { title: c.thumbTexts[2], points: [c.thumbTexts[1]] },
  };
  const beatPlans = [
    [art({ illustration: true }), kinetic(c.titles[0]), list],
    [stat, list, kinetic(c.titles[1])],
    [tour, quote, compare],
    [quote, art(), kinetic(c.titles[2])],
    [compare, kinetic(c.titles[0]), tour],
    [art(), list, kinetic(c.titles[1])],
  ];
  for (let ch = 1; ch <= 3; ch += 1) {
    const chapter = { id: ch, title: c.titles[ch - 1], paragraphs: [] };
    for (let p = 1; p <= 2; p += 1) {
      const id = `c0${ch}p0${p}`;
      const k = (ch - 1) * 2 + (p - 1);
      const text = `${c.sentence(k)} [[CL01]] ${c.analysis} [[analysis]]`;
      const n = words(text.replace(/[[[^]]+]]/g, '')).length;
      const beats = beatPlans[k].map((b, i) => ({
        ...b,
        atWord: Math.round((i * n) / 3),
        ...(b.type.startsWith('art-')
          ? { imagePrompt: `Illustrated scene ${k}-${i} of a crowded city square at dusk` }
          : {}),
      }));
      chapter.paragraphs.push({ id, text, hold: 0.4, beats });
      paragraphs.push(id);
    }
    script.chapters.push(chapter);
  }
  const totalWords = script.chapters
    .flatMap((x) => x.paragraphs)
    .reduce((n, p) => n + words(p.text.replace(/\[\[[^\]]+\]\]/g, '')).length, 0);
  const estimateSec = (totalWords / 155) * 60 + paragraphs.length * 0.4;

  // 1 · Idea
  const brief = readJson(project.path('brief.json'));
  Object.assign(brief, {
    topic: 'A courtroom remark and a youth movement',
    angle: 'How one word became a movement',
    audience: 'Young Indians',
    promise: 'Understand what happened and why it spread',
    hook: c.sentence(0),
    titles: c.titles,
    thumbTexts: c.thumbTexts,
    mood: ['documentary'],
    lengthTargetMin: Math.round((estimateSec / 60) * 100) / 100,
    style: { main: 'editorial', accents: { quote: 'kinetic' } },
    formats: ['long', 'short'],
  });
  writeFile(project, 'brief.json', brief);
  await cli(['brief:check', project.dir]);
  approve(project, 'gate:idea');

  // 2–4 · Research, outline, script
  writeFile(project, 'research.json', {
    sources: [
      {
        id: 'S01',
        url: 'https://example.com/report',
        publisher: 'Example News',
        published: '2026-05-21',
        accessed: '2026-10-24',
        excerpt: 'Supporting excerpt.',
      },
      {
        id: 'S02',
        url: 'https://example.org/analysis',
        publisher: 'Example Review',
        published: '2026-06-02',
        accessed: '2026-10-24',
        excerpt: 'Supporting excerpt.',
      },
    ],
    claims: [
      {
        id: 'CL01',
        text: 'The remark spread quickly.',
        status: 'attributed',
        contested: true,
        sources: ['S01', 'S02'],
      },
    ],
  });
  await cli(['research:check', project.dir]);
  const per = Math.round(estimateSec / 3);
  writeFile(project, 'outline.json', {
    chapters: script.chapters.map((x, i) => ({
      id: x.id,
      title: x.title,
      purpose: 'Explain',
      targetSeconds: i === 2 ? Math.round(estimateSec) - 2 * per : per,
    })),
    hook: { endsAt: 20 },
    rehooks: [],
    payoff: 'Why it spread.',
  });
  await cli(['outline:check', project.dir]);
  writeFile(project, 'script.json', script);
  writeFile(project, 'pronunciations.json', {});
  writeFile(project, 'shorts.json', [
    { id: 's1', hookLine: c.titles[0], fromSentence: 'c01p01s1', toSentence: 'c02p01s2' },
    { id: 's2', hookLine: c.titles[1], fromSentence: 'c01p02s1', toSentence: 'c02p02s2' },
    { id: 's3', hookLine: c.titles[2], fromSentence: 'c02p02s1', toSentence: 'c03p02s2' },
  ]);
  await cli(['script:check', project.dir]);
  approve(project, 'gate:script');

  // 5–7 · Voice sample, voice, align (simulated Gemini and recogniser)
  const gemini = { fetch: fakeGemini, apiKey: 'test-key' };
  assert.equal((await synthesizeSample(project, gemini)).rateLimited, false);
  await alignSample(project, { asr: fakeAsr });
  writeStamp(project, 'voice-sample');
  approve(project, 'gate:voice');
  assert.deepEqual((await synthesizeChapters(project, gemini)).pending, []);
  writeStamp(project, 'voice');
  assert.deepEqual((await alignProject(project, { asr: fakeAsr })).issues, []);
  assert.deepEqual(voiceIssues(project).issues, []);
  writeStamp(project, 'align');

  // 8–10 · Plan, assets, storyboard
  await cli(['plan', project.dir]);
  await cli(['images:prompts', project.dir]);
  readJson(project.path('assets', 'image_prompts.json')).forEach((p, i) =>
    picture(project.path('assets', 'images', p.file), i + 1, !p.file.startsWith('thumb_')),
  );
  await cli(['images:record', project.dir, '--origin=agent-generated:test']);
  await cli(['images:check', project.dir]);
  await cli(['preview', project.dir]);
  approve(project, 'gate:storyboard');

  // 11–14 · Render, Shorts, package, QC, AI review
  await cli(['render', project.dir]);
  await cli(['shorts', project.dir]);
  await cli(['package', project.dir]);
  await cli(['qc', project.dir]);
  await aiReview(project, { ...gemini, model: 'gemini-test-flash' });
  aggregate(project);
  writeStamp(project, 'ai-review');

  // Stop 5 through the review server, with the PIN.
  const server = await startServer(project, { port: 0, pinFile: PIN_FILE });
  try {
    const rating = { A: 'Excellent', BG: 'Excellent', D: 'Excellent', F: 'Excellent' };
    const shorts = Object.fromEntries(['s1', 's2', 's3'].map((id) => [id, rating]));
    const saved = await post(`${server.url}/gate/${encodeURIComponent('gate:final')}/ratings`, {
      pin: PIN,
      ratings: { ...rating, I: 'Excellent' },
      shorts,
      drags: [],
      pick: { thumbnail: 1, title: 1 },
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    const approved = await post(`${server.url}/gate/${encodeURIComponent('gate:final')}`, {
      pin: PIN,
      decision: 'approve',
      notes: '',
    });
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
  } finally {
    await server.close();
  }

  const out = await release(project, PIN, { pinFile: PIN_FILE });
  return { project, out };
}

setupLibrary();

for (const lang of ['en', 'hi']) {
  test(
    `a ${lang} project goes from idea to a released 95+ package`,
    { timeout: 45 * 60 * 1000 },
    async () => {
      const { project, out } = await produce(lang);
      assert.ok(fs.existsSync(path.join(out.dir, 'master.mp4')));
      assert.equal(out.score.releasable, true);
      assert.ok(out.score.total >= 95, `score ${out.score.total}`);
      const qcReport = readJson(project.path('outputs', 'qc', 'qc.json'));
      assert.deepEqual(qcReport.hardFails, []);
      assert.ok(qcReport.metrics.staticLongest <= 6, `static ${qcReport.metrics.staticLongest}`);
    },
  );
}
