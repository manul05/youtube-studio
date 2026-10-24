'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { GlobalFonts } = require('@napi-rs/canvas');

// Each role lists licensed Windows system fonts in order of preference.
// Nirmala UI ships with Windows and shapes Devanagari correctly in @napi-rs/canvas.
const ROLES = [
  ['Sans', ['segoeui.ttf', 'arial.ttf']],
  ['SansBold', ['segoeuib.ttf', 'arialbd.ttf']],
  ['Serif', ['georgia.ttf', 'times.ttf']],
  ['Mono', ['consola.ttf', 'cour.ttf']],
  ['Deva', ['Nirmala.ttc', 'mangal.ttf']],
  ['DevaBold', ['NirmalaB.ttc', 'Nirmala.ttc', 'mangalb.ttf']],
];

let registered = null;

function registerFonts() {
  if (registered) return registered;
  const fontDir = path.join(process.env.WINDIR || 'C:/Windows', 'Fonts');
  const found = [];
  for (const [role, candidates] of ROLES) {
    const file = candidates
      .map((name) => path.join(fontDir, name))
      .find((candidate) => fs.existsSync(candidate));
    if (!file || !GlobalFonts.registerFromPath(file, role)) {
      throw new Error(
        `Missing font for role "${role}" (tried ${candidates.join(', ')} in ${fontDir}).`,
      );
    }
    found.push({ role, path: file });
  }
  registered = found;
  return found;
}

module.exports = { registerFonts, ROLES };
