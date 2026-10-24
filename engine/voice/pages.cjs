'use strict';

const fs = require('node:fs');
const { readJson } = require('../util/files.cjs');
const { registerGatePage } = require('../review/pages.cjs');

registerGatePage('gate:voice', (project) => {
  const dir = project.path('work', 'voice', 'sample');
  const manifestFile = `${dir}/manifest.json`;
  if (!fs.existsSync(manifestFile)) {
    return {
      title: 'Stop 3 — The voice',
      sections: [{ kind: 'text', text: 'No sample yet. Run: npm run voice:sample' }],
    };
  }
  const manifest = readJson(manifestFile);
  const alignmentFile = `${dir}/alignment.json`;
  const alignment = fs.existsSync(alignmentFile)
    ? readJson(alignmentFile)
    : { names: [], hooks: [] };
  const rel = (file) => `work/voice/sample/${file}`;
  const sections = [
    {
      heading: 'Voice settings',
      kind: 'list',
      items: [
        `Voice: ${manifest.voice.voice} · Model: ${manifest.voice.model} · Language: ${manifest.voice.language}`,
        `Style: ${manifest.voice.style}`,
      ],
    },
    {
      heading: 'The opening (about 45 seconds)',
      kind: 'audio',
      items: [{ path: rel('intro.wav'), label: 'Listen for pace, warmth and clarity.' }],
    },
  ];
  const names = manifest.items.find((i) => i.kind === 'names');
  if (names) {
    const spans = new Map(alignment.names.map((n) => [n.name, n]));
    sections.push({
      heading: 'Names — is each one pronounced correctly?',
      kind: 'audio',
      items: names.names.map((n) => ({
        path: rel('names.wav'),
        label: `${n.name} (spoken as "${n.spoken}")`,
        ...(spans.has(n.name)
          ? { start: spans.get(n.name).start, end: spans.get(n.name).end }
          : {}),
      })),
    });
  }
  const hooks = manifest.items.find((i) => i.kind === 'hooks');
  if (hooks) {
    const spans = new Map(alignment.hooks.map((h) => [h.id, h]));
    sections.push({
      heading: 'Shorts hook lines',
      kind: 'audio',
      items: hooks.hooks.map((h) => ({
        path: rel('hooks.wav'),
        label: `${h.id}: ${h.text}`,
        ...(spans.has(h.id) ? { start: spans.get(h.id).start, end: spans.get(h.id).end } : {}),
      })),
    });
  }
  sections.push({
    kind: 'text',
    text:
      'To fix a name, ask the agent to change its spelling in pronunciations.json. To change the ' +
      'delivery, ask for a different voice style or voice. Then request changes here.',
  });
  return {
    title: 'Stop 3 — The voice',
    intro: 'Listen before the full narration is recorded.',
    sections,
  };
});
