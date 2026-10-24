'use strict';

const { qc } = require('../config.cjs');
const { graphemeCount, lineFits } = require('./phrases.cjs');

/** Caption rules from the quality bar: lines, line length, reading speed, timing. */
function captionIssues(cues, { script = 'latin' } = {}) {
  const limits = qc();
  const issues = [];
  let previous = null;
  for (const cue of cues) {
    const label = `Caption "${cue.text.slice(0, 40)}${cue.text.length > 40 ? '…' : ''}"`;
    const duration = cue.end - cue.start;
    if (cue.lines.length > limits.captionMaxLines) {
      issues.push(`${label} needs ${cue.lines.length} lines (max ${limits.captionMaxLines}).`);
    }
    for (const line of cue.lines) {
      if (!lineFits(line, script)) issues.push(`${label} has a line that is too long.`);
    }
    if (duration < limits.captionMinDuration - 1e-9) {
      issues.push(
        `${label} is on screen for ${duration.toFixed(2)} s (min ${limits.captionMinDuration} s).`,
      );
    }
    const cps = duration > 0 ? graphemeCount(cue.text) / duration : Infinity;
    if (cps > limits.captionMaxCps) {
      issues.push(`${label} needs ${cps.toFixed(1)} characters/s (max ${limits.captionMaxCps}).`);
    }
    if (previous && cue.start < previous.end - 1e-6) {
      issues.push(`${label} overlaps the previous caption.`);
    }
    const tokens = cue.tokens || [];
    if (tokens.length) {
      const tolerance = limits.captionTimingTolerance;
      if (Math.abs(cue.start - tokens[0].start) > tolerance) {
        issues.push(`${label} starts more than ${tolerance} s away from its first word.`);
      }
      if (cue.end < tokens[tokens.length - 1].end - tolerance) {
        issues.push(`${label} ends before its last word ends.`);
      }
    }
    previous = cue;
  }
  return issues;
}

module.exports = { captionIssues };
