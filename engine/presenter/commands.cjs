'use strict';

const { openProject } = require('../project.cjs');
const { writeStamp } = require('../next.cjs');
const { checkRecording } = require('./recording-check.cjs');
const { importRecordings } = require('./import.cjs');

function projectFrom(positional, example) {
  if (!positional[0])
    throw new Error(`Name the project, e.g. npm run ${example} -- 2026-11-09-cjp`);
  return openProject(positional[0]);
}

const COMMANDS = {
  'recording:check': {
    summary: "Check the owner's test recording (recordings/sample.*) before recording the video.",
    run: ({ positional }) => {
      const project = projectFrom(positional, 'recording:check');
      const { issues, report } = checkRecording(project);
      if (report) {
        console.log(
          `Test recording: ${report.durationSec} s, ${report.lufs} LUFS, peak ${report.truePeak} dBTP, ` +
            `noise floor ${report.noiseFloorDb} dBFS, ${report.sampleRate} Hz` +
            (report.width ? `, ${report.width}×${report.height} at ${report.fps} fps` : ''),
        );
      }
      if (issues.length) {
        console.log(`recording: ${issues.length} issue(s):`);
        for (const issue of issues) console.log(`  - ${issue}`);
        return 1;
      }
      writeStamp(project, 'voice-sample');
      console.log(
        `Test recording OK. Stop 3 is ready: npm run review -- ${project.name}, then npm run next -- ${project.name}`,
      );
      return 0;
    },
  },
};

COMMANDS['recording:import'] = {
  summary: "Import and clean the owner's chapter recordings (recordings/c01.*, c02.*, …).",
  run: ({ positional }) => {
    const project = projectFrom(positional, 'recording:import');
    const { imported, skipped, issues } = importRecordings(project);
    if (imported.length) console.log(`Imported: ${imported.join(', ')}`);
    if (skipped.length) console.log(`Unchanged: ${skipped.join(', ')}`);
    if (issues.length) {
      console.log(`recordings: ${issues.length} issue(s):`);
      for (const issue of issues) console.log(`  - ${issue}`);
      return 1;
    }
    writeStamp(project, 'voice');
    console.log(`All chapters imported. Next: npm run next -- ${project.name}`);
    return 0;
  },
};

module.exports = { COMMANDS };
