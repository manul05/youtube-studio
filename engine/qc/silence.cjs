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
    const covered = exempt.some(([s, e]) => start >= s - 0.05 && end <= e + 0.05);
    if (covered || end - start < minSec) return;
    issues.push({
      category: 'D',
      hard: true,
      t: start,
      message: `Unintended silence of ${(end - start).toFixed(1)} s at ${stamp(start).slice(3, 8)}.`,
    });
  });
  return issues;
}

module.exports = { silenceIssues };
