'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { readJson, writeJson } = require('../util/files.cjs');
const { ffmpegPath, probe } = require('../util/proc.cjs');
const { qc } = require('../config.cjs');
const { loadStyle } = require('../styles/loader.cjs');
const { researchIssues } = require('../words/research.cjs');
const { ledgerIssues } = require('../assets/ledger.cjs');
const { captionIssues } = require('../captions/check.cjs');
const { writeCaptions } = require('../package/captions.cjs');
const { thumbIssues, titleIssues } = require('../package/thumbs-check.cjs');
const { staticIntervals } = require('./static-interval.cjs');
const { readTextLogs, debugTextIssues } = require('./text-audit.cjs');
const { silenceIssues } = require('./silence.cjs');
const { streamIssues } = require('./streams.cjs');

function decodeErrors(file) {
  const r = spawnSync(ffmpegPath(), ['-v', 'error', '-i', file, '-f', 'null', '-'], {
    windowsHide: true,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  return r.status !== 0 || r.stderr.trim() ? (r.stderr || 'decode failed').slice(0, 500) : '';
}

/** Windows (seconds) where silence and stillness are intended: chapter cards and the endcard. */
function quietWindows(plan) {
  return plan.beats
    .filter((b) => b.type === 'chapter' || b.type === 'endcard')
    .map((b) => [b.startFrame / plan.fps, (b.startFrame + b.frames) / plan.fps]);
}

function loudnessIssues(audioFile, limits, category = 'E') {
  if (!fs.existsSync(audioFile))
    return [{ category, hard: true, message: 'No loudness measurement found.' }];
  const audio = readJson(audioFile);
  const out = [];
  const { lufs, truePeak } = audio.final;
  if (!(lufs >= limits.lufsMin && lufs <= limits.lufsMax)) {
    out.push({
      category,
      hard: true,
      message: `Loudness ${lufs} LUFS is outside ${limits.lufsMin} to ${limits.lufsMax}.`,
    });
  }
  if (!(truePeak <= limits.truePeakMax)) {
    out.push({
      category,
      hard: true,
      message: `True peak ${truePeak} dBTP is above ${limits.truePeakMax}.`,
    });
  }
  if (audio.voiceToMusicDb < limits.voiceToMusicMinDb) {
    out.push({
      category,
      message: `Voice is only ${audio.voiceToMusicDb.toFixed(1)} dB above the music (min ${limits.voiceToMusicMinDb}).`,
    });
  }
  return out;
}

function checkVideo(
  file,
  { expected, threshold, staticMax, exempt, textLogDir, audioFile, limits },
) {
  const found = [];
  if (!fs.existsSync(file))
    return {
      found: [{ category: 'J', hard: true, message: `${path.basename(file)} is missing.` }],
      metrics: {},
    };
  for (const message of streamIssues(probe(file), expected))
    found.push({ category: 'J', hard: true, message });
  const decode = decodeErrors(file);
  if (decode)
    found.push({ category: 'J', hard: true, message: `Full decode reported errors: ${decode}` });
  found.push(...debugTextIssues(readTextLogs(textLogDir)));
  const still = staticIntervals(file, { threshold, exempt });
  if (still.longest > staticMax) {
    found.push({
      category: 'G',
      hard: true,
      t: still.longestAt,
      message: `The picture stays unchanged for ${still.longest.toFixed(1)} s from ${still.longestAt.toFixed(1)} s (max ${staticMax} s).`,
    });
  }
  found.push(...loudnessIssues(audioFile, limits));
  return {
    found,
    metrics: {
      staticLongest: still.longest,
      staticMedian: still.median,
      staticAt: still.longestAt,
    },
  };
}

/**
 * Measure everything code can measure about the finished package and write outputs/qc/qc.json:
 * { hardFails, issues, metrics, shorts }. Each finding names its rubric category (A–J).
 */
async function runQc(project) {
  const limits = qc();
  const brief = project.brief;
  const plan = readJson(project.path('beats.json'));
  const threshold =
    (loadStyle(brief.style.main).meta.qc || {}).changeThreshold || limits.changeThreshold;
  const findings = [];

  const long = checkVideo(project.path('outputs', 'master.mp4'), {
    expected: {
      width: 1920,
      height: 1080,
      fps: plan.fps,
      frames: plan.frames,
      duration: plan.frames / plan.fps,
    },
    threshold,
    staticMax: limits.staticMaxLong,
    exempt: quietWindows(plan).filter(([s, e]) => e - s > limits.staticMaxLong),
    textLogDir: project.path('work', 'render', 'long'),
    audioFile: project.path('outputs', 'qc', 'audio.json'),
    limits,
  });
  findings.push(...long.found);

  const voice = project.path('work', 'audio', 'voice.wav');
  if (fs.existsSync(voice))
    findings.push(
      ...silenceIssues(voice, { exempt: quietWindows(plan), minSec: limits.silenceHardFail }),
    );

  for (const p of writeCaptions(project)) {
    for (const message of captionIssues(p.cues, { script: brief.captionScript })) {
      findings.push({ category: 'H', message: `${p.id}: ${message}` });
    }
  }
  const script = readJson(project.path('script.json'));
  for (const message of researchIssues(script, readJson(project.path('research.json')))) {
    findings.push({ category: 'C', hard: true, message });
  }
  for (const message of ledgerIssues(project))
    findings.push({ category: 'C', hard: true, message });

  const thumbsFile = project.path('outputs', 'package', 'thumbs.json');
  if (fs.existsSync(thumbsFile)) {
    for (const t of readJson(thumbsFile)) {
      for (const message of await thumbIssues(t, brief.titles[0]))
        findings.push({ category: 'I', message });
    }
  } else {
    findings.push({ category: 'I', message: 'No thumbnails yet (npm run package).' });
  }
  for (const message of titleIssues(brief.titles)) findings.push({ category: 'I', message });

  const shorts = {};
  const shortsDir = project.path('outputs', 'shorts');
  const shortFiles = fs.existsSync(shortsDir)
    ? fs.readdirSync(shortsDir).filter((f) => f.endsWith('.mp4'))
    : [];
  for (const name of shortFiles) {
    const id = name.replace(/\.mp4$/, '');
    const shortPlan = readJson(project.path('work', 'shorts', id, 'beats.json'));
    const result = checkVideo(path.join(shortsDir, name), {
      expected: {
        width: 1080,
        height: 1920,
        fps: shortPlan.fps,
        frames: shortPlan.frames,
        duration: shortPlan.frames / shortPlan.fps,
      },
      threshold,
      staticMax: limits.staticMaxShort,
      exempt: [],
      textLogDir: project.path('work', 'render', `short-${id}`),
      audioFile: project.path('outputs', 'qc', `short-${id}-audio.json`),
      limits,
    });
    if (shortPlan.frames / shortPlan.fps > 59)
      result.found.push({ category: 'J', hard: true, message: 'Short is longer than 59 s.' });
    shorts[id] = {
      hardFails: result.found.filter((f) => f.hard),
      issues: result.found.filter((f) => !f.hard),
      metrics: result.metrics,
    };
  }

  const report = {
    hardFails: findings.filter((f) => f.hard),
    issues: findings.filter((f) => !f.hard),
    metrics: long.metrics,
    shorts,
    checkedAt: new Date().toISOString(),
  };
  writeJson(project.path('outputs', 'qc', 'qc.json'), report);
  return report;
}

module.exports = { runQc, quietWindows };
