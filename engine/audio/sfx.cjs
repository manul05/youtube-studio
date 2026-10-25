'use strict';

const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { ffmpegPath } = require('../util/proc.cjs');
const { libraryFile, sfxIndex } = require('./library.cjs');
const {
  listSchedule,
  timelineSchedule,
  compareSchedule,
} = require('../../styles/base/components/data.cjs');

const RATE = 48000;
const BLOCK_SEC = 10;

/** Sound cues tied to what appears on screen. Times are seconds from the start of the video. */
function sfxEvents(plan) {
  const events = [];
  plan.beats.forEach((beat, index) => {
    const start = beat.startFrame / plan.fps;
    const seconds = beat.frames / plan.fps;
    const f = beat.fields || {};
    if (index > 0 && ['art-tour', 'stock', 'chapter'].includes(beat.type))
      events.push({ t: start, kind: 'whoosh' });
    if (beat.type === 'stat') events.push({ t: start + 1.2, kind: 'hit' });
    if (beat.type === 'document') events.push({ t: start + 0.1, kind: 'paper' });
    if (beat.type === 'list' && f.items) {
      for (const t of listSchedule(f.items, seconds)) events.push({ t: start + t, kind: 'click' });
    }
    if (beat.type === 'timeline' && f.events) {
      for (const t of timelineSchedule(f.events, seconds))
        events.push({ t: start + t, kind: 'click' });
    }
    if (beat.type === 'compare' && f.left && f.right) {
      for (const t of compareSchedule(f, seconds)) events.push({ t: start + t, kind: 'click' });
    }
  });
  return events;
}

function prng(seed) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff - 0.5;
  };
}

/** Built-in sounds (mono Float32 at 48 kHz) for kinds without a library file. */
function synth(kind) {
  const len = Math.round(RATE * { whoosh: 0.6, hit: 0.5, click: 0.05, paper: 0.25 }[kind]);
  const out = new Float32Array(len);
  const noise = prng(kind.length * 97);
  let lp = 0;
  for (let i = 0; i < len; i += 1) {
    const x = i / len;
    const t = i / RATE;
    if (kind === 'whoosh') {
      const cutoff = 0.02 + 0.25 * Math.sin(Math.PI * x);
      lp += cutoff * (noise() - lp);
      out[i] = lp * Math.sin(Math.PI * x) * 3;
    } else if (kind === 'hit') {
      const f = 70 - 25 * x;
      out[i] = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 9) * 0.9;
    } else if (kind === 'click') {
      out[i] = Math.sin(2 * Math.PI * 1500 * t) * Math.exp(-t * 90) * 0.6;
    } else {
      const v = noise();
      out[i] = (v - lp) * Math.exp(-t * 18) * 0.8;
      lp = v;
    }
  }
  return out;
}

function decodeMono(file) {
  const r = spawnSync(
    ffmpegPath(),
    ['-v', 'error', '-i', file, '-f', 'f32le', '-ac', '1', '-ar', String(RATE), '-'],
    {
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
    },
  );
  if (r.status !== 0) throw new Error(`Cannot decode sound effect ${file}`);
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4);
}

function sources() {
  const map = {};
  for (const kind of ['whoosh', 'hit', 'click', 'paper']) {
    const entry = sfxIndex().find((e) => e.kind === kind);
    map[kind] = entry ? decodeMono(libraryFile('sfx', entry.file)) : synth(kind);
  }
  return map;
}

function wavHeader(samples) {
  const h = Buffer.alloc(44);
  const bytes = samples * 4; // stereo 16-bit
  h.write('RIFF', 0);
  h.writeUInt32LE(36 + bytes, 4);
  h.write('WAVE', 8);
  h.write('fmt ', 12);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(2, 22);
  h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 4, 28);
  h.writeUInt16LE(4, 32);
  h.writeUInt16LE(16, 34);
  h.write('data', 36);
  h.writeUInt32LE(bytes, 40);
  return h;
}

/** Write the effects track block by block (bounded memory), each cue at gainDb. */
function renderSfxTrack(events, totalSec, dest, { gainDb = -18 } = {}) {
  const total = Math.round(totalSec * RATE);
  const gain = 10 ** (gainDb / 20);
  const sounds = sources();
  const fd = fs.openSync(dest, 'w');
  try {
    fs.writeSync(fd, wavHeader(total));
    const block = BLOCK_SEC * RATE;
    for (let start = 0; start < total; start += block) {
      const n = Math.min(block, total - start);
      const mix = new Float32Array(n);
      for (const e of events) {
        const sound = sounds[e.kind];
        const at = Math.round(e.t * RATE);
        if (at >= start + n || at + sound.length <= start) continue;
        for (let i = Math.max(0, at - start); i < n && i + start - at < sound.length; i += 1) {
          mix[i] += sound[i + start - at] * gain;
        }
      }
      const pcm = Buffer.alloc(n * 4);
      for (let i = 0; i < n; i += 1) {
        const v = Math.max(-1, Math.min(1, mix[i])) * 32767;
        pcm.writeInt16LE(Math.round(v), i * 4);
        pcm.writeInt16LE(Math.round(v), i * 4 + 2);
      }
      fs.writeSync(fd, pcm);
    }
  } finally {
    fs.closeSync(fd);
  }
  return dest;
}

module.exports = { sfxEvents, renderSfxTrack, synth, decodeMono, RATE };
