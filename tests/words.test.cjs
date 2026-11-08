'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { sentences, spokenText } = require('../engine/words/text.cjs');
const { researchIssues, ledgerIssues } = require('../engine/words/research.cjs');
const { outlineIssues } = require('../engine/words/outline.cjs');
const { briefIssues } = require('../engine/words/brief.cjs');
const { scriptIssues, shortsIssues } = require('../engine/words/script.cjs');

const source = (id) => ({
  id,
  url: `https://example.com/${id}`,
  publisher: 'Example News',
  published: '2026-05-21',
  accessed: '2026-10-24',
  excerpt: 'Supporting excerpt.',
});

function scriptWith(text) {
  return { chapters: [{ id: 1, title: 'One', paragraphs: [{ id: 'c01p01', text, hold: 0.4 }] }] };
}

test('sentences splits on terminal punctuation followed by a tag', () => {
  const out = sentences('Court spoke. [[CL01]] I think so. [[analysis]]', 'c01p01');
  assert.equal(out.length, 2);
  assert.deepEqual(out[0].tags, ['CL01']);
  assert.deepEqual(out[1].tags, ['analysis']);
  assert.equal(out[0].id, 'c01p01s1');
  assert.equal(out[1].spoken, 'I think so.');
});

test('a Hindi sentence ending in a danda and a tag parses', () => {
  const out = sentences('सुप्रीम कोर्ट ने टिप्पणी की।[[CL02]]');
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].tags, ['CL02']);
  assert.equal(out[0].spoken, 'सुप्रीम कोर्ट ने टिप्पणी की।');
});

test('researchIssues flags relative dates, untagged sentences and thin contested claims', () => {
  const research = {
    sources: [source('S01')],
    claims: [
      { id: 'CL01', text: 'x', status: 'verified', contested: false, sources: ['S01'] },
      { id: 'CL02', text: 'y', status: 'attributed', contested: true, sources: ['S01'] },
    ],
  };
  const script = scriptWith(
    'This happened recently. [[CL01]] यह हाल ही में हुआ। [[CL01]] No tag here. Then more. [[CL02]]',
  );
  const issues = researchIssues(script, research).join('\n');
  assert.match(issues, /recently/);
  assert.match(issues, /हाल ही में/);
  assert.match(issues, /No tag here\./);
  assert.match(issues, /CL02.*2 sources/);
});

test('the Hindi word for yesterday is not matched inside a longer word', () => {
  const research = { sources: [source('S01')], claims: [] };
  const issues = researchIssues(scriptWith('उसने कलम उठाई। [[analysis]]'), research);
  assert.deepEqual(issues, []);
});

test('ledgerIssues flags unverified claims and sources without a publish date', () => {
  const issues = ledgerIssues({
    sources: [{ ...source('S01'), published: '' }],
    claims: [{ id: 'CL01', text: 'x', status: 'unverified', contested: false, sources: ['S01'] }],
  }).join('\n');
  assert.match(issues, /S01.*published/);
  assert.match(issues, /CL01.*unverified/);
});

test('spokenText applies pronunciations to the voice text but keeps captions original', () => {
  const out = spokenText(
    { text: 'Chief Justice Surya Kant spoke. [[CL01]]' },
    { 'Surya Kant': 'Soor-ya Kaant' },
  );
  assert.match(out.tts, /Soor-ya Kaant/);
  assert.match(out.captions, /Surya Kant/);
  assert.ok(!out.tts.includes('[['));
});

test('outlineIssues flags a re-hook gap longer than 90 seconds', () => {
  const outline = {
    chapters: [
      { id: 1, title: 'A', purpose: 'p', targetSeconds: 200 },
      { id: 2, title: 'B', purpose: 'p', targetSeconds: 200 },
      { id: 3, title: 'C', purpose: 'p', targetSeconds: 200 },
    ],
    hook: { endsAt: 30 },
    rehooks: [
      { atSeconds: 100, line: 'But…' },
      { atSeconds: 220, line: 'Then…' },
      { atSeconds: 300, line: 'Next…' },
      { atSeconds: 380, line: 'Finally…' },
      { atSeconds: 460, line: 'And…' },
      { atSeconds: 540, line: 'So…' },
    ],
    payoff: 'The answer.',
  };
  const issues = outlineIssues(outline, { lengthTargetMin: 10 }).join('\n');
  assert.match(issues, /120 s/);
});

