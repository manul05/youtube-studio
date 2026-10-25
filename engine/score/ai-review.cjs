'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { readJson, writeJson } = require('../util/files.cjs');
const { run, ffmpegPath } = require('../util/proc.cjs');
const { stamp } = require('../util/timecode.cjs');
const { models, loadEnv } = require('../config.cjs');
const { sentences } = require('../words/text.cjs');
const { RateLimited, ProviderError } = require('../voice/gemini.cjs');
const { NAMES, AI_CATEGORIES } = require('./rubric.cjs');

const MODEL_ID = /^[a-z0-9][a-z0-9.\-]*$/;

function schemaFor(categories) {
  const category = {
    type: 'OBJECT',
    properties: {
      score: { type: 'INTEGER' },
      reasons: {
        type: 'ARRAY',
        items: {
          type: 'OBJECT',
          properties: { t: { type: 'NUMBER' }, note: { type: 'STRING' } },
          required: ['note'],
        },
      },
    },
    required: ['score', 'reasons'],
  };
  return {
    type: 'OBJECT',
    properties: {
      categories: {
        type: 'OBJECT',
        properties: Object.fromEntries(categories.map((c) => [c, category])),
        required: categories,
      },
    },
    required: ['categories'],
  };
}

/**
 * One fresh generateContent call to the review model, asking for JSON scores per category.
 * The answer must match the schema exactly (integer scores 0–100) or it is refused.
 */
async function requestReview({ parts, categories, fetch = globalThis.fetch, apiKey, model }) {
  if (!apiKey) throw new ProviderError('GEMINI_API_KEY is not set.');
  if (!MODEL_ID.test(String(model)))
    throw new ProviderError(`Invalid review model "${model}" (run npm run doctor).`);
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: schemaFor(categories),
          temperature: 0.2,
        },
      }),
    },
  );
  if (res.status === 429) throw new RateLimited(null);
  if (!res.ok)
    throw new ProviderError(
      `AI review failed (HTTP ${res.status}): ${String(await res.text()).slice(0, 300)}`,
      res.status,
    );
  const body = await res.json();
  const text = ((body.candidates || [])[0] || { content: { parts: [] } }).content.parts
    .map((p) => p.text || '')
    .join('');
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('AI review response does not match the schema (not JSON).');
  }
  for (const c of categories) {
    const entry = parsed.categories && parsed.categories[c];
    if (
      !entry ||
      !Number.isInteger(entry.score) ||
      entry.score < 0 ||
      entry.score > 100 ||
      !Array.isArray(entry.reasons)
    ) {
      throw new Error(`AI review response does not match the schema (category ${c}).`);
    }
  }
  return { categories: parsed.categories };
}

