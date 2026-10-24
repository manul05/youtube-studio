'use strict';

/**
 * The fixed production sequence. Steps produce files and are stamped; gates are owner reviews
 * whose approvals cover a set of files. Paths are relative to the project folder; a trailing
 * "/*" means the files directly in that folder, "/**" means all files below it, and "*" inside
 * the last segment is a wildcard.
 */

const step = (id, command, playbook, inputs, outputs) => ({
  id,
  kind: 'step',
  command,
  playbook: `docs/steps/${playbook}.md`,
  inputs: () => inputs,
  outputs: () => outputs,
});

const gate = (id, playbook, covers) => ({
  id,
  kind: 'gate',
  command: 'review',
  playbook: `docs/steps/${playbook}.md`,
  covers: () => covers,
});

const STEPS = [
  step('idea', 'brief:check', '01-idea', [], ['brief.json']),
  gate('gate:idea', '01-idea', ['brief.json']),
  step('research', 'research:check', '02-research', ['brief.json'], ['research.json']),
  step('outline', 'outline:check', '03-outline', ['brief.json', 'research.json'], ['outline.json']),
  step(
    'script',
    'script:check',
    '04-script',
    ['outline.json', 'research.json'],
    ['script.json', 'pronunciations.json', 'shorts.json'],
  ),
  gate('gate:script', '04-script', ['outline.json', 'script.json', 'research.json']),
  step(
    'voice-sample',
    'voice:sample',
    '05-voice-sample',
    ['script.json', 'pronunciations.json', 'shorts.json', 'brief.json'],
    ['work/voice/sample/*'],
  ),
  gate('gate:voice', '05-voice-sample', [
    'pronunciations.json',
    'work/voice/sample/*',
    'brief.json',
  ]),
  step(
    'voice',
    'voice',
    '06-voice',
    ['script.json', 'pronunciations.json', 'brief.json'],
    ['work/voice/chapters/*'],
  ),
  step(
    'align',
    'align',
    '07-align',
    ['work/voice/chapters/*'],
    ['work/voice/paragraphs/*', 'work/align/*'],
  ),
  step('plan', 'plan', '08-plan', ['script.json', 'brief.json', 'work/align/*'], ['beats.json']),
  step(
    'assets',
    'images:check',
    '09-assets',
    ['beats.json'],
    ['assets/ledger.json', 'assets/images/*'],
  ),
  step(
    'storyboard',
    'preview',
    '10-storyboard',
    ['beats.json', 'assets/ledger.json', 'assets/images/*'],
    ['outputs/storyboard/*'],
  ),
  gate('gate:storyboard', '10-storyboard', [
    'beats.json',
    'assets/ledger.json',
    'outputs/storyboard/*',
    'outputs/package/thumb_draft_*',
  ]),
  step(
    'render',
    'render',
    '11-render',
    [
      'beats.json',
      'assets/ledger.json',
      'assets/images/*',
      'assets/stock/*',
      'work/voice/paragraphs/*',
    ],
    ['outputs/master.mp4'],
  ),
  step(
    'shorts',
    'shorts',
    '12-shorts',
    ['shorts.json', 'outputs/master.mp4'],
    ['outputs/shorts/*'],
  ),
  step(
    'package',
    'package',
    '13-package',
    ['outputs/master.mp4', 'research.json', 'brief.json'],
    ['outputs/package/*'],
  ),
  step(
    'qc',
    'qc',
    '14-release',
    ['outputs/master.mp4', 'outputs/shorts/*', 'outputs/package/*'],
    ['outputs/qc/qc.json'],
  ),
  step('ai-review', 'review:ai', '14-release', ['outputs/qc/qc.json'], ['outputs/score/ai.json']),
  gate('gate:final', '14-release', [
    'outputs/master.mp4',
    'outputs/shorts/*',
    'outputs/package/*',
    'outputs/score/owner.json',
  ]),
  step('release', 'release', '14-release', ['outputs/score/score.json'], ['outputs/release/**']),
];

function findStep(id) {
  const entry = STEPS.find((s) => s.id === id);
  if (!entry) throw new Error(`Unknown step "${id}".`);
  return entry;
}

module.exports = { STEPS, findStep };
