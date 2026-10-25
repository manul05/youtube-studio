'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readJson, writeJson, ensureDir, sha256File } = require('./util/files.cjs');
const { channel } = require('./config.cjs');
const { evaluate, writeStamp } = require('./next.cjs');
const { deriveKey } = require('./review/pin.cjs');
const { verifyApprovals, ownerRatingsIssue } = require('./review/approvals.cjs');
const { aggregateScores } = require('./score/aggregate.cjs');
const { usedSources } = require('./package/description.cjs');
const { rootPath } = require('./util/files.cjs');

const CHECKLIST = `# Upload checklist

1. YouTube Studio → Create → Upload video → choose master.mp4.
2. Title: the first line of titles.txt (the one you picked). Keep the others for later A/B tests.
3. Description: paste description.txt. The chapter list in it creates YouTube chapters.
4. Thumbnail: thumbnail_A.png (your pick). After publishing, use "Test & Compare" with thumbnail_A, B and C.
5. Subtitles: Subtitles → Add language → Upload file → captions.srt (with timing).
6. Tags: paste tags.txt.
7. Altered or synthetic content: follow disclosure.txt.
8. End screen: add two videos in the two boxes and the subscribe element in the circle (the video leaves those areas plain).
9. After publishing, post pinned_comment.txt as a comment and pin it.
10. Shorts: upload each short_*.mp4 as a Short with its own title; link the main video as the related video.
`;

const usesMap = (plan) => plan.beats.some((b) => b.type === 'map');

function mapIssues(plan, mapsConfirmed) {
  if (!usesMap(plan)) return [];
  const issues = [];
  const file = rootPath('library', 'maps', 'SOURCES.md');
  if (!fs.existsSync(file)) {
    issues.push('The video uses a map but library/maps/SOURCES.md is missing.');
  } else if (/Owner confirmation:s*NOT YET CONFIRMED/i.test(fs.readFileSync(file, 'utf8'))) {
    issues.push(
      'The video uses a map of India: check it against the official Survey of India map and record your confirmation in library/maps/SOURCES.md.',
    );
  }
  // SOURCES.md is a plain file an agent could edit, so the owner also confirms at the prompt.
  if (!mapsConfirmed) {
    issues.push(
      'This video shows a map: confirm the map when the release command asks (it must match the official Survey of India map).',
    );
  }
  return issues;
}

/**
 * Release the project after the owner types the PIN. Refuses (listing every reason) unless
 * every step and review stop is complete, every approval carries the owner's signature over the
 * current files, the score recomputed from the current files is releasable, the channel is real
 * and any map has the owner's source confirmation. Then writes outputs/release/<date>_<slug>/.
 */
async function release(project, pin, { pinFile, mapsConfirmed = false } = {}) {
  const key = deriveKey(pin, { pinFile });
  const problems = [];
  for (const r of evaluate(project, { useCache: false })) {
    if (r.id === 'release') break;
    if (r.state !== 'done') problems.push(`${r.id} is ${r.state}. ${r.reasons.join(' ')}`.trim());
  }
  problems.push(...verifyApprovals(project, key, { pinFile }));

  const read = (...p) => (fs.existsSync(project.path(...p)) ? readJson(project.path(...p)) : null);
  const owner = read('outputs', 'score', 'owner.json');
  const ownerIssue = ownerRatingsIssue(owner, key, { pinFile });
  if (ownerIssue) problems.push(ownerIssue);
  const qcReport = read('outputs', 'qc', 'qc.json') || {
    hardFails: [{ category: 'J', hard: true, message: 'QC has not run.' }],
    issues: [],
    shorts: {},
  };
  const score = aggregateScores({
    ai: read('outputs', 'score', 'ai.json'),
    owner: ownerIssue ? null : owner,
    qcReport,
  });
  const approved = read('outputs', 'score', 'score.json');
  if (approved) delete approved.scoredAt;
  if (JSON.stringify(approved) !== JSON.stringify(JSON.parse(JSON.stringify(score)))) {
    problems.push(
      `The score now (${score.total}) differs from the score you approved at stop 5 (${approved ? approved.total : 'none'}). Run npm run score and review stop 5 again.`,
    );
  }
  if (!score.releasable) {
    problems.push(
      `The score is ${score.total}; release needs 95 or more with every category at least 80% and no hard failures. ${score.explanation.join(' ')}`.trim(),
    );
  }
  const brief = project.brief;
  if (channel(brief.channel).placeholder) {
    problems.push(
      `The channel "${brief.channel}" is a placeholder: add your real channel in library/channels/ and set it in brief.json.`,
    );
  }
  const plan = readJson(project.path('beats.json'));
  problems.push(...mapIssues(plan, mapsConfirmed));
  if (problems.length) throw new Error(`Release refused:\n  - ${problems.join('\n  - ')}`);

  const date = project.name.slice(0, 10);
  const slug = project.name.slice(11);
  const dir = project.path('outputs', 'release', `${date}_${slug}`);
  fs.rmSync(dir, { recursive: true, force: true });
  ensureDir(dir);
  const copy = (rel, name) => fs.copyFileSync(project.path(rel), path.join(dir, name));

  copy('outputs/master.mp4', 'master.mp4');
  const dropped = new Set(score.droppedShorts.map((d) => d.id));
  const shortsDir = project.path('outputs', 'shorts');
  if (fs.existsSync(shortsDir)) {
    for (const f of fs.readdirSync(shortsDir).filter((x) => x.endsWith('.mp4'))) {
      if (!dropped.has(f.replace(/\.mp4$/, ''))) copy(`outputs/shorts/${f}`, `short_${f}`);
    }
  }
  const chosen = (owner && owner.pick) || { thumbnail: 1, title: 1 };
  const order = [chosen.thumbnail, ...[1, 2, 3].filter((n) => n !== chosen.thumbnail)];
  order.forEach((n, i) => copy(`outputs/package/thumb_${n}.png`, `thumbnail_${'ABC'[i]}.png`));
  for (const f of [
    'captions.srt',
    'captions.vtt',
    'description.txt',
    'tags.txt',
    'pinned_comment.txt',
    'disclosure.txt',
  ]) {
    copy(`outputs/package/${f}`, f);
  }
  const titles = brief.titles;
  const titleOrder = [titles[chosen.title - 1], ...titles.filter((_, i) => i !== chosen.title - 1)];
  fs.writeFileSync(path.join(dir, 'titles.txt'), `${titleOrder.join('\n')}\n`);
  fs.writeFileSync(
    path.join(dir, 'sources.md'),
    `# Sources\n\n${usedSources(project)
      .map((s) => `- ${s.publisher}, ${s.published}: ${s.url}`)
      .join('\n')}\n`,
  );
  copy('assets/ledger.json', 'asset_ledger.json');
  writeJson(path.join(dir, 'score.json'), score);
  fs.writeFileSync(path.join(dir, 'UPLOAD_CHECKLIST.md'), CHECKLIST);
  const files = {};
  for (const f of fs.readdirSync(dir).sort()) files[f] = sha256File(path.join(dir, f));
  writeJson(path.join(dir, 'release.json'), {
    project: project.name,
    releasedAt: new Date().toISOString(),
    score: score.total,
    files,
  });
  writeStamp(project, 'release');
  return { dir, score };
}

module.exports = { release, usesMap };
