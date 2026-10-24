'use strict';

const fs = require('node:fs');
const { readJson, writeJson } = require('./util/files.cjs');
const { STEPS, findStep } = require('./steps.cjs');
const { expand, hasher, hashPatterns, digest, stampFile, approvalFile } = require('./stamps.cjs');

/** The fingerprint a downstream entry records for the entry just before it. */
function upstreamFingerprint(project, index, h) {
  if (index === 0) return 'start';
  const prev = STEPS[index - 1];
  if (prev.kind === 'gate') {
    const file = approvalFile(project, prev.id);
    if (!fs.existsSync(file)) return 'none';
    const a = readJson(file);
    return `${a.decision}:${a.contentHash}`;
  }
  const file = stampFile(project, prev.id);
  if (!fs.existsSync(file)) return 'none';
  return digest(readJson(file).outputs);
}

function gateContentHash(project, gateId, h = hasher(project)) {
  return digest(hashPatterns(project, findStep(gateId).covers(project), h));
}

/** Record that a step finished: hashes of its inputs and outputs plus its upstream link. */
function writeStamp(project, stepId) {
  const index = STEPS.findIndex((s) => s.id === stepId);
  const entry = STEPS[index];
  if (!entry || entry.kind !== 'step') throw new Error(`"${stepId}" is not a stampable step.`);
  const h = hasher(project);
  for (const pattern of entry.outputs(project)) {
    if (!pattern.includes('*') && !fs.existsSync(project.path(pattern))) {
      throw new Error(`Cannot stamp ${stepId}: output ${pattern} does not exist.`);
    }
  }
  writeJson(stampFile(project, stepId), {
    step: stepId,
    inputs: hashPatterns(project, entry.inputs(project), h),
    outputs: hashPatterns(project, entry.outputs(project), h),
    upstream: upstreamFingerprint(project, index, h),
    at: new Date().toISOString(),
  });
  h.save();
}

function changedFiles(recorded, current) {
  const keys = new Set([...Object.keys(recorded), ...Object.keys(current)]);
  return [...keys].filter((k) => recorded[k] !== current[k]).sort();
}

/** Evaluate every entry in order; returns [{id, state, reasons}]. */
function evaluate(project) {
  const h = hasher(project);
  const results = [];
  let earlierIncomplete = false;
  STEPS.forEach((entry, index) => {
    const result = { id: entry.id, state: 'done', reasons: [] };
    if (entry.kind === 'gate') {
      const file = approvalFile(project, entry.id);
      if (!fs.existsSync(file)) {
        result.state = 'todo';
        result.reasons.push('Waiting for your review.');
      } else {
        const approval = readJson(file);
        const current = gateContentHash(project, entry.id, h);
        if (approval.decision !== 'approve' || !approval.sig) {
          result.state = 'todo';
          result.reasons.push(
            approval.decision === 'changes' ? 'Changes were requested.' : 'Approval is unsigned.',
          );
        } else if (approval.contentHash !== current) {
          result.state = 'todo';
          result.reasons.push('The reviewed files changed after approval.');
        } else if (earlierIncomplete) {
          result.state = 'stale';
          result.reasons.push('An earlier step must be redone first.');
        }
      }
    } else {
      const file = stampFile(project, entry.id);
      if (!fs.existsSync(file)) {
        result.state = 'todo';
      } else {
        const stamp = readJson(file);
        const inputs = hashPatterns(project, entry.inputs(project), h);
        const outputs = hashPatterns(project, entry.outputs(project), h);
        const changed = [
          ...changedFiles(stamp.inputs, inputs),
          ...changedFiles(stamp.outputs, outputs),
        ];
        if (changed.length) {
          result.state = 'stale';
          result.reasons.push(`Changed since this step ran: ${changed.join(', ')}`);
        } else if (stamp.upstream !== upstreamFingerprint(project, index, h)) {
          result.state = 'stale';
          result.reasons.push('The step before it was redone.');
        } else if (earlierIncomplete) {
          result.state = 'stale';
          result.reasons.push('An earlier step must be redone first.');
        }
      }
    }
    if (result.state !== 'done') earlierIncomplete = true;
    results.push(result);
  });
  h.save();
  return results;
}

function stepState(project, stepId) {
  findStep(stepId);
  return evaluate(project).find((r) => r.id === stepId).state;
}

/** The earliest entry that is not done, with the command and playbook to follow. */
function nextAction(project) {
  const pending = evaluate(project).find((r) => r.state !== 'done');
  if (!pending) {
    return { stepId: null, command: null, playbook: null, reasons: ['Everything is done.'] };
  }
  const entry = findStep(pending.id);
  return {
    stepId: entry.id,
    command: entry.command,
    playbook: entry.playbook,
    reasons: pending.reasons,
  };
}

module.exports = { writeStamp, stepState, nextAction, gateContentHash, evaluate, expand };