test('briefIssues rejects long titles and thumbnail text equal to a title', () => {
  const brief = {
    topic: 't',
    angle: 'a',
    audience: 'u',
    promise: 'p',
    language: 'en',
    captionScript: 'latin',
    channel: 'en-placeholder',
    lengthTargetMin: 10,
    titles: ['x'.repeat(61), 'Second title', 'Third title'],
    thumbTexts: ['Second title', 'Big news', 'Why now'],
    mood: ['tense'],
    hook: 'h',
    style: { main: 'editorial', accents: {} },
    formats: ['long', 'short'],
  };
  const issues = briefIssues(brief).join('\n');
  assert.match(issues, /61/);
  assert.match(issues, /same as a title/);
});

test('a Short span estimated beyond 59 seconds is flagged', () => {
  const words = (n) => Array.from({ length: n }, () => 'word').join(' ');
  const script = {
    chapters: [
      {
        id: 1,
        title: 'One',
        paragraphs: [
          {
            id: 'c01p01',
            text: `${words(100)}. [[analysis]] ${words(90)}. [[analysis]]`,
            hold: 0.4,
          },
        ],
      },
    ],
  };
  const shorts = [
    { id: 's1', hookLine: 'Wait for it.', fromSentence: 'c01p01s1', toSentence: 'c01p01s2' },
  ];
  const issues = shortsIssues(shorts, script, { wpm: 155, required: 1 }).join('\n');
  assert.match(issues, /s1.*59/);
});

test('scriptIssues flags a script far shorter than the length target', () => {
  const brief = { lengthTargetMin: 10, language: 'en', formats: ['long'] };
  const issues = scriptIssues(scriptWith('Too short. [[analysis]]'), brief, { wpm: null }, []);
  assert.ok(issues.some((i) => /length target/.test(i)));
});

test('brief:check fails on an empty brief and stamps the idea step once it passes', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { main } = require('../tools/studio.cjs');
  const { createProject, openProject } = require('../engine/project.cjs');
  const { nextAction } = require('../engine/next.cjs');
  const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-words-'));
  const dir = createProject('demo', { channel: 'en-placeholder', date: '2026-10-25', projectsDir });
  const quiet = console.log;
  console.log = () => {};
  try {
    assert.equal(await main(['brief:check', dir]), 1);
    const brief = JSON.parse(fs.readFileSync(path.join(dir, 'brief.json'), 'utf8'));
    Object.assign(brief, {
      topic: 'CJP',
      angle: 'How a joke became a movement',
      audience: 'Indian Gen Z',
      promise: 'Understand what happened and why',
      hook: 'One word from a courtroom…',
      titles: ['A joke became a movement', 'The cockroach party, explained', 'Why CJP matters'],
      thumbTexts: ['ONE WORD', 'JOKE OR MOVEMENT?', 'GEN Z ANGRY'],
      style: { main: 'editorial', accents: {} },
    });
    fs.writeFileSync(path.join(dir, 'brief.json'), JSON.stringify(brief, null, 2));
    assert.equal(await main(['brief:check', dir]), 0);
  } finally {
    console.log = quiet;
  }
  assert.equal(nextAction(openProject(dir)).stepId, 'gate:idea');
});

test('briefIssues accepts the presenter modes and rejects an unknown one', () => {
  const brief = {
    topic: 't',
    angle: 'a',
    audience: 'u',
    promise: 'p',
    language: 'en',
    captionScript: 'latin',
    channel: 'en-placeholder',
    lengthTargetMin: 10,
    titles: ['First title', 'Second title', 'Third title'],
    thumbTexts: ['Big news', 'Why now', 'The cost'],
    mood: ['tense'],
    hook: 'h',
    style: { main: 'editorial', accents: {} },
    formats: ['long'],
  };
  for (const presenter of [undefined, { mode: 'ai' }, { mode: 'voice' }, { mode: 'face' }]) {
    assert.ok(!briefIssues({ ...brief, presenter }).some((i) => /presenter/.test(i)));
  }
  assert.ok(
    briefIssues({ ...brief, presenter: { mode: 'avatar' } }).some((i) => /presenter\.mode/.test(i)),
  );
});
