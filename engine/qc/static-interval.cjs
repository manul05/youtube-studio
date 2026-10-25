'use strict';

const { spawnSync } = require('node:child_process');
const { ffmpegPath, probe } = require('../util/proc.cjs');
const { changeEvents, GW, GH } = require('./change.cjs');

const SAMPLES_PER_SEC = 2;

/** Decode a video to 80×45 grey frames, two per second. */
function grayFrames(videoPath) {
  const r = spawnSync(
    ffmpegPath(),
    [
      '-v',
      'error',
      '-i',
      videoPath,
      '-vf',
      `fps=${SAMPLES_PER_SEC}:round=down,scale=${GW}:${GH},format=gray`,
      '-f',
      'rawvideo',
      '-',
    ],
    { windowsHide: true, maxBuffer: 512 * 1024 * 1024 },
  );
  if (r.status !== 0)
    throw new Error(`Could not decode ${videoPath}: ${String(r.stderr).slice(-300)}`);
  const size = GW * GH;
  const frames = [];
  for (let off = 0; off + size <= r.stdout.length; off += size)
    frames.push(r.stdout.subarray(off, off + size));
  return frames;
}

/**
 * How long the picture stays without a meaningful change (motion-compensated; see change.cjs).
 * `exempt` windows (e.g. the endcard) are excluded. Returns change times, the longest static
 * interval and where it starts, the median interval and a histogram in whole seconds.
 */
function staticIntervals(videoPath, { threshold, exempt = [] }) {
  const duration = Number(probe(videoPath).format.duration);
  const { events } = changeEvents(grayFrames(videoPath), threshold);
  const times = events.map((i) => i / SAMPLES_PER_SEC);
  const marks = [...new Set([...times, ...exempt.flat(), duration])]
    .filter((t) => t <= duration)
    .sort((a, b) => a - b);
  const inExempt = (a, b) => exempt.some(([s, e]) => a >= s - 1e-6 && b <= e + 1e-6);
  const intervals = [];
  for (let i = 0; i + 1 < marks.length; i += 1) {
    if (!inExempt(marks[i], marks[i + 1]))
      intervals.push({ start: marks[i], length: marks[i + 1] - marks[i] });
  }
  const longest = intervals.reduce((a, b) => (b.length > a.length ? b : a), {
    start: 0,
    length: 0,
  });
  const lengths = intervals.map((x) => x.length).sort((a, b) => a - b);
  const histogram = {};
  for (const len of lengths) histogram[Math.floor(len)] = (histogram[Math.floor(len)] || 0) + 1;
  return {
    events: times,
    longest: Math.round(longest.length * 100) / 100,
    longestAt: longest.start,
    median: lengths.length ? lengths[Math.floor(lengths.length / 2)] : 0,
    histogram,
  };
}

module.exports = { staticIntervals, grayFrames };
