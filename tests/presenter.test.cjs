'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const { createProject, openProject } = require('../engine/project.cjs');

function tempProject({ mode = 'voice', language = 'en' } = {}) {
  const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-presenter-'));
  const channel = language === 'hi' ? 'hi-placeholder' : 'en-placeholder';
  const project = openProject(createProject('demo', { channel, date: '2026-11-08', projectsDir }));
  const brief = JSON.parse(fs.readFileSync(project.path('brief.json'), 'utf8'));
  fs.writeFileSync(
    project.path('brief.json'),
    JSON.stringify({ ...brief, presenter: { mode }, language }),
  );
  return project;
}

function writeScript(project, chapters) {
  fs.writeFileSync(project.path('script.json'), JSON.stringify({ chapters }));
}

function get(url) {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      })
      .on('error', reject);
  });
}

const SCRIPT = [
  {
    id: 1,
    title: 'The remark',
    paragraphs: [
      {
        id: 'c01p01',
        text: 'On 15 May, Surya Kant spoke. [[CL01]] Nobody expected it. [[analysis]]',
      },
      { id: 'c01p02', text: 'The clip spread fast. [[CL02]]' },
    ],
  },
  { id: 2, title: 'The party', paragraphs: [{ id: 'c02p01', text: 'A party was born. [[CL03]]' }] },
];

test('the teleprompter shows each chapter in order, in real spelling, without tags', () => {
  const { teleprompterData } = require('../engine/presenter/teleprompter.cjs');
  const project = tempProject();
  writeScript(project, SCRIPT);
  fs.writeFileSync(
    project.path('pronunciations.json'),
    JSON.stringify({ 'Surya Kant': 'Soor-ya Kaant' }),
  );
  const data = teleprompterData(project);
  assert.deepEqual(
    data.chapters.map((c) => c.title),
    ['The remark', 'The party'],
  );
  assert.deepEqual(data.chapters[0].paragraphs, [
    'On 15 May, Surya Kant spoke. Nobody expected it.',
    'The clip spread fast.',
  ]);
  assert.equal(data.chapters[0].file, 'recordings/c01.<ext>');
  assert.equal(data.script, 'latin');
});

test('the review server serves the teleprompter page with its script embedded safely', async () => {
  require('../engine/review/register-pages.cjs');
  const { startServer } = require('../engine/review/server.cjs');
  const project = tempProject();
  writeScript(project, [
    {
      id: 1,
      title: 'X',
      paragraphs: [{ id: 'c01p01', text: 'A </script><b>trick</b>. [[CL01]]' }],
    },
  ]);
  const server = await startServer(project, { port: 0 });
  try {
    const page = await get(`${server.url}/teleprompter`);
    assert.equal(page.status, 200);
    assert.ok(!page.body.includes('</script><b>'), 'script text cannot break out of the page');
    assert.match(page.body, /\\u003c\/script>/);
    const index = await get(`${server.url}/`);
    assert.match(index.body, /href="\/teleprompter"/);
  } finally {
    await server.close();
  }
});

test('the teleprompter page script is valid JavaScript', () => {
  const vm = require('node:vm');
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'engine', 'review', 'pages', 'teleprompter.html'),
    'utf8',
  );
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 1);
  for (const code of scripts) new vm.Script(code.replace(/\/\*TELEPROMPTER_DATA\*\/\s*null/, '{}'));
});

/** A speech-like test recording: 220 Hz bursts with real pauses, plus optional noise and gain. */
function recording(file, { seconds = 12, gain = 0.3, noise = 0.0003, video = null } = {}) {
  const { run, ffmpegPath } = require('../engine/util/proc.cjs');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const voice = `sine=f=220:d=${seconds},volume='if(lt(mod(t\,1)\,0.6)\,${gain}\,0)':eval=frame`;
  const args = ['-v', 'error', '-y', '-f', 'lavfi', '-i', voice];
  args.push('-f', 'lavfi', '-i', `anoisesrc=d=${seconds}:c=white:a=${noise}`);
  if (video)
    args.push(
      '-f',
      'lavfi',
      '-i',
      `testsrc=size=${video.size}:rate=${video.fps}:duration=${seconds}`,
    );
  args.push('-filter_complex', '[0:a][1:a]amix=inputs=2:normalize=0[a]', '-map', '[a]');
  if (video) args.push('-map', '2:v', '-pix_fmt', 'yuv420p');
  args.push('-ar', '48000', file);
  run(ffmpegPath(), args);
  return file;
}

