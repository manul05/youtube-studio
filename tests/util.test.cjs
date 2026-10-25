'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { stamp } = require('../engine/util/timecode.cjs');
const { concatManifestLine } = require('../engine/util/proc.cjs');
const { readJson, writeJson } = require('../engine/util/files.cjs');
const { registerFonts } = require('../engine/util/fonts.cjs');

test('stamp formats hours, minutes, seconds and rounded milliseconds', () => {
  assert.equal(stamp(3661.2345), '01:01:01.235');
  assert.equal(stamp(0.5, ','), '00:00:00,500');
});

test('concatManifestLine uses forward slashes and escapes apostrophes', () => {
  assert.equal(concatManifestLine("F:\\a b\\it's.mp4"), "file 'F:/a b/it'\\''s.mp4'");
});

test('writeJson round-trips through readJson and leaves no partial file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-util-'));
  const target = path.join(dir, 'nested', 'data.json');
  const value = { name: 'कॉकरोच', list: [1, 2, 3] };
  writeJson(target, value);
  assert.deepEqual(readJson(target), value);
  assert.ok(fs.readFileSync(target, 'utf8').endsWith('\n'));
  assert.deepEqual(
    fs.readdirSync(path.dirname(target)).filter((name) => name.includes('.partial')),
    [],
  );
});

test('registerFonts registers a Devanagari role backed by Nirmala UI', () => {
  const roles = registerFonts();
  const deva = roles.find((r) => r.role === 'Deva');
  assert.ok(deva, 'Deva role registered');
  assert.match(deva.path, /Nirmala\.ttc$/i);
});

test('file hashes are read in chunks, so masters over 2 GiB can be hashed', () => {
  const crypto = require('node:crypto');
  const { sha256File } = require('../engine/util/files.cjs');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'studio-hash-')), 'big.bin');
  const data = crypto.randomBytes(3 * 1024 * 1024 + 17);
  fs.writeFileSync(file, data);
  const expected = crypto.createHash('sha256').update(data).digest('hex');
  const real = fs.readFileSync;
  // Node refuses to read a whole file above 2 GiB; simulate that limit for this file.
  fs.readFileSync = (f, ...rest) => {
    if (f === file) throw Object.assign(new Error('too large'), { code: 'ERR_FS_FILE_TOO_LARGE' });
    return real(f, ...rest);
  };
  try {
    assert.equal(sha256File(file), expected);
  } finally {
    fs.readFileSync = real;
  }
});
