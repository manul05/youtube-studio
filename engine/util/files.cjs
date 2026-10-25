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

/** SHA-256 of a file, read in 8 MB chunks (whole-file reads fail above 2 GiB). */
function sha256File(file) {
  const hash = crypto.createHash('sha256');
  const buffer = Buffer.allocUnsafe(8 * 1024 * 1024);
  const fd = fs.openSync(file, 'r');
  try {
    let read;
    while ((read = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      hash.update(buffer.subarray(0, read));
    }
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

function sha256Text(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

module.exports = { ROOT, rootPath, ensureDir, readJson, writeJson, sha256File, sha256Text };
