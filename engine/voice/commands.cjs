'use strict';

const { openProject } = require('../project.cjs');
const { writeStamp } = require('../next.cjs');
const {
  synthesizeChapters,
  synthesizeSample,
  retakeParagraph,
  assertParagraphId,
} = require('./synthesize.cjs');

const RESUME_LATER = 75; // agents must stop and tell the owner to resume later

function projectFrom(positional) {
  if (!positional[0]) throw new Error('Name the project, e.g. npm run voice -- 2026-10-25-cjp');
  return openProject(positional[0]);
}

function rateLimited(project, command, retryAfterSec) {
  const wait = retryAfterSec ? ` (Google suggests waiting ${retryAfterSec} s)` : '';
  console.log(
    `Gemini free-tier limit reached${wait}. Finished work is saved. ` +
      `Run npm run ${command} -- ${project.name} again later; it continues where it stopped.`,
  );
  return RESUME_LATER;
}

const COMMANDS = {
  'voice:sample': {
    summary: 'Record the stop-3 voice sample: opening, names and Shorts hooks.',
    run: async ({ positional }) => {
      const project = projectFrom(positional);
      const result = await synthesizeSample(project);
      if (result.rateLimited) return rateLimited(project, 'voice:sample', result.retryAfterSec);
      try {
        await require('../align/sample.cjs').alignSample(project);
      } catch (err) {
        console.log(`Note: could not time names/hooks for the review page (${err.message}).`);
      }
      writeStamp(project, 'voice-sample');
      console.log(`Voice sample ready. Review it at stop 3: npm run review -- ${project.name}`);
      return 0;
    },
  },
  voice: {
    summary: 'Record the full narration, one Gemini call per chapter (resumable).',
    run: async ({ positional }) => {
      const project = projectFrom(positional);
      const result = await synthesizeChapters(project);
      if (result.rateLimited) return rateLimited(project, 'voice', result.retryAfterSec);
      writeStamp(project, 'voice');
      console.log(
        `Narration recorded for ${result.done.length} chapters. Next: npm run align -- ${project.name}`,
      );
      return 0;
    },
  },
  'voice:retake': {
    summary: 'Re-record one paragraph: npm run voice:retake -- <project> <paragraph-id>',
    run: async ({ positional }) => {
      const project = projectFrom(positional);
      if (!positional[1]) throw new Error('Name the paragraph, e.g. c03p02');
      assertParagraphId(positional[1]);
      const result = await retakeParagraph(project, positional[1]);
      if (result.rateLimited) return rateLimited(project, 'voice:retake', result.retryAfterSec);
      console.log(`Retake saved for ${positional[1]}. Run npm run align -- ${project.name} next.`);
      return 0;
    },
  },
};

module.exports = { COMMANDS, RESUME_LATER };
