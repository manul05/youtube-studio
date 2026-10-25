'use strict';

const { run, ffmpegPath, probe } = require('../util/proc.cjs');
const { stamp } = require('../util/timecode.cjs');

/** Unintended silences (≥ minSec below noiseDb) outside the exempt windows. Hard failures. */
function silenceIssues(audioPath, { exempt = [], noiseDb = -45, minSec = 1.2 } = {}) {
  const { stderr } = run(ffmpegPath(), [
    '-hide_banner',
    '-nostats',
    '-i',
    audioPath,
    '-vn',
    '-af',
    `silencedetect=n=${noiseDb}dB:d=${minSec}`,
    '-f',
    'null',
    '-',
  ]);
  const duration = Number(probe(audioPath).format.duration);
  const starts = [...stderr.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  const issues = [];
  starts.forEach((start, i) => {
    const end = ends[i] ?? duration;
    // Remove intended quiet windows (chapter cards, endcard); only what remains can be a fault.
    let pieces = [[start, end]];
    for (const [s0, e0] of exempt) {
      pieces = pieces.flatMap(([a, b]) => [
        ...(a < s0 ? [[a, Math.min(b, s0)]] : []),
        ...(b > e0 ? [[Math.max(a, e0), b]] : []),
      ]);
    }
    for (const [a, b] of pieces) {
      if (b - a < minSec) continue;
      issues.push({
        category: 'D',
        hard: true,
        t: a,
        message: `Unintended silence of ${(b - a).toFixed(1)} s at ${stamp(a).slice(3, 8)}.`,
      });
    }
  });
  return issues;
}

module.exports = { silenceIssues };
