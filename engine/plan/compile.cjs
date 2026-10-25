'use strict';

const fs = require('node:fs');
const { readJson } = require('../util/files.cjs');
const { BEAT_TYPES } = require('./beat-types.cjs');
const { assertParagraphId } = require('../voice/synthesize.cjs');

const FPS = 30;
const LEAD = 0.18; // silence before each paragraph's voice
const ANCHOR_LEAD = 0.2; // a beat appears this long before its anchor word is spoken
const CHAPTER_CARD_SEC = 2.5;
const ENDCARD_SEC = 20;
const FORMATS = { long: { width: 1920, height: 1080 }, short: { width: 1080, height: 1920 } };
const AUTO_FIELDS = new Set(['type', 'atWord', 'claim', 'illustration']);

const toFrames = (sec) => Math.round(sec * FPS);

/** Which pack draws a beat: an accent for its type if the brief names one, else the main. */
function styleFor(brief, type) {
  const accents = (brief.style && brief.style.accents) || {};
  return accents[type] || brief.style.main;
}

function beatFields(intent) {
  const fields = {};
  for (const [key, value] of Object.entries(intent)) if (!AUTO_FIELDS.has(key)) fields[key] = value;
  return fields;
}

/** Load each paragraph's alignment (words relative to the paragraph audio, and its duration). */
function loadAlignment(project, paragraphId) {
  assertParagraphId(paragraphId);
  const file = project.path('work', 'align', `${paragraphId}.json`);
  if (!fs.existsSync(file))
    throw new Error(`${paragraphId} is not aligned yet (run npm run align).`);
  return readJson(file);
}

/** Longest pause between two paragraphs: below QC's 1.2 s unintended-silence limit. */
const MAX_PARAGRAPH_PAUSE = 1.0;

/**
 * Paragraph files are cut mid-pause, so their own quiet edges, the next paragraph's lead and the
 * hold add up. Shorten the hold so the spoken pause stays within MAX_PARAGRAPH_PAUSE.
 */
function cappedHold(hold, align, next) {
  if (!next || !align.words.length || !next.words.length) return hold;
  const tail = align.durationSec - align.words[align.words.length - 1].end;
  const room = MAX_PARAGRAPH_PAUSE - tail - LEAD - next.words[0].start;
  return Math.max(0, Math.min(hold, room));
}

/**
 * Compile the beat intents in script.json into frame-exact beats.json for the long-form video.
 * Paragraph span = 0.18 s lead + voice duration + hold. Chapters 2+ open with a 2.5 s title card
 * (chapter 1 is the cold open). The video ends with a 20 s endcard.
 */
function compilePlan(project, { format = 'long' } = {}) {
  const brief = project.brief;
  const script = readJson(project.path('script.json'));
  const beats = [];
  const chapters = [];
  const paragraphs = [];
  let frame = 0;
  const order = script.chapters.flatMap((c) => c.paragraphs.map((p) => p.id));

  script.chapters.forEach((chapter, chapterIndex) => {
    const chapterStart = frame;
    const cid = `c${String(chapter.id).padStart(2, '0')}`;
    if (chapterIndex > 0) {
      beats.push({
        id: `${cid}chapter`,
        chapter: chapter.id,
        paragraph: null,
        type: 'chapter',
        startFrame: frame,
        frames: toFrames(CHAPTER_CARD_SEC),
        fields: { number: chapterIndex + 1, title: chapter.title },
        style: styleFor(brief, 'chapter'),
      });
      frame += toFrames(CHAPTER_CARD_SEC);
    }
    for (const paragraph of chapter.paragraphs) {
      const align = loadAlignment(project, paragraph.id);
      const nextId = order[order.indexOf(paragraph.id) + 1];
      const hold = cappedHold(
        paragraph.hold ?? 0.4,
        align,
        nextId && loadAlignment(project, nextId),
      );
      const spanFrames = Math.ceil((LEAD + align.durationSec + hold) * FPS);
      const paragraphStart = frame;
      paragraphs.push({
        id: paragraph.id,
        chapter: chapter.id,
        startFrame: frame,
        frames: spanFrames,
        lead: LEAD,
      });
      const intents = paragraph.beats || [];
      const starts = intents.map((intent, i) => {
        if (i === 0) return 0;
        const word = align.words[intent.atWord];
        const sec = word ? LEAD + word.start - ANCHOR_LEAD : 0;
        return Math.min(spanFrames - 1, Math.max(0, toFrames(sec)));
      });
      intents.forEach((intent, i) => {
        const start = starts[i];
        const end = i + 1 < intents.length ? starts[i + 1] : spanFrames;
        beats.push({
          id: `${paragraph.id}b${i}`,
          chapter: chapter.id,
          paragraph: paragraph.id,
          type: intent.type,
          atWord: intent.atWord,
          startFrame: paragraphStart + start,
          frames: Math.max(0, end - start),
          paragraphStartFrame: paragraphStart,
          lead: LEAD,
          fields: beatFields(intent),
          claim: intent.claim || null,
          illustration: Boolean(intent.illustration),
          style: styleFor(brief, intent.type),
        });
      });
      frame += spanFrames;
    }
    if (chapterIndex === script.chapters.length - 1) {
      beats.push({
        id: 'endcard',
        chapter: chapter.id,
        paragraph: null,
        type: 'endcard',
        startFrame: frame,
        frames: toFrames(ENDCARD_SEC),
        fields: {},
        style: styleFor(brief, 'endcard'),
      });
      frame += toFrames(ENDCARD_SEC);
    }
    chapters.push({
      id: chapter.id,
      title: chapter.title,
      startFrame: chapterStart,
      frames: frame - chapterStart,
    });
  });

  const { width, height } = FORMATS[format];
  return { format, fps: FPS, width, height, frames: frame, chapters, paragraphs, beats };
}

