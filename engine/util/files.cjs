'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..', '..');

function rootPath(...parts) {
  return path.join(ROOT, ...parts);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/** Pretty JSON with a trailing newline, written atomically (partial file, then rename). */
function writeJson(file, value) {
  ensureDir(path.dirname(file));
  const partial = `${file}.partial`;
  fs.writeFileSync(partial, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  fs.renameSync(partial, file);
}

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

module.exports = { ROOT, rootPath, ensureDir, readJson, writeJson, sha256File, sha256Text };
