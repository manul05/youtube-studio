'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

const { createProject, openProject } = require('../engine/project.cjs');
const { writeStamp } = require('../engine/next.cjs');
const { setPin, deriveKey } = require('../engine/review/pin.cjs');
const { writeApproval, verifyApprovals } = require('../engine/review/approvals.cjs');
const { startServer } = require('../engine/review/server.cjs');

function tempPinFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'studio-pin-')), 'pin.json');
}

function tempProject() {
  const projectsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-projects-'));
  const dir = createProject('demo', { channel: 'en-placeholder', date: '2026-10-25', projectsDir });
  const project = openProject(dir);
  writeStamp(project, 'idea');
  return project;
}

function request(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

test('a PIN derives a key, and a wrong PIN is rejected', () => {
  const pinFile = tempPinFile();
  setPin('123456', { pinFile });
  assert.equal(deriveKey('123456', { pinFile }).length, 32);
  assert.throws(() => deriveKey('000000', { pinFile }), /Wrong PIN/);
});

test('setting a PIN twice without reset is refused, and short PINs are refused', () => {
  const pinFile = tempPinFile();
  assert.throws(() => setPin('12345', { pinFile }), /at least 6 digits/);
  setPin('123456', { pinFile });
  assert.throws(() => setPin('654321', { pinFile }), /already set/);
});

test('signed approvals verify; edited content and forged signatures are reported', () => {
  const pinFile = tempPinFile();
  setPin('123456', { pinFile });
  const key = deriveKey('123456', { pinFile });
  const project = tempProject();

  writeApproval(project, 'gate:idea', key, { decision: 'approve', pinFile });
  assert.deepEqual(verifyApprovals(project, key, { pinFile }), []);

  fs.appendFileSync(project.path('brief.json'), ' ');
  assert.ok(verifyApprovals(project, key, { pinFile }).some((i) => /changed/.test(i)));

  const file = project.path('approvals', 'gate_idea.json');
  const forged = { ...JSON.parse(fs.readFileSync(file, 'utf8')), sig: 'f'.repeat(64) };
  fs.writeFileSync(file, JSON.stringify(forged));
  assert.ok(verifyApprovals(project, key, { pinFile }).some((i) => /signature/.test(i)));
});

test('resetting the PIN invalidates earlier approvals', () => {
  const pinFile = tempPinFile();
  setPin('123456', { pinFile });
  const project = tempProject();
  writeApproval(project, 'gate:idea', deriveKey('123456', { pinFile }), {
    decision: 'approve',
    pinFile,
  });
  setPin('654321', { pinFile, reset: true });
  const issues = verifyApprovals(project, deriveKey('654321', { pinFile }), { pinFile });
  assert.ok(issues.some((i) => /PIN was reset/.test(i)));
});

test('the review server refuses requests whose Host is not loopback', async () => {
  const project = tempProject();
  const server = await startServer(project, { port: 0, pinFile: tempPinFile() });
  try {
    const res = await request(`${server.url}/`, { headers: { Host: 'evil.example' } });
    assert.equal(res.status, 403);
    const ok = await request(`${server.url}/`);
    assert.equal(ok.status, 200);
  } finally {
    await server.close();
  }
});

test('the review server approves the current gate with the right PIN only', async () => {
  const pinFile = tempPinFile();
  setPin('123456', { pinFile });
  const project = tempProject();
  const server = await startServer(project, { port: 0, pinFile });
  const post = (gate, pin) =>
    request(`${server.url}/gate/${encodeURIComponent(gate)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pin, decision: 'approve', notes: '' }),
    });
  try {
    assert.equal((await post('gate:idea', '000000')).status, 401);
    assert.equal((await post('gate:script', '123456')).status, 409);
    assert.equal((await post('gate:idea', '123456')).status, 200);
    assert.ok(fs.existsSync(project.path('approvals', 'gate_idea.json')));
  } finally {
    await server.close();
  }
});

test('pin:set refuses to run without an interactive terminal', async () => {
  const { main } = require('../tools/studio.cjs');
  await assert.rejects(() => main(['pin:set']), /interactive terminal/);
});

test('verification re-reads content even when the hash cache is forged', () => {
  const pinFile = tempPinFile();
  setPin('123456', { pinFile });
  const key = deriveKey('123456', { pinFile });
  const project = tempProject();
  writeApproval(project, 'gate:idea', key, { decision: 'approve', pinFile });
  const { evaluate } = require('../engine/next.cjs');
  evaluate(project); // writes the size+mtime hash cache

  const brief = project.path('brief.json');
  const cacheFile = project.path('work', 'stamps', '.hashcache.json');
  const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  const originalSha = cache['brief.json'].sha;
  fs.appendFileSync(brief, ' ');
  const stat = fs.statSync(brief);
  cache['brief.json'] = { key: `${stat.size}:${stat.mtimeMs}`, sha: originalSha };
  fs.writeFileSync(cacheFile, JSON.stringify(cache));

  assert.ok(verifyApprovals(project, key, { pinFile }).some((i) => /changed/.test(i)));
});

test('a review page embeds its data safely', async () => {
  const project = tempProject();
  const { registerGatePage } = require('../engine/review/pages.cjs');
  registerGatePage('gate:idea', () => ({
    title: 'Idea',
    sections: [{ kind: 'text', text: '</script><script>alert(1)</script>' }],
  }));
  const server = await startServer(project, { port: 0, pinFile: tempPinFile() });
  try {
    const res = await request(`${server.url}/gate/${encodeURIComponent('gate:idea')}`);
    assert.equal(res.status, 200);
    assert.match(res.body, /"gate":"gate:idea"/);
    assert.ok(!res.body.includes('</script><script>alert(1)'), 'script text is escaped');
  } finally {
    await server.close();
  }
});
