'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const LIBRARY = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-library-'));
process.env.STUDIO_LIBRARY_DIR = LIBRARY;
const PIN_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'studio-pin-')), 'pin.json');

const { createProject, openProject } = require('../engine/project.cjs');
const { STEPS } = require('../engine/steps.cjs');
const { writeStamp } = require('../engine/next.cjs');
const { setPin, deriveKey } = require('../engine/review/pin.cjs');
const { writeApproval, signOwnerRatings } = require('../engine/review/approvals.cjs');
const { aggregate } = require('../engine/score/aggregate.cjs');
const { release } = require('../engine/release.cjs');

setPin('123456', { pinFile: PIN_FILE });
const KEY = deriveKey('123456', { pinFile: PIN_FILE });

function realChannel(placeholder = false) {
  const dir = path.join(LIBRARY, 'channels', placeholder ? 'fake-channel' : 'real-channel');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'channel.json'),
    JSON.stringify({
      name: 'Real Channel',
      handle: '@real',
      language: 'en',
      captionScript: 'latin',
      voice: { name: 'Charon', style: 'calm' },
      musicMoods: [],
      placeholder,
    }),
  );
  return placeholder ? 'fake-channel' : 'real-channel';
}

function write(project, rel, content) {
  const abs = project.path(rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, typeof content === 'string' ? content : JSON.stringify(content));
}

/** A project with every step stamped and every stop approved with the owner's key. */
function finishedProject({ aiScore = 97, placeholder = false, signedOwner = true } = {}) {
  const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-release-'));
  const project = openProject(
    createProject('demo', { channel: realChannel(placeholder), date: '2026-10-25', projectsDir }),
  );
  const brief = JSON.parse(fs.readFileSync(project.path('brief.json'), 'utf8'));
  Object.assign(brief, {
    titles: ['Title one', 'Title two', 'Title three'],
    thumbTexts: ['A', 'B', 'C'],
    style: { main: 'editorial', accents: {} },
  });
  fs.writeFileSync(project.path('brief.json'), JSON.stringify(brief));
  write(project, 'beats.json', {
    format: 'long',
    fps: 30,
    width: 1920,
    height: 1080,
    frames: 30,
    chapters: [],
    paragraphs: [],
    beats: [],
  });
  write(project, 'research.json', {
    sources: [
      { id: 'S01', url: 'https://example.com', publisher: 'Example', published: '2026-05-21' },
    ],
    claims: [{ id: 'CL01', status: 'verified', sources: ['S01'] }],
  });
  write(project, 'script.json', {
    chapters: [{ id: 1, title: 'x', paragraphs: [{ id: 'c01p01', text: 'A fact. [[CL01]]' }] }],
  });
  write(project, 'outputs/master.mp4', 'video');
  write(project, 'outputs/shorts/s1.mp4', 'short');
  for (const f of [
    'thumb_1.png',
    'thumb_2.png',
    'thumb_3.png',
    'description.txt',
    'titles.txt',
    'tags.txt',
    'pinned_comment.txt',
    'disclosure.txt',
    'captions.srt',
    'captions.vtt',
  ]) {
    write(project, `outputs/package/${f}`, f);
  }
  write(project, 'assets/ledger.json', { images: {}, stock: {} });
  write(project, 'outputs/qc/qc.json', {
    hardFails: [],
    issues: [],
    shorts: { s1: { hardFails: [], issues: [], metrics: {} } },
  });
  const ai = Object.fromEntries(
    ['A', 'B', 'C', 'F', 'G', 'I'].map((c) => [c, { score: aiScore, reasons: [] }]),
  );
  write(project, 'outputs/score/ai.json', { categories: ai, shorts: { s1: { categories: ai } } });
  const rating = { A: 'Excellent', BG: 'Excellent', D: 'Excellent', F: 'Excellent' };
  const owner = {
    ...rating,
    I: 'Excellent',
    pick: { thumbnail: 2, title: 3 },
    drags: [],
    shorts: { s1: rating },
  };
  write(
    project,
    'outputs/score/owner.json',
    signedOwner ? signOwnerRatings(owner, KEY, { pinFile: PIN_FILE }) : owner,
  );
  aggregate(project);

  for (const entry of STEPS) {
    if (entry.id === 'release') break;
    if (entry.kind === 'gate') {
      writeApproval(project, entry.id, KEY, { decision: 'approve', pinFile: PIN_FILE });
      continue;
    }
    for (const pattern of entry.outputs(project)) {
      if (!pattern.includes('*') && !fs.existsSync(project.path(pattern)))
        write(project, pattern, `${entry.id} output`);
      if (pattern.endsWith('/*') && !fs.existsSync(project.path(pattern.slice(0, -2)))) {
        write(project, `${pattern.slice(0, -2)}/fixture.bin`, 'x');
      }
    }
    writeStamp(project, entry.id);
  }
  return project;
}