/** Every reason the compiled plan cannot be rendered as specified. */
function planIssues(plan, research) {
  const issues = [];
  const claims = new Map((research.claims || []).map((c) => [c.id, c]));
  const paragraphBeats = new Map();
  for (const beat of plan.beats) {
    const spec = BEAT_TYPES[beat.type];
    if (!spec) {
      issues.push(`${beat.id}: unknown beat type "${beat.type}" (see npm run beats).`);
      continue;
    }
    if (beat.paragraph) {
      if (!paragraphBeats.has(beat.paragraph)) paragraphBeats.set(beat.paragraph, []);
      paragraphBeats.get(beat.paragraph).push(beat);
    }
    for (const [field, need] of Object.entries(spec.fields)) {
      if (need === 'required' && (beat.fields[field] === undefined || beat.fields[field] === '')) {
        issues.push(`${beat.id}: ${beat.type} needs "${field}".`);
      }
    }
    const seconds = beat.frames / plan.fps;
    if (seconds > spec.maxSec + 1e-9) {
      const reason = spec.internalReveals
        ? `the limit for ${beat.type} is ${spec.maxSec} s`
        : `a beat without internal reveals cannot be longer than 6 s`;
      issues.push(
        `${beat.id}: ${beat.type} lasts ${seconds.toFixed(1)} s, longer than ${spec.maxSec} s — ${reason}. ` +
          'Split it or add a beat at a later word.',
      );
    }
    if (seconds < spec.minSec - 1e-9) {
      issues.push(
        `${beat.id}: ${beat.type} lasts only ${seconds.toFixed(1)} s (min ${spec.minSec} s).`,
      );
    }
    if (
      beat.type === 'art-tour' &&
      !(Array.isArray(beat.fields.crops) && beat.fields.crops.length >= 2)
    ) {
      issues.push(`${beat.id}: art-tour needs at least 2 crops.`);
    }
    if (beat.type === 'art-focus') {
      const f = beat.fields.focus;
      if (!Array.isArray(f) || f.length !== 4 || f.some((v) => !(v >= 0 && v <= 1))) {
        issues.push(`${beat.id}: focus must be [x, y, width, height] between 0 and 1.`);
      }
    }
    if (spec.factual) {
      const claim = beat.claim && claims.get(beat.claim);
      if (!beat.claim) issues.push(`${beat.id}: ${beat.type} shows facts and needs a claim id.`);
      else if (!claim) issues.push(`${beat.id}: claim ${beat.claim} is not in research.json.`);
      else if (claim.status === 'removed')
        issues.push(`${beat.id}: claim ${beat.claim} was removed.`);
    }
  }
  for (const paragraph of plan.paragraphs) {
    const list = paragraphBeats.get(paragraph.id) || [];
    if (!list.length) issues.push(`${paragraph.id}: has no beats.`);
    if (list.length && list[0].atWord !== 0)
      issues.push(`${paragraph.id}: the first beat must have atWord 0.`);
    for (let i = 1; i < list.length; i += 1) {
      if (!(list[i].atWord > list[i - 1].atWord)) {
        issues.push(`${list[i].id}: atWord must increase within a paragraph.`);
      }
    }
  }
  return issues;
}

module.exports = { compilePlan, planIssues, FPS, LEAD, FORMATS, styleFor };
