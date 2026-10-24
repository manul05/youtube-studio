'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { styleCheck } = require('./check.cjs');
const { stylePreview } = require('./preview.cjs');
const { buildGallery } = require('./gallery.cjs');
const { listPacks, suggestStyles } = require('./suggest.cjs');
const { openProject } = require('../project.cjs');

const COMMANDS = {
  'style:check': {
    summary: 'Check a style pack draws every beat type cleanly: npm run style:check -- <pack>',
    run: ({ positional }) => {
      if (!positional[0]) throw new Error('Name the pack, e.g. npm run style:check -- editorial');
      const result = styleCheck(positional[0]);
      for (const issue of result.issues) console.log(`  - ${issue}`);
      console.log(
        `${positional[0]}: ${result.passed ? 'PASSED' : 'FAILED'} (contact sheet: ${result.sheet})`,
      );
      return result.passed ? 0 : 1;
    },
  },
  'style:preview': {
    summary: 'Render a 20 s preview clip and card for a style pack.',
    run: async ({ positional }) => {
      if (!positional[0]) throw new Error('Name the pack, e.g. npm run style:preview -- editorial');
      const out = await stylePreview(positional[0]);
      console.log(`Preview: ${out.preview}`);
      return 0;
    },
  },
  styles: {
    summary: 'Build the style gallery (renders missing previews) and print where to open it.',
    run: async () => {
      for (const pack of listPacks()) {
        if (pack.id !== 'base' && !fs.existsSync(path.join(pack.dir, 'preview.mp4'))) {
          console.log(`Rendering preview for ${pack.id}…`);
          await stylePreview(pack.id);
        }
      }
      console.log(`Open the style gallery: ${buildGallery()}`);
      return 0;
    },
  },
  'style:suggest': {
    summary: 'Suggest three main styles for a project brief.',
    run: ({ positional }) => {
      if (!positional[0]) throw new Error('Name the project.');
      for (const s of suggestStyles(openProject(positional[0]).brief)) {
        console.log(`${s.id.padEnd(14)} ${s.name} — ${s.reason}`);
      }
      return 0;
    },
  },
};

module.exports = { COMMANDS };
