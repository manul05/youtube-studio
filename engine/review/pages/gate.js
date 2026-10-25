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

  // Stop 5: ratings, picks and "this drags" markers, saved with the PIN to /gate/<id>/ratings.
  const ratings = { long: {}, shorts: {} };
  const drags = [];
  const pick = { thumbnail: 1, title: 1 };
  const LEVELS = ['Excellent', 'Good', 'OK', 'Weak', 'Bad'];

  renderers.form = (s) => {
    const box = el('div', { class: 'card' });
    for (const q of s.questions) {
      box.appendChild(el('div', {}, q.label));
      const row = box.appendChild(el('div'));
      for (const level of LEVELS) {
        const label = row.appendChild(el('label', { style: 'margin-right:12px' }));
        const input = label.appendChild(
          el('input', { type: 'radio', name: `${s.target}-${q.id}`, value: level }),
        );
        label.appendChild(document.createTextNode(` ${level}`));
        input.addEventListener('change', () => {
          const target =
            s.target === 'long'
              ? ratings.long
              : (ratings.shorts[s.target] = ratings.shorts[s.target] || {});
          target[q.id] = level;
        });
      }
    }
    return box;
  };
  renderers.pick = (s) => {
    const box = el('div', { class: 'grid' });
    s.items.forEach((item, i) => {
      const label = box.appendChild(el('label', { class: 'card' }));
      const input = label.appendChild(el('input', { type: 'radio', name: `pick-${s.what}` }));
      if (i === 0) input.checked = true;
      input.addEventListener('change', () => (pick[s.what] = i + 1));
      if (item.path) label.appendChild(el('img', { src: fileUrl(item.path), style: 'width:100%' }));
      label.appendChild(el('div', {}, item.text || ''));
    });
    return box;
  };
  renderers.drags = () => {
    const box = el('div', { class: 'card' });
    const button = box.appendChild(
      el('button', { type: 'button', class: 'changes' }, 'This drags (mark the current moment)'),
    );
    const list = box.appendChild(el('div', { class: 'muted' }, 'No moments marked.'));
    button.addEventListener('click', () => {
      const video = document.querySelector('video');
      if (!video) return;
      drags.push(Math.round(video.currentTime * 10) / 10);
      list.textContent = `Marked: ${drags.map((t) => t.toFixed(1) + ' s').join(', ')}`;
    });
    return box;
  };
  renderers.save = () => {
    const box = el('div', { class: 'card' });
    const button = box.appendChild(
      el('button', { type: 'button', class: 'approve' }, 'Save my ratings and show the score'),
    );
    const out = box.appendChild(el('pre', { class: 'muted' }));
    button.addEventListener('click', async () => {
      const res = await fetch(`/gate/${encodeURIComponent(data.gate)}/ratings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pin: document.getElementById('pin').value,
          ratings: ratings.long,
          shorts: ratings.shorts,
          drags,
          pick,
        }),
      });
      const body = await res.json().catch(() => ({}));
      out.textContent = res.ok
        ? [
            `Score ${body.total} — ${body.releasable ? 'ready to release' : 'not releasable yet'}`,
            ...(body.explanation || []),
          ].join('\n')
        : `Not saved: ${body.error || res.status}`;
    });
    return box;
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
