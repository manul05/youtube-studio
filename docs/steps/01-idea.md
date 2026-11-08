# 01 · Idea (then stop 1)

**Purpose:** decide what the video promises, how it opens, how it looks, and which channel it is for — before any research or writing.

**Input:** the owner's filled-in `prompts/DAILY.txt`.
**Output:** `brief.json`. **Command:** `npm run brief:check -- <project>`. **Then:** stop 1 (`npm run review -- <project>`).

## Fill in brief.json

| Field | What good looks like |
|---|---|
| `topic`, `angle` | The angle is the specific question the video answers, not the topic restated. |
| `audience`, `promise` | Who it is for, and what they will understand by the end. |
| `language`, `captionScript` | `en`/`hi`/`hinglish`; `latin` or `deva`. Hinglish must stay in one script throughout. |
| `channel` | A folder in `library/channels/`. |
| `lengthTargetMin` | Long-form length in minutes (8–20 typical). |
| `titles` (3) | ≤ 60 characters each; three genuinely different angles; no promise the video does not pay off. |
| `thumbTexts` (3) | ≤ 4 words, short words (≤ 7 letters each reads best), never the same as a title. |
| `mood` | Music moods, e.g. `["documentary", "tense"]`. |
| `hook` | The first 30 seconds written out: a concrete moment, a tension, and why to keep watching. No "In this video…". |
| `style` | `npm run style:suggest -- <project>` gives three fits; show the owner `styles/gallery.html`. `main` is a pack id; `accents` maps up to two beat types to accent packs, e.g. `{"quote": "kinetic"}`. |
| `formats` | `["long", "short"]` unless the owner says otherwise. |
| `voice` (optional) | `{ "name": "…", "style": "…" }` to override the channel's default voice. |
| `presenter` (optional) | `{ "mode": "voice" }` when the owner records their own voice (teleprompter, `recordings/`); leave it out for the AI voice. `"face"` (on camera) is not built yet — see `docs/FACE_VIDEO_PLAN.md`. |

## Done when

`brief:check` passes, then the owner approves stop 1. If they request changes, read `approvals/gate_idea.changes.json`, edit the brief, re-run the check.

## Common failures

- Thumbnail text too long — the thumbnail check later fails if text cannot be 18% of the height. Prefer one or two short words.
- A style id that does not exist — run `npm run styles` to see the packs.