test('a clean test recording passes and stop 3 can play it', () => {
  const { checkRecording } = require('../engine/presenter/recording-check.cjs');
  const project = tempProject();
  recording(project.path('recordings', 'sample.wav'));
  const { issues, report } = checkRecording(project);
  assert.deepEqual(issues, []);
  assert.ok(report.noiseFloorDb < -50, `noise floor ${report.noiseFloorDb}`);
  assert.equal(report.sampleRate, 48000);
  assert.ok(fs.existsSync(project.path('work', 'voice', 'sample', 'recording.wav')));
});

test('a clipped test recording is rejected with its clip count', () => {
  const { checkRecording } = require('../engine/presenter/recording-check.cjs');
  const project = tempProject();
  recording(project.path('recordings', 'sample.wav'), { gain: 40 });
  const { issues } = checkRecording(project);
  assert.ok(
    issues.some((i) => /clips \d+ time/.test(i)),
    issues.join('\n'),
  );
});

test('a noisy test recording reports its noise floor', () => {
  const { checkRecording } = require('../engine/presenter/recording-check.cjs');
  const project = tempProject();
  recording(project.path('recordings', 'sample.wav'), { noise: 0.05 });
  const { issues, report } = checkRecording(project);
  assert.ok(report.noiseFloorDb > -50);
  assert.ok(
    issues.some((i) => /noise floor -\d+(\.\d)? dBFS/.test(i)),
    issues.join('\n'),
  );
});

test('a missing test recording, and a low-resolution face recording, are explained', () => {
  const { checkRecording } = require('../engine/presenter/recording-check.cjs');
  const voice = tempProject();
  assert.match(checkRecording(voice).issues.join('\n'), /recordings\/sample\./);
  const face = tempProject({ mode: 'face' });
  recording(face.path('recordings', 'sample.mp4'), { video: { size: '1280x720', fps: 30 } });
  assert.match(checkRecording(face).issues.join('\n'), /1280×720/);
});

test('stop 3 plays the owner test recording and shows its measurements', () => {
  const { checkRecording } = require('../engine/presenter/recording-check.cjs');
  require('../engine/review/register-pages.cjs');
  const { pageData } = require('../engine/review/pages.cjs');
  const project = tempProject();
  recording(project.path('recordings', 'sample.wav'));
  checkRecording(project);
  const page = pageData(project, 'gate:voice');
  const audio = page.sections.find((s) => s.kind === 'audio');
  assert.equal(audio.items[0].path, 'work/voice/sample/recording.wav');
  const text = JSON.stringify(page.sections);
  assert.match(text, /Noise floor/);
  assert.match(text, /Sample rate 48000 Hz/);
});

test('the recording:check command stamps the voice-sample step only when it passes', async () => {
  const { main } = require('../tools/studio.cjs');
  const { stepState } = require('../engine/next.cjs');
  const project = tempProject();
  recording(project.path('recordings', 'sample.wav'), { noise: 0.05 });
  assert.equal(await main(['recording:check', project.dir]), 1);
  recording(project.path('recordings', 'sample.wav'));
  assert.equal(await main(['recording:check', project.dir]), 0);
  assert.notEqual(stepState(project, 'voice-sample'), 'todo');
});

const TWO_CHAPTERS = [
  { id: 1, title: 'One', paragraphs: [{ id: 'c01p01', text: 'First chapter. [[analysis]]' }] },
  { id: 2, title: 'Two', paragraphs: [{ id: 'c02p01', text: 'Second chapter. [[analysis]]' }] },
];

test('import writes a cleaned 48 kHz stereo chapter file for each recording', () => {
  const { importRecordings } = require('../engine/presenter/import.cjs');
  const { probe } = require('../engine/util/proc.cjs');
  const project = tempProject();
  writeScript(project, TWO_CHAPTERS);
  recording(project.path('recordings', 'c01.wav'), { seconds: 6 });
  recording(project.path('recordings', 'c02.mp3'), { seconds: 5 });
  const result = importRecordings(project);
  assert.deepEqual(result.issues, []);
  assert.deepEqual(result.imported, ['c01', 'c02']);
  for (const cid of ['c01', 'c02']) {
    const a = probe(project.path('work', 'voice', 'chapters', `${cid}.wav`)).streams[0];
    assert.equal(Number(a.sample_rate), 48000);
    assert.equal(a.channels, 2);
  }
});

test('a missing chapter recording is reported by chapter id', () => {
  const { importRecordings } = require('../engine/presenter/import.cjs');
  const project = tempProject();
  writeScript(project, TWO_CHAPTERS);
  recording(project.path('recordings', 'c01.wav'), { seconds: 4 });
  const { issues } = importRecordings(project);
  assert.equal(issues.length, 1);
  assert.match(issues[0], /^c02: no recording .*recordings\/c02\./);
});

