'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { rootPath, readJson } = require('../util/files.cjs');

/** The owner's media library (music, sound effects); STUDIO_LIBRARY_DIR overrides it in tests. */
function libraryDir(...parts) {
  return path.join(process.env.STUDIO_LIBRARY_DIR || rootPath('library'), ...parts);
}

function readIndex(kind) {
  const file = libraryDir(kind, 'index.json');
  return fs.existsSync(file) ? readJson(file) : [];
}

module.exports = {
  libraryDir,
  musicIndex: () => readIndex('music'),
  sfxIndex: () => readIndex('sfx'),
};
