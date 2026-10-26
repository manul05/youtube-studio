'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readJson, ensureDir } = require('../util/files.cjs');
const { sentences } = require('../words/text.cjs');
const { musicIndex } = require('../audio/library.cjs');

function timestamp(seconds) {
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${String(m).padStart(2, '0')}:${sec}`;
}

/** YouTube chapter lines from the plan ("00:00 Title"; the first must be 00:00). */
function chapterLines(plan) {
  return plan.chapters.map((c) => `${timestamp(c.startFrame / plan.fps)} ${c.title}`);
}

/** YouTube's chapter rules: first at 00:00, at least three, each at least 10 s long. */
function chapterIssues(plan) {
  const issues = [];
  if (plan.chapters.length < 3) issues.push('YouTube needs at least 3 chapters.');
  if (plan.chapters[0] && plan.chapters[0].startFrame !== 0)
    issues.push('The first chapter must start at 00:00.');
  for (const c of plan.chapters) {
    if (c.frames / plan.fps < 10) issues.push(`Chapter "${c.title}" is shorter than 10 s.`);
  }
  return issues;
}

/** Sources behind every claim the script actually uses (removed claims excluded). */
function usedSources(project) {
  const research = readJson(project.path('research.json'));
  const script = readJson(project.path('script.json'));
  const used = new Set();
  for (const p of script.chapters.flatMap((c) => c.paragraphs)) {
    for (const s of sentences(p.text, p.id)) for (const tag of s.tags) used.add(tag);
  }
  const ids = new Set();
  for (const claim of research.claims) {
    if (used.has(claim.id) && claim.status !== 'removed')
      for (const id of claim.sources) ids.add(id);
  }
  return research.sources.filter((s) => ids.has(s.id));
}

function disclosure(project) {
  const plan = readJson(project.path('beats.json'));
  const realistic = plan.beats.some((b) => b.illustration && /^art-/.test(b.type));
  return realistic
    ? 'Yes — in YouTube Studio select "Altered or synthetic content": the video shows AI-generated illustrations of real events.'
    : 'Not required — no realistic synthetic depictions of real events.';
}

function musicCredits(project) {
  const file = project.path('outputs', 'qc', 'audio.json');
  if (!fs.existsSync(file)) return [];
  const used = new Set(readJson(file).music.map((m) => m.file));
  return musicIndex()
    .filter((t) => used.has(t.file) && t.attributionRequired)
    .map((t) => t.attributionText || t.file);
}

/** Credit lines for stock photos the video shows whose licence asks for attribution. */
function photoCredits(project) {
  const plan = readJson(project.path('beats.json'));
  const ledgerFile = project.path('assets', 'ledger.json');
  const images = fs.existsSync(ledgerFile) ? readJson(ledgerFile).images || {} : {};
  const lines = plan.beats
    .filter((b) => b.fields && b.fields.photoQuery)
    .map((b) => images[`img_${b.id}.png`])
    .filter((e) => e && e.attributionRequired)
    .map((e) => `${e.credit}: ${e.url}`);
  return [...new Set(lines)];
}

/** Description, titles, tags, pinned comment and disclosure in outputs/package/. */
function writeDescription(project) {
  const brief = project.brief;
  const plan = readJson(project.path('beats.json'));
  const dir = project.path('outputs', 'package');
  ensureDir(dir);
  const credits = musicCredits(project);
  const photos = photoCredits(project);
  const usesPhotos = plan.beats.some((b) => b.fields && b.fields.photoQuery);
  const description = [
    brief.hook,
    '',
    brief.promise,
    '',
    'Chapters:',
    ...chapterLines(plan),
    '',
    'Sources:',
    ...usedSources(project).map((s) => `- ${s.publisher}, ${s.published}: ${s.url}`),
    ...(photos.length ? ['', 'Photos:', ...photos.map((c) => `- ${c}`)] : []),
    ...(credits.length ? ['', 'Music:', ...credits.map((c) => `- ${c}`)] : []),
    '',
    `${usesPhotos ? 'Illustrations are AI-generated and stock photos are credited where required' : 'Illustrations are AI-generated'}; narration uses a synthetic voice. Dates and claims are as reported by the sources above.`,
  ].join('\n');
  fs.writeFileSync(path.join(dir, 'description.txt'), `${description}\n`);
  fs.writeFileSync(path.join(dir, 'titles.txt'), `${brief.titles.join('\n')}\n`);
  const tags =
    brief.tags && brief.tags.length
      ? brief.tags
      : String(brief.topic)
          .toLowerCase()
          .split(/\s+/)
          .filter((w) => w.length > 3);
  fs.writeFileSync(path.join(dir, 'tags.txt'), `${tags.join(', ')}\n`);
  fs.writeFileSync(
    path.join(dir, 'pinned_comment.txt'),
    `${brief.promise} — what do you think? Tell us below.\n`,
  );
  fs.writeFileSync(path.join(dir, 'disclosure.txt'), `${disclosure(project)}\n`);
  return { issues: chapterIssues(plan) };
}

module.exports = {
  writeDescription,
  chapterLines,
  chapterIssues,
  disclosure,
  photoCredits,
  usedSources,
  timestamp,
};