test('a finished, signed, 95+ project releases every upload file with checksums', async () => {
  const project = finishedProject();
  const out = await release(project, '123456', { pinFile: PIN_FILE });
  const files = fs.readdirSync(out.dir).sort();
  for (const name of [
    'master.mp4',
    'short_s1.mp4',
    'thumbnail_A.png',
    'thumbnail_B.png',
    'thumbnail_C.png',
    'captions.srt',
    'captions.vtt',
    'description.txt',
    'titles.txt',
    'tags.txt',
    'pinned_comment.txt',
    'disclosure.txt',
    'sources.md',
    'asset_ledger.json',
    'score.json',
    'UPLOAD_CHECKLIST.md',
    'release.json',
  ]) {
    assert.ok(files.includes(name), `${name} in release`);
  }
  assert.equal(
    fs.readFileSync(path.join(out.dir, 'thumbnail_A.png'), 'utf8'),
    'thumb_2.png',
    'the chosen thumbnail comes first',
  );
  assert.match(fs.readFileSync(path.join(out.dir, 'titles.txt'), 'utf8'), /^Title three/);
  const manifest = JSON.parse(fs.readFileSync(path.join(out.dir, 'release.json'), 'utf8'));
  assert.ok(manifest.files['master.mp4'].match(/^[0-9a-f]{64}$/));
});

test('a forged approval stops the release', async () => {
  const project = finishedProject();
  const file = project.path('approvals', 'gate_script.json');
  const a = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({ ...a, sig: 'a'.repeat(64) }));
  await assert.rejects(() => release(project, '123456', { pinFile: PIN_FILE }), /signature/);
});

test('a score below 95 stops the release', async () => {
  const project = finishedProject({ aiScore: 93 });
  await assert.rejects(() => release(project, '123456', { pinFile: PIN_FILE }), /95/);
});

test('a placeholder channel stops the release', async () => {
  const project = finishedProject({ placeholder: true });
  await assert.rejects(() => release(project, '123456', { pinFile: PIN_FILE }), /channel/);
});

test('a wrong PIN stops the release', async () => {
  const project = finishedProject();
  await assert.rejects(() => release(project, '999999', { pinFile: PIN_FILE }), /Wrong PIN/);
});

test('the release command needs the owner at an interactive terminal', async () => {
  const { main } = require('../tools/studio.cjs');
  await assert.rejects(() => main(['release', 'any-project']), /interactive terminal/);
});

test('QC findings edited after the final approval stop the release', async () => {
  const project = finishedProject();
  write(project, 'outputs/qc/qc.json', {
    hardFails: [],
    issues: [],
    shorts: { s1: { hardFails: [], issues: [], metrics: {} } },
    edited: true,
  });
  writeStamp(project, 'qc');
  writeStamp(project, 'ai-review');
  await assert.rejects(
    () => release(project, '123456', { pinFile: PIN_FILE }),
    /gate:final: the reviewed files changed after approval/,
  );
});

test('ratings that were not saved with the PIN stop the release', async () => {
  const project = finishedProject({ signedOwner: false });
  await assert.rejects(
    () => release(project, '123456', { pinFile: PIN_FILE }),
    /ratings were not saved with your PIN/,
  );
});

test('a score that differs from the one approved at stop 5 stops the release', async () => {
  const project = finishedProject();
  const file = project.path('outputs', 'score', 'score.json');
  write(project, 'outputs/score/score.json', {
    ...JSON.parse(fs.readFileSync(file, 'utf8')),
    total: 99.9,
  });
  writeApproval(project, 'gate:final', KEY, { decision: 'approve', pinFile: PIN_FILE });
  await assert.rejects(
    () => release(project, '123456', { pinFile: PIN_FILE }),
    /differs from the score you approved/,
  );
});

test('the release bar is fixed in code, not read from an editable config file', () => {
  const config = require('../engine/config.cjs');
  const real = config.qc;
  config.qc = () => ({ ...real(), releaseMin: 50, categoryFloor: 0.1, hardFailCap: 100 });
  try {
    delete require.cache[require.resolve('../engine/score/aggregate.cjs')];
    const { scoreOne, RELEASE_BAR } = require('../engine/score/aggregate.cjs');
    assert.deepEqual(RELEASE_BAR, { releaseMin: 95, categoryFloor: 0.8, hardFailCap: 59 });
    const ai = Object.fromEntries(['A', 'B', 'C', 'F', 'G', 'I'].map((c) => [c, { score: 70 }]));
    const owner = { A: 'OK', BG: 'OK', D: 'OK', F: 'OK', I: 'OK' };
    const result = scoreOne({ kind: 'long', ai: { categories: ai }, owner, qcFindings: [] });
    assert.equal(result.releasable, false);
  } finally {
    config.qc = real;
    delete require.cache[require.resolve('../engine/score/aggregate.cjs')];
  }
});

test('a video with a map needs the owner to confirm the map at the release prompt', async () => {
  const project = finishedProject();
  const plan = JSON.parse(fs.readFileSync(project.path('beats.json'), 'utf8'));
  plan.beats.push({ id: 'b001', type: 'map' });
  write(project, 'beats.json', plan);
  await assert.rejects(
    () => release(project, '123456', { pinFile: PIN_FILE }),
    /confirm the map when the release command asks/,
  );
});
