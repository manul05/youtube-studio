'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { rootPath, readJson } = require('./files.cjs');

/** Run a program synchronously; throw with its stderr when it exits non-zero. */
function run(exe, args, opts = {}) {
  const result = spawnSync(exe, args, {
    windowsHide: true,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...opts,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').toString().slice(-4000);
    throw new Error(`${path.basename(exe)} exited ${result.status}: ${detail}`);
  }
  return { stdout: result.stdout, stderr: result.stderr };
}

function ffmpegPath() {
  return process.env.FFMPEG_PATH || 'ffmpeg';
}

function ffprobePath() {
  return process.env.FFPROBE_PATH || 'ffprobe';
}

function probe(file) {
  const { stdout } = run(ffprobePath(), [
    '-v',
    'error',
    '-show_streams',
    '-show_format',
    '-of',
    'json',
    file,
  ]);
  return JSON.parse(stdout);
}

function pythonPath() {
  if (process.env.STUDIO_PYTHON) return process.env.STUDIO_PYTHON;
  const local = rootPath('config', 'local.json');
  if (fs.existsSync(local)) {
    const configured = readJson(local).python;
    if (configured && fs.existsSync(configured)) return configured;
  }
  return 'python';
}

/** One line of an FFmpeg concat-demuxer manifest, safe for spaces and apostrophes. */
function concatManifestLine(absPath) {
  const normalised = absPath.replaceAll('\\', '/').replaceAll("'", "'\\''");
  return `file '${normalised}'`;
}

module.exports = { run, ffmpegPath, ffprobePath, probe, pythonPath, concatManifestLine };