test('re-importing an unchanged recording is skipped; a changed one is redone', () => {
  const { importRecordings } = require('../engine/presenter/import.cjs');
  const project = tempProject();
  writeScript(project, [TWO_CHAPTERS[0]]);
  recording(project.path('recordings', 'c01.wav'), { seconds: 4 });
  importRecordings(project);
  const out = project.path('work', 'voice', 'chapters', 'c01.wav');
  const before = fs.statSync(out).mtimeMs;
  const again = importRecordings(project);
  assert.deepEqual(again.skipped, ['c01']);
  assert.equal(fs.statSync(out).mtimeMs, before);
  recording(project.path('recordings', 'c01.wav'), { seconds: 5 });
  assert.deepEqual(importRecordings(project).imported, ['c01']);
});

test('a clipped chapter recording is reported so it can be recorded again', () => {
  const { importRecordings } = require('../engine/presenter/import.cjs');
  const project = tempProject();
  writeScript(project, [TWO_CHAPTERS[0]]);
  recording(project.path('recordings', 'c01.wav'), { seconds: 4, gain: 40 });
  assert.match(importRecordings(project).issues.join('\n'), /c01: the recording clips \d+ time/);
});

test('face mode also keeps a 30 fps video copy without sound', () => {
  const { importRecordings } = require('../engine/presenter/import.cjs');
  const { probe } = require('../engine/util/proc.cjs');
  const project = tempProject({ mode: 'face' });
  writeScript(project, [TWO_CHAPTERS[0]]);
  recording(project.path('recordings', 'c01.mp4'), {
    seconds: 3,
    video: { size: '1920x1080', fps: 60 },
  });
  assert.deepEqual(importRecordings(project).issues, []);
  const streams = probe(project.path('work', 'presenter', 'c01.mp4')).streams;
  assert.deepEqual(
    streams.map((s) => s.codec_type),
    ['video'],
  );
  assert.equal(streams[0].avg_frame_rate, '30/1');
  assert.equal(streams[0].width, 1920);
});

test('the recording:import command stamps the voice step only when every chapter is in', async () => {
  const { main } = require('../tools/studio.cjs');
  const { stepState } = require('../engine/next.cjs');
  const project = tempProject();
  writeScript(project, TWO_CHAPTERS);
  recording(project.path('recordings', 'c01.wav'), { seconds: 4 });
  assert.equal(await main(['recording:import', project.dir]), 1);
  recording(project.path('recordings', 'c02.wav'), { seconds: 4 });
  assert.equal(await main(['recording:import', project.dir]), 0);
  assert.notEqual(stepState(project, 'voice'), 'todo');
});

/** Recogniser words for a phrase, starting at `start`, one word every `step` seconds. */
function spoken(text, start, step = 0.4) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((t, i) => ({ text: t, start: start + i * step, end: start + i * step + step * 0.8 }));
}

const S1 = 'The court heard the case on a quiet Monday morning.';
const S2 = 'Nobody expected the ruling that followed.';
const sentencesOf = (...texts) => texts.map((t, i) => ({ id: `s${i + 1}`, tokens: t.split(' ') }));

test('a sentence said twice keeps the second take', () => {
  const { chooseTakes } = require('../engine/presenter/takes.cjs');
  const asr = [...spoken(S1, 0), ...spoken(S1, 5), ...spoken(S2, 10)];
  const { kept, retakes } = chooseTakes(sentencesOf(S1, S2), asr);
  assert.ok(Math.abs(kept[0].start - 5) < 0.01, `kept S1 at ${kept[0].start}`);
  assert.ok(Math.abs(kept[1].start - 10) < 0.01);
  assert.equal(retakes.length, 1);
  assert.ok(Math.abs(retakes[0].start - 0) < 0.01);
});

test('a restart inside a sentence is cut, and is not called an ad-lib', () => {
  const { chooseTakes } = require('../engine/presenter/takes.cjs');
  const asr = [...spoken('The court', 0), ...spoken(S1, 1.5), ...spoken(S2, 6.5)];
  const { kept, adlibs } = chooseTakes(sentencesOf(S1, S2), asr);
  assert.ok(Math.abs(kept[0].start - 1.5) < 0.01);
  assert.deepEqual(adlibs, []);
});

