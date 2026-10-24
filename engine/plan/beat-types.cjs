'use strict';

/**
 * The visual vocabulary. A plan may use only these types; each style pack draws all of them.
 * internalReveals: the beat changes on screen at least every few seconds by design (crops,
 * staggered items, video motion), so it may run longer than the 6-second static limit.
 * factual: on-screen content states facts, so the beat must cite a live claim.
 */

const R = 'required';
const O = 'optional';

const BEAT_TYPES = Object.freeze({
  'art-focus': {
    fields: { imagePrompt: R, focus: R, reverse: O },
    minSec: 2,
    maxSec: 6,
    internalReveals: false,
    use: 'One AI image; the camera moves purposefully to a named region.',
  },
  'art-tour': {
    fields: { imagePrompt: R, crops: R },
    minSec: 4,
    maxSec: 14,
    internalReveals: true,
    use: 'One AI image explored through 2–4 detail crops (a new crop every 2–4 s).',
  },
  stock: {
    fields: { query: R, inSec: O, lowerThird: O },
    minSec: 2,
    maxSec: 8,
    internalReveals: true,
    use: 'Licensed stock video clip, graded to the style.',
  },
  kinetic: {
    fields: { text: R },
    minSec: 1.5,
    maxSec: 8,
    internalReveals: true,
    use: 'A key phrase as animated type, revealed on the spoken words.',
  },
  quote: {
    fields: { text: R, speaker: R, source: R, date: R },
    minSec: 3,
    maxSec: 10,
    internalReveals: true,
    factual: true,
    use: 'An attributed quotation with source and date, highlighted as it is read.',
  },
  stat: {
    fields: { value: R, unit: O, label: R, source: R },
    minSec: 2.5,
    maxSec: 6,
    internalReveals: false,
    factual: true,
    use: 'One number that counts up, with its context and source.',
  },
  compare: {
    fields: { left: R, right: R },
    minSec: 4,
    maxSec: 12,
    internalReveals: true,
    use: 'Two sides building point by point.',
  },
  timeline: {
    fields: { events: R },
    minSec: 4,
    maxSec: 15,
    internalReveals: true,
    factual: true,
    use: 'Dated events revealed along an axis (one every ≤ 3 s).',
  },
  map: {
    fields: { region: R, highlight: O, pins: O, route: O },
    minSec: 3,
    maxSec: 10,
    internalReveals: true,
    use: 'India or world map with highlights, pins or a route drawn in sequence.',
  },
  document: {
    fields: { title: R, lines: R, highlight: O },
    minSec: 3,
    maxSec: 10,
    internalReveals: true,
    factual: true,
    use: 'A recreated (never copied) document or headline card with highlight sweeps.',
  },
  list: {
    fields: { items: R },
    minSec: 3,
    maxSec: 12,
    internalReveals: true,
    use: '2–4 items revealed as they are spoken.',
  },
  chart: {
    fields: { kind: R, series: R, source: R },
    minSec: 3,
    maxSec: 10,
    internalReveals: true,
    factual: true,
    use: 'A bar or line chart that builds.',
  },
  chapter: {
    fields: { number: R, title: R },
    minSec: 2,
    maxSec: 3,
    internalReveals: false,
    auto: true,
    use: 'Chapter title card (added automatically from chapter 2 onwards).',
  },
  endcard: {
    fields: {},
    minSec: 20,
    maxSec: 20,
    internalReveals: true,
    auto: true,
    use: 'YouTube end screen (added automatically, 20 s).',
  },
});

module.exports = { BEAT_TYPES };
