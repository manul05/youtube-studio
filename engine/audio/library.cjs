'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { rootPath, readJson } = require('../util/files.cjs');

/** The owner's media library (music, sound effects); STUDIO_LIBRARY_DIR overrides it in tests. */
function libraryDir(...parts) {
  return path.join(process.env.STUDIO_LIBRARY_DIR || rootPath('library'), ...parts);
}

const AUDIO_FILE = /^[^\/:*?"<>|]+.(mp3|wav|m4a|aac|ogg|flac)$/i;

/**
 * Absolute path of a library file named in an index. Index files are edited by people and
 * agents, so names must be plain audio file names inside the library folder.
 */
function libraryFile(kind, name) {
  const base = path.resolve(libraryDir(kind));
  const abs = path.resolve(base, String(name));
  if (!AUDIO_FILE.test(String(name)) || String(name).includes('..') || path.dirname(abs) !== base) {
    throw new Error(
      `Invalid ${kind} library entry "${name}": use a plain audio file name in library/${kind}/.`,
    );
  }
  return abs;
}

function readIndex(kind) {
  const file = libraryDir(kind, 'index.json');
  return fs.existsSync(file) ? readJson(file) : [];
}

module.exports = {
  libraryDir,
  libraryFile,
  musicIndex: () => readIndex('music'),
  sfxIndex: () => readIndex('sfx'),
};
