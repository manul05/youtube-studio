'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { loadImage } = require('@napi-rs/canvas');
const {
  readJson,
  writeJson,
  ensureDir,
  sha256File,
  sha256Text,
  rootPath,
} = require('../util/files.cjs');
const { ffmpegPath } = require('../util/proc.cjs');
const { channel, channelLogo } = require('../config.cjs');
const { createFrameCanvas } = require('./context.cjs');
const { openVideoSource } = require('./video-source.cjs');
const { loadStyle, styleForBeat } = require('../styles/loader.cjs');

const CROSSFADE_FRAMES = 9; // 0.3 s at 30 fps

/** Hash every file under a folder (sorted), for render signatures. */
function hashTree(dir) {
  const parts = [];
  const walk = (d) => {
    for (const entry of fs
      .readdirSync(d, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (!/\.(png|jpg|mp4)$/i.test(entry.name))
        parts.push(`${path.relative(dir, full)}:${sha256File(full)}`);
    }
  };
  walk(dir);
  return sha256Text(parts.join('\n'));
}

function outputDir(project, label) {
  return project.path('work', 'render', label);
}

function waitDrain(stream, child) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      stream.off('drain', onDrain);
      child.off('close', onClose);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new Error('The encoder closed before accepting all frames.'));
    };
    stream.once('drain', onDrain);
    child.once('close', onClose);
  });
}

/** Aligned words of a beat's paragraph, re-timed so 0 is the beat's first frame. */
function beatWords(project, beat, fps) {
  if (!beat.paragraph) return [];
  const file = project.path('work', 'align', `${beat.paragraph}.json`);
  if (!fs.existsSync(file)) return [];
  const offset = (beat.lead || 0) - (beat.startFrame - beat.paragraphStartFrame) / fps;
  return readJson(file).words.map((w) => ({ ...w, start: w.start + offset, end: w.end + offset }));
}

async function loadBeatAssets(project, beat, plan, ledger) {
  const assets = { image: null, video: null, logo: null };
  if (beat.fields && beat.fields.imagePrompt) {
    const file = project.path('assets', 'images', `img_${beat.id}.png`);
    if (!fs.existsSync(file))
      throw new Error(`Missing image for ${beat.id}: assets/images/img_${beat.id}.png`);
    assets.image = await loadImage(file);
  }
  if (beat.type === 'stock') {
    const entry = ledger.stock && ledger.stock[beat.id];
    if (!entry) throw new Error(`No stock clip picked for ${beat.id} (npm run stock:pick).`);
    assets.video = openVideoSource(project.path(entry.file), {
      w: plan.width,
      h: plan.height,
      inSec: Number(beat.fields.inSec) || 0,
      fps: plan.fps,
    });
  }
  if (beat.type === 'endcard') {
    const logo = channelLogo(project.brief.channel);
    if (fs.existsSync(logo)) assets.logo = await loadImage(logo);
  }
  return assets;
}

/**
 * Render one chapter of a plan to work/render/<label>/chapter_NN.mp4 (video only). Skips the
 * work when the plan, assets, engine and style packs are unchanged since the last render.
 * Normally runs in its own child process so memory is released between chapters.
 */