test('unscripted words are listed as an ad-lib with their time, and cut', () => {
  const { chooseTakes, editList } = require('../engine/presenter/takes.cjs');
  const asr = [
    ...spoken(S1, 0),
    ...spoken('and honestly this was really wild', 5),
    ...spoken(S2, 9),
  ];
  const { kept, adlibs } = chooseTakes(sentencesOf(S1, S2), asr);
  assert.equal(adlibs.length, 1);
  assert.equal(adlibs[0].text, 'and honestly this was really wild');
  assert.ok(Math.abs(adlibs[0].start - 5) < 0.01);
  const segments = editList(kept, 12);
  assert.ok(
    !segments.some(([a, b]) => a < adlibs[0].end && b > adlibs[0].start + 0.2),
    'the ad-lib is not in the edit',
  );
});

test('pauses longer than 0.35 s are shortened to 0.35 s; shorter ones are kept', () => {
  const { editList } = require('../engine/presenter/takes.cjs');
  const segments = editList(
    [
      { start: 0.5, end: 2.0 },
      { start: 2.2, end: 3.0 },
      { start: 5.0, end: 6.0 },
    ],
    7,
  );
  assert.equal(segments.length, 2, 'the 0.2 s pause is kept inside one segment');
  assert.ok(segments[0][1] < segments[1][0], 'segments are in order and do not overlap');
  // In the edited audio, the quiet between "3.0" (speech ends) and "5.0" (speech starts again).
  const pauseOut = segments[0][1] - 3.0 + (5.0 - segments[1][0]);
  assert.ok(Math.abs(pauseOut - 0.35) < 1e-9, `pause is ${pauseOut} s`);
});

test('the edited chapter is shorter than the raw one by exactly the cut time', () => {
  const { applyEdit } = require('../engine/presenter/takes.cjs');
  const { probe, run, ffmpegPath } = require('../engine/util/proc.cjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-edit-'));
  const raw = path.join(dir, 'raw.wav');
  run(ffmpegPath(), [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=f=220:d=8',
    '-ar',
    '48000',
    '-ac',
    '2',
    raw,
  ]);
  const segments = [
    [0.2, 1.5],
    [2.0, 4.25],
    [6.0, 7.9],
  ];
  const out = path.join(dir, 'edited.wav');
  applyEdit(raw, out, segments);
  const expected = segments.reduce((n, [a, b]) => n + (b - a), 0);
  const actual = Number(probe(out).format.duration);
  assert.ok(Math.abs(actual - expected) < 0.02, `${actual} vs ${expected}`);
});

test('a Hindi sentence said twice keeps the second take (real recogniser spelling)', () => {
  const { chooseTakes } = require('../engine/presenter/takes.cjs');
  const samples = require('./fixtures/audio/asr-samples.json');
  const once = samples.hi.asr;
  const length = once[once.length - 1].end + 1;
  const twice = [
    ...once,
    ...once.map((w) => ({ ...w, start: w.start + length, end: w.end + length })),
  ];
  const tokens = samples.hi.text.split(/\s+/).filter(Boolean);
  const { kept, retakes } = chooseTakes([{ id: 's1', tokens }], twice);
  assert.ok(kept[0].start >= length - 0.01, `kept at ${kept[0].start}, second take at ${length}`);
  assert.equal(retakes.length, 1);
});

test('voice-mode alignment cuts the repeat and aligns paragraphs to the edited audio', async () => {
  const { splitChapter } = require('../engine/align/split.cjs');
  const { probe, run, ffmpegPath } = require('../engine/util/proc.cjs');
  const project = tempProject();
  writeScript(project, [
    {
      id: 1,
      title: 'One',
      paragraphs: [
        { id: 'c01p01', text: `${S1} [[analysis]]` },
        { id: 'c01p02', text: `${S2} [[analysis]]` },
      ],
    },
  ]);
  const raw = project.path('work', 'voice', 'chapters', 'c01.wav');
  fs.mkdirSync(path.dirname(raw), { recursive: true });
  run(ffmpegPath(), [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    'sine=f=200:d=14',
    '-ar',
    '48000',
    '-ac',
    '2',
    raw,
  ]);
  const asr = [...spoken(S1, 0.3), ...spoken(S1, 5), ...spoken(S2, 10)];
  const result = await splitChapter(project, 1, { asr: async () => asr });
  assert.deepEqual(result.issues, []);
  const edl = JSON.parse(fs.readFileSync(project.path('work', 'takes', 'c01.edl.json'), 'utf8'));
  assert.ok(edl.segments[0][0] >= 4.5, 'the first take is cut');
  const edited = Number(probe(project.path('work', 'takes', 'c01.wav')).format.duration);
  assert.ok(edited < 10, `edited chapter is ${edited} s`);
  const p1 = JSON.parse(fs.readFileSync(project.path('work', 'align', 'c01p01.json'), 'utf8'));
  assert.equal(p1.words.length, S1.split(' ').length);
  assert.ok(p1.words[0].start < 0.5, 'paragraph 1 starts at the kept take');
});

