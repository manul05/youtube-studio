# Style pack guide

A style pack is a folder in `styles/<id>/` that changes how every beat looks. It works with any topic and both languages. A new pack is selectable only after `npm run style:check -- <id>` passes.

## Files

- `style.json` — the look:
  - `id`, `name`, `role` (`main`, `accent` or `shorts`), `bestFor` (topic tags for suggestions), `mixesWith`, `formats` (`long`, `short`)
  - `palette`: `bg`, `surface`, `ink`, `muted`, `accent`, `accent2` (ink must have ≥ 4.5:1 contrast on bg and surface)
  - `fonts`: `display`, `body`, `serif`, `mono`, `deva` — font roles: Sans, SansBold, Serif, SerifBold, Mono, Deva, DevaBold, Condensed; optional `thumb`
  - `captionStyle`, `motion`, `transition` (`crossfade` or `cut`), `tagCorner`, `musicMoods`
  - `imagePromptSuffix` — appended to every image prompt so AI artwork matches the pack
  - `stockGrade`: `saturate`, `contrast`, `brightness`, `tint`, `tintAlpha`, `vignette`, `grain`
  - `fallback` — beat types this pack does not redraw (they use `styles/base`). Every other type must be in `components.cjs`.
  - `qc.changeThreshold` — written by `style:check` (calibration); do not edit.
- `components.cjs` — `module.exports = { quote(ctx, beat, t, assets, env) { … } }` for the beat types you redraw.

## Drawing rules

- Draw text only with `drawText` from `engine/render/text.cjs` (it wraps, shrinks, switches to Devanagari, logs text for QC and checks the safe area). Use helpers from `styles/base/components/shared.cjs`.
- Everything is a function of `t` (seconds into the beat) — no randomness, no state between frames.
- Read colours and fonts from `env.style.meta`, sizes through `unit(env)` (works at 1920×1080 and 1080×1920).
- Keep text inside `ctx.__safe`. Long-form keeps the bottom 12% free for YouTube captions.
- Beats that last longer than 6 s must reveal something new every few seconds.
- Never draw debug text, ids, counters or timecodes.

## Steps for a new style

1. Copy a similar pack (`editorial`, `map-doc`, `evidence`, `kinetic`, `vertical-captions`) to `styles/<new-id>/`.
2. Change `style.json`; redraw the beat types that define the look (often `chapter`, `quote`, `stat`, `kinetic`), list the rest in `fallback`.
3. `npm run style:check -- <new-id>`; open `styles/<new-id>/check.jpg` and fix anything crowded, small or ugly. Repeat until it passes and looks right.
4. `npm run style:preview -- <new-id>`, then `npm run styles` to add it to the gallery.

Reference images (videozero.ai styles, the Antigravity 35-style renders) are for looking at only — never copy their code or assets.
