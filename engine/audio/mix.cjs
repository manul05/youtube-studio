'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readJson, ensureDir } = require('../util/files.cjs');
const { run, ffmpegPath, concatManifestLine } = require('../util/proc.cjs');
const { pickMusic } = require('./music.cjs');
const { sfxEvents, renderSfxTrack, decodeMono, RATE } = require('./sfx.cjs');
const { measure } = require('./loudness.cjs');

const VOICE_LUFS = -16;
const MUSIC_LUFS = -30;
const PCM = ['-ar', String(RATE), '-ac', '2', '-c:a', 'pcm_s16le'];

const ff = (args) => run(ffmpegPath(), ['-v', 'error', '-y', ...args]);
const defaultDir = (project) => project.path('work', 'audio');

function concat(files, dest) {
  const manifest = `${dest}.txt`;
  fs.writeFileSync(manifest, `${files.map(concatManifestLine).join('\n')}\n`);
  ff(['-f', 'concat', '-safe', '0', '-i', manifest, ...PCM, dest]);
  return dest;
}

function silence(dest, seconds) {
  ff(['-f', 'lavfi', '-i', `anullsrc=r=${RATE}:cl=stereo`, '-t', seconds.toFixed(6), ...PCM, dest]);
  return dest;
}

/**
 * The narration on the timeline: each plan paragraph starts after its lead and is padded to its
 * exact span; anything between paragraphs (chapter cards, endcard) is silent. A paragraph may
 * name its own audio file (Shorts do); otherwise work/voice/paragraphs/<id>.wav is used.
 * Normalised to -16 LUFS.
 */
function buildVoiceTrack(project, plan, dir = defaultDir(project)) {
  const timed = path.join(dir, 'timed');
  ensureDir(timed);
  const segments = [];
  let cursor = 0;
  const paragraphs = [...plan.paragraphs].sort((a, b) => a.startFrame - b.startFrame);
  paragraphs.forEach((p, i) => {
    if (p.startFrame > cursor) {
      segments.push(silence(path.join(timed, `gap_${i}.wav`), (p.startFrame - cursor) / plan.fps));
    }
    const source = p.audio || project.path('work', 'voice', 'paragraphs', `${p.id}.wav`);
    if (!fs.existsSync(source))
      throw new Error(`Missing narration for ${p.id} (run npm run align).`);
    const lead = Math.round((p.lead || 0) * 1000);
    const dest = path.join(timed, `${p.id}.wav`);
    const span = (p.frames / plan.fps).toFixed(6);
    ff(['-i', source, '-af', `adelay=${lead}|${lead},apad,atrim=end=${span}`, ...PCM, dest]);
    segments.push(dest);
    cursor = p.startFrame + p.frames;
  });
  if (plan.frames > cursor) {
    segments.push(silence(path.join(timed, 'tail.wav'), (plan.frames - cursor) / plan.fps));
  }
  const raw = concat(segments, path.join(dir, 'voice_raw.wav'));
  const dest = path.join(dir, 'voice.wav');
  ff(['-i', raw, '-af', `loudnorm=I=${VOICE_LUFS}:TP=-2:LRA=11`, ...PCM, dest]);
  return dest;
}

/** One licensed track per chapter, looped to length, faded, levelled to a quiet bed. */
function buildMusicTrack(project, plan, dir = defaultDir(project)) {
  const musicDir = path.join(dir, 'music');
  ensureDir(musicDir);
  const picks = pickMusic(project.brief, plan);
  const files = plan.chapters.map((chapter, i) => {
    const seconds = chapter.frames / plan.fps;
    const fade = Math.min(1.5, seconds / 4);
    const dest = path.join(musicDir, `c${String(chapter.id).padStart(2, '0')}.wav`);
    const filter =
      `loudnorm=I=${MUSIC_LUFS}:TP=-6:LRA=11,afade=t=in:st=0:d=${fade},` +
      `afade=t=out:st=${(seconds - fade).toFixed(3)}:d=${fade}`;
    ff([
      '-stream_loop',
      '-1',
      '-i',
      picks[i].file,
      '-t',
      seconds.toFixed(6),
      '-af',
      filter,
      ...PCM,
      dest,
    ]);
    return dest;
  });
  return { file: concat(files, path.join(dir, 'music.wav')), picks };
}

/**
 * Voice + music (ducked under the voice) + effects, mixed without normalisation, then measured
 * for the second loudness pass. Returns { mixed, firstPass, picks }.
 */
async function buildMix(
  project,
  plan = readJson(project.path('beats.json')),
  { dir = defaultDir(project) } = {},
) {
  ensureDir(dir);
  const voice = buildVoiceTrack(project, plan, dir);
  const music = buildMusicTrack(project, plan, dir);
  const ducked = path.join(dir, 'music_ducked.wav');
  ff([
    '-i',
    music.file,
    '-i',
    voice,
    '-filter_complex',
    '[0:a][1:a]sidechaincompress=threshold=0.02:ratio=8:attack=15:release=350[d]',
    '-map',
    '[d]',
    ...PCM,
    ducked,
  ]);
  const effects = renderSfxTrack(
    sfxEvents(plan),
    plan.frames / plan.fps,
    path.join(dir, 'sfx.wav'),
  );
  const mixed = path.join(dir, 'mixed.wav');
  ff([
    '-i',
    voice,
    '-i',
    ducked,
    '-i',
    effects,
    '-filter_complex',
    '[0:a][1:a][2:a]amix=inputs=3:duration=first:normalize=0[m]',
    '-map',
    '[m]',
    ...PCM,
    mixed,
  ]);
  return { mixed, firstPass: measure(mixed), picks: music.picks };
}

const rmsDb = (samples, from, to) => {
  let sum = 0;
  for (let i = from; i < to; i += 1) sum += samples[i] * samples[i];
  return 10 * Math.log10(sum / Math.max(1, to - from) + 1e-12);
};

/** Median, over windows where the narrator speaks, of voice level minus ducked music level. */
function voiceToMusicDb(project, dir = defaultDir(project)) {
  const voice = decodeMono(path.join(dir, 'voice.wav'));
  const music = decodeMono(path.join(dir, 'music_ducked.wav'));
  const window = Math.round(RATE * 0.4);
  const diffs = [];
  for (let start = 0; start + window <= Math.min(voice.length, music.length); start += window) {
    const v = rmsDb(voice, start, start + window);
    if (v < -35) continue;
    diffs.push(v - rmsDb(music, start, start + window));
  }
  if (!diffs.length) return Infinity;
  diffs.sort((a, b) => a - b);
  return diffs[Math.floor(diffs.length / 2)];
}

module.exports = { buildMix, buildVoiceTrack, buildMusicTrack, voiceToMusicDb };
