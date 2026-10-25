'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

process.env.STUDIO_STYLES_DIRS = path.join(__dirname, 'fixtures', 'styles');
const LIBRARY = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-library-'));
process.env.STUDIO_LIBRARY_DIR = LIBRARY;

const { run, ffmpegPath, probe } = require('../engine/util/proc.cjs');
const { createProject, openProject } = require('../engine/project.cjs');
const { pickMusic } = require('../engine/audio/music.cjs');
const { buildMix, voiceToMusicDb } = require('../engine/audio/mix.cjs');
const { assembleMaster } = require('../engine/assemble/master.cjs');
const { renderAll } = require('../engine/render/render-all.cjs');

function tone(file, seconds, freq, extra = []) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  run(ffmpegPath(), [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `sine=f=${freq}:d=${seconds}`,
    ...extra,
    '-ar',
    '48000',
    '-ac',
    '2',
    file,
  ]);
}

function writeMusicLibrary(tracks) {
  const dir = path.join(LIBRARY, 'music');
  fs.mkdirSync(dir, { recursive: true });
  const index = tracks.map((name, i) => {
    tone(path.join(dir, name), 8, 330 + i * 110, ['-af', 'volume=0.4']);
    return {
      file: name,
      moods: ['neutral'],
      bpm: 90,
      licence: 'YouTube Audio Library',
      attributionRequired: false,
    };
  });
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index));
}

/** A two-chapter project whose paragraphs have speech-like tone bursts as their voice. */
function audioProject(projectsDir, { seconds = 5 } = {}) {
  const project = openProject(
    createProject('demo', { channel: 'en-placeholder', date: '2026-10-25', projectsDir }),
  );
  const brief = JSON.parse(fs.readFileSync(project.path('brief.json'), 'utf8'));
  brief.style = { main: 'fixture', accents: {} };
  brief.mood = ['neutral'];
  fs.writeFileSync(project.path('brief.json'), JSON.stringify(brief));
  const frames = seconds * 30;
  const plan = {
    format: 'long',
    fps: 30,
    width: 640,
    height: 360,
    frames: frames * 2,
    chapters: [
      { id: 1, title: 'One', startFrame: 0, frames },
      { id: 2, title: 'Two', startFrame: frames, frames },
    ],
    paragraphs: [
      { id: 'c01p01', chapter: 1, startFrame: 0, frames, lead: 0.18 },
      { id: 'c02p01', chapter: 2, startFrame: frames, frames, lead: 0.18 },
    ],
    beats: [
      {
        id: 'c01p01b0',
        chapter: 1,
        paragraph: 'c01p01',
        type: 'kinetic',
        startFrame: 0,
        frames,
        fields: { text: 'One' },
        style: 'fixture',
      },
      {
        id: 'c02p01b0',
        chapter: 2,
        paragraph: 'c02p01',
        type: 'kinetic',
        startFrame: frames,
        frames,
        fields: { text: 'Two' },
        style: 'fixture',
      },
    ],
  };
  fs.writeFileSync(project.path('beats.json'), JSON.stringify(plan));
  for (const p of plan.paragraphs) {
    tone(project.path('work', 'voice', 'paragraphs', `${p.id}.wav`), seconds - 0.8, 180, [
      '-af',
      "volume='if(lt(mod(t,0.5),0.35),0.8,0.05)':eval=frame",
    ]);
  }
  fs.mkdirSync(project.path('assets'), { recursive: true });
  fs.writeFileSync(
    project.path('assets', 'ledger.json'),
    JSON.stringify({ images: {}, stock: {} }),
  );
  return project;
}

test('an empty music library is refused with a clear message', () => {
  fs.mkdirSync(path.join(LIBRARY, 'music'), { recursive: true });
  fs.writeFileSync(path.join(LIBRARY, 'music', 'index.json'), '[]');
  const plan = { chapters: [{ id: 1 }] };
  assert.throws(
    () => pickMusic({ mood: ['tense'], style: { main: 'fixture' } }, plan),
    /No licensed music/,
  );
});

test('music never repeats a track in consecutive chapters', () => {
  writeMusicLibrary(['a.wav', 'b.wav']);
  const picks = pickMusic(
    { mood: ['neutral'], style: { main: 'fixture' } },
    { chapters: [{ id: 1 }, { id: 2 }, { id: 3 }] },
  );
  for (let i = 1; i < picks.length; i += 1) assert.notEqual(picks[i].file, picks[i - 1].file);
});

test('voice stays at least 15 dB above the ducked music', { timeout: 180000 }, async () => {
  writeMusicLibrary(['a.wav', 'b.wav']);
  const project = audioProject(fs.mkdtempSync(path.join(os.tmpdir(), 'studio-mix-')));
  await buildMix(project);
  const db = voiceToMusicDb(project);
  assert.ok(db >= 15, `voice-to-music ${db.toFixed(1)} dB`);
});

test(
  'a master assembles under a path with spaces and an apostrophe, at -14 LUFS',
  { timeout: 300000 },
  async () => {
    writeMusicLibrary(['a.wav', 'b.wav']);
    const root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'studio-')), "it's a test");
    fs.mkdirSync(root, { recursive: true });
    const project = audioProject(root, { seconds: 4 });
    await renderAll(project, { format: 'long' });
    const out = await assembleMaster(project);
    const meta = probe(out.file);
    assert.ok(Math.abs(Number(meta.format.duration) - 8) < 0.1, `duration ${meta.format.duration}`);
    const audio = JSON.parse(fs.readFileSync(project.path('outputs', 'qc', 'audio.json'), 'utf8'));
    assert.ok(audio.final.lufs >= -15 && audio.final.lufs <= -13, `final ${audio.final.lufs} LUFS`);
    assert.ok(audio.final.truePeak <= -1.0, `true peak ${audio.final.truePeak}`);
  },
);

test('the second loudness pass only accepts numeric measurements', () => {
  const { secondPassFilter } = require('../engine/audio/loudness.cjs');
  const good = {
    raw: {
      input_i: '-20.1',
      input_tp: '-3.2',
      input_lra: '4.0',
      input_thresh: '-30.5',
      target_offset: '0.4',
    },
  };
  assert.match(secondPassFilter(good), /measured_I=-20\.1/);
  const evil = { raw: { ...good.raw, input_i: '-20,afade=t=out' } };
  assert.throws(() => secondPassFilter(evil), /loudness measurement/);
});

test('library entries that point outside the library are refused', () => {
  fs.mkdirSync(path.join(LIBRARY, 'music'), { recursive: true });
  fs.writeFileSync(
    path.join(LIBRARY, 'music', 'index.json'),
    JSON.stringify([{ file: '../../evil.wav', moods: ['neutral'], licence: 'x' }]),
  );
  assert.throws(
    () => pickMusic({ mood: ['neutral'], style: { main: 'fixture' } }, { chapters: [{ id: 1 }] }),
    /library/,
  );
});
