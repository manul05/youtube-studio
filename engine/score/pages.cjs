'use strict';

const fs = require('node:fs');
const { readJson } = require('../util/files.cjs');
const { registerGatePage } = require('../review/pages.cjs');
const { namesFor } = require('./rubric.cjs');
const { presenterMode } = require('../steps.cjs');

const QUESTIONS = [
  { id: 'A', label: 'Does the opening grab me?' },
  { id: 'BG', label: 'Did it stay interesting the whole way?' },
  { id: 'D', label: 'Does the voice sound right, with names correct?' },
  { id: 'F', label: 'Do the visuals look good and fit the style?' },
  { id: 'I', label: 'Would I click this thumbnail?' },
];
const SOURCE_LABELS = { measured: 'measured', ai: 'AI-judged', owner: 'your rating' };
const DELIVERY = { id: 'D', label: 'Is your delivery clear, natural and confident?' };

/** The owner's questions; with their own voice, D asks about their delivery. */
function questionsFor(project) {
  return presenterMode(project) === 'ai'
    ? QUESTIONS
    : QUESTIONS.map((q) => (q.id === 'D' ? DELIVERY : q));
}

registerGatePage('gate:final', (project) => {
  const read = (...p) => (fs.existsSync(project.path(...p)) ? readJson(project.path(...p)) : null);
  const brief = project.brief;
  const names = namesFor(presenterMode(project));
  const shortsDir = project.path('outputs', 'shorts');
  const shorts = fs.existsSync(shortsDir)
    ? fs
        .readdirSync(shortsDir)
        .filter((f) => f.endsWith('.mp4'))
        .map((f) => f.replace(/\.mp4$/, ''))
    : [];
  const qcReport = read('outputs', 'qc', 'qc.json');
  const ai = read('outputs', 'score', 'ai.json');
  const score = read('outputs', 'score', 'score.json');
  const sections = [
    {
      heading: 'Watch the whole video',
      kind: 'video',
      items: [{ path: 'outputs/master.mp4', label: 'Final master' }],
    },
    { kind: 'drags' },
    {
      heading: 'Your ratings (long video)',
      kind: 'form',
      target: 'long',
      questions: questionsFor(project),
    },
    ...shorts.flatMap((id) => [
      {
        heading: `Short ${id}`,
        kind: 'video',
        items: [{ path: `outputs/shorts/${id}.mp4`, label: id }],
      },
      { kind: 'form', target: id, questions: questionsFor(project).filter((q) => q.id !== 'I') },
    ]),
    {
      heading: 'Pick the thumbnail',
      kind: 'pick',
      what: 'thumbnail',
      items: [1, 2, 3].map((n) => ({
        path: `outputs/package/thumb_${n}.png`,
        text: brief.thumbTexts[n - 1],
      })),
    },
    {
      heading: 'Pick the title',
      kind: 'pick',
      what: 'title',
      items: brief.titles.map((t) => ({ text: t })),
    },
    { kind: 'save' },
  ];
  if (qcReport) {
    sections.push({
      heading: 'Automated checks',
      kind: 'list',
      items: [
        ...qcReport.hardFails.map((f) => ({
          text: `[${f.category}] ${f.message}`,
          flag: true,
          note: 'hard failure',
        })),
        ...qcReport.issues.map((f) => ({ text: `[${f.category}] ${f.message}`, flag: true })),
        ...(qcReport.hardFails.length + qcReport.issues.length
          ? []
          : ['No problems found by the automated checks.']),
      ],
    });
  }
  if (ai) {
    sections.push({
      heading: 'Independent AI review',
      kind: 'table',
      columns: ['Category', 'Score', 'Reasons'],
      rows: Object.entries(ai.categories).map(([c, v]) => [
        `${c} ${names[c]}`,
        String(v.score),
        v.reasons
          .map((r) => (r.t !== undefined ? `${r.t.toFixed(0)} s: ${r.note}` : r.note))
          .join(' · '),
      ]),
    });
  }
  if (score) {
    sections.push({
      heading: `Current score: ${score.total} — ${score.releasable ? 'ready to release' : 'not releasable yet'}`,
      kind: 'table',
      columns: ['Category', 'Points', 'Sources'],
      rows: Object.entries(score.categories).map(([c, v]) => [
        `${c} ${names[c]}`,
        `${v.points} / ${v.weight}`,
        Object.entries(v.sources)
          .map(([k, x]) => `${SOURCE_LABELS[k]} ${Math.round(x * 100)}%`)
          .join(', '),
      ]),
    });
  }
  return {
    title: 'Stop 5 — Final watch',
    intro:
      'Watch at normal speed. Mark moments that drag, rate, pick, save — then approve or request changes.',
    sections,
  };
});
