'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readJson, ensureDir } = require('../util/files.cjs');
const { phrases } = require('../captions/phrases.cjs');
const { exportCaptions } = require('../captions/export.cjs');

/**
 * Long-form captions from the aligned words: phrase cues per paragraph, placed at the
 * paragraph's position on the timeline, written to outputs/package/captions.srt and .vtt.
 */
function writeCaptions(project) {
  const plan = readJson(project.path('beats.json'));
  const script = project.brief.captionScript;
  const paragraphs = plan.paragraphs.map((p) => {
    const align = readJson(project.path('work', 'align', `${p.id}.json`));
    return {
      id: p.id,
      start: p.startFrame / plan.fps + (p.lead || 0),
      cues: phrases(align.words, { script }),
    };
  });
  const out = exportCaptions(paragraphs);
  const dir = project.path('outputs', 'package');
  ensureDir(dir);
  fs.writeFileSync(path.join(dir, 'captions.srt'), out.srt);
  fs.writeFileSync(path.join(dir, 'captions.vtt'), out.vtt);
  return paragraphs;
}

module.exports = { writeCaptions };
