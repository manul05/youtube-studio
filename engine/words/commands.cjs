'use strict';

const { readJson } = require('../util/files.cjs');
const { channel } = require('../config.cjs');
const { createProject, openProject } = require('../project.cjs');
const { writeStamp } = require('../next.cjs');
const { briefIssues } = require('./brief.cjs');
const { ledgerIssues, researchIssues } = require('./research.cjs');
const { outlineIssues } = require('./outline.cjs');
const { scriptIssues } = require('./script.cjs');

function projectFrom(positional) {
  if (!positional[0])
    throw new Error('Name the project, e.g. npm run script:check -- 2026-10-25-cjp');
  return openProject(positional[0]);
}

/** Print issues; stamp the step when there are none. Returns the exit code. */
function report(project, stepId, issues) {
  if (issues.length) {
    console.log(`${stepId}: ${issues.length} issue(s) to fix in ${project.name}:`);
    for (const issue of issues) console.log(`  - ${issue}`);
    return 1;
  }
  writeStamp(project, stepId);
  console.log(
    `${stepId}: all checks passed for ${project.name}. Next: npm run next -- ${project.name}`,
  );
  return 0;
}

const read = (project, file) => readJson(project.path(file));

const COMMANDS = {
  new: {
    summary: 'Create a project folder: npm run new -- <slug> --channel=<channel-id>',
    run: ({ positional, flags }) => {
      if (!positional[0] || !flags.channel) {
        throw new Error('Usage: npm run new -- <slug> --channel=<channel-id>');
      }
      const dir = createProject(positional[0], { channel: flags.channel, date: flags.date });
      console.log(`Created ${dir}\nNext: npm run next -- ${require('node:path').basename(dir)}`);
      return 0;
    },
  },
  'brief:check': {
    summary: 'Check brief.json (idea step).',
    run: ({ positional }) => {
      const project = projectFrom(positional);
      return report(project, 'idea', briefIssues(project.brief));
    },
  },
  'research:check': {
    summary: 'Check research.json sources and claims (research step).',
    run: ({ positional }) => {
      const project = projectFrom(positional);
      return report(project, 'research', ledgerIssues(read(project, 'research.json')));
    },
  },
  'outline:check': {
    summary: 'Check outline.json structure, length and re-hooks (outline step).',
    run: ({ positional }) => {
      const project = projectFrom(positional);
      return report(
        project,
        'outline',
        outlineIssues(read(project, 'outline.json'), project.brief),
      );
    },
  },
  'script:check': {
    summary: 'Check script.json tags, claims, length and shorts.json (script step).',
    run: ({ positional }) => {
      const project = projectFrom(positional);
      const script = read(project, 'script.json');
      const brief = project.brief;
      const issues = [
        ...researchIssues(script, read(project, 'research.json')),
        ...scriptIssues(script, brief, channel(brief.channel), read(project, 'shorts.json')),
      ];
      return report(project, 'script', issues);
    },
  },
};

module.exports = { COMMANDS };
