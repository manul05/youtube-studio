'use strict';

const fs = require('node:fs');
const { readJson } = require('../util/files.cjs');
const { openProject } = require('../project.cjs');
const { writeStamp } = require('../next.cjs');
const { shortsMeasuredIssues } = require('./spans.cjs');
const { buildShort } = require('./build.cjs');

const COMMANDS = {
  shorts: {
    summary: 'Build the three Shorts from shorts.json into outputs/shorts/.',
    run: async ({ positional }) => {
      if (!positional[0])
        throw new Error('Name the project, e.g. npm run shorts -- 2026-10-25-cjp');
      const project = openProject(positional[0]);
      const shorts = readJson(project.path('shorts.json'));
      const issues = shortsMeasuredIssues(shorts, project);
      if (issues.length) {
        console.log('shorts: fix these in shorts.json first:');
        for (const issue of issues) console.log(`  - ${issue}`);
        return 1;
      }
      fs.rmSync(project.path('outputs', 'shorts'), { recursive: true, force: true });
      for (const short of shorts) {
        const out = await buildShort(project, short);
        console.log(`${short.id}: ${out.file} (${out.final.lufs} LUFS)`);
      }
      writeStamp(project, 'shorts');
      return 0;
    },
  },
};

module.exports = { COMMANDS };
