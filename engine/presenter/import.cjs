'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readJson, writeJson, ensureDir, sha256File, sha256Text } = require('../util/files.cjs');
const { run, ffmpegPath } = require('../util/proc.cjs');
const { presenterMode } = require('../steps.cjs');
const { chapterId } = require('../voice/synthesize.cjs');
const { clippedRuns } = require('../align/voice-check.cjs');
const { findRecording, RECORDING_EXTENSIONS, VOICE_CHAIN } = require('./recording-check.cjs');

const VIDEO_ARGS = ['-vf', 'fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '18'];
const VIDEO_COLOUR = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709'];
// Changing the chain or video settings must redo every import.
const RECIPE = sha256Text([VOICE_CHAIN, ...VIDEO_ARGS, ...VIDEO_COLOUR].join('|'));

const ff = (args) => run(ffmpegPath(), ['-v', 'error', '-y', ...args]);

/** Clipped runs in a recording, measured at its own channel layout (mixing hides clipping). */
function sourceClips(source, scratch) {
  ff(['-i', source, '-vn', '-ar', '48000', '-c:a', 'pcm_s16le', scratch]);
  try {
    return clippedRuns(scratch);
  } finally {
    fs.rmSync(scratch, { force: true });
  }
}

/**
 * Import the owner's chapter recordings (recordings/c01.*, c02.*, …): cleaned 48 kHz stereo
 * audio to work/voice/chapters/<cid>.wav (where the AI voice would go, so alignment works
 * unchanged) and, in face mode, a 30 fps video copy without sound to work/presenter/<cid>.mp4.
 * Unchanged recordings are skipped. Returns { imported, skipped, issues }.
 */
function importRecordings(project) {
  const script = readJson(project.path('script.json'));
  const face = presenterMode(project) === 'face';
  const audioDir = project.path('work', 'voice', 'chapters');
  const videoDir = project.path('work', 'presenter');
  ensureDir(audioDir);
  if (face) ensureDir(videoDir);
  const result = { imported: [], skipped: [], issues: [] };
  const keep = new Set();
  for (const chapter of script.chapters) {
    const cid = chapterId(chapter);
    keep.add(cid);
    const source = findRecording(project, cid);
    if (!source) {
      result.issues.push(
        `${cid}: no recording — save chapter ${chapter.id} ("${chapter.title}") as recordings/${cid}.${RECORDING_EXTENSIONS.join('|')}.`,
      );
      continue;
    }
    const wav = path.join(audioDir, `${cid}.wav`);
    const video = path.join(videoDir, `${cid}.mp4`);
    const metaFile = path.join(audioDir, `${cid}.json`);
    const sourceSha = sha256File(source);
    if (fs.existsSync(metaFile) && fs.existsSync(wav) && (!face || fs.existsSync(video))) {
      const meta = readJson(metaFile);
      if (meta.sourceSha === sourceSha && meta.recipe === RECIPE && meta.face === face) {
        result.skipped.push(cid);
        continue;
      }
    }
    const clips = sourceClips(source, path.join(audioDir, `${cid}.check.wav`));
    if (clips) {
      result.issues.push(
        `${cid}: the recording clips ${clips} time(s) (too loud) — record chapter ${chapter.id} again with lower microphone gain.`,
      );
      continue;
    }
    const partial = `${wav}.partial.wav`;
    ff([
      '-i',
      source,
      '-vn',
      '-af',
      VOICE_CHAIN,
      '-ar',
      '48000',
      '-ac',
      '2',
      '-c:a',
      'pcm_s16le',
      partial,
    ]);
    fs.renameSync(partial, wav);
    if (face) {
      const partialVideo = `${video}.partial.mp4`;
      ff(['-i', source, '-an', ...VIDEO_ARGS, ...VIDEO_COLOUR, partialVideo]);
      fs.renameSync(partialVideo, video);
    }
    writeJson(metaFile, {
      source: path.relative(project.dir, source).replace(/\\/g, '/'),
      sourceSha,
      recipe: RECIPE,
      face,
      wavSha: sha256File(wav),
    });
    result.imported.push(cid);
  }
  // Chapter files for chapters no longer in the script would be aligned against nothing.
  for (const name of fs.readdirSync(audioDir)) {
    const cid = name.replace(/\.(wav|json)$/, '');
    if (/^c\d{2}\.(wav|json)$/.test(name) && !keep.has(cid)) fs.rmSync(path.join(audioDir, name));
  }
  return result;
}

module.exports = { importRecordings };
