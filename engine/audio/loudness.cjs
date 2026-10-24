'use strict';

const { run, ffmpegPath } = require('../util/proc.cjs');

const TARGET = 'I=-14:TP=-1.5:LRA=11';

/** Integrated loudness, true peak and loudness range of a file (EBU R128 via loudnorm). */
function measure(file) {
  const { stderr } = run(ffmpegPath(), [
    '-hide_banner',
    '-nostats',
    '-i',
    file,
    '-vn',
    '-af',
    `loudnorm=${TARGET}:print_format=json`,
    '-f',
    'null',
    '-',
  ]);
  const match = stderr.match(/\{[\s\S]*?"input_i"[\s\S]*?\}/);
  if (!match) throw new Error(`Could not measure loudness of ${file}`);
  const raw = JSON.parse(match[0]);
  return {
    lufs: Number(raw.input_i),
    truePeak: Number(raw.input_tp),
    lra: Number(raw.input_lra),
    raw,
  };
}

/** Second-pass loudnorm filter (linear) from a first-pass measurement. */
function secondPassFilter(m) {
  const r = m.raw;
  return (
    `loudnorm=${TARGET}:measured_I=${r.input_i}:measured_TP=${r.input_tp}` +
    `:measured_LRA=${r.input_lra}:measured_thresh=${r.input_thresh}:offset=${r.target_offset}:linear=true`
  );
}

module.exports = { measure, secondPassFilter };
