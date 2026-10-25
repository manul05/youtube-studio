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
  next: {
    summary: 'Show the single next step for a project, with its command and playbook.',
    run: ({ positional }) => {
      const project = requireProject(positional);
      const { nextAction } = require('../engine/next.cjs');
      const action = nextAction(project);
      if (!action.stepId) {
        console.log(`${project.name}: everything is done.`);
        return 0;
      }
      console.log(`Project: ${project.name}`);
      console.log(`Next:    ${action.stepId}`);
      console.log(`Run:     npm run ${action.command} -- ${project.name}`);
      console.log(`Guide:   ${action.playbook}`);
      for (const reason of action.reasons) console.log(`Why:     ${reason}`);
      return 0;
    },
  },
  'pin:set': {
    summary: 'Owner only: choose the review PIN (--reset replaces it and voids approvals).',
    run: async ({ flags }) => {
      requireOwnerTerminal('pin:set');
      const { setPin } = require('../engine/review/pin.cjs');
      const pin = await askHidden('Choose a PIN (at least 6 digits): ');
      const again = await askHidden('Type it again: ');
      if (pin !== again) throw new Error('The two PINs did not match. Nothing was saved.');
      setPin(pin, { reset: Boolean(flags.reset) });
      console.log('PIN saved. Agents cannot approve review stops without it.');
      return 0;
    },
  },
  review: {
    summary: 'Open the local review pages for a project (stops 1–5).',
    run: async ({ positional, flags }) => {
      const project = requireProject(positional);
      require('../engine/review/register-pages.cjs');
      const { startServer } = require('../engine/review/server.cjs');
      const server = await startServer(project, { port: Number(flags.port) || 8770 });
      console.log(`Review pages for ${project.name}: ${server.url}`);
      console.log('Leave this running while you review. Press Ctrl+C to stop.');
      await new Promise(() => {});
    },
  },
};

/** Ask a question in the terminal without echoing the answer (for the PIN). */
function askHidden(question) {
  const readline = require('node:readline');
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    rl._writeToOutput = (text) => {
      if (text.includes(question)) process.stdout.write(question);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

function requireOwnerTerminal(command) {
  if (!process.stdin.isTTY) {
    throw new Error(`${command} must be typed by the owner in an interactive terminal.`);
  }
}

function requireProject(positional) {
  const { openProject } = require('../engine/project.cjs');
  if (!positional[0]) throw new Error('Name the project, e.g. npm run next -- 2026-10-25-cjp');
  return openProject(positional[0]);
}

Object.assign(COMMANDS, require('../engine/words/commands.cjs').COMMANDS);
Object.assign(COMMANDS, require('../engine/voice/commands.cjs').COMMANDS);
Object.assign(COMMANDS, require('../engine/align/commands.cjs').COMMANDS);
Object.assign(COMMANDS, require('../engine/plan/commands.cjs').COMMANDS);
Object.assign(COMMANDS, require('../engine/styles/commands.cjs').COMMANDS);
Object.assign(COMMANDS, require('../engine/assets/commands.cjs').COMMANDS);
Object.assign(COMMANDS, require('../engine/render/commands.cjs').COMMANDS);
Object.assign(COMMANDS, require('../engine/shorts/commands.cjs').COMMANDS);
Object.assign(COMMANDS, require('../engine/package/commands.cjs').COMMANDS);

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
