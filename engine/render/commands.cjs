'use strict';

const { openProject } = require('../project.cjs');
const { writeStamp } = require('../next.cjs');
const { storyboard } = require('./storyboard.cjs');
const { renderAll } = require('./render-all.cjs');
const { assembleMaster } = require('../assemble/master.cjs');

function projectFrom(positional) {
  if (!positional[0]) throw new Error('Name the project, e.g. npm run preview -- 2026-10-25-cjp');
  return openProject(positional[0]);
}

const COMMANDS = {
  render: {
    summary:
      'Render every chapter (cached when unchanged), mix the audio and assemble outputs/master.mp4.',
    run: async ({ positional, flags }) => {
      const project = projectFrom(positional);
      await renderAll(project, { format: 'long', force: Boolean(flags.force) });
      const out = await assembleMaster(project);
      writeStamp(project, 'render');
      console.log(
        `Master ready: ${out.file} (${out.final.lufs} LUFS, true peak ${out.final.truePeak} dBTP).`,
      );
      return 0;
    },
  },
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
