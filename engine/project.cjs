'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { rootPath, readJson, writeJson } = require('./util/files.cjs');
const { channel } = require('./config.cjs');

const PROJECTS_DIR = rootPath('projects');
const TEMPLATE_DIR = rootPath('templates', 'project');

function today() {
  return new Date().toISOString().slice(0, 10);
}

/** Create projects/<date>-<slug>/ from templates/project and set the channel defaults. */
function createProject(slug, { channel: channelId, date = today(), projectsDir = PROJECTS_DIR }) {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new Error(`Project slug "${slug}" must use lowercase letters, digits and hyphens.`);
  }
  const profile = channel(channelId);
  const dir = path.join(projectsDir, `${date}-${slug}`);
  if (fs.existsSync(dir)) throw new Error(`Project already exists: ${dir}`);
  fs.cpSync(TEMPLATE_DIR, dir, { recursive: true });
  const briefFile = path.join(dir, 'brief.json');
  const brief = readJson(briefFile);
  writeJson(briefFile, {
    ...brief,
    channel: profile.id,
    language: profile.language,
    captionScript: profile.captionScript,
  });
  return dir;
}

/** Open a project by folder name (under projects/) or by absolute path. */
function openProject(nameOrDir, { projectsDir = PROJECTS_DIR } = {}) {
  const dir = path.isAbsolute(nameOrDir) ? nameOrDir : path.join(projectsDir, nameOrDir);
  if (!fs.existsSync(path.join(dir, 'brief.json'))) {
    throw new Error(`No project at ${dir} (brief.json missing).`);
  }
  return {
    dir,
    name: path.basename(dir),
    path: (...parts) => path.join(dir, ...parts),
    get brief() {
      return readJson(path.join(dir, 'brief.json'));
    },
  };
}

module.exports = { PROJECTS_DIR, createProject, openProject };
