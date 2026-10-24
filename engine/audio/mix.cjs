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

const work = (project, ...parts) => project.path('work', 'audio', ...parts);
const ff = (args) => run(ffmpegPath(), ['-v', 'error', '-y', ...args]);

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
 * The narration on the timeline: each paragraph starts after its 0.18 s lead and is padded to
 * its exact span; chapter cards and the endcard are silent. Normalised to -16 LUFS.
 */
function buildVoiceTrack(project, plan) {
  const dir = work(project, 'timed');
  ensureDir(dir);
  const segments = [];
  let cursor = 0;
  const paragraphs = [...plan.paragraphs].sort((a, b) => a.startFrame - b.startFrame);
  paragraphs.forEach((p, i) => {
    if (p.startFrame > cursor)
      segments.push(silence(path.join(dir, `gap_${i}.wav`), (p.startFrame - cursor) / plan.fps));
    const source = project.path('work', 'voice', 'paragraphs', `${p.id}.wav`);
    if (!fs.existsSync(source))
      throw new Error(`Missing narration for ${p.id} (run npm run align).`);
    const lead = Math.round((p.lead || 0) * 1000);
    const dest = path.join(dir, `${p.id}.wav`);
    ff([
      '-i',
      source,
      '-af',
      `adelay=${lead}|${lead},apad,atrim=end=${(p.frames / plan.fps).toFixed(6)}`,
      ...PCM,
      dest,
    ]);
    segments.push(dest);
    cursor = p.startFrame + p.frames;
  });
  if (plan.frames > cursor)
    segments.push(silence(path.join(dir, 'tail.wav'), (plan.frames - cursor) / plan.fps));
  const raw = concat(segments, work(project, 'voice_raw.wav'));
  const dest = work(project, 'voice.wav');
  ff(['-i', raw, '-af', `loudnorm=I=${VOICE_LUFS}:TP=-2:LRA=11`, ...PCM, dest]);
  return dest;
}

/** One licensed track per chapter, looped to length, faded, levelled to a quiet bed. */
function buildMusicTrack(project, plan) {
  const dir = work(project, 'music');
  ensureDir(dir);
  const picks = pickMusic(project.brief, plan);
  const files = plan.chapters.map((chapter, i) => {
    const seconds = chapter.frames / plan.fps;
    const fade = Math.min(1.5, seconds / 4);
    const dest = path.join(dir, `c${String(chapter.id).padStart(2, '0')}.wav`);
    ff([
      '-stream_loop',
      '-1',
      '-i',
      picks[i].file,
      '-t',
      seconds.toFixed(6),
      '-af',
      `loudnorm=I=${MUSIC_LUFS}:TP=-6:LRA=11,afade=t=in:st=0:d=${fade},afade=t=out:st=${(seconds - fade).toFixed(3)}:d=${fade}`,
      ...PCM,
      dest,
    ]);
    return dest;
  });
  return { file: concat(files, work(project, 'music.wav')), picks };
}

/**
 * Voice + music (ducked under the voice) + effects, mixed without normalisation, then measured
 * for the second loudness pass. Returns { mixed, firstPass, picks }.
 */
async function buildMix(project, plan = readJson(project.path('beats.json'))) {
  ensureDir(work(project));
  const voice = buildVoiceTrack(project, plan);
  const music = buildMusicTrack(project, plan);
  const ducked = work(project, 'music_ducked.wav');
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
  const effects = renderSfxTrack(sfxEvents(plan), plan.frames / plan.fps, work(project, 'sfx.wav'));
  const mixed = work(project, 'mixed.wav');
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
function voiceToMusicDb(project) {
  const voice = decodeMono(work(project, 'voice.wav'));
  const music = decodeMono(work(project, 'music_ducked.wav'));
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
