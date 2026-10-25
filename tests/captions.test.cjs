'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { phrases, graphemeCount } = require('../engine/captions/phrases.cjs');
const { exportCaptions } = require('../engine/captions/export.cjs');
const { captionIssues } = require('../engine/captions/check.cjs');

function timed(text, step = 0.38) {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((w, i) => ({ id: `c01p01-w${i}`, text: w, start: i * step, end: i * step + step * 0.85 }));
}

test('a 60-word English paragraph becomes cues that pass every caption check', () => {
  const sentence =
    'The court heard the case in May and the remark spread across the country within hours.';
  const words = timed(
    [sentence, sentence, sentence, sentence].join(' ').split(' ').slice(0, 60).join(' '),
  );
  const cues = phrases(words, { script: 'latin' });
  assert.ok(cues.length >= 4);
  assert.deepEqual(captionIssues(cues, { script: 'latin' }), []);
});

test('Devanagari cues stay within two lines by rendered width', () => {
  const text =
    'पंद्रह मई को मुख्य न्यायाधीश सूर्य कांत ने एक टिप्पणी की जिसे लाखों युवा भारतीय नहीं ' +
    'भूलेंगे और कॉकरोच जनता पार्टी इसी से पैदा हुई जो देखते ही देखते पूरे देश में फैल गई।';
  const cues = phrases(timed(text, 0.42), { script: 'deva' });
  for (const cue of cues) assert.ok(cue.lines.length <= 2, cue.text);
  assert.deepEqual(captionIssues(cues, { script: 'deva' }), []);
});

test('SRT and VTT use standard timestamps', () => {
  const out = exportCaptions([
    { start: 3661, cues: [{ start: 0.2, end: 1.5, lines: ['A sentence.'], text: 'A sentence.' }] },
  ]);
  assert.match(out.srt, /^1\r?\n01:01:01,200 --> 01:01:02,500\r?\nA sentence\./);
  assert.match(out.vtt, /^WEBVTT/);
  assert.match(out.vtt, /01:01:01\.200 --> 01:01:02\.500/);
});

test('reading speed counts Devanagari letters as graphemes, not code points', () => {
  assert.equal(graphemeCount('क्षत्रिय'), 3);
});

test('overlapping cues and a cue that cuts a word short are flagged', () => {
  const cues = [
    {
      start: 0,
      end: 1.2,
      lines: ['First words'],
      text: 'First words',
      tokens: [{ start: 0, end: 1.2 }],
    },
    {
      start: 1.0,
      end: 2.0,
      lines: ['next words'],
      text: 'next words',
      tokens: [{ start: 1.0, end: 2.4 }],
    },
  ];
  const issues = captionIssues(cues, { script: 'latin' }).join('\n');
  assert.match(issues, /overlap/);
  assert.match(issues, /before its last word ends/);
});

test('a very short phrase is merged instead of flashing on screen', () => {
  const words = [
    { id: 'a', text: 'Go.', start: 0, end: 0.25 },
    { id: 'b', text: 'Then', start: 0.3, end: 0.5 },
    { id: 'c', text: 'we', start: 0.5, end: 0.7 },
    { id: 'd', text: 'continue.', start: 0.7, end: 1.3 },
  ];
  const cues = phrases(words, { script: 'latin' });
  assert.ok(cues.every((c) => c.end - c.start >= 0.7 - 1e-9));
  assert.deepEqual(captionIssues(cues, { script: 'latin' }), []);
});

test('a fast final caption is held a little longer when there is room', () => {
  const words = [
    { id: 'a', text: 'People', start: 0, end: 0.3 },
    { id: 'b', text: 'share', start: 0.38, end: 0.68 },
    { id: 'c', text: 'everything.', start: 0.76, end: 1.06 },
    { id: 'd', text: 'anger', start: 1.14, end: 1.44 },
    { id: 'e', text: 'together', start: 1.52, end: 1.82 },
    { id: 'f', text: 'online.', start: 1.9, end: 2.2 },
  ];
  const cues = phrases(words, { script: 'latin' });
  assert.deepEqual(captionIssues(cues, { script: 'latin' }), []);
});

test('a held caption stays within the reading speed wherever it sits in the video', () => {
  const base = [
    ['People', 0, 0.3],
    ['share', 0.38, 0.68],
    ['everything.', 0.76, 1.06],
    ['anger', 1.14, 1.44],
    ['together', 1.52, 1.82],
    ['online.', 1.9, 2.2],
  ];
  for (const offset of [2.192, 2.74, 3.288, 37.3, 612.45]) {
    const words = base.map(([text, start, end], i) => ({
      id: `w${i}`,
      text,
      start: start + offset,
      end: end + offset,
    }));
    const cues = phrases(words, { script: 'latin' });
    assert.deepEqual(captionIssues(cues, { script: 'latin' }), [], `offset ${offset}`);
  }
});
