'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createCanvas } = require('@napi-rs/canvas');
const { readJson, ensureDir } = require('../util/files.cjs');
const { stamp } = require('../util/timecode.cjs');
const { channel } = require('../config.cjs');
const { createFrameCanvas } = require('./context.cjs');
const { loadBeatAssets, beatWords } = require('./chapter.cjs');
const { styleForBeat } = require('../styles/loader.cjs');

const PER_SHEET = 12;
const TILE_W = 480;
const TILE_H = 270;
const LABEL_H = 34;
const JPEG_QUALITY = 88;

/** Still times for a beat: just after it appears, mid-action, and settled. */
function stillTimes(seconds) {
  return [
    ['entry', Math.min(0.3, seconds / 4)],
    ['action', seconds * 0.45],
    ['settled', Math.max(0, seconds - 0.3)],
  ];
}

/**
 * Render entry/action/settled stills of every beat (exactly as the final render draws them)
 * plus contact sheets of the action stills, 12 beats per sheet, labelled with their start time.
 * Throws listing every beat whose text leaves the safe area.
 */
async function storyboard(
  project,
  { planFile = project.path('beats.json'), label = 'storyboard' } = {},
) {
  const plan = readJson(planFile);
  const ledgerFile = project.path('assets', 'ledger.json');
  const ledger = fs.existsSync(ledgerFile) ? readJson(ledgerFile) : { images: {}, stock: {} };
  const dir = project.path('outputs', label);
  ensureDir(dir);
  for (const old of fs.readdirSync(dir)) {
    if (/^(beat_.*|contact_\d+)\.jpg$/.test(old)) fs.rmSync(path.join(dir, old));
  }
  const { canvas, ctx } = createFrameCanvas(plan.width, plan.height, plan.format);
  const env0 = {
    channel: channel(project.brief.channel),
    format: plan.format,
    width: plan.width,
    height: plan.height,
    fps: plan.fps,
  };
  const tileW = plan.format === 'short' ? Math.round((TILE_H * 9) / 16) : TILE_W;
  const tiles = [];
  const problems = [];
  const stills = [];

  for (const beat of plan.beats) {
    const style = styleForBeat(beat, project.brief);
    const draw = style.components[beat.type];
    if (!draw) {
      problems.push(`${beat.id}: style "${style.id}" cannot draw "${beat.type}"`);
      continue;
    }
    const seconds = beat.frames / plan.fps;
    const assets = await loadBeatAssets(project, beat, plan, ledger);
    const env = {
      ...env0,
      style,
      beat,
      duration: seconds,
      words: beatWords(project, beat, plan.fps),
    };
    for (const [moment, t] of stillTimes(seconds)) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.__layoutIssues.length = 0;
      if (assets.video) assets.videoFrame = await assets.video.frame(Math.floor(t * plan.fps));
      ctx.save();
      draw(ctx, beat, t, assets, env);
      ctx.restore();
      for (const issue of new Set(ctx.__layoutIssues))
        problems.push(`${beat.id} (${moment}): ${issue}`);
      const file = path.join(dir, `beat_${beat.id}_${moment}.jpg`);
      fs.writeFileSync(file, canvas.toBuffer('image/jpeg', JPEG_QUALITY));
      stills.push(file);
      if (moment === 'action') {
        const tile = createCanvas(tileW, TILE_H);
        tile.getContext('2d').drawImage(canvas, 0, 0, tileW, TILE_H);
        tiles.push({ tile, at: beat.startFrame / plan.fps });
      }
    }
    if (assets.video) assets.video.close();
  }

  const sheets = [];
  for (let start = 0; start < tiles.length; start += PER_SHEET) {
    const group = tiles.slice(start, start + PER_SHEET);
    const sheet = createCanvas(4 * tileW, Math.ceil(group.length / 4) * (TILE_H + LABEL_H));
    const g = sheet.getContext('2d');
    g.fillStyle = '#111111';
    g.fillRect(0, 0, sheet.width, sheet.height);
    group.forEach(({ tile, at }, i) => {
      const x = (i % 4) * tileW;
      const y = Math.floor(i / 4) * (TILE_H + LABEL_H);
      g.drawImage(tile, x, y + LABEL_H);
      g.fillStyle = '#ffffff';
      g.font = '22px Mono';
      g.fillText(stamp(at).slice(3, 8), x + 10, y + 25);
    });
    const file = path.join(dir, `contact_${sheets.length + 1}.jpg`);
    fs.writeFileSync(file, sheet.toBuffer('image/jpeg', JPEG_QUALITY));
    sheets.push(file);
  }

  if (problems.length) {
    throw new Error(`Storyboard problems:\n  - ${[...new Set(problems)].join('\n  - ')}`);
  }
  return { sheets, stills };
}

module.exports = { storyboard, stillTimes };
