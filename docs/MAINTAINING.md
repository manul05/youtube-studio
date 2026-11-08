# Maintaining the studio

For any agent (Codex, Antigravity, Cursor, Claude Code) asked to fix a crash or change how the studio works. Making a video does not need this file: follow `AGENTS.md`.

## When to change code

Only when a studio command **crashes** (a stack trace instead of a list of issues), gives a **clearly wrong result**, or the owner **asks for a change**. A command that lists issues is working: fix the project (brief, research, script, beats, images), not the code.

## The rules

1. **Test first.** Write a test in `tests/` that fails because of the problem, run it and see it fail, then fix the code until it passes. A fix with no failing test first is not done.
2. **Never weaken a check to pass.** Do not lower a threshold, delete or skip a test, loosen a regex, or catch-and-ignore an error to get a video through. The owner's quality bar is the point of the studio.
3. **Never touch the owner's controls** unless the owner asks in their own words: the release bar (`RELEASE_BAR` in `engine/score/aggregate.cjs`: 95 / 80% / 59), PIN and signing code (`engine/review/pin.cjs`, `approvals.cjs`), `config/pin.json`, `approvals/`, `outputs/score/owner.json`, and `config/qc.json` limits.
4. **Run everything before committing:** `npm test` (about 3–5 min) and `npm run lint` must pass. If you changed anything in `engine/`, `styles/` or `tools/`, also run `npm run test:e2e` (about 10 min: an English and a Hindi video from idea to release; both must pass).
5. **Commit** with a message that says what was wrong and what changed. Record any decision the owner should know about as one line in `docs/BUILD_DECISIONS.md`.
6. **Format** with `npx prettier --write <files>` (print width 100). Match the surrounding code: CommonJS, small functions, a short doc comment on each exported function.

## How it fits together

- `tools/studio.cjs` is the command line; each area adds its commands in `engine/<area>/commands.cjs`. `package.json` maps `npm run <command>` to it.
- `engine/steps.cjs` lists every step and review stop in order, with each step's inputs and outputs. `engine/next.cjs` decides the next step from content hashes (`engine/stamps.cjs`): editing an input makes that step and everything after it stale.
- Areas, in pipeline order:

| Folder | Does |
|---|---|
| `engine/words/` | brief, research ledger, outline, script checks |
| `engine/voice/` | Gemini TTS (`gemini.cjs`), synthesis and retakes, rate-limit resume (exit 75) |
| `engine/align/` | faster-whisper (`whisper_words.py` in `.venv`), word matching for English/Hindi (`match.cjs`, `phonetic.cjs`, `numbers.cjs`), paragraph cuts, voice checks |
| `engine/captions/` | caption phrasing, reading-speed rules, SRT/VTT |
| `engine/plan/` | beat types (`beat-types.cjs`) and compiling `script.json` beats into `beats.json` |
| `engine/assets/` | AI image prompts, image checks, stock photos (`photos.cjs`, `licences.cjs`), stock video (`stock.cjs`), asset ledger |
| `engine/render/` + `styles/` | frame drawing (canvas → FFmpeg), per-chapter cache, storyboard; style packs live in `styles/<id>/` |
| `engine/audio/` | music choice, sound effects, mix and loudness |
| `engine/assemble/`, `engine/shorts/`, `engine/package/` | master video, Shorts, thumbnails, description, captions files |
| `engine/qc/`, `engine/score/` | measured checks, Gemini review, score |
| `engine/review/` | local review server, PIN, signed approvals |
| `engine/release.cjs` | the owner's release command |

## Tests

- `npm test` — unit and integration tests (`tests/*.test.cjs`), no network.
- `npm run test:e2e` — full English and Hindi runs with a simulated voice and recogniser.
- `npm run test:live` — real Gemini TTS and real faster-whisper; needs `GEMINI_API_KEY`, uses free-tier quota.
- `npm run doctor` — checks tools, fonts and keys.

## Planned work

- `docs/FACE_VIDEO_PLAN.md` — presenter mode: the owner's own voice (Phase A) and face on camera (Phase B). Build it task by task in that order, only when the owner asks.

## Known open items

See `docs/BUILD_DECISIONS.md` → "Deferred minor issues". Fix them only when the owner asks.

## Windows notes

The studio runs on Windows with Git Bash or PowerShell. FFmpeg and Node must be on PATH. Python packages live in `.venv` (`.venv\Scripts\python -m pip install -r requirements.txt`); never install them globally.
