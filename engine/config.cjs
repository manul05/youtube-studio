'use strict';

const fs = require('node:fs');
const { rootPath, readJson, writeJson } = require('./util/files.cjs');

const ENV_KEYS = ['GEMINI_API_KEY', 'PEXELS_API_KEY', 'PIXABAY_API_KEY'];

/**
 * Parse a .env file (KEY=value, optional quotes, # comments) without any dependency.
 * Values already present in process.env win over the file.
 */
function loadEnv(envFile = rootPath('.env')) {
  const values = {};
  if (fs.existsSync(envFile)) {
    for (const rawLine of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
      values[key] = value;
    }
  }
  for (const key of Object.keys(values)) {
    if (process.env[key] !== undefined) values[key] = process.env[key];
  }
  for (const key of ENV_KEYS) {
    if (values[key] === undefined && process.env[key] !== undefined) values[key] = process.env[key];
  }
  return values;
}

function models() {
  return readJson(rootPath('config', 'models.json'));
}

function saveModels(next) {
  writeJson(rootPath('config', 'models.json'), next);
}

function qc() {
  return readJson(rootPath('config', 'qc.json'));
}

function channel(id) {
  const file = rootPath('library', 'channels', id, 'channel.json');
  if (!fs.existsSync(file)) {
    throw new Error(`Unknown channel "${id}". Create library/channels/${id}/channel.json.`);
  }
  const data = readJson(file);
  return { placeholder: false, wpm: null, ...data, id };
}

function channelLogo(id) {
  return rootPath('library', 'channels', id, 'logo.png');
}

module.exports = { ENV_KEYS, loadEnv, models, saveModels, qc, channel, channelLogo };
