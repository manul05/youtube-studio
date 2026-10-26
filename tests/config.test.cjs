'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadEnv, qc, channel, models } = require('../engine/config.cjs');
const { doctor } = require('../engine/doctor.cjs');

test('loadEnv reads a .env file without overriding existing environment values', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-env-'));
  const envFile = path.join(dir, '.env');
  fs.writeFileSync(envFile, '# comment\nSTUDIO_TEST_A=1\nSTUDIO_TEST_B="from file"\n');
  process.env.STUDIO_TEST_B = 'keep';
  try {
    const env = loadEnv(envFile);
    assert.equal(env.STUDIO_TEST_A, '1');
    assert.equal(env.STUDIO_TEST_B, 'keep');
  } finally {
    delete process.env.STUDIO_TEST_B;
  }
});

test('qc thresholds come from the spec', () => {
  assert.equal(qc().staticMaxLong, 6);
  assert.equal(require('../engine/score/aggregate.cjs').RELEASE_BAR.releaseMin, 95);
  assert.equal(qc().truePeakMax, -1.0);
});

test('placeholder Hindi channel uses Devanagari captions', () => {
  const hi = channel('hi-placeholder');
  assert.equal(hi.captionScript, 'deva');
  assert.equal(hi.placeholder, true);
});

test('models config names the Gemini TTS model', () => {
  assert.equal(models().tts, 'gemini-3.8-flash-tts');
});

test('doctor reports a malformed config/local.json instead of crashing', async () => {
  const { rootPath } = require('../engine/util/files.cjs');
  const local = rootPath('config', 'local.json');
  const backup = fs.existsSync(local) ? fs.readFileSync(local) : null;
  fs.writeFileSync(local, '{ "python": "C:\\Users\\x" }'); // "\U" is an invalid JSON escape
  try {
    const report = await doctor({ fetch: async () => ({ ok: false, status: 401 }), env: {} });
    const py = report.checks.find((c) => c.name === 'python-faster-whisper');
    assert.equal(py.ok, false);
    assert.match(py.detail, /config\/local\.json/);
  } finally {
    if (backup) fs.writeFileSync(local, backup);
    else fs.unlinkSync(local);
  }
});

test('doctor sends the Gemini key in a header and never leaks keys into messages', async () => {
  const urls = [];
  const throwingFetch = async (url) => {
    urls.push(url);
    throw new Error(`request to ${url} failed`);
  };
  const env = {
    GEMINI_API_KEY: 'SECRET-G',
    PEXELS_API_KEY: 'SECRET-P',
    PIXABAY_API_KEY: 'SECRET-X',
  };
  const report = await doctor({ fetch: throwingFetch, env, writeModels: false });
  assert.ok(!urls[0].includes('SECRET-G'), 'Gemini key is not in the URL');
  const text = JSON.stringify(report);
  for (const secret of Object.values(env)) assert.ok(!text.includes(secret), `${secret} redacted`);
});

test('doctor reports a rejected Gemini key as a failed check without throwing', async () => {
  const fakeFetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
  const report = await doctor({
    fetch: fakeFetch,
    env: { GEMINI_API_KEY: 'bad', PEXELS_API_KEY: 'bad', PIXABAY_API_KEY: 'bad' },
    writeModels: false,
  });
  const gemini = report.checks.find((c) => c.name === 'gemini-key');
  assert.equal(gemini.ok, false);
  assert.match(gemini.detail, /401/);
  assert.equal(report.ok, false);
});

test('stock video keys are optional: missing ones are a warning, not a failure', async () => {
  const report = await doctor({
    fetch: async () => ({ ok: false, status: 401, json: async () => ({}) }),
    env: { GEMINI_API_KEY: 'g' },
    writeModels: false,
  });
  for (const name of ['pexels-key', 'pixabay-key']) {
    const c = report.checks.find((x) => x.name === name);
    assert.equal(c.ok, true, `${name} does not fail`);
    assert.equal(c.warn, true, `${name} is shown as a warning`);
    assert.match(c.detail, /optional/);
  }
});
