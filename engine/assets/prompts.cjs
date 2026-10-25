'use strict';

const fs = require('node:fs');
const { readJson, writeJson, ensureDir } = require('../util/files.cjs');
const { loadStyle } = require('../styles/loader.cjs');

const SAFETY_RULE =
  'No real, identifiable people; no photorealistic faces of public figures; no legible text unless specified.';
const THUMB_BASES = 3;

/**
 * Write assets/image_prompts.json and a copy-ready assets/IMAGE_PROMPTS.md: one prompt per
 * art beat (img_<beatId>.png) plus three thumbnail base images. Each prompt carries the beat's
 * own description, the style pack's image suffix and the safety rule.
 */
function writeImagePrompts(project) {
  const plan = readJson(project.path('beats.json'));
  const aspect = plan.format === 'short' ? '9:16' : '16:9';
  const brief = project.brief;
  const prompts = [];
  for (const beat of plan.beats) {
    if (!beat.fields || !beat.fields.imagePrompt) continue;
    const suffix = loadStyle(beat.style).meta.imagePromptSuffix;
    prompts.push({
      file: `img_${beat.id}.png`,
      prompt: `${beat.fields.imagePrompt}. Style: ${suffix}. ${SAFETY_RULE}`,
      aspect,
      beatIds: [beat.id],
    });
  }
  const mainSuffix = loadStyle(brief.style.main).meta.imagePromptSuffix;
  for (let i = 1; i <= THUMB_BASES; i += 1) {
    const idea = (brief.thumbTexts || [])[i - 1] || brief.topic;
    prompts.push({
      file: `thumb_base_${i}.png`,
      prompt:
        `YouTube thumbnail background about "${brief.topic}" (mood: "${idea}"): one bold, ` +
        `emotionally clear subject on the right two thirds, a large calm empty area on the left ` +
        `third for headline text, high contrast. Style: ${mainSuffix}. ${SAFETY_RULE}`,
      aspect: '16:9',
      beatIds: [],
    });
  }
  writeJson(project.path('assets', 'image_prompts.json'), prompts);
  ensureDir(project.path('assets', 'images'));
  const md = [
    `# Image prompts for ${project.name}`,
    '',
    `Generate each image at ${aspect} (thumbnails at 16:9), at least 1344 px on the long edge, ` +
      'and save it in assets/images/ with exactly the file name shown. Then run ' +
      `\`npm run images:record -- ${project.name} --origin=agent-generated:<your-agent>\` ` +
      `and \`npm run images:check -- ${project.name}\`.`,
    '',
    ...prompts.flatMap((p, i) => [`## ${i + 1}. ${p.file}`, '', p.prompt, '']),
  ].join('\n');
  fs.writeFileSync(project.path('assets', 'IMAGE_PROMPTS.md'), md);
  return prompts;
}

function readPrompts(project) {
  const file = project.path('assets', 'image_prompts.json');
  if (!fs.existsSync(file))
    throw new Error('No image prompts yet. Run npm run images:prompts first.');
  return readJson(file);
}

module.exports = { writeImagePrompts, readPrompts, SAFETY_RULE };
