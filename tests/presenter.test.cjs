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
