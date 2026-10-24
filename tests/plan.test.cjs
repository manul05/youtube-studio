'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createProject, openProject } = require('../engine/project.cjs');
const { compilePlan, planIssues } = require('../engine/plan/compile.cjs');
const { BEAT_TYPES } = require('../engine/plan/beat-types.cjs');

const FPS = 30;
const research = {
  sources: [],
  claims: [
    { id: 'CL01', text: 'x', status: 'verified', sources: ['S01'] },
    { id: 'CL02', text: 'y', status: 'removed', sources: [] },
  ],
};

/** A project with one aligned paragraph per entry: { words: n, step, beats }. */
function projectWith(paragraphs, { accents = {} } = {}) {
  const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-plan-'));
  const dir = createProject('demo', { channel: 'en-placeholder', date: '2026-10-25', projectsDir });
  const project = openProject(dir);
  const brief = JSON.parse(fs.readFileSync(project.path('brief.json'), 'utf8'));
  brief.style = { main: 'editorial', accents };
  fs.writeFileSync(project.path('brief.json'), JSON.stringify(brief));
  const script = { chapters: [{ id: 1, title: 'One', paragraphs: [] }] };
  paragraphs.forEach((p, i) => {
    const id = `c01p0${i + 1}`;
    script.chapters[0].paragraphs.push({ id, text: 'x. [[analysis]]', hold: 0.4, beats: p.beats });
    const words = Array.from({ length: p.words }, (_, n) => ({
      id: `${id}-w${n}`,
      text: `w${n}`,
      start: n * p.step,
      end: n * p.step + p.step * 0.8,
    }));
    fs.mkdirSync(project.path('work', 'align'), { recursive: true });
    fs.writeFileSync(
      project.path('work', 'align', `${id}.json`),
      JSON.stringify({ paragraph: id, words, durationSec: p.words * p.step + 0.2 }),
    );
  });
  fs.writeFileSync(project.path('script.json'), JSON.stringify(script));
  return project;
}

const focus = { imagePrompt: 'a courtroom at dusk', focus: [0.2, 0.2, 0.5, 0.5] };

test('a beat starts 0.2 s before its anchor word, after the 0.18 s paragraph lead', () => {
  const words12at = 4.1 / 12;
  const project = projectWith([
    {
      words: 20,
      step: words12at,
      beats: [
        { type: 'art-focus', atWord: 0, ...focus },
        { type: 'kinetic', atWord: 12, text: 'One remark' },
      ],
    },
  ]);
  const plan = compilePlan(project);
  const paragraphBeats = plan.beats.filter((b) => b.paragraph === 'c01p01');
  const expected = Math.round((0.18 + 12 * words12at - 0.2) * FPS);
  assert.equal(paragraphBeats[1].startFrame - paragraphBeats[0].startFrame, expected);
  assert.equal(paragraphBeats[0].id, 'c01p01b0');
});

test('beats are contiguous and the video ends with a 20 second endcard', () => {
  const project = projectWith([
    { words: 10, step: 0.4, beats: [{ type: 'art-focus', atWord: 0, ...focus }] },
    { words: 10, step: 0.4, beats: [{ type: 'art-focus', atWord: 0, ...focus }] },
  ]);
  const plan = compilePlan(project);
  let frame = 0;
  for (const beat of plan.beats) {
    assert.equal(beat.startFrame, frame, `${beat.id} starts where the previous ended`);
    frame += beat.frames;
  }
  const last = plan.beats[plan.beats.length - 1];
  assert.equal(last.type, 'endcard');
  assert.equal(last.frames, 20 * FPS);
  assert.equal(plan.frames, frame);
});

test('a static beat longer than 6 seconds is flagged; a tour with 3 crops may run longer', () => {
  const tooLong = projectWith([
    { words: 18, step: 0.4, beats: [{ type: 'art-focus', atWord: 0, ...focus }] },
  ]);
  const issues = planIssues(compilePlan(tooLong), research).join('\n');
  assert.match(issues, /longer than 6/);

  const tour = projectWith([
    {
      words: 22,
      step: 0.4,
      beats: [
        {
          type: 'art-tour',
          atWord: 0,
          imagePrompt: 'protest crowd',
          crops: [
            [0, 0, 0.5, 0.5],
            [0.5, 0, 0.5, 0.5],
            [0.25, 0.5, 0.5, 0.5],
          ],
        },
      ],
    },
  ]);
  assert.deepEqual(planIssues(compilePlan(tour), research), []);
});

test('unknown beat types and factual beats without a live claim are flagged', () => {
  const project = projectWith([
    {
      words: 12,
      step: 0.4,
      beats: [
        { type: 'hologram', atWord: 0 },
        { type: 'stat', atWord: 4, value: 2000000, label: 'views', source: 'X' },
        { type: 'stat', atWord: 8, value: 5, label: 'days', source: 'Y', claim: 'CL02' },
      ],
    },
  ]);
  const issues = planIssues(compilePlan(project), research).join('\n');
  assert.match(issues, /hologram/);
  assert.match(issues, /c01p01b1.*claim/);
  assert.match(issues, /c01p01b2.*CL02.*removed/);
});

test('accent styles apply only to their beat type', () => {
  const project = projectWith(
    [
      {
        words: 12,
        step: 0.4,
        beats: [
          { type: 'art-focus', atWord: 0, ...focus },
          { type: 'map', atWord: 6, region: 'india', pins: [] },
        ],
      },
    ],
    { accents: { map: 'map-doc' } },
  );
  const plan = compilePlan(project);
  const byType = Object.fromEntries(plan.beats.map((b) => [b.type, b.style]));
  assert.equal(byType.map, 'map-doc');
  assert.equal(byType['art-focus'], 'editorial');
});

test('every beat type documents its fields and limits', () => {
  assert.equal(Object.keys(BEAT_TYPES).length, 14);
  for (const [type, spec] of Object.entries(BEAT_TYPES)) {
    assert.ok(spec.fields && spec.maxSec > 0, type);
    if (!spec.internalReveals) assert.ok(spec.maxSec <= 6, `${type} without reveals is ≤ 6 s`);
  }
});

test('the plan command writes beats.json and stamps the step when the plan is clean', async () => {
  const { main } = require('../tools/studio.cjs');
  const project = projectWith([
    { words: 10, step: 0.4, beats: [{ type: 'art-focus', atWord: 0, ...focus }] },
  ]);
  fs.writeFileSync(project.path('research.json'), JSON.stringify(research));
  const quiet = console.log;
  console.log = () => {};
  try {
    assert.equal(await main(['plan', project.dir]), 0);
  } finally {
    console.log = quiet;
  }
  const beats = JSON.parse(fs.readFileSync(project.path('beats.json'), 'utf8'));
  assert.equal(beats.beats[0].id, 'c01p01b0');
  assert.ok(!('script' in beats), 'the script is not copied into beats.json');
  assert.ok(fs.existsSync(project.path('work', 'stamps', 'plan.json')));
});
