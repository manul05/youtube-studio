'use strict';

const { openProject } = require('../project.cjs');
const { writeStamp } = require('../next.cjs');
const { alignProject } = require('./split.cjs');
const { voiceIssues } = require('./voice-check.cjs');

function projectFrom(positional) {
  if (!positional[0]) throw new Error('Name the project, e.g. npm run align -- 2026-10-25-cjp');
  return openProject(positional[0]);
}

function printIssues(title, issues) {
  console.log(`${title}: ${issues.length} issue(s):`);
  for (const issue of issues) console.log(`  - ${issue}`);
}

const COMMANDS = {
  align: {
    summary: 'Time every word of the narration and cut it into paragraphs; then check the voice.',
    run: async ({ positional }) => {
      const project = projectFrom(positional);
      console.log('Aligning narration (the first run downloads the speech model once)…');
      const aligned = await alignProject(project);
      const voice = voiceIssues(project);
      const issues = [...aligned.issues, ...voice.issues];
      if (issues.length) {
        printIssues('align', issues);
        return 1;
      }
      writeStamp(project, 'align');
      console.log(
        `Aligned. Narration pace ${voice.wpm} wpm. Next: npm run next -- ${project.name}`,
      );
      return 0;
    },
  },
  'voice:check': {
    summary: 'Report clipping, long pauses and speaking pace from the aligned narration.',
    run: ({ positional }) => {
      const project = projectFrom(positional);
      const voice = voiceIssues(project);
      if (voice.issues.length) {
        printIssues('voice:check', voice.issues);
        return 1;
      }
      console.log(`Voice OK. Pace ${voice.wpm} wpm.`);
      return 0;
    },
  },
};

module.exports = { COMMANDS };
