'use strict';

const fs = require('node:fs');
const { readJson } = require('../util/files.cjs');
const { registerGatePage } = require('../review/pages.cjs');
const { sentences } = require('./text.cjs');

const readIf = (project, file, fallback) =>
  fs.existsSync(project.path(file)) ? readJson(project.path(file)) : fallback;

registerGatePage('gate:idea', (project) => {
  const brief = project.brief;
  const accents = Object.entries(brief.style.accents || {}).map(
    ([beat, pack]) => `${beat}: ${pack}`,
  );
  return {
    title: 'Stop 1 — The idea',
    intro: 'Check the angle, the opening hook and the style before any research or writing.',
    sections: [
      {
        heading: 'Topic and angle',
        kind: 'list',
        items: [
          `Topic: ${brief.topic}`,
          `Angle: ${brief.angle}`,
          `Audience: ${brief.audience}`,
          `Promise: ${brief.promise}`,
          `Language: ${brief.language} (captions: ${brief.captionScript}) · Channel: ${brief.channel}`,
          `Length: ${brief.lengthTargetMin} min · Formats: ${(brief.formats || []).join(', ')}`,
        ],
      },
      { heading: 'Opening hook (first 30 seconds)', kind: 'text', text: brief.hook },
      { heading: 'Title options', kind: 'list', items: brief.titles },
      { heading: 'Thumbnail text options', kind: 'list', items: brief.thumbTexts },
      {
        heading: 'Style',
        kind: 'list',
        items: [`Main style: ${brief.style.main}`, ...(accents.length ? accents : ['No accents'])],
      },
    ],
  };
});

registerGatePage('gate:script', (project) => {
  const script = readIf(project, 'script.json', { chapters: [] });
  const research = readIf(project, 'research.json', { sources: [], claims: [] });
  const outline = readIf(project, 'outline.json', { chapters: [], rehooks: [] });
  const claims = new Map(research.claims.map((c) => [c.id, c]));
  const sources = new Map(research.sources.map((s) => [s.id, s]));

  const describe = (s) => {
    if (s.tags.includes('analysis')) return { text: s.spoken, note: 'narrator analysis' };
    if (!s.tags.length) return { text: s.spoken, flag: true, note: 'NO TAG' };
    const notes = [];
    let flag = false;
    for (const id of s.tags) {
      const c = claims.get(id);
      if (!c) {
        notes.push(`${id}: unknown claim`);
        flag = true;
        continue;
      }
      const cited = (c.sources || []).map((sid) => {
        const src = sources.get(sid);
        return src ? `${src.publisher} ${src.published}` : sid;
      });
      if (c.status === 'disputed' || c.status === 'unverified' || cited.length < 2) flag = true;
      notes.push(`${id} · ${c.status} · ${cited.join('; ') || 'no source'}`);
    }
    return { text: s.spoken, flag, note: notes.join(' | ') };
  };

  const sections = [
    {
      heading: 'Structure',
      kind: 'list',
      items: [
        ...outline.chapters.map((c) => `${c.id}. ${c.title} — ${c.purpose} (${c.targetSeconds} s)`),
        ...outline.rehooks.map((r) => `Re-hook at ${r.atSeconds} s: ${r.line}`),
        `Payoff: ${outline.payoff || '—'}`,
      ],
    },
    {
      heading: 'How to read this',
      kind: 'text',
      text:
        'Red sentences rest on a disputed, unverified or single-source claim — check the ' +
        'wording attributes it fairly. Grey notes mark the narrator’s own analysis.',
    },
  ];
  for (const chapter of script.chapters) {
    sections.push({
      heading: `Chapter ${chapter.id}: ${chapter.title}`,
      kind: 'list',
      items: chapter.paragraphs.flatMap((p) => sentences(p.text, p.id).map(describe)),
    });
  }
  sections.push({
    heading: 'Sources',
    kind: 'table',
    columns: ['Id', 'Publisher', 'Published', 'URL'],
    rows: research.sources.map((s) => [s.id, s.publisher, s.published, s.url]),
  });
  return {
    title: 'Stop 2 — The script',
    intro: 'Read the whole script. Approve only if every fact is fairly worded and sourced.',
    sections,
  };
});
