'use strict';

const fs = require('node:fs');
const { readJson } = require('../util/files.cjs');
const { stamp } = require('../util/timecode.cjs');
const { registerGatePage } = require('../review/pages.cjs');
const { readAdlibs } = require('../presenter/takes.cjs');

registerGatePage('gate:storyboard', (project) => {
  const dir = project.path('outputs', 'storyboard');
  const sheets = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => /^contact_\d+\.jpg$/.test(f))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    : [];
  const sections = [
    {
      heading: 'Every shot, in order',
      kind: 'images',
      items: sheets.map((f, i) => ({ path: `outputs/storyboard/${f}`, caption: `Sheet ${i + 1}` })),
    },
  ];
  const plan = fs.existsSync(project.path('beats.json'))
    ? readJson(project.path('beats.json'))
    : null;
  if (plan) {
    sections.push({
      heading: 'Shot list',
      kind: 'table',
      columns: ['Time', 'Shot', 'Type', 'Style'],
      rows: plan.beats.map((b) => [
        stamp(b.startFrame / plan.fps).slice(3, 8),
        b.id,
        b.type,
        b.style,
      ]),
    });
  }
  const pkg = project.path('outputs', 'package');
  const drafts = fs.existsSync(pkg)
    ? fs.readdirSync(pkg).filter((f) => /^thumb_draft_\d\.png$/.test(f))
    : [];
  if (drafts.length) {
    sections.push({
      heading: 'Thumbnail drafts',
      kind: 'images',
      items: drafts.map((f) => ({ path: `outputs/package/${f}`, caption: f })),
    });
  }
  sections.push({
    kind: 'text',
    text: 'Request changes with the shot ids (for example c03p02b1) and what to change.',
  });
  const adlibs = readAdlibs(project);
  if (adlibs.length) {
    sections.push({
      heading: 'Unscripted passages in your recording (cut from the video)',
      kind: 'audio',
      items: adlibs.map((a) => ({
        path: `work/voice/chapters/${a.chapter}.wav`,
        label: `${a.chapter} at ${stamp(a.start).slice(3, 8)}: "${a.text}" — cut`,
        start: a.start,
        end: a.end,
      })),
    });
    sections.push({
      kind: 'text',
      text:
        'To keep a passage, request changes and say which one: the agent adds it to the script ' +
        '(with a source if it states a fact), you approve the script again, and it is aligned in.',
    });
  }
  return {
    title: 'Stop 4 — Storyboard',
    intro: 'One still per shot. Check pictures, text and variety before the full render.',
    sections,
  };
});