test('stop 4 lists each unscripted passage with a player at its place in the raw recording', () => {
  require('../engine/review/register-pages.cjs');
  const { pageData } = require('../engine/review/pages.cjs');
  const project = tempProject();
  const dir = project.path('work', 'takes');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'c01.adlibs.json'),
    JSON.stringify({
      chapter: 'c01',
      adlibs: [{ text: 'and honestly this was really wild', start: 5, end: 7.3 }],
    }),
  );
  const page = pageData(project, 'gate:storyboard');
  const section = page.sections.find((s) => /Unscripted/.test(s.heading || ''));
  assert.ok(section, 'an unscripted-passages section');
  assert.equal(section.kind, 'audio');
  assert.deepEqual(section.items[0], {
    path: 'work/voice/chapters/c01.wav',
    label: 'c01 at 00:05: "and honestly this was really wild" — cut',
    start: 5,
    end: 7.3,
  });
});

test('voice mode calls category D "Delivery" and keeps every weight', () => {
  const { namesFor, RUBRIC, NAMES } = require('../engine/score/rubric.cjs');
  assert.equal(namesFor('ai').D, 'Voice');
  assert.equal(namesFor('voice').D, 'Delivery');
  assert.equal(namesFor('face').D, 'Delivery');
  assert.equal(NAMES.D, 'Voice');
  assert.deepEqual(RUBRIC.long, {
    A: 10,
    B: 15,
    C: 10,
    D: 10,
    E: 5,
    F: 15,
    G: 15,
    H: 5,
    I: 10,
    J: 5,
  });
  require('../engine/review/register-pages.cjs');
  const { pageData } = require('../engine/review/pages.cjs');
  const page = pageData(tempProject(), 'gate:final');
  const form = page.sections.find((s) => s.kind === 'form');
  assert.match(form.questions.find((q) => q.id === 'D').label, /your delivery/i);
});

const HOOKS = [
  {
    id: 's1',
    hookLine: 'One remark changed everything',
    fromSentence: 'c01p01s1',
    toSentence: 'c01p01s1',
  },
  {
    id: 's2',
    hookLine: 'Nobody saw this party coming',
    fromSentence: 'c01p01s1',
    toSentence: 'c01p01s1',
  },
];

test('with Shorts planned, the test-recording step also cleans and places the hook lines', async () => {
  const { recordSample } = require('../engine/presenter/recording-check.cjs');
  const { hookSpan } = require('../engine/shorts/spans.cjs');
  const project = tempProject();
  fs.writeFileSync(project.path('shorts.json'), JSON.stringify(HOOKS));
  recording(project.path('recordings', 'sample.wav'));
  recording(project.path('recordings', 'hooks.wav'), { seconds: 6 });
  const asr = async () => [...spoken(HOOKS[0].hookLine, 0.4), ...spoken(HOOKS[1].hookLine, 3.2)];
  const { issues } = await recordSample(project, { asr });
  assert.deepEqual(issues, []);
  assert.ok(fs.existsSync(project.path('work', 'voice', 'sample', 'hooks.wav')));
  const s2 = hookSpan(project, { id: 's2' });
  assert.ok(Math.abs(s2.start - 3.2) < 0.05, `s2 hook at ${s2.start}`);
});

test('with Shorts planned, a missing hooks recording is explained', async () => {
  const { recordSample } = require('../engine/presenter/recording-check.cjs');
  const project = tempProject();
  fs.writeFileSync(project.path('shorts.json'), JSON.stringify(HOOKS));
  recording(project.path('recordings', 'sample.wav'));
  const { issues } = await recordSample(project, { asr: async () => [] });
  assert.match(issues.join('\n'), /recordings\/hooks\./);
});

test('the teleprompter ends with the Shorts hook lines to record', () => {
  const { teleprompterData } = require('../engine/presenter/teleprompter.cjs');
  const project = tempProject();
  writeScript(project, TWO_CHAPTERS);
  fs.writeFileSync(project.path('shorts.json'), JSON.stringify(HOOKS));
  const last = teleprompterData(project).chapters.at(-1);
  assert.equal(last.file, 'recordings/hooks.<ext>');
  assert.deepEqual(
    last.paragraphs,
    HOOKS.map((h) => h.hookLine),
  );
});
