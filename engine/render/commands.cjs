'use strict';

const { openProject } = require('../project.cjs');
const { writeStamp } = require('../next.cjs');
const { storyboard } = require('./storyboard.cjs');

function projectFrom(positional) {
  if (!positional[0]) throw new Error('Name the project, e.g. npm run preview -- 2026-10-25-cjp');
  return openProject(positional[0]);
}

const COMMANDS = {
  preview: {
    summary: 'Render the storyboard: stills of every beat and contact sheets for stop 4.',
    run: async ({ positional }) => {
      const project = projectFrom(positional);
      const out = await storyboard(project);
      writeStamp(project, 'storyboard');
      console.log(
        `Storyboard ready: ${out.sheets.length} contact sheet(s). Review at stop 4: npm run review -- ${project.name}`,
      );
      return 0;
    },
  },
};

module.exports = { COMMANDS };
