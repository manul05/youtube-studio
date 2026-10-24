'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const { rootPath, readJson, writeJson } = require('../util/files.cjs');

const DEFAULT_PIN_FILE = rootPath('config', 'pin.json');
const ITERATIONS = 600_000;
const VERIFIER_LABEL = 'studio-pin-verifier';

function pbkdf2(pin, saltHex, iterations) {
  return crypto.pbkdf2Sync(String(pin), Buffer.from(saltHex, 'hex'), iterations, 32, 'sha256');
}

function hmacHex(key, text) {
  return crypto.createHmac('sha256', key).update(text).digest('hex');
}

/**
 * Store a PIN verifier (salt + iterations + HMAC of a fixed label). The PIN itself is never
 * stored. A reset changes setAt, which invalidates every approval signed before it.
 */
function setPin(pin, { reset = false, pinFile = DEFAULT_PIN_FILE } = {}) {
  if (!/^\d{6,}$/.test(String(pin))) throw new Error('The PIN must be at least 6 digits.');
  if (fs.existsSync(pinFile) && !reset) {
    throw new Error('A PIN is already set. Use --reset to replace it (this voids all approvals).');
  }
  const salt = crypto.randomBytes(16).toString('hex');
  const key = pbkdf2(pin, salt, ITERATIONS);
  const record = {
    salt,
    iterations: ITERATIONS,
    verifier: hmacHex(key, VERIFIER_LABEL),
    setAt: new Date().toISOString(),
  };
  if (reset) record.resetAt = record.setAt;
  writeJson(pinFile, record);
  return record;
}

function pinRecord({ pinFile = DEFAULT_PIN_FILE } = {}) {
  if (!fs.existsSync(pinFile)) throw new Error('No PIN is set. The owner runs: npm run pin:set');
  return readJson(pinFile);
}

/** Derive the signing key from the PIN; throws "Wrong PIN" when the verifier does not match. */
function deriveKey(pin, { pinFile = DEFAULT_PIN_FILE } = {}) {
  const record = pinRecord({ pinFile });
  const key = pbkdf2(pin, record.salt, record.iterations);
  const expected = Buffer.from(record.verifier, 'hex');
  const actual = Buffer.from(hmacHex(key, VERIFIER_LABEL), 'hex');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    throw new Error('Wrong PIN.');
  }
  return key;
}

module.exports = { DEFAULT_PIN_FILE, setPin, deriveKey, pinRecord, hmacHex };