async function renderChapter(project, chapterId, opts = {}) {
  const { format = 'long', planFile = project.path('beats.json'), label = format } = opts;
  if (!opts.inProcess)
    return renderInChild(project, chapterId, { format, planFile, label, force: opts.force });

  const plan = readJson(planFile);
  const chapter = plan.chapters.find((c) => Number(c.id) === Number(chapterId));
  if (!chapter) throw new Error(`No chapter ${chapterId} in ${path.basename(planFile)}.`);
  const beats = plan.beats.filter((b) => Number(b.chapter) === Number(chapterId));
  const ledgerFile = project.path('assets', 'ledger.json');
  const ledger = fs.existsSync(ledgerFile) ? readJson(ledgerFile) : { images: {}, stock: {} };

  const packs = [...new Set(beats.map((b) => b.style))];
  const signature = sha256Text(
    [
      sha256File(planFile),
      fs.existsSync(ledgerFile) ? sha256File(ledgerFile) : '',
      hashTree(rootPath('engine')),
      ...packs.map((id) => hashTree(loadStyle(id).dir)),
      fs.existsSync(project.path('assets', 'images')) ? hashImages(project, beats) : '',
    ].join('|'),
  );

  const dir = outputDir(project, label);
  ensureDir(dir);
  const id2 = String(chapterId).padStart(2, '0');
  const dest = path.join(dir, `chapter_${id2}.mp4`);
  const metaFile = `${dest}.json`;
  if (!opts.force && fs.existsSync(dest) && fs.existsSync(metaFile)) {
    const meta = readJson(metaFile);
    if (meta.signature === signature && meta.sha256 === sha256File(dest)) {
      return { cached: true, file: dest };
    }
  }

  const { canvas, ctx } = createFrameCanvas(plan.width, plan.height, plan.format || format);
  const env0 = {
    channel: channel(project.brief.channel),
    format: plan.format || format,
    width: plan.width,
    height: plan.height,
    fps: plan.fps,
  };
  const partial = dest.replace(/\.mp4$/, '.partial.mp4');
  const ff = spawn(
    ffmpegPath(),
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-f',
      'rawvideo',
      '-pixel_format',
      'rgba',
      '-video_size',
      `${plan.width}x${plan.height}`,
      '-framerate',
      String(plan.fps),
      '-i',
      'pipe:0',
      '-an',
      '-vf',
      'scale=out_color_matrix=bt709:out_range=tv',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '18',
      '-threads',
      '2',
      '-pix_fmt',
      'yuv420p',
      '-color_primaries',
      'bt709',
      '-color_trc',
      'bt709',
      '-colorspace',
      'bt709',
      '-color_range',
      'tv',
      '-movflags',
      '+faststart',
      partial,
    ],
    { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] },
  );
  let stderr = '';
  ff.stderr.on('data', (d) => (stderr += d.toString()));
  ff.stdin.on('error', () => {});
  let exitCode;
  const closed = new Promise((resolve, reject) => {
    ff.once('error', reject);
    ff.once('close', (code) => {
      exitCode = code;
      resolve(code);
    });
  });

  const started = Date.now();
  const textLog = [];
  let previous = null; // frozen copy of the previous beat's last frame, for crossfades
  const { createCanvas } = require('@napi-rs/canvas');
  try {
    for (const beat of beats) {
      const style = styleForBeat(beat, project.brief);
      const draw = style.components[beat.type];
      if (!draw) throw new Error(`Style "${style.id}" cannot draw beat type "${beat.type}".`);
      const assets = await loadBeatAssets(project, beat, plan, ledger);
      const env = {
        ...env0,
        style,
        beat,
        duration: beat.frames / plan.fps,
        words: beatWords(project, beat, plan.fps),
      };
      ctx.__textLog.clear();
      const fade = previous && style.meta.transition !== 'cut' ? CROSSFADE_FRAMES : 0;
      for (let f = 0; f < beat.frames; f += 1) {
        if (exitCode !== undefined) throw new Error(stderr || 'The encoder stopped early.');
        if (assets.video) assets.videoFrame = await assets.video.frame(f);
        ctx.save();
        draw(ctx, beat, f / plan.fps, assets, env);
        ctx.restore();
        if (f < fade) {
          ctx.save();
          ctx.globalAlpha = 1 - (f + 1) / (fade + 1);
          ctx.drawImage(previous, 0, 0);
          ctx.restore();
        }
        if (!ff.stdin.write(canvas.data())) await waitDrain(ff.stdin, ff);
      }
      if (assets.video) assets.video.close();
      for (const text of ctx.__textLog) textLog.push(JSON.stringify({ beat: beat.id, text }));
      previous = previous || createCanvas(plan.width, plan.height);
      previous.getContext('2d').drawImage(canvas, 0, 0);
    }
    ff.stdin.end();
    if ((await closed) !== 0) throw new Error(stderr || 'The encoder failed.');
  } catch (err) {
    ff.stdin.destroy();
    ff.kill();
    await closed.catch(() => {});
    fs.rmSync(partial, { force: true });
    throw err;
  }
  const issues = [...new Set(ctx.__layoutIssues)];
  if (issues.length) {
    fs.rmSync(partial, { force: true });
    throw new Error(`Layout problems in chapter ${chapterId}:\n  - ${issues.join('\n  - ')}`);
  }
  fs.renameSync(partial, dest);
  fs.writeFileSync(path.join(dir, `textlog_${id2}.jsonl`), `${textLog.join('\n')}\n`);
  const seconds = (Date.now() - started) / 1000;
  writeJson(metaFile, {
    chapter: Number(chapterId),
    signature,
    sha256: sha256File(dest),
    frames: chapter.frames,
    beatIds: beats.map((b) => b.id),
    seconds,
  });
  return { cached: false, file: dest, seconds };
}

function hashImages(project, beats) {
  return sha256Text(
    beats
      .map((b) => project.path('assets', 'images', `img_${b.id}.png`))
      .filter((f) => fs.existsSync(f))
      .map((f) => sha256File(f))
      .join(''),
  );
}

/** Run renderChapter in a separate Node process so each chapter starts with fresh memory. */
function renderInChild(project, chapterId, { format, planFile, label, force }) {
  return new Promise((resolve, reject) => {
    const args = [__filename, project.dir, String(chapterId), format, planFile, label];
    if (force) args.push('--force');
    const child = spawn(process.execPath, args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.on('error', reject);
    child.on('close', (code) => {
      const line = out.split('\n').find((l) => l.startsWith('RESULT '));
      if (code === 0 && line) resolve(JSON.parse(line.slice(7)));
      else reject(new Error(`Chapter ${chapterId} render failed (exit ${code}).`));
    });
  });
}

if (require.main === module) {
  const [dir, chapterId, format, planFile, label] = process.argv.slice(2);
  const { openProject } = require('../project.cjs');
  renderChapter(openProject(dir), chapterId, {
    format,
    planFile,
    label,
    inProcess: true,
    force: process.argv.includes('--force'),
  }).then(
    (result) => {
      process.stdout.write(`RESULT ${JSON.stringify(result)}\n`);
      process.exit(0);
    },
    (err) => {
      process.stderr.write(`${err.message}\n`);
      process.exit(1);
    },
  );
}

module.exports = { renderChapter, hashTree, loadBeatAssets, beatWords };
