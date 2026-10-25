'use strict';

const fs = require('node:fs');
const { readJson, writeJson, ensureDir, sha256File } = require('../util/files.cjs');
const { run, ffmpegPath, probe } = require('../util/proc.cjs');
const { buildMix, voiceToMusicDb } = require('../audio/mix.cjs');
const { measure, secondPassFilter } = require('../audio/loudness.cjs');

/**
 * The finished long-form master: the joined chapter video (no re-encode) with the mixed audio
 * normalised in a second, linear loudnorm pass to -14 LUFS / -1.5 dBTP, AAC 320k 48 kHz,
 * BT.709 tags and fast start. Loudness is measured again after encoding into outputs/qc/audio.json.
 */
async function assembleMaster(
  project,
  {
    label = 'long',
    planFile = project.path('beats.json'),
    dest = project.path('outputs', 'master.mp4'),
    audioDir = project.path('work', 'audio'),
    qcFile = project.path('outputs', 'qc', 'audio.json'),
  } = {},
) {
  const plan = readJson(planFile);
  const video = project.path('work', 'render', label, 'video.mp4');
  if (!fs.existsSync(video)) throw new Error('No rendered video yet (render the chapters first).');
  const stream = probe(video).streams.find((s) => s.codec_type === 'video');
  if (Number(stream.nb_frames) !== plan.frames) {
    throw new Error(`Rendered video has ${stream.nb_frames} frames; the plan has ${plan.frames}.`);
  }
  const { mixed, firstPass, picks } = await buildMix(project, plan, { dir: audioDir });
  ensureDir(require('node:path').dirname(qcFile));
  ensureDir(require('node:path').dirname(dest));
  const partial = dest.replace(/\.mp4$/, '.partial.mp4');
  const duration = plan.frames / plan.fps;
  run(ffmpegPath(), [
    '-v',
    'error',
    '-y',
    '-i',
    video,
    '-i',
    mixed,
    '-map',
    '0:v:0',
    '-map',
    '1:a:0',
    '-c:v',
    'copy',
    '-bsf:v',
    'h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1',
    '-af',
    secondPassFilter(firstPass),
    '-c:a',
    'aac',
    '-b:a',
    '320k',
    '-ar',
    '48000',
    '-ac',
    '2',
    '-t',
    duration.toFixed(6),
    '-movflags',
    '+faststart',
    '-metadata',
    'comment=AI-assisted illustrations and synthetic narration',
    partial,
  ]);
  fs.renameSync(partial, dest);
  const final = measure(dest);
  writeJson(qcFile, {
    method: 'Two-pass loudnorm; measured again after AAC encoding',
    firstPass: { lufs: firstPass.lufs, truePeak: firstPass.truePeak },
    final: { lufs: final.lufs, truePeak: final.truePeak, lra: final.lra },
    voiceToMusicDb: voiceToMusicDb(project, audioDir),
    music: picks.map((p) => ({
      chapter: p.chapterId,
      file: p.entry.file,
      licence: p.entry.licence,
    })),
    duration,
    masterSha256: sha256File(dest),
  });
  return { file: dest, final };
}

module.exports = { assembleMaster };
