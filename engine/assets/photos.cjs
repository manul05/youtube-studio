'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');
const { readJson, writeJson, ensureDir, sha256File } = require('../util/files.cjs');
const { loadEnv, qc } = require('../config.cjs');
const { readLedger, writeLedger } = require('./ledger.cjs');
const { licenceAllowed, needsCredit } = require('./licences.cjs');

const COMMONS_MAX = 4;
const PIXABAY_MAX = 2;
const MAX_CANDIDATES = COMMONS_MAX + PIXABAY_MAX;
const MAX_BYTES = 40 * 1024 * 1024;
const BEAT_ID = /^[A-Za-z0-9_-]+$/;
// Wikimedia asks every API client to identify itself.
const USER_AGENT = 'claude-youtube-studio/1.0 (local video tool; stock photo search)';
// Only image files from the two libraries are ever downloaded.
const ALLOWED_HOSTS = [/^upload\.wikimedia\.org$/, /(^|\.)pixabay\.com$/];

function allowed(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && ALLOWED_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

/** Plain text from Commons' HTML metadata ("<a …>Ravi Kumar</a>" → "Ravi Kumar"). */
function plainText(html) {
  return String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Large, freely licensed JPEG/PNG photos from Wikimedia Commons (no key needed). */
async function commons(query, { fetch, minEdge }) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrsearch: `${query} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: '20',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '2560',
  });
  const res = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
    headers: { 'User-Agent': USER_AGENT },
  });
  if (!res.ok) return [];
  const pages = Object.values(((await res.json()).query || {}).pages || {});
  pages.sort((a, b) => (a.index ?? a.pageid) - (b.index ?? b.pageid));
  const out = [];
  for (const page of pages) {
    const info = (page.imageinfo || [])[0];
    if (!info || !/^image\/(jpeg|png)$/.test(info.mime)) continue;
    if (Math.max(info.width, info.height) < minEdge) continue;
    const meta = info.extmetadata || {};
    const licence = plainText(meta.LicenseShortName && meta.LicenseShortName.value);
    if (!licenceAllowed(licence)) continue;
    const creator = plainText(meta.Artist && meta.Artist.value) || 'unknown';
    const title = String(page.title || '')
      .replace(/^File:/, '')
      .replace(/\.[a-z]+$/i, '');
    out.push({
      provider: 'wikimedia',
      title,
      creator,
      licence,
      licenceUrl: (meta.LicenseUrl && meta.LicenseUrl.value) || '',
      attributionRequired:
        needsCredit(licence) || String((meta.AttributionRequired || {}).value) === 'true',
      page: info.descriptionurl,
      download: info.thumburl || info.url,
    });
    if (out.length >= COMMONS_MAX) break;
  }
  return out;
}

/**
 * Pixabay photos. The free API's largeImageURL is at most 1280 px, below the image size floor,
 * so only full-size links (fullHDURL / imageURL, given to accounts with full API access) are used.
 */
async function pixabay(query, { fetch, key }) {
  if (!key) return [];
  const params = new URLSearchParams({
    key,
    q: query,
    image_type: 'photo',
    safesearch: 'true',
    per_page: '20',
  });
  const res = await fetch(`https://pixabay.com/api/?${params}`);
  if (!res.ok) return [];
  const out = [];
  for (const hit of (await res.json()).hits || []) {
    const download = hit.fullHDURL || hit.imageURL;
    if (!download) continue;
    out.push({
      provider: 'pixabay',
      title: `Pixabay photo ${hit.id}`,
      creator: hit.user || 'unknown',
      licence: 'Pixabay Content License',
      licenceUrl: 'https://pixabay.com/service/license-summary/',
      attributionRequired: false,
      page: hit.pageURL,
      download,
    });
    if (out.length >= PIXABAY_MAX) break;
  }
  return out;
}

async function download(url, dest, fetch) {
  if (!allowed(url)) throw new Error(`Refusing download from ${url}`);
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status}).`);
  const type = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
  if (type && !/^image\/(jpeg|png)/.test(type)) throw new Error(`Not a JPEG or PNG: ${type}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length > MAX_BYTES) throw new Error('Photo too large.');
  fs.writeFileSync(dest, bytes);
}

