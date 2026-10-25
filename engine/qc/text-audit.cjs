'use strict';

const fs = require('node:fs');
const path = require('node:path');

// Strings that must never appear on screen: internal counters, layout ids, broken values.
const DEBUG_PATTERNS = [
  /\bframe\s*\d/i,
  /layout[_:]/i,
  /\bshot\s*\d+\s*\//i,
  /\bdebug\b/i,
  /\bundefined\b/i,
  /\bNaN\b/,
  /\[object/i,
];

/** Every drawn string a render logged (work/render/<label>/textlog_*.jsonl). */
function readTextLogs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /^textlog_\d+\.jsonl$/.test(f))
    .flatMap((f) =>
      fs
        .readFileSync(path.join(dir, f), 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line)),
    );
}

function debugTextIssues(entries) {
  return entries
    .filter((e) => DEBUG_PATTERNS.some((re) => re.test(e.text)))
    .map((e) => ({
      category: 'J',
      hard: true,
      beat: e.beat,
      message: `Debug text on screen in ${e.beat}: "${e.text}"`,
    }));
}

module.exports = { readTextLogs, debugTextIssues, DEBUG_PATTERNS };
