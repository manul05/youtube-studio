'use strict';

const fs = require('node:fs');
const { readJson } = require('../util/files.cjs');
const { spokenText } = require('../words/text.cjs');
const { chapterId } = require('../voice/synthesize.cjs');

/**
 * What the owner reads aloud: every chapter of script.json in order, each paragraph in its real
 * spelling (claim tags removed; pronunciation hints are for the AI voice, not for people), with
 * the recording file name to save it as.
 */
function teleprompterData(project) {
  const file = project.path('script.json');
  if (!fs.existsSync(file)) throw new Error('No script yet: finish the script step first.');
  const brief = project.brief;
  return {
    project: project.name,
    script: brief.captionScript || 'latin',
    chapters: readJson(file).chapters.map((chapter) => ({
      title: chapter.title,
      file: `recordings/${chapterId(chapter)}.<ext>`,
      paragraphs: chapter.paragraphs.map((p) => spokenText(p).captions),
    })),
  };
}

module.exports = { teleprompterData };
