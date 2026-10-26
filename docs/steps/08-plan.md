# 08 · Plan the visuals

**Purpose:** decide what is on screen for every moment, anchored to the spoken words.

**Input:** `script.json` (you fill each paragraph's `beats`). **Command:** `npm run plan -- <project>`. **Output:** `beats.json` (generated — never edit it).

## Beats

Each paragraph gets a list of beats: `{ "type": "art-focus", "atWord": 0, …fields }`. The first beat has `atWord: 0`; each later beat starts 0.2 s before word number `atWord` (counting the paragraph's spoken words from 0) and lasts until the next beat.

Run `npm run beats` for every type with its fields and limits. In short:

| Type | Use it for |
|---|---|
| `art-focus` | One AI image (`imagePrompt`) or real photo (`photoQuery`); the camera moves to `focus` [x, y, w, h]. ≤ 6 s. |
| `art-tour` | One AI image or real photo, 2–4 `crops` in turn. Longer passages. |
| `stock` | Real-world footage from Pexels/Pixabay (`query`). |
| `kinetic` | A key phrase as big type, revealed on the voice. |
| `quote` | An attributed quotation with `speaker`, `source`, `date` (needs a claim). |
| `stat` | One number with `label` and `source` (needs a claim). |
| `compare` | Two sides, points revealed in pairs. |
| `timeline` | Dated `events` revealed along an axis (needs a claim). |
| `map` | `region` india/world with `highlight`, `pins`, `route`. |
| `document` | A recreated document with highlighted lines (needs a claim). |
| `list` | 2–4 `items` revealed as spoken. |
| `chart` | A bar or line `series` with `source` (needs a claim). |

Chapter cards and the endcard are added automatically.

## Rules that make it watchable

- A meaningful change at least every 6 s: beats without internal reveals may last at most 6 s. Long passages → `art-tour`, `list`, `compare`, `kinetic`.
- Vary the types; never three of the same type in a row.
- Factual beats (`quote`, `stat`, `timeline`, `document`, `chart`) need `"claim": "CLxx"`.
- AI art of real events: `"illustration": true`.
- `imagePrompt`: describe the scene, composition and subject; no photorealistic real people; no text in the image. The style's look is added automatically.
- `photoQuery` (instead of `imagePrompt` on `art-focus` / `art-tour`): a real photo from Wikimedia Commons or Pixabay. Use it for real people, buildings, places and documented events — e.g. `"Supreme Court of India building"`. Keep the query short and concrete. One of the two per art beat, never both.
- `stock` beats need a Pexels or Pixabay key (`npm run doctor`); without one, use art beats.
- Put the key visual exactly when the narrator says the key word (`atWord`).

## Done when

`npm run plan` passes.
