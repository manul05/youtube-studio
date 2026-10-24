'use strict';

const { stamp } = require('../util/timecode.cjs');

/**
 * SRT and VTT from paragraphs placed on the timeline: [{ start, cues }], where each cue's times
 * are relative to its paragraph's start (in seconds).
 */
function exportCaptions(paragraphs) {
  const cues = [];
  for (const paragraph of paragraphs) {
    for (const cue of paragraph.cues) {
      cues.push({ ...cue, start: cue.start + paragraph.start, end: cue.end + paragraph.start });
    }
  }
  const srt = cues
    .map(
      (c, i) =>
        `${i + 1}\n${stamp(c.start, ',')} --> ${stamp(c.end, ',')}\n${c.lines.join('\n')}\n`,
    )
    .join('\n');
  const vtt = `WEBVTT\n\n${cues
    .map((c) => `${stamp(c.start)} --> ${stamp(c.end)}\n${c.lines.join('\n')}\n`)
    .join('\n')}`;
  return { srt, vtt, count: cues.length };
}

module.exports = { exportCaptions };
