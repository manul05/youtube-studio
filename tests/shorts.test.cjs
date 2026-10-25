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
const { shortsMeasuredIssues } = require('../engine/shorts/spans.cjs');
const { buildShort } = require('../engine/shorts/build.cjs');

function tone(file, seconds, freq = 200) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  run(ffmpegPath(), [
    '-v',
    'error',
    '-y',
    '-f',
    'lavfi',
    '-i',
    `sine=f=${freq}:d=${seconds}`,
    '-af',
    "volume='if(lt(mod(t,0.5),0.35),0.8,0.05)':eval=frame",
    '-ar',
    '48000',
    '-ac',
    '2',
    file,
  ]);
}

/** Two paragraphs of ~`words` evenly spoken words each, aligned, with audio and a hook sample. */
function shortsProject({ words = 50, step = 0.4 } = {}) {
  const musicDir = path.join(LIBRARY, 'music');
  fs.mkdirSync(musicDir, { recursive: true });
  tone(path.join(musicDir, 'bed.wav'), 6, 330);
  fs.writeFileSync(
    path.join(musicDir, 'index.json'),
    JSON.stringify([{ file: 'bed.wav', moods: ['neutral'], licence: 'YouTube Audio Library' }]),
  );

  const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-shorts-'));
  const project = openProject(
    createProject('demo', { channel: 'en-placeholder', date: '2026-10-25', projectsDir }),
  );
  const brief = JSON.parse(fs.readFileSync(project.path('brief.json'), 'utf8'));
  brief.style = { main: 'fixture', accents: {} };
  brief.mood = ['neutral'];
  fs.writeFileSync(project.path('brief.json'), JSON.stringify(brief));

  const sentence = (n) => `${Array.from({ length: n - 1 }, (_, i) => `word${i}`).join(' ')} end.`;
  const half = words / 2;
  const script = {
    chapters: [
      {
        id: 1,
        title: 'One',
        paragraphs: ['c01p01', 'c01p02'].map((id) => ({
          id,
          text: `${sentence(half)} [[analysis]] ${sentence(half)} [[analysis]]`,
          hold: 0.4,
          beats: [{ type: 'kinetic', atWord: 0, text: `Beat ${id}` }],
        })),
      },
    ],
  };
  fs.writeFileSync(project.path('script.json'), JSON.stringify(script));
  for (const p of script.chapters[0].paragraphs) {
    const tokens = p.text
      .replace(/\[\[[^\]]+\]\]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    const aligned = tokens.map((text, i) => ({
      id: `${p.id}-w${i}`,
      text,
      start: 0.1 + i * step,
      end: 0.1 + i * step + step * 0.8,
    }));
    fs.mkdirSync(project.path('work', 'align'), { recursive: true });
    const duration = 0.3 + tokens.length * step;
    fs.writeFileSync(
      project.path('work', 'align', `${p.id}.json`),
      JSON.stringify({ paragraph: p.id, words: aligned, durationSec: duration }),
    );
    tone(project.path('work', 'voice', 'paragraphs', `${p.id}.wav`), duration);
  }
  const plan = require('../engine/plan/compile.cjs').compilePlan(project);
  fs.writeFileSync(project.path('beats.json'), JSON.stringify(plan));

  tone(project.path('work', 'voice', 'sample', 'hooks.wav'), 2.4);
  fs.writeFileSync(
    project.path('work', 'voice', 'sample', 'alignment.json'),
    JSON.stringify({
      names: [],
      hooks: [{ id: 's1', text: 'Wait for this.', start: 0.1, end: 1.9, file: 'hooks.wav' }],
    }),
  );
  return project;
}

test('measured Shorts longer than 59 s and unknown sentences are flagged', () => {
  const project = shortsProject({ words: 100, step: 0.4 });
  const shorts = [
    { id: 's1', hookLine: 'Wait for this.', fromSentence: 'c01p01s1', toSentence: 'c01p02s2' },
    { id: 's2', hookLine: 'Wait for this.', fromSentence: 'c09p01s1', toSentence: 'c01p02s2' },
  ];
  const issues = shortsMeasuredIssues(shorts, project, { required: 2 }).join('\n');
  assert.match(issues, /s1.*59/);
  assert.match(issues, /s2.*unknown sentence/);
});

test(
  'a Short renders vertically within 59 seconds with safe burned-in captions',
  { timeout: 600000 },
  async () => {
    const project = shortsProject({ words: 60, step: 0.35 });
    const short = {
      id: 's1',
      hookLine: 'Wait for this.',
      fromSentence: 'c01p01s1',
      toSentence: 'c01p02s1',
    };
    const out = await buildShort(project, short);
    const meta = probe(out.file);
    const video = meta.streams.find((s) => s.codec_type === 'video');
    assert.equal(video.width, 1080);
    assert.equal(video.height, 1920);
    assert.ok(Number(meta.format.duration) <= 59, `duration ${meta.format.duration}`);
    const log = fs
      .readdirSync(project.path('work', 'render', 'short-s1'))
      .filter((f) => f.startsWith('textlog_'))
      .map((f) => fs.readFileSync(project.path('work', 'render', 'short-s1', f), 'utf8'))
      .join('\n');
    assert.match(log, /word1/, 'captions were drawn (and passed the safe-area check)');
  },
);
