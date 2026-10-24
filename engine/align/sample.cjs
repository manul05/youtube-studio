'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { readJson, writeJson } = require('../util/files.cjs');
const { matchWords } = require('./match.cjs');
const { runWhisper, asrLanguage } = require('./whisper.cjs');

/**
 * Find where each name and each Shorts hook sits inside the stop-3 sample recordings, so the
 * review page can play them one by one. Writes work/voice/sample/alignment.json.
 */
async function alignSample(project, { asr } = {}) {
  const dir = project.path('work', 'voice', 'sample');
  const manifest = readJson(path.join(dir, 'manifest.json'));
  const language = asrLanguage(project.brief.language);
  const recognise =
    asr || (async (file) => runWhisper(file, language, project.path('work', 'align', 'asr')));
  const result = { names: [], hooks: [] };

  for (const item of manifest.items) {
    const entries =
      item.kind === 'names'
        ? item.names.map((n) => ({ key: n.name, text: n.spoken }))
        : item.kind === 'hooks'
          ? item.hooks.map((h) => ({ key: h.id, text: h.text }))
          : [];
    if (!entries.length) continue;
    const file = path.join(dir, item.file);
    if (!fs.existsSync(file)) continue;
    const tokens = entries.map((e) => e.text.split(/\s+/).filter(Boolean));
    const timed = matchWords(tokens.flat(), await recognise(file)).words;
    let offset = 0;
    entries.forEach((entry, i) => {
      const words = timed.slice(offset, offset + tokens[i].length);
      offset += tokens[i].length;
      const span = { start: words[0].start, end: words[words.length - 1].end, file: item.file };
      if (item.kind === 'names')
        result.names.push({ name: entry.key, spoken: entry.text, ...span });
      else result.hooks.push({ id: entry.key, text: entry.text, ...span });
    });
  }
  writeJson(path.join(dir, 'alignment.json'), result);
  return result;
}

module.exports = { alignSample };
