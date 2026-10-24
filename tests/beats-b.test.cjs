'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createFrameCanvas } = require('../engine/render/context.cjs');
const { loadStyle } = require('../engine/styles/loader.cjs');
const { project, simplify, loadGeo, bboxOf } = require('../engine/render/geo.cjs');
const { compareSchedule, timelineSchedule } = require('../styles/base/components/data.cjs');

function draw(type, fields, t, { duration = 8, illustration = false } = {}) {
  const { canvas, ctx } = createFrameCanvas(1920, 1080, 'long');
  const style = loadStyle('base');
  const beat = { id: 'c01p01b0', type, fields, illustration };
  const env = {
    width: 1920,
    height: 1080,
    format: 'long',
    fps: 30,
    style,
    beat,
    duration,
    words: [],
  };
  style.components[type](ctx, beat, t, {}, env);
  return { canvas, ctx };
}

test('compare reveals three points per side by 7.5 seconds', () => {
  const fields = {
    left: { title: 'Online', points: ['a', 'b', 'c'] },
    right: { title: 'Offline', points: ['d', 'e', 'f'] },
  };
  const times = compareSchedule(fields, 12);
  assert.ok(Math.max(...times) <= 7.5, `last reveal at ${Math.max(...times)}`);
});

test('a 12 second timeline reveals all four events with gaps of at most 3 seconds', () => {
  const events = ['2026-05-15', '2026-05-21', '2026-06-06', '2026-07-20'].map((date) => ({
    date,
    label: date,
  }));
  const times = timelineSchedule(events, 12);
  assert.ok(times[3] <= 12);
  for (let i = 1; i < times.length; i += 1) assert.ok(times[i] - times[i - 1] <= 3 + 1e-9);
});

test('New Delhi projects inside the drawn bounds of India', () => {
  const india = loadGeo('india_states');
  const box = bboxOf(india);
  const [x, y] = project(77.21, 28.61, box, 1000, 1000);
  assert.ok(x > 0 && x < 1000 && y > 0 && y < 1000, `Delhi at ${x}, ${y}`);
  assert.ok(box.minLon < 77.21 && box.maxLon > 77.21 && box.minLat < 28.61 && box.maxLat > 28.61);
});

test('simplify keeps the end points and drops near-collinear points', () => {
  const line = [
    [0, 0],
    [1, 0.001],
    [2, 0],
    [3, 5],
    [4, 0],
  ];
  const out = simplify(line, 0.01);
  assert.deepEqual(out[0], [0, 0]);
  assert.deepEqual(out[out.length - 1], [4, 0]);
  assert.ok(out.length < line.length);
});

test('charts refuse negative values', () => {
  assert.throws(
    () => draw('chart', { kind: 'bar', series: [{ label: 'a', value: -1 }], source: 'X' }, 2),
    /non-negative/,
  );
});

test('a document card is always labelled as a recreation', () => {
  const { ctx } = draw(
    'document',
    { title: 'Order', lines: ['Line one', 'Line two'], highlight: [1] },
    3,
  );
  assert.ok([...ctx.__textLog].some((t) => /illustration|recreated/i.test(t)));
});

test('every data beat draws inside the safe area without debug text', () => {
  const cases = [
    [
      'stat',
      { value: 2000000, unit: '', label: 'impressions in 48 hours', source: 'Party statement' },
    ],
    [
      'compare',
      {
        left: { title: 'Online', points: ['Millions can share'] },
        right: { title: 'Offline', points: ['Fewer can attend'] },
      },
    ],
    [
      'timeline',
      {
        events: [
          { date: '2026-05-15', label: 'Remark in court' },
          { date: '2026-05-21', label: 'Party launched' },
        ],
      },
    ],
    [
      'map',
      {
        region: 'india',
        highlight: ['Delhi'],
        pins: [{ lon: 77.21, lat: 28.61, label: 'New Delhi' }],
        route: [
          [73.86, 18.52],
          [77.21, 28.61],
        ],
      },
    ],
    ['document', { title: 'Court order', lines: ['The bench observed…'], highlight: [0] }],
    ['list', { items: ['Exams', 'Jobs', 'Representation'] }],
    [
      'chart',
      {
        kind: 'bar',
        series: [
          { label: 'May', value: 3 },
          { label: 'June', value: 9 },
        ],
        source: 'Survey',
      },
    ],
    ['map', { region: 'world', highlight: ['IND', 'NPL', 'BGD'] }],
  ];
  for (const [type, fields] of cases) {
    const { ctx } = draw(type, fields, 7);
    assert.deepEqual(ctx.__layoutIssues, [], type);
    for (const text of ctx.__textLog)
      assert.ok(!/frame\s*\d|layout[_:]|shot\s*\d/i.test(text), text);
  }
});

test('simplify keeps the shape of a closed ring', () => {
  const square = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
    [0, 0],
  ];
  assert.equal(simplify(square, 0.01).length, 5);
});
