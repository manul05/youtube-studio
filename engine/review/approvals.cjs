'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');
const { readJson, writeJson } = require('../util/files.cjs');
const { STEPS, findStep } = require('../steps.cjs');
const { gateContentHash } = require('../next.cjs');
const { approvalFile, hasher } = require('../stamps.cjs');
const { pinRecord, hmacHex } = require('./pin.cjs');

function signingText(a) {
  return `${a.gate}|${a.contentHash}|${a.at}|${a.decision}`;
}

/** Write a signed approval (or change request) for a gate. Only the review server calls this. */
function writeApproval(project, gateId, key, { decision, notes = '', extra = {}, pinFile } = {}) {
  if (findStep(gateId).kind !== 'gate') throw new Error(`${gateId} is not a review stop.`);
  if (!['approve', 'changes'].includes(decision)) throw new Error(`Unknown decision ${decision}`);
  const approval = {
    gate: gateId,
    decision,
    contentHash: gateContentHash(project, gateId, hasher(project, { useCache: false })),
    at: new Date().toISOString(),
    pinSetAt: pinRecord({ pinFile }).setAt,
    notes,
  };
  approval.sig = hmacHex(key, signingText(approval));
  const file = approvalFile(project, gateId);
  writeJson(file, approval);
  if (decision === 'changes') {
    writeJson(file.replace(/\.json$/, '.changes.json'), {
      gate: gateId,
      at: approval.at,
      notes,
      ...extra,
    });
  }
  return approval;
}

/** Check every existing approval: signature, current content and PIN generation. */
function verifyApprovals(project, key, { pinFile } = {}) {
  const issues = [];
  const record = pinRecord({ pinFile });
  const contentHasher = hasher(project, { useCache: false });
  for (const entry of STEPS.filter((s) => s.kind === 'gate')) {
    const file = approvalFile(project, entry.id);
    if (!fs.existsSync(file)) continue;
    const approval = readJson(file);
    if (approval.pinSetAt !== record.setAt) {
      issues.push(`${entry.id}: the PIN was reset after this approval; review it again.`);
      continue;
    }
    const expected = Buffer.from(hmacHex(key, signingText(approval)), 'hex');
    const actual = Buffer.from(String(approval.sig || ''), 'hex');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
      issues.push(`${entry.id}: signature does not match (not approved with your PIN).`);
      continue;
    }
    if (approval.contentHash !== gateContentHash(project, entry.id, contentHasher)) {
      issues.push(`${entry.id}: the reviewed files changed after approval.`);
    }
  }
  return issues;
}

module.exports = { writeApproval, verifyApprovals };
