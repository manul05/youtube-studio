'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { readJson, writeJson, ensureDir, sha256File } = require('../util/files.cjs');
const { run, ffmpegPath, probe } = require('../util/proc.cjs');
const { loadEnv } = require('../config.cjs');
const { readLedger, writeLedger } = require('./ledger.cjs');

const PER_PROVIDER = 2;
const MAX_BYTES = 200 * 1024 * 1024;
// Only video files from the two licensed libraries are ever downloaded.
const ALLOWED_HOSTS = [/(^|\.)pexels\.com$/, /(^|\.)pixabay\.com$/];
const BEAT_ID = /^[A-Za-z0-9_-]+$/;

function allowed(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && ALLOWED_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

/** Smallest rendition at least minWidth wide (and tall enough for the frame). */
function pickRendition(files, minWidth, minHeight) {
  const ok = files.filter((f) => f.width >= minWidth && f.height >= minHeight && allowed(f.link));
  ok.sort((a, b) => a.width * a.height - b.width * b.height);
  return ok[0] || null;
}

async function pexels(query, portrait, { fetch, key }, [minW, minH]) {
  if (!key) return [];
  const url =
    'https://api.pexels.com/videos/search?per_page=6&size=medium' +
    `&orientation=${portrait ? 'portrait' : 'landscape'}&query=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { Authorization: key } });
  if (!res.ok) throw new Error(`Pexels search failed (HTTP ${res.status}).`);
  const body = await res.json();
  return (body.videos || [])
    .map((v) => {
      const file = pickRendition(v.video_files || [], minW, minH);
      return (
        file && {
          provider: 'pexels',
          licence: 'Pexels License',
          page: v.url,
          creator: (v.user && v.user.name) || 'unknown',
          download: file.link,
        }
      );
    })
    .filter(Boolean)
    .slice(0, PER_PROVIDER);
}

async function pixabay(query, portrait, { fetch, key }, [minW, minH]) {
  if (!key) return [];
  const url = `https://pixabay.com/api/videos/?per_page=6&key=${key}&q=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Pixabay search failed (HTTP ${res.status}).`);
  const body = await res.json();
  return (body.hits || [])
    .map((hit) => {
      const files = Object.values(hit.videos || {}).map((v) => ({
        link: v.url,
        width: v.width,
        height: v.height,
      }));
      const file = pickRendition(files, minW, minH);
      return (
        file && {
          provider: 'pixabay',
          licence: 'Pixabay Content License',
          page: hit.pageURL,
          creator: hit.user || 'unknown',
          download: file.link,
        }
      );
    })
    .filter(Boolean)
    .slice(0, PER_PROVIDER);
}

async function download(url, dest, fetch) {
  if (!allowed(url)) throw new Error(`Refusing download from ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}).`);
  const type = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
  if (type && !/video|octet-stream/.test(type)) throw new Error(`Not a video: ${type}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error('Clip too large.');
  fs.writeFileSync(dest, bytes);
}

/** A 2×2 sheet of frames taken 2 s into each candidate, numbered 1–4. */
async function contactSheet(dir, count) {
  const sheet = createCanvas(960, 540);
  const g = sheet.getContext('2d');
  g.fillStyle = '#000000';
  g.fillRect(0, 0, 960, 540);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-stock-'));
  for (let i = 1; i <= count; i += 1) {
    const still = path.join(tmp, `${i}.png`);
    try {
      run(ffmpegPath(), [
        '-v',
        'error',
        '-y',
        '-ss',
        '2',
        '-i',
        path.join(dir, `cand_${i}.mp4`),
        '-frames:v',
        '1',
        '-vf',
        'scale=480:270',
        still,
      ]);
      g.drawImage(await loadImage(still), ((i - 1) % 2) * 480, Math.floor((i - 1) / 2) * 270);
    } catch {
      // A candidate that cannot be decoded simply shows as black.
    }
    g.fillStyle = 'rgba(0,0,0,0.7)';
    g.fillRect(((i - 1) % 2) * 480, Math.floor((i - 1) / 2) * 270, 48, 40);
    g.fillStyle = '#ffffff';
    g.font = '28px sans-serif';
    g.fillText(String(i), ((i - 1) % 2) * 480 + 14, Math.floor((i - 1) / 2) * 270 + 30);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.writeFileSync(path.join(dir, 'candidates.jpg'), sheet.toBuffer('image/jpeg'));
}

/**
 * For every stock beat, search Pexels and Pixabay with its query and download up to four
 * candidates into assets/stock/_incoming/<beatId>/ with a candidates.jpg to choose from.
 */
async function searchStock(project, { fetch = globalThis.fetch, env = loadEnv() } = {}) {
  const plan = readJson(project.path('beats.json'));
  const portrait = plan.format === 'short';
  const minimum = portrait ? [1080, 1920] : [1920, 1080];
  const results = [];
  for (const beat of plan.beats.filter((b) => b.type === 'stock')) {
    const dir = project.path('assets', 'stock', '_incoming', beat.id);
    fs.rmSync(dir, { recursive: true, force: true });
    ensureDir(dir);
    const query = beat.fields.query;
    const found = [
      ...(await pexels(query, portrait, { fetch, key: env.PEXELS_API_KEY }, minimum)),
      ...(await pixabay(query, portrait, { fetch, key: env.PIXABAY_API_KEY }, minimum)),
    ].slice(0, 4);
    let n = 0;
    for (const candidate of found) {
      try {
        await download(candidate.download, path.join(dir, `cand_${n + 1}.mp4`), fetch);
        writeJson(path.join(dir, `cand_${n + 1}.json`), candidate);
        n += 1;
      } catch (err) {
        console.log(`  ${beat.id}: skipped one candidate (${err.message})`);
      }
    }
    if (n) await contactSheet(dir, n);
    results.push({ beat: beat.id, query, candidates: n });
  }
  return results;
}

/** Keep candidate n for a beat: move it to assets/stock/<beatId>.mp4 and record its licence. */
function pickStock(project, beatId, n) {
  if (!BEAT_ID.test(String(beatId))) throw new Error(`Invalid beat id "${beatId}".`);
  const index = Number(n);
  if (!Number.isInteger(index) || index < 1 || index > 4)
    throw new Error('Pick a candidate number 1–4.');
  const dir = project.path('assets', 'stock', '_incoming', beatId);
  const source = path.join(dir, `cand_${index}.mp4`);
  if (!fs.existsSync(source)) throw new Error(`No candidate ${index} for ${beatId}.`);
  const meta = readJson(path.join(dir, `cand_${index}.json`));
  const rel = `assets/stock/${beatId}.mp4`;
  fs.copyFileSync(source, project.path(rel));
  const ledger = readLedger(project);
  ledger.stock = ledger.stock || {};
  ledger.stock[beatId] = {
    file: rel,
    provider: meta.provider,
    licence: meta.licence,
    url: meta.page,
    creator: meta.creator,
    durationSec: Number(probe(project.path(rel)).format.duration),
    sha256: sha256File(project.path(rel)),
  };
  writeLedger(project, ledger);
  return ledger.stock[beatId];
}

module.exports = { searchStock, pickStock, allowed };
