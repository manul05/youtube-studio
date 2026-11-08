'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { writeJson, ensureDir } = require('../util/files.cjs');
const { run, ffmpegPath, probe } = require('../util/proc.cjs');
const { qc } = require('../config.cjs');
const { presenterMode } = require('../steps.cjs');
const { measure } = require('../audio/loudness.cjs');
const { decodeMono, RATE } = require('../audio/sfx.cjs');
const { clippedRuns } = require('../align/voice-check.cjs');

const RECORDING_EXTENSIONS = ['wav', 'm4a', 'mp3', 'mp4', 'mov', 'aac', 'flac'];
const WINDOW_SEC = 0.05;

/** The owner's file for a recording slot ("sample", "c01", …), or null. */
function findRecording(project, name) {
  for (const ext of RECORDING_EXTENSIONS) {
    const file = project.path('recordings', `${name}.${ext}`);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

/** Level of the quietest 10% of 50 ms windows, in dBFS: the room and microphone noise. */
function noiseFloorDb(samples) {
  const size = Math.round(RATE * WINDOW_SEC);
  const levels = [];
  for (let start = 0; start + size <= samples.length; start += size) {
    let sum = 0;
    for (let i = start; i < start + size; i += 1) sum += samples[i] * samples[i];
    levels.push(Math.sqrt(sum / size));
  }
  if (!levels.length) return 0;
  levels.sort((a, b) => a - b);
  const quiet = levels.slice(0, Math.max(1, Math.floor(levels.length * 0.1)));
  const rms = quiet.reduce((n, v) => n + v, 0) / quiet.length;
  return Math.round(20 * Math.log10(Math.max(rms, 1e-7)) * 10) / 10;
}

/**
 * Check the owner's test recording (recordings/sample.*) before they record the whole video:
 * clipping, room noise, sample rate, length and — in face mode — resolution and frame rate.
 * Writes work/voice/sample/recording.wav and manifest.json for the stop-3 page.
 */
function checkRecording(project) {
  const source = findRecording(project, 'sample');
  if (!source) {
    return {
      issues: [
        `No test recording: save about 30 s as recordings/sample.${RECORDING_EXTENSIONS.join('|')}.`,
      ],
      report: null,
    };
  }
  const limits = qc();
  const issues = [];
  const info = probe(source);
  const audio = info.streams.find((s) => s.codec_type === 'audio');
  if (!audio) return { issues: [`${path.basename(source)} has no sound.`], report: null };
  const dir = project.path('work', 'voice', 'sample');
  ensureDir(dir);
  const wav = path.join(dir, 'recording.wav');
  // Keep the original channels: up- or down-mixing changes the level and can hide clipping.
  run(ffmpegPath(), [
    '-v',
    'error',
    '-y',
    '-i',
    source,
    '-vn',
    '-ar',
    '48000',
    '-c:a',
    'pcm_s16le',
    wav,
  ]);

  const loud = measure(wav);
  const report = {
    file: path.relative(project.dir, source).replace(/\\/g, '/'),
    durationSec: Math.round(Number(info.format.duration) * 10) / 10,
    sampleRate: Number(audio.sample_rate),
    lufs: loud.lufs,
    truePeak: loud.truePeak,
    noiseFloorDb: noiseFloorDb(decodeMono(wav)),
    clips: clippedRuns(wav),
  };
  if (report.durationSec < 10) {
    issues.push(`The test recording is ${report.durationSec} s; record about 30 s.`);
  }
  if (report.clips) {
    issues.push(
      `The recording clips ${report.clips} time(s) (too loud): lower the microphone gain or move it a little further away.`,
    );
  }
  if (report.noiseFloorDb > limits.recordingNoiseFloorMax) {
    issues.push(
      `Background noise floor ${report.noiseFloorDb} dBFS (max ${limits.recordingNoiseFloorMax}): find a quieter room, switch off fans, move the microphone closer.`,
    );
  }
  if (report.lufs < limits.recordingMinLufs) {
    issues.push(
      `The voice is very quiet (${report.lufs} LUFS, min ${limits.recordingMinLufs}): move the microphone closer or raise its gain.`,
    );
  }
  if (report.sampleRate < limits.recordingMinSampleRate) {
    issues.push(
      `Sample rate ${report.sampleRate} Hz (min ${limits.recordingMinSampleRate}): record at 48 kHz.`,
    );
  }
  if (presenterMode(project) === 'face') {
    const video = info.streams.find((s) => s.codec_type === 'video');
    if (!video) {
      issues.push('Face mode needs a video recording (mp4 or mov) of you speaking.');
    } else {
      const [n, d] = String(video.avg_frame_rate || '0/1')
        .split('/')
        .map(Number);
      report.width = video.width;
      report.height = video.height;
      report.fps = d ? Math.round((n / d) * 100) / 100 : 0;
      if (video.width < limits.recordingMinWidth || video.height < limits.recordingMinHeight) {
        issues.push(
          `Video is ${video.width}×${video.height} (min ${limits.recordingMinWidth}×${limits.recordingMinHeight}; 4K recommended for Shorts).`,
        );
      }
      if (report.fps < limits.recordingFpsMin || report.fps > limits.recordingFpsMax) {
        issues.push(
          `Video is ${report.fps} fps (use ${limits.recordingFpsMin}–${limits.recordingFpsMax}; 30 recommended).`,
        );
      }
    }
  }
  writeJson(path.join(dir, 'manifest.json'), {
    recorded: true,
    mode: presenterMode(project),
    report,
    issues,
  });
  return { issues, report };
}

module.exports = { checkRecording, findRecording, noiseFloorDb, RECORDING_EXTENSIONS };
