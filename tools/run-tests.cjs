#!/usr/bin/env node
'use strict';

/**
 * Run `node --test` with every temporary file the tests (and the studio code they call) create
 * kept inside one fresh folder, and delete that folder when the run ends — passed or failed.
 * Without this, each run leaves rendered test videos in the system Temp folder; hundreds of runs
 * filled a 230 GB drive. Usage: node tools/run-tests.cjs [node --test options] <files…>
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-run-'));
// os.tmpdir() reads TEMP/TMP on Windows and TMPDIR elsewhere; child processes inherit them.
const env = { ...process.env, TEMP: root, TMP: root, TMPDIR: root };
// Set when this runs inside another test run; a nested `node --test` that sees it runs nothing.
delete env.NODE_TEST_CONTEXT;
let status = 1;
try {
  const result = spawnSync(process.execPath, ['--test', ...process.argv.slice(2)], {
    env,
    stdio: 'inherit',
    windowsHide: true,
  });
  status = result.status === null ? 1 : result.status;
} finally {
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
process.exit(status);
