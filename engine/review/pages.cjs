'use strict';

/**
 * Page data for each review stop. Later tasks register a builder per gate:
 *   registerGatePage('gate:script', (project) => ({ title, intro, sections }))
 * Section kinds rendered by pages/gate.js: text, list, table, images, audio, video.
 * Media items reference project files by relative path; the server serves them from /file.
 */

const { findStep } = require('../steps.cjs');

const builders = new Map();

function registerGatePage(gateId, build) {
  findStep(gateId);
  builders.set(gateId, build);
}

function pageData(project, gateId) {
  const gate = findStep(gateId);
  const build = builders.get(gateId);
  if (build) return build(project);
  return {
    title: gateId,
    intro: 'Files covered by this review:',
    sections: [{ heading: 'Files', kind: 'list', items: gate.covers(project) }],
  };
}

module.exports = { registerGatePage, pageData };
