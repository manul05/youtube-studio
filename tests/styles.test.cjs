'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const TEMP_STYLES = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-styles-'));
process.env.STUDIO_STYLES_DIRS = TEMP_STYLES;

const { styleCheck, calibrate } = require('../engine/styles/check.cjs');
const { suggestStyles } = require('../engine/styles/suggest.cjs');
const { resolveStyle } = require('../engine/styles/loader.cjs');
const { contrastRatio } = require('../engine/qc/color.cjs');

function tempPack(id, edit = (meta) => meta, components = '') {
  const base = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'styles', 'base', 'style.json'), 'utf8'),
  );
  const dir = path.join(TEMP_STYLES, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'style.json'), JSON.stringify(edit({ ...base, id, name: id })));
  fs.writeFileSync(
    path.join(dir, 'components.cjs'),
    components || "'use strict';\nmodule.exports = {};\n",
  );
  return id;
}

test('the base pack passes its own style check', { timeout: 120000 }, () => {
  const result = styleCheck('base', { write: false });
  assert.deepEqual(result.issues, []);
  assert.equal(result.passed, true);
});

test(
  'a pack that neither draws nor declares a fallback for a beat type fails',
  { timeout: 120000 },
  () => {
    const allButQuote = [
      'art-focus',
      'art-tour',
      'stock',
      'kinetic',
      'stat',
      'compare',
      'timeline',
      'map',
      'document',
      'list',
      'chart',
      'chapter',
      'endcard',
    ];
    const id = tempPack('missing-quote', (meta) => ({ ...meta, fallback: allButQuote }));
    const result = styleCheck(id, { write: false });
    assert.equal(result.passed, false);
    assert.match(result.issues.join('\n'), /quote/);
  },
);

test(
  'a pack whose ink matches its background fails the contrast check',
  { timeout: 120000 },
  () => {
    const id = tempPack('no-contrast', (meta) => ({
      ...meta,
      fallback: ['*'],
      palette: { ...meta.palette, ink: meta.palette.bg },
    }));
    assert.match(styleCheck(id, { write: false }).issues.join('\n'), /contrast/);
  },
);

test('contrastRatio follows WCAG', () => {
  assert.ok(Math.abs(contrastRatio('#000000', '#ffffff') - 21) < 0.01);
  assert.equal(contrastRatio('#777777', '#777777'), 1);
});

test('the change threshold ignores a slow drift but catches a reveal', { timeout: 120000 }, () => {
  const result = calibrate('editorial');
  assert.equal(result.driftEvents, 0);
  assert.ok(result.revealEvents >= 1);
});

test('style suggestions rank by topic tags', () => {
  const ids = suggestStyles({
    topic: 'border dispute',
    angle: 'map of the route',
    formats: ['long'],
  }).map((s) => s.id);
  assert.equal(ids[0], 'map-doc');
  assert.equal(ids.length, 3);
  assert.ok(!ids.includes('kinetic'), 'accent-only packs are not suggested as main styles');
});

test('an accent pack keeps its drawing but takes the main palette', () => {
  const styleFor = resolveStyle({ style: { main: 'editorial', accents: { quote: 'kinetic' } } });
  const quote = styleFor('quote');
  const editorial = styleFor('art-focus');
  assert.equal(quote.id, 'kinetic');
  assert.deepEqual(quote.meta.palette, editorial.meta.palette);
});
