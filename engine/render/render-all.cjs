'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readJson } = require('../util/files.cjs');
const { run, ffmpegPath, concatManifestLine } = require('../util/proc.cjs');
const { renderChapter } = require('./chapter.cjs');

/**
 * Render every chapter of a plan (one child process each, sequentially, to stay within memory)
 * and join them without re-encoding into work/render/<label>/video.mp4 (no audio yet).
 */
async function renderAll(project, opts = {}) {
  const { format = 'long', planFile = project.path('beats.json'), label = format } = opts;
  const plan = readJson(planFile);
  const files = [];
  for (const chapter of plan.chapters) {
    const result = await renderChapter(project, chapter.id, {
      format,
      planFile,
      label,
      force: opts.force,
    });
    console.log(`${result.cached ? 'CACHED  ' : 'RENDERED'} chapter ${chapter.id}`);
    files.push(result.file);
  }
  const dir = project.path('work', 'render', label);
  const manifest = path.join(dir, 'chapters.txt');
  fs.writeFileSync(manifest, `${files.map(concatManifestLine).join('\n')}\n`);
  const file = path.join(dir, 'video.mp4');
  const partial = path.join(dir, 'video.partial.mp4');
  run(ffmpegPath(), [
    '-v',
    'error',
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    manifest,
    '-c',
    'copy',
    '-movflags',
    '+faststart',
    partial,
  ]);
  fs.renameSync(partial, file);
  return { file, frames: plan.frames };
}

module.exports = { renderAll };
