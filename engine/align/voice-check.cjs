'use strict';

const fs = require('node:fs');
const { readJson } = require('../util/files.cjs');
const { qc, channel } = require('../config.cjs');
const { assertParagraphId } = require('../voice/synthesize.cjs');

/** Pauses inside paragraphs and the overall speaking pace, from aligned words. */
function pacingIssues(paragraphs, { language, channelWpm }) {
  const limits = qc();
  const issues = [];
  let words = 0;
  let seconds = 0;
  for (const { id, words: timed } of paragraphs) {
    if (!timed.length) continue;
    for (let i = 1; i < timed.length; i += 1) {
      const gap = timed[i].start - timed[i - 1].end;
      if (gap > limits.silenceInParagraphFlag) {
        issues.push(
          `${id}: ${gap.toFixed(1)} s pause after "${timed[i - 1].text}" — retake this paragraph.`,
        );
      }
    }
    words += timed.length;
    seconds += timed[timed.length - 1].end - timed[0].start;
  }
  const wpm = seconds > 0 ? Math.round((words / seconds) * 60) : 0;
  let band = null;
  if (language === 'en') band = limits.wpmEnglish;
  else if (channelWpm)
    band = [channelWpm * (1 - limits.wpmBand), channelWpm * (1 + limits.wpmBand)];
  if (band && wpm && (wpm < band[0] || wpm > band[1])) {
    issues.push(
      `Narration pace is ${wpm} words per minute; the target is ${Math.round(band[0])}–` +
        `${Math.round(band[1])}. Adjust the voice style (for example "a little slower") and re-record.`,
    );
  }
  return { issues, wpm };
}

/** Count runs of 3+ consecutive full-scale samples (clipping) in a 16-bit PCM WAV. */
function clippedRuns(wavPath) {
  const buf = fs.readFileSync(wavPath);
  let pos = 12;
  let channels = 2;
  let dataStart = -1;
  let dataLength = 0;
  while (pos + 8 <= buf.length) {
    const id = buf.toString('ascii', pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === 'fmt ') channels = buf.readUInt16LE(pos + 10);
    if (id === 'data') {
      dataStart = pos + 8;
      dataLength = Math.min(size, buf.length - dataStart);
      break;
    }
    pos += 8 + size + (size % 2);
  }
  if (dataStart < 0) return 0;
  let runs = 0;
  let streak = 0;
  for (let p = dataStart; p + 1 < dataStart + dataLength; p += 2 * channels) {
    const v = buf.readInt16LE(p);
    streak = v >= 32767 || v <= -32768 ? streak + 1 : 0;
    if (streak === 3) runs += 1;
  }
  return runs;
}

/** All voice problems for the project, with paragraph ids to retake. */
function voiceIssues(project) {
  const script = readJson(project.path('script.json'));
  const brief = project.brief;
  const paragraphs = [];
  const issues = [];
  for (const p of script.chapters.flatMap((c) => c.paragraphs)) {
    assertParagraphId(p.id);
    const alignFile = project.path('work', 'align', `${p.id}.json`);
    const wav = project.path('work', 'voice', 'paragraphs', `${p.id}.wav`);
    if (!fs.existsSync(alignFile) || !fs.existsSync(wav)) {
      issues.push(`${p.id}: not aligned yet (run npm run align).`);
      continue;
    }
    paragraphs.push({ id: p.id, words: readJson(alignFile).words });
    const clipped = clippedRuns(wav);
    if (clipped) issues.push(`${p.id}: audio clips ${clipped} time(s) — retake this paragraph.`);
  }
  const pacing = pacingIssues(paragraphs, {
    language: brief.language,
    channelWpm: channel(brief.channel).wpm,
  });
  return { issues: [...issues, ...pacing.issues], wpm: pacing.wpm };
}

module.exports = { pacingIssues, clippedRuns, voiceIssues };
