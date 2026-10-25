'use strict';

const { openProject } = require('../project.cjs');
const { writeStamp } = require('../next.cjs');
const { composeThumbnails } = require('./thumbnails.cjs');
const { thumbIssues, titleIssues } = require('./thumbs-check.cjs');
const { writeDescription } = require('./description.cjs');

function projectFrom(positional) {
  if (!positional[0]) throw new Error('Name the project, e.g. npm run package -- 2026-10-25-cjp');
  return openProject(positional[0]);
}

async function checkThumbs(project, thumbs) {
  const issues = [];
  for (const t of thumbs) issues.push(...(await thumbIssues(t, project.brief.titles[0])));
  return issues;
}

const COMMANDS = {
  package: {
    summary:
      'Compose thumbnails and write description, titles, tags, pinned comment and disclosure.',
    run: async ({ positional }) => {
      const project = projectFrom(positional);
      const thumbs = await composeThumbnails(project);
      const described = writeDescription(project);
      const issues = [
        ...(await checkThumbs(project, thumbs)),
        ...titleIssues(project.brief.titles),
        ...described.issues,
      ];
      if (issues.length) {
        console.log('package: fix these (usually in brief.json thumbTexts/titles):');
        for (const issue of issues) console.log(`  - ${issue}`);
        return 1;
      }
      writeStamp(project, 'package');
      console.log(`Package ready in outputs/package/. Next: npm run next -- ${project.name}`);
      return 0;
    },
  },
  'thumbs:check': {
    summary: 'Compose thumbnail drafts and report phone-size readability problems.',
    run: async ({ positional }) => {
      const project = projectFrom(positional);
      const issues = await checkThumbs(project, await composeThumbnails(project, { draft: true }));
      for (const issue of issues) console.log(`  - ${issue}`);
      console.log(issues.length ? 'Thumbnail drafts need changes.' : 'Thumbnail drafts pass.');
      return issues.length ? 1 : 0;
    },
  },
};

module.exports = { COMMANDS };
