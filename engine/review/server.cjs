'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { STEPS, findStep } = require('../steps.cjs');
const { evaluate, nextAction } = require('../next.cjs');
const { deriveKey } = require('./pin.cjs');
const { writeApproval, signOwnerRatings, ownerRatingsIssue } = require('./approvals.cjs');
const { pageData } = require('./pages.cjs');
const { readJson, writeJson } = require('../util/files.cjs');
const { aggregate } = require('../score/aggregate.cjs');
const { teleprompterData } = require('../presenter/teleprompter.cjs');

const PAGES_DIR = path.join(__dirname, 'pages');
const MAX_BODY = 1024 * 1024;
// Types for the server's own pages only (never for project files).
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function sendJson(res, status, value) {
  send(res, status, JSON.stringify(value), TYPES['.json']);
}

/** JSON safe to embed inside a <script> element. */
function embed(value) {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new Error('Request body too large.'));
        req.destroy();
      } else {
        chunks.push(chunk);
      }
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// Project files are agent-written, so only passive media and plain text are ever served.
const MEDIA_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.srt': 'text/plain; charset=utf-8',
  '.vtt': 'text/vtt; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};
const FILE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy': "sandbox; default-src 'none'",
  'Cache-Control': 'no-store',
};

/** Resolve a project-relative path, following symlinks, and refuse anything outside it. */
function containedPath(project, rel) {
  if (!rel) return null;
  const abs = path.resolve(project.dir, rel);
  if (!fs.existsSync(abs)) return null;
  const real = fs.realpathSync(abs);
  const inside = path.relative(fs.realpathSync(project.dir), real);
  if (inside.startsWith('..') || path.isAbsolute(inside)) return null;
  return fs.statSync(real).isFile() ? real : null;
}

/** Serve one media file from the project; supports byte ranges for video seeking. */
function serveProjectFile(project, rel, req, res) {
  const abs = containedPath(project, rel);
  const type = abs && MEDIA_TYPES[path.extname(abs).toLowerCase()];
  if (!type) return send(res, 404, 'Not found');
  const size = fs.statSync(abs).size;
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start > end || start >= size) {
      res.writeHead(416, { ...FILE_HEADERS, 'Content-Range': `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, {
      ...FILE_HEADERS,
      'Content-Type': type,
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
    });
    return fs.createReadStream(abs, { start, end }).pipe(res);
  }
  res.writeHead(200, {
    ...FILE_HEADERS,
    'Content-Type': type,
    'Content-Length': size,
    'Accept-Ranges': 'bytes',
  });
  return fs.createReadStream(abs).pipe(res);
}

function indexPage(project) {
  const rows = evaluate(project)
    .filter((r) => findStep(r.id).kind === 'gate')
    .map((r) => `<li><a href="/gate/${encodeURIComponent(r.id)}">${r.id}</a> — ${r.state}</li>`)
    .join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Review — ${project.name}</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="font-family:system-ui;max-width:760px;margin:40px auto;padding:0 16px">
<h1>Review stops for ${project.name}</h1><ul>${rows}</ul>
<p><a href="/teleprompter">Teleprompter</a> — read the script aloud when you record your own voice.</p>
</body></html>`;
}

/** The owner's teleprompter for recording the narration (presenter modes "voice" and "face"). */
function teleprompterPage(project) {
  const html = fs.readFileSync(path.join(PAGES_DIR, 'teleprompter.html'), 'utf8');
  return html.replace(/\/\*TELEPROMPTER_DATA\*\/\s*null/, () => embed(teleprompterData(project)));
}

function gatePage(project, gateId) {
  const layout = fs.readFileSync(path.join(PAGES_DIR, 'layout.html'), 'utf8');
  const data = { gate: gateId, project: project.name, ...pageData(project, gateId) };
  // A function replacement so "$" sequences in the data are never treated as patterns.
  return layout.replace(/\/\*GATE_DATA\*\/\s*null/, () => embed(data));
}

async function handleApproval(project, gateId, req, res, pinFile) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (err) {
    return sendJson(res, 400, { error: `Bad request: ${err.message}` });
  }
  let key;
  try {
    key = deriveKey(body.pin, { pinFile });
  } catch (err) {
    return sendJson(res, 401, { error: err.message });
  }
  const current = nextAction(project).stepId;
  if (current !== gateId) {
    return sendJson(res, 409, {
      error: `This stop is not ready. The next step is "${current}".`,
    });
  }
  if (gateId === 'gate:final' && body.decision === 'approve') {
    const file = project.path('outputs', 'score', 'owner.json');
    const issue = ownerRatingsIssue(fs.existsSync(file) ? readJson(file) : null, key, { pinFile });
    if (issue) return sendJson(res, 409, { error: issue });
  }
  const approval = writeApproval(project, gateId, key, {
    decision: body.decision,
    notes: String(body.notes || ''),
    extra: body.extra && typeof body.extra === 'object' ? body.extra : {},
    pinFile,
  });
  return sendJson(res, 200, { ok: true, decision: approval.decision, at: approval.at });
}

const LEVEL_NAMES = ['Excellent', 'Good', 'OK', 'Weak', 'Bad'];
const SAFE_ID = /^[A-Za-z0-9_-]+$/;

/** Owner ratings for stop 5, validated; the only writer of outputs/score/owner.json. */
async function handleRatings(project, req, res, pinFile) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch (err) {
    return sendJson(res, 400, { error: `Bad request: ${err.message}` });
  }
  let key;
  try {
    key = deriveKey(body.pin, { pinFile });
  } catch (err) {
    return sendJson(res, 401, { error: err.message });
  }
  const pickLevels = (r, questions) => {
    const out = {};
    for (const q of questions) {
      if (!LEVEL_NAMES.includes(r && r[q]))
        throw new Error(`Rate "${q}" as one of ${LEVEL_NAMES.join(', ')}.`);
      out[q] = r[q];
    }
    return out;
  };
  let owner;
  try {
    owner = {
      ...pickLevels(body.ratings, ['A', 'BG', 'D', 'F', 'I']),
      drags: (Array.isArray(body.drags) ? body.drags : []).filter(
        (t) => Number.isFinite(t) && t >= 0,
      ),
      pick: {
        thumbnail: [1, 2, 3].includes(body.pick && body.pick.thumbnail) ? body.pick.thumbnail : 1,
        title: [1, 2, 3].includes(body.pick && body.pick.title) ? body.pick.title : 1,
      },
      shorts: {},
      at: new Date().toISOString(),
    };
    for (const [id, r] of Object.entries(body.shorts || {})) {
      if (SAFE_ID.test(id)) owner.shorts[id] = pickLevels(r, ['A', 'BG', 'D', 'F']);
    }
  } catch (err) {
    return sendJson(res, 400, { error: err.message });
  }
  writeJson(
    project.path('outputs', 'score', 'owner.json'),
    signOwnerRatings(owner, key, { pinFile }),
  );
  const score = aggregate(project);
  return sendJson(res, 200, {
    ok: true,
    total: score.total,
    releasable: score.releasable,
    explanation: score.explanation,
    droppedShorts: score.droppedShorts,
  });
}

