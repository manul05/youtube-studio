'use strict';

const { openProject } = require('../project.cjs');
const { writeStamp } = require('../next.cjs');
const { runQc } = require('./run.cjs');

const COMMANDS = {
  qc: {
    summary: 'Measure the finished video, Shorts and package; write outputs/qc/qc.json.',
    run: async ({ positional }) => {
      if (!positional[0]) throw new Error('Name the project, e.g. npm run qc -- 2026-10-25-cjp');
      const project = openProject(positional[0]);
      const report = await runQc(project);
      for (const f of report.hardFails) console.log(`  HARD FAIL [${f.category}] ${f.message}`);
      for (const f of report.issues) console.log(`  issue [${f.category}] ${f.message}`);
      for (const [id, s] of Object.entries(report.shorts)) {
        for (const f of [...s.hardFails, ...s.issues])
          console.log(`  ${id} [${f.category}] ${f.message}`);
      }
      writeStamp(project, 'qc');
      console.log(
        `qc: ${report.hardFails.length} hard failure(s), ${report.issues.length} issue(s). ` +
          (report.hardFails.length
            ? 'Fix the hard failures before review; the score is capped at 59 until then.'
            : `Next: npm run next -- ${project.name}`),
      );
      return 0;
    },
  },
};

module.exports = { COMMANDS };