/** Frames every `every` seconds from a video, tiled 4×3 at 480×270 with timestamps. */
async function frameSheets(video, { every, from = 0, to = Infinity }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-review-'));
  try {
    const args = ['-v', 'error', '-y'];
    if (from) args.push('-ss', String(from));
    args.push('-i', video);
    if (Number.isFinite(to)) args.push('-t', String(to - from));
    run(ffmpegPath(), [
      ...args,
      '-vf',
      `fps=1/${every},scale=480:270`,
      '-q:v',
      '4',
      path.join(dir, 'f_%05d.jpg'),
    ]);
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.jpg'))
      .sort();
    const sheets = [];
    for (let start = 0; start < files.length; start += 12) {
      const group = files.slice(start, start + 12);
      const sheet = createCanvas(1920, Math.ceil(group.length / 4) * 300);
      const g = sheet.getContext('2d');
      g.fillStyle = '#000000';
      g.fillRect(0, 0, sheet.width, sheet.height);
      for (let i = 0; i < group.length; i += 1) {
        const x = (i % 4) * 480;
        const y = Math.floor(i / 4) * 300;
        g.drawImage(await loadImage(path.join(dir, group[i])), x, y + 30);
        g.fillStyle = '#ffffff';
        g.font = '22px sans-serif';
        g.fillText(stamp(from + (start + i) * every).slice(3, 8), x + 8, y + 22);
      }
      sheets.push(sheet.toBuffer('image/jpeg', 80).toString('base64'));
    }
    return sheets;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const image = (data) => ({ inline_data: { mime_type: 'image/jpeg', data } });

function instructions(kind, categories) {
  return [
    'You are an independent, strict YouTube quality reviewer. You did not make this video.',
    `Score each category from 0 to 100, where 95+ means as good as the best professional ${kind === 'short' ? 'Shorts' : 'documentary/explainer channels'}.`,
    'Judge only what you can see in the frames and read in the script. Give concrete reasons with timestamps (seconds).',
    'Categories:',
    ...categories.map((c) => `- ${c}: ${NAMES[c]}`),
    'Penalise: slides held still, repeated layouts, text-heavy frames, weak or slow openings, unfair or unattributed claims, cluttered or unreadable thumbnails.',
  ].join('\n');
}

function scriptText(project, filter = () => true) {
  const script = readJson(project.path('script.json'));
  return script.chapters
    .flatMap((c) => c.paragraphs)
    .flatMap((p) => sentences(p.text, p.id))
    .filter(filter)
    .map((s) => `[${s.id}] ${s.spoken} {${s.tags.join(',')}}`)
    .join('\n');
}

function researchSummary(project) {
  const r = readJson(project.path('research.json'));
  return r.claims
    .map((c) => `${c.id} (${c.status}, ${c.sources.length} source(s)): ${c.text}`)
    .join('\n');
}

/** Review the long-form video and each Short with fresh calls; write outputs/score/ai.json. */
async function aiReview(project, opts = {}) {
  const fetch = opts.fetch || globalThis.fetch;
  const apiKey = opts.apiKey || loadEnv().GEMINI_API_KEY;
  const model = opts.model || models().review;
  if (!model) throw new Error('No review model configured: run npm run doctor.');
  const master = project.path('outputs', 'master.mp4');
  const thumbs = [1, 2, 3]
    .map((n) => project.path('outputs', 'package', `thumb_${n}.png`))
    .filter((f) => fs.existsSync(f));
  const thumbParts = [];
  for (const t of thumbs) {
    const c = createCanvas(320, 180);
    c.getContext('2d').drawImage(await loadImage(t), 0, 0, 320, 180);
    thumbParts.push(image(c.toBuffer('image/jpeg', 85).toString('base64')));
  }
  const long = await requestReview({
    model,
    apiKey,
    fetch,
    categories: AI_CATEGORIES.long,
    parts: [
      { text: instructions('long', AI_CATEGORIES.long) },
      {
        text: `TITLE OPTIONS:\n${project.brief.titles.join('\n')}\n\nSCRIPT (claim tags in braces):\n${scriptText(project)}\n\nRESEARCH LEDGER:\n${researchSummary(project)}`,
      },
      { text: 'FIRST 30 SECONDS, one frame per second:' },
      ...(await frameSheets(master, { every: 1, to: 30 })).map(image),
      { text: 'WHOLE VIDEO, one frame every 2 seconds:' },
      ...(await frameSheets(master, { every: 2 })).map(image),
      { text: 'THUMBNAILS at phone size:' },
      ...thumbParts,
    ],
  });
  const shorts = {};
  const shortsDir = project.path('outputs', 'shorts');
  if (fs.existsSync(shortsDir)) {
    for (const file of fs.readdirSync(shortsDir).filter((f) => f.endsWith('.mp4'))) {
      const id = file.replace(/\.mp4$/, '');
      shorts[id] = await requestReview({
        model,
        apiKey,
        fetch,
        categories: AI_CATEGORIES.short,
        parts: [
          { text: instructions('short', AI_CATEGORIES.short) },
          ...(await frameSheets(path.join(shortsDir, file), { every: 1 })).map(image),
        ],
      });
    }
  }
  const out = { model, at: new Date().toISOString(), categories: long.categories, shorts };
  writeJson(project.path('outputs', 'score', 'ai.json'), out);
  return out;
}

module.exports = { aiReview, requestReview, schemaFor };