/** Start the loopback-only review server. Resolves to { url, port, close() }. */
function startServer(project, { port = 8770, pinFile } = {}) {
  let allowedHosts = [];
  const server = http.createServer(async (req, res) => {
    try {
      if (!allowedHosts.includes(req.headers.host)) return send(res, 403, 'Forbidden host');
      if (req.headers.origin && !allowedHosts.some((h) => req.headers.origin === `http://${h}`)) {
        return send(res, 403, 'Forbidden origin');
      }
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (req.method === 'GET' && url.pathname === '/') {
        return send(res, 200, indexPage(project), TYPES['.html']);
      }
      if (req.method === 'GET' && url.pathname === '/teleprompter') {
        return send(res, 200, teleprompterPage(project), TYPES['.html']);
      }
      if (req.method === 'GET' && url.pathname === '/gate.js') {
        return send(res, 200, fs.readFileSync(path.join(PAGES_DIR, 'gate.js')), TYPES['.js']);
      }
      if (req.method === 'GET' && url.pathname === '/file') {
        return serveProjectFile(project, url.searchParams.get('path'), req, res);
      }
      if (
        req.method === 'POST' &&
        decodeURIComponent(url.pathname) === '/gate/gate:final/ratings'
      ) {
        return handleRatings(project, req, res, pinFile);
      }
      const match = /^\/gate\/([^/]+)$/.exec(url.pathname);
      if (match) {
        const gateId = decodeURIComponent(match[1]);
        const entry = STEPS.find((s) => s.id === gateId && s.kind === 'gate');
        if (!entry) return send(res, 404, 'Unknown review stop');
        if (req.method === 'GET') return send(res, 200, gatePage(project, gateId), TYPES['.html']);
        if (req.method === 'POST') return handleApproval(project, gateId, req, res, pinFile);
      }
      return send(res, 404, 'Not found');
    } catch (err) {
      return send(res, 500, `Server error: ${err.message}`);
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const actual = server.address().port;
      allowedHosts = [`127.0.0.1:${actual}`, `localhost:${actual}`];
      resolve({
        url: `http://127.0.0.1:${actual}`,
        port: actual,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

module.exports = { startServer };
