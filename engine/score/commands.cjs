'use strict';

const { openProject } = require('../project.cjs');
const { writeStamp } = require('../next.cjs');
const { RateLimited } = require('../voice/gemini.cjs');
const { aiReview } = require('./ai-review.cjs');
const { aggregate } = require('./aggregate.cjs');

const RESUME_LATER = 75;

function projectFrom(positional) {
  if (!positional[0]) throw new Error('Name the project, e.g. npm run review:ai -- 2026-10-25-cjp');
  return openProject(positional[0]);
}

const COMMANDS = {
  'review:ai': {
    summary:
      'Independent AI review of the finished video, Shorts and thumbnails (fresh Gemini call).',
    run: async ({ positional }) => {
      const project = projectFrom(positional);
      try {
        const out = await aiReview(project);
        for (const [c, v] of Object.entries(out.categories)) console.log(`  ${c}: ${v.score}`);
      } catch (err) {
        if (err instanceof RateLimited) {
          console.log(
            `Gemini free-tier limit reached. Run npm run review:ai -- ${project.name} again later.`,
          );
          return RESUME_LATER;
        }
        throw err;
      }
      aggregate(project);
      writeStamp(project, 'ai-review');
      console.log(`AI review saved. Final review (stop 5): npm run review -- ${project.name}`);
      return 0;
    },
  },
  score: {
    summary: 'Show the current score from QC, the AI review and the owner ratings.',
    run: ({ positional }) => {
      const project = projectFrom(positional);
      const s = aggregate(project);
      for (const [c, v] of Object.entries(s.categories))
        console.log(`  ${c}: ${v.points}/${v.weight}`);
      for (const line of s.explanation) console.log(`  - ${line}`);
      console.log(`Total ${s.total} — ${s.releasable ? 'releasable' : 'not releasable'}`);
      for (const d of s.droppedShorts)
        console.log(`  Short ${d.id} will be left out (${d.total}).`);
      return 0;
    },
  },
};

module.exports = { COMMANDS };
