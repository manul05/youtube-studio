'use strict';

const { readJson, writeJson } = require('../util/files.cjs');
const { openProject } = require('../project.cjs');
const { writeStamp } = require('../next.cjs');
const { compilePlan, planIssues } = require('./compile.cjs');
const { BEAT_TYPES } = require('./beat-types.cjs');

const COMMANDS = {
  plan: {
    summary: 'Compile the beat intents in script.json into frame-exact beats.json.',
    run: ({ positional }) => {
      if (!positional[0]) throw new Error('Name the project, e.g. npm run plan -- 2026-10-25-cjp');
      const project = openProject(positional[0]);
      const plan = compilePlan(project);
      const issues = planIssues(plan, readJson(project.path('research.json')));
      if (issues.length) {
        console.log(`plan: ${issues.length} issue(s) to fix in script.json beats:`);
        for (const issue of issues) console.log(`  - ${issue}`);
        return 1;
      }
      writeJson(project.path('beats.json'), plan);
      writeStamp(project, 'plan');
      const minutes = (plan.frames / plan.fps / 60).toFixed(1);
      console.log(
        `plan: ${plan.beats.length} beats, ${minutes} min. Next: npm run next -- ${project.name}`,
      );
      return 0;
    },
  },
  beats: {
    summary: 'List the beat types a plan may use, with their fields and limits.',
    run: () => {
      for (const [type, spec] of Object.entries(BEAT_TYPES)) {
        if (spec.auto) continue;
        const fields = Object.entries(spec.fields)
          .map(([name, need]) => (need === 'required' ? name : `${name}?`))
          .join(', ');
        const facts = spec.factual ? ' · needs claim' : '';
        console.log(`${type.padEnd(10)} ${spec.minSec}–${spec.maxSec} s${facts}
  fields: ${fields}
  ${spec.use}`);
      }
      return 0;
    },
  },
};

module.exports = { COMMANDS };
