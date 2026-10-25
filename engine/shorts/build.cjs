'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readJson, writeJson, ensureDir } = require('../util/files.cjs');
const { run, ffmpegPath, probe, concatManifestLine } = require('../util/proc.cjs');
const { BEAT_TYPES } = require('../plan/beat-types.cjs');
const { phrases } = require('../captions/phrases.cjs');
const { renderAll } = require('../render/render-all.cjs');
const { assembleMaster } = require('../assemble/master.cjs');
const { spanSegments, hookSpan, shortsMeasuredIssues, HOOK_GAP } = require('./spans.cjs');

const FPS = 30;
const STATIC_MAX_SHORT = 3;
const SHORT_CAPTION_CHARS = 20; // short, punchy caption lines for phones
const PCM = ['-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le'];
const ff = (args) => run(ffmpegPath(), ['-v', 'error', '-y', ...args]);
const seconds = (file) => Number(probe(file).format.duration);

/** Cut [start, end] seconds of an audio file into a PCM WAV. */
function cutAudio(source, dest, start, end) {
  ff(['-i', source, '-ss', start.toFixed(3), '-to', end.toFixed(3), ...PCM, dest]);
  return dest;
}

/** An art-focus too long for Shorts pacing becomes a tour of the full frame, focus and centre. */
function paceForShorts(beat) {
  const spec = BEAT_TYPES[beat.type];
  if (beat.type !== 'art-focus' || beat.frames / FPS <= STATIC_MAX_SHORT || spec.internalReveals)
    return beat;
  const [x, y, w, h] = beat.fields.focus;
  return {
    ...beat,
    type: 'art-tour',
    fields: {
      imagePrompt: beat.fields.imagePrompt,
      crops: [
        [0, 0, 1, 1],
        [x, y, w, h],
        [x + w / 4, y + h / 4, w / 2, h / 2],
      ],
    },
  };
}

/**
 * Plan one Short (9:16, ≤ 59 s) without rendering it: its hook line, then the long-form
 * sentences it spans, with the long-form beats that cover them re-timed and burned-in captions.
 * Writes work/shorts/<id>/beats.json (and the Short's audio pieces); returns the plan file.
 */
async function planShort(project, short) {
  if (!/^[a-z0-9-]+$/i.test(short.id)) throw new Error(`Invalid Short id "${short.id}".`);
  const issues = shortsMeasuredIssues([short], project, { required: 1 });
  if (issues.length) throw new Error(issues.join('\n'));
  const brief = project.brief;
  const longPlan = readJson(project.path('beats.json'));
  const dir = project.path('work', 'shorts', short.id);
  ensureDir(dir);

  // Audio: the hook line, a short pause, then the spoken span.
  const hook = hookSpan(project, short);
  const hookWav = cutAudio(
    hook.path,
    path.join(dir, 'hook.wav'),
    Math.max(0, hook.start - 0.05),
    hook.end + 0.15,
  );
  const segments = spanSegments(project, short);
  const pieces = segments.map((seg, i) =>
    cutAudio(
      project.path('work', 'voice', 'paragraphs', `${seg.paragraph}.wav`),
      path.join(dir, `seg_${i}.wav`),
      seg.start,
      seg.end,
    ),
  );
  const manifest = path.join(dir, 'span.txt');
  fs.writeFileSync(manifest, `${pieces.map(concatManifestLine).join('\n')}\n`);
  const spanWav = path.join(dir, 'span.wav');
  ff(['-f', 'concat', '-safe', '0', '-i', manifest, ...PCM, spanWav]);

  const hookSec = seconds(hookWav) + HOOK_GAP;
  const hookFrames = Math.ceil(hookSec * FPS);
  const spanFrames = Math.ceil(seconds(spanWav) * FPS);
  const total = hookFrames + spanFrames;

  // Beats: the hook as kinetic type, then long-form beats re-timed onto the span.
  const accents = (brief.style && brief.style.accents) || {};
  const beats = [
    {
      id: `${short.id}hook`,
      chapter: 1,
      paragraph: null,
      type: 'kinetic',
      startFrame: 0,
      frames: hookFrames,
      fields: { text: short.hookLine },
      style: accents.kinetic || brief.style.main,
      words: [],
    },
  ];
  const captionWords = [];
  let offset = hookSec;
  for (const seg of segments) {
    const paragraphBeats = longPlan.beats.filter((b) => b.paragraph === seg.paragraph);
    const toShort = (paraAudioSec) => offset + (paraAudioSec - seg.start);
    for (let i = 0; i < paragraphBeats.length; i += 1) {
      const b = paragraphBeats[i];
      const lead = b.lead || 0;
      const bStart = (b.startFrame - b.paragraphStartFrame) / longPlan.fps - lead;
      const bEnd = bStart + b.frames / longPlan.fps;
      const from = Math.max(bStart, seg.start);
      const to = Math.min(bEnd, seg.end);
      if (to - from < 0.5) continue;
      beats.push(
        paceForShorts({
          ...b,
          id: `${short.id}-${b.id}`,
          sourceBeat: b.id,
          chapter: 1,
          paragraph: null,
          startFrame: Math.round(toShort(from) * FPS),
          frames: 0,
          words: seg.words.map((w) => ({
            ...w,
            start: toShort(w.start) - toShort(from),
            end: toShort(w.end) - toShort(from),
          })),
        }),
      );
    }
    for (const w of seg.words)
      captionWords.push({ ...w, start: toShort(w.start), end: toShort(w.end) });
    offset += seg.end - seg.start;
  }
  // Make beats contiguous to the end of the Short.
  beats.sort((a, b) => a.startFrame - b.startFrame);
  beats[1] && (beats[1].startFrame = hookFrames);
  for (let i = 0; i < beats.length; i += 1) {
    const next = i + 1 < beats.length ? beats[i + 1].startFrame : total;
    beats[i].frames = next - beats[i].startFrame;
  }

  const plan = {
    format: 'short',
    fps: FPS,
    width: 1080,
    height: 1920,
    frames: total,
    chapters: [{ id: 1, title: short.hookLine, startFrame: 0, frames: total }],
    paragraphs: [
      { id: 'hook', startFrame: 0, frames: hookFrames, lead: 0, audio: hookWav },
      { id: 'span', startFrame: hookFrames, frames: spanFrames, lead: 0, audio: spanWav },
    ],
    beats,
    captions: phrases(captionWords, {
      script: brief.captionScript,
      lineChars: SHORT_CAPTION_CHARS,
    }),
    captionPack: 'vertical-captions',
  };
  const planFile = path.join(dir, 'beats.json');
  writeJson(planFile, plan);
  return planFile;
}

/** Plan, render and mix one Short into outputs/shorts/<id>.mp4. */
async function buildShort(project, short) {
  const planFile = await planShort(project, short);
  const dir = path.dirname(planFile);
  const label = `short-${short.id}`;
  await renderAll(project, { format: 'short', planFile, label });
  return assembleMaster(project, {
    label,
    planFile,
    dest: project.path('outputs', 'shorts', `${short.id}.mp4`),
    audioDir: path.join(dir, 'audio'),
    qcFile: project.path('outputs', 'qc', `short-${short.id}-audio.json`),
  });
}

module.exports = { buildShort, planShort, paceForShorts };