/** A 3×2 sheet of the candidates, numbered 1–6. */
async function contactSheet(dir, count) {
  const sheet = createCanvas(1440, 540);
  const g = sheet.getContext('2d');
  g.fillStyle = '#000000';
  g.fillRect(0, 0, sheet.width, sheet.height);
  for (let i = 1; i <= count; i += 1) {
    const x = ((i - 1) % 3) * 480;
    const y = Math.floor((i - 1) / 3) * 270;
    try {
      const image = await loadImage(fs.readFileSync(path.join(dir, `cand_${i}.img`)));
      const scale = Math.min(480 / image.width, 270 / image.height);
      const w = image.width * scale;
      const h = image.height * scale;
      g.drawImage(image, x + (480 - w) / 2, y + (270 - h) / 2, w, h);
    } catch {
      // A candidate that cannot be decoded simply shows as black.
    }
    g.fillStyle = 'rgba(0,0,0,0.7)';
    g.fillRect(x, y, 48, 40);
    g.fillStyle = '#ffffff';
    g.font = '28px sans-serif';
    g.fillText(String(i), x + 14, y + 30);
  }
  fs.writeFileSync(path.join(dir, 'candidates.jpg'), sheet.toBuffer('image/jpeg'));
}

/**
 * For every beat with a photoQuery, search Wikimedia Commons (always) and Pixabay (with a key)
 * and download up to six freely licensed candidates into assets/photos/_incoming/<beatId>/,
 * with a numbered candidates.jpg to choose from.
 */
async function searchPhotos(project, { fetch = globalThis.fetch, env = loadEnv() } = {}) {
  const plan = readJson(project.path('beats.json'));
  const minEdge = qc().imageMinLongEdge;
  const results = [];
  for (const beat of plan.beats.filter((b) => b.fields && b.fields.photoQuery)) {
    if (!BEAT_ID.test(String(beat.id))) throw new Error(`Invalid beat id "${beat.id}".`);
    const dir = project.path('assets', 'photos', '_incoming', beat.id);
    fs.rmSync(dir, { recursive: true, force: true });
    ensureDir(dir);
    const query = beat.fields.photoQuery;
    const found = [
      ...(await commons(query, { fetch, minEdge })),
      ...(await pixabay(query, { fetch, key: env.PIXABAY_API_KEY })),
    ].slice(0, MAX_CANDIDATES);
    let n = 0;
    for (const candidate of found) {
      try {
        await download(candidate.download, path.join(dir, `cand_${n + 1}.img`), fetch);
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

/**
 * Keep candidate n for a beat: save it as assets/images/img_<beatId>.png (PNG) and record its
 * source, author, licence and credit line in the asset ledger.
 */
async function pickPhoto(project, beatId, n) {
  if (!BEAT_ID.test(String(beatId))) throw new Error(`Invalid beat id "${beatId}".`);
  const index = Number(n);
  if (!Number.isInteger(index) || index < 1 || index > MAX_CANDIDATES)
    throw new Error(`Pick a candidate number 1–${MAX_CANDIDATES}.`);
  const dir = project.path('assets', 'photos', '_incoming', beatId);
  const source = path.join(dir, `cand_${index}.img`);
  if (!fs.existsSync(source)) throw new Error(`No candidate ${index} for ${beatId}.`);
  const meta = readJson(path.join(dir, `cand_${index}.json`));
  if (!licenceAllowed(meta.licence)) throw new Error(`Licence "${meta.licence}" is not allowed.`);
  const image = await loadImage(fs.readFileSync(source));
  const canvas = createCanvas(image.width, image.height);
  canvas.getContext('2d').drawImage(image, 0, 0);
  const name = `img_${beatId}.png`;
  const rel = `assets/images/${name}`;
  ensureDir(project.path('assets', 'images'));
  fs.writeFileSync(project.path(rel), canvas.toBuffer('image/png'));
  const library = meta.provider === 'wikimedia' ? 'Wikimedia Commons' : 'Pixabay';
  const ledger = readLedger(project);
  ledger.images[name] = {
    file: rel,
    origin: `stock-photo:${meta.provider}`,
    provider: meta.provider,
    title: meta.title,
    creator: meta.creator,
    licence: meta.licence,
    licenceUrl: meta.licenceUrl,
    url: meta.page,
    attributionRequired: Boolean(meta.attributionRequired),
    credit: `"${meta.title}" by ${meta.creator} — ${library}, ${meta.licence}`,
    sha256: sha256File(project.path(rel)),
  };
  writeLedger(project, ledger);
  return ledger.images[name];
}

module.exports = { searchPhotos, pickPhoto, licenceAllowed, allowed };
