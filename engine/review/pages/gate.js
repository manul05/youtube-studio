'use strict';

// Renders window.GATE ({ title, intro, sections, gate }) and posts the owner's decision.
// All agent-written text is inserted with textContent, never as HTML.

(function () {
  const data = window.GATE;
  const app = document.getElementById('app');
  const fileUrl = (rel) => `/file?path=${encodeURIComponent(rel)}`;

  function el(tag, attrs = {}, text) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function renderItem(item) {
    if (typeof item === 'string') return el('span', {}, item);
    const span = el('span', item.flag ? { class: 'flag' } : {}, item.text || '');
    if (item.note) span.appendChild(el('span', { class: 'muted' }, ` — ${item.note}`));
    return span;
  }

  const renderers = {
    text: (s) => el('p', {}, s.text),
    list: (s) => {
      const ul = el('ul');
      for (const item of s.items || []) ul.appendChild(el('li')).appendChild(renderItem(item));
      return ul;
    },
    table: (s) => {
      const table = el('table');
      const head = table.appendChild(el('tr'));
      for (const c of s.columns || []) head.appendChild(el('th', {}, c));
      for (const row of s.rows || []) {
        const tr = table.appendChild(el('tr'));
        for (const cell of row) tr.appendChild(el('td')).appendChild(renderItem(cell));
      }
      return table;
    },
    images: (s) => {
      const grid = el('div', { class: 'grid' });
      for (const img of s.items || []) {
        const fig = grid.appendChild(el('figure'));
        fig.appendChild(el('img', { src: fileUrl(img.path), alt: img.caption || '' }));
        if (img.caption) fig.appendChild(el('figcaption', { class: 'muted' }, img.caption));
      }
      return grid;
    },
    audio: (s) => {
      const box = el('div');
      for (const a of s.items || []) {
        const card = box.appendChild(el('div', { class: 'card' }));
        card.appendChild(el('div', {}, a.label || a.path));
        const player = card.appendChild(el('audio', { controls: '', src: fileUrl(a.path) }));
        if (a.start !== undefined) {
          player.addEventListener('loadedmetadata', () => (player.currentTime = a.start));
          player.addEventListener('timeupdate', () => {
            if (a.end !== undefined && player.currentTime >= a.end) player.pause();
          });
        }
      }
      return box;
    },
    video: (s) => {
      const box = el('div');
      for (const v of s.items || []) {
        box.appendChild(el('div', { class: 'muted' }, v.label || ''));
        box.appendChild(el('video', { controls: '', preload: 'metadata', src: fileUrl(v.path) }));
      }
      return box;
    },
  };

  app.appendChild(el('div', { class: 'muted' }, `${data.project} · ${data.gate}`));
  app.appendChild(el('h1', {}, data.title || data.gate));
  if (data.intro) app.appendChild(el('p', { class: 'muted' }, data.intro));
  for (const section of data.sections || []) {
    if (section.heading) app.appendChild(el('h2', {}, section.heading));
    const render = renderers[section.kind] || renderers.text;
    app.appendChild(render(section));
  }

  const status = document.getElementById('status');
  for (const button of document.querySelectorAll('button[data-decision]')) {
    button.addEventListener('click', async () => {
      status.textContent = 'Saving…';
      const res = await fetch(`/gate/${encodeURIComponent(data.gate)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: document.getElementById('pin').value,
          decision: button.dataset.decision,
          notes: document.getElementById('notes').value,
          extra: window.GATE_EXTRA ? window.GATE_EXTRA() : {},
        }),
      });
      const body = await res.json().catch(() => ({}));
      status.textContent = res.ok
        ? `Saved: ${body.decision} at ${body.at}. You can close this tab.`
        : `Not saved: ${body.error || res.status}`;
    });
  }
})();
