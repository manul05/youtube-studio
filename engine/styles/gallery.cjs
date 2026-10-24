'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { rootPath } = require('../util/files.cjs');
const { listPacks } = require('./suggest.cjs');

const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

/** Write styles/gallery.html: every pack with its preview, best-for tags and mixing partners. */
function buildGallery() {
  const stylesDir = rootPath('styles');
  const packs = listPacks().filter((p) => p.dir.startsWith(stylesDir) && p.id !== 'base');
  const cards = packs
    .map((p) => {
      const rel = (f) => `${p.id}/${f}`;
      const hasPreview = fs.existsSync(path.join(p.dir, 'preview.mp4'));
      const media = hasPreview
        ? `<video src="${rel('preview.mp4')}" poster="${rel('card.png')}" muted loop playsinline controls></video>`
        : `<p class="muted">No preview yet: npm run style:preview -- ${escape(p.id)}</p>`;
      const role =
        p.meta.role === 'accent'
          ? 'Accent (mix into a main style)'
          : p.meta.role === 'shorts'
            ? 'Shorts captions'
            : 'Main style';
      const status = p.check ? (p.check.passed ? 'Checked ✓' : 'Check failing') : 'Not checked';
      return `<article>
  ${media}
  <h2>${escape(p.meta.name)} <code>${escape(p.id)}</code></h2>
  <p class="muted">${escape(role)} · ${escape((p.meta.formats || []).join(' + '))} · ${escape(status)}</p>
  <p><strong>Best for:</strong> ${escape((p.meta.bestFor || []).join(', '))}</p>
  <p><strong>Mixes with:</strong> ${escape((p.meta.mixesWith || []).join(', ') || '—')}</p>
</article>`;
    })
    .join('\n');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Style Gallery</title>
<style>
:root{--bg:#f6f4ee;--card:#fff;--ink:#1b1f1d;--muted:#5d6661;--line:#dcd8cd}
@media (prefers-color-scheme:dark){:root{--bg:#141615;--card:#1d201f;--ink:#ecebe6;--muted:#a3aaa6;--line:#333836}}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.5 'Segoe UI',system-ui,sans-serif}
main{max-width:1200px;margin:0 auto;padding:24px 16px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px}
article{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}
video{width:100%;border-radius:6px;background:#000}h2{font-size:19px;margin:10px 0 4px}
.muted{color:var(--muted)}code{font-size:13px;color:var(--muted)}
</style></head><body><main>
<h1>Style Gallery</h1>
<p class="muted">Pick a main style by its id for brief.json → style.main. Accent styles go in style.accents by beat type, e.g. {"quote": "kinetic"}. At most two accents.</p>
<div class="grid">
${cards}
</div></main></body></html>
`;
  const file = path.join(stylesDir, 'gallery.html');
  fs.writeFileSync(file, html);
  return file;
}

module.exports = { buildGallery };
