#!/usr/bin/env node
'use strict';

/**
 * Studio command line. Usage: node tools/studio.cjs <command> [project] [--flag=value]
 * Each later task registers its commands in COMMANDS below.
 */

const COMMANDS = {
  help: {
    summary: 'List every studio command.',
    run: () => printHelp(),
  },
  doctor: {
    summary: 'Check tools, fonts, Python packages and API keys.',
    run: async () => {
      const { doctor } = require('../engine/doctor.cjs');
      const report = await doctor();
      for (const c of report.checks)
        console.log(`${c.ok ? 'OK  ' : 'FAIL'} ${c.name}: ${c.detail}`);
      console.log(report.ok ? '\nAll checks passed.' : '\nSome checks failed (see above).');
      return report.ok ? 0 : 1;
    },
  },
};

function printHelp() {
  console.log('Studio commands (run with: npm run <command> -- [project] [--flags])\n');
  for (const [name, command] of Object.entries(COMMANDS)) {
    console.log(`  ${name.padEnd(18)} ${command.summary}`);
  }
}

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (const arg of argv) {
    if (arg.startsWith('--')) {
      const [key, ...rest] = arg.slice(2).split('=');
      flags[key] = rest.length ? rest.join('=') : true;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

async function main(argv) {
  const [name, ...rest] = argv;
  const command = COMMANDS[name];
  if (!command) {
    if (name) console.error(`Unknown command: ${name}\n`);
    printHelp();
    return name ? 1 : 0;
  }
  const code = await command.run(parseArgs(rest));
  return typeof code === 'number' ? code : 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err) => {
      console.error(err.message);
      process.exit(1);
    },
  );
}

module.exports = { COMMANDS, parseArgs, main };
