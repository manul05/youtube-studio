'use strict';

const { openProject } = require('../project.cjs');
const { writeStamp } = require('../next.cjs');
const { writeImagePrompts } = require('./prompts.cjs');
const { checkImages } = require('./images-check.cjs');
const { recordImages, ledgerIssues } = require('./ledger.cjs');
const { searchStock, pickStock } = require('./stock.cjs');
const { searchPhotos, pickPhoto } = require('./photos.cjs');

function projectFrom(positional) {
  if (!positional[0])
    throw new Error('Name the project, e.g. npm run images:check -- 2026-10-25-cjp');
  return openProject(positional[0]);
}

const COMMANDS = {
  'images:prompts': {
    summary:
      'Write the image prompt list (assets/IMAGE_PROMPTS.md) for every art beat and thumbnail.',
    run: ({ positional }) => {
      const project = projectFrom(positional);
      const prompts = writeImagePrompts(project);
      console.log(`${prompts.length} prompts written to assets/IMAGE_PROMPTS.md`);
      return 0;
    },
  },
  'images:record': {
    summary:
      'Record where new images came from: --origin=agent-generated:<agent>|owner-supplied|legacy-antigravity',
    run: ({ positional, flags }) => {
      const project = projectFrom(positional);
      const added = recordImages(project, { origin: flags.origin });
      console.log(`Recorded ${added} image(s) in assets/ledger.json.`);
      return 0;
    },
  },
  'images:check': {
    summary: 'Check images and the asset ledger; completes the assets step when everything passes.',
    run: async ({ positional }) => {
      const project = projectFrom(positional);
      const problems = (await checkImages(project)).map((p) => `${p.file}: ${p.problem}`);
      const issues = [...problems, ...ledgerIssues(project)];
      if (issues.length) {
        console.log(`assets: ${issues.length} issue(s):`);
        for (const issue of issues) console.log(`  - ${issue}`);
        return 1;
      }
      writeStamp(project, 'assets');
      console.log(
        `assets: all images and clips are present and recorded. Next: npm run next -- ${project.name}`,
      );
      return 0;
    },
  },
  'stock:search': {
    summary: 'Download up to 4 stock candidates per stock beat (Pexels, Pixabay) to choose from.',
    run: async ({ positional }) => {
      const project = projectFrom(positional);
      for (const r of await searchStock(project)) {
        console.log(
          `${r.beat} ("${r.query}"): ${r.candidates} candidate(s) — view assets/stock/_incoming/${r.beat}/candidates.jpg`,
        );
      }
      return 0;
    },
  },
  'photos:search': {
    summary:
      'Download up to 6 freely licensed photos per photo beat (Wikimedia Commons, Pixabay) to choose from.',
    run: async ({ positional }) => {
      const project = projectFrom(positional);
      for (const r of await searchPhotos(project)) {
        console.log(
          `${r.beat} ("${r.query}"): ${r.candidates} candidate(s) — view assets/photos/_incoming/${r.beat}/candidates.jpg`,
        );
      }
      return 0;
    },
  },
  'photos:pick': {
    summary: 'Keep a photo candidate: npm run photos:pick -- <project> <beat-id> <1-6>',
    run: async ({ positional }) => {
      const project = projectFrom(positional);
      const photo = await pickPhoto(project, positional[1], positional[2]);
      console.log(`Picked ${photo.file}: ${photo.credit}.`);
      return 0;
    },
  },
  'stock:pick': {
    summary: 'Keep a stock candidate: npm run stock:pick -- <project> <beat-id> <1-4>',
    run: ({ positional }) => {
      const project = projectFrom(positional);
      const clip = pickStock(project, positional[1], positional[2]);
      console.log(`Picked ${clip.file} (${clip.licence}, ${clip.durationSec.toFixed(1)} s).`);
      return 0;
    },
  },
};

module.exports = { COMMANDS };
