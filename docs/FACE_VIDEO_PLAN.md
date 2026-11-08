# Face video mode — design and build plan

**Status:** planned, not built. Written 2026-11-08 for any agent (Codex, Antigravity, Cursor, Claude Code) to build later. Read `AGENTS.md` and `docs/MAINTAINING.md` first; every rule there applies (failing test first, never weaken a check, `npm test` + `npm run lint` + `npm run test:e2e` before each commit).

## Goal

Let the owner make presenter-led videos in the style of Dhruv Rathee: the owner speaks to camera for part of the video, and the studio's existing graphics (art, photos, maps, charts, quotes, kinetic text, stock) take over for the rest — cut on the spoken word, at the same 95+ quality bar.

## Non-goals

- AI avatars or face/voice cloning (paid, needs disclosure, lower trust). Never.
- Live streaming, multi-camera editing, colour grading of the owner's footage beyond a light normalise.
- Changing anything about today's AI-voice videos: they must keep working exactly as now (the existing e2e test stays green).

## Decisions the owner makes first

Ask the owner these before Task A1, and record the answers in `docs/BUILD_DECISIONS.md`:

1. **Phase A only, or A then B?** (A = own voice, no face — about 2–3 days of agent work. B = face on camera — about 1–2 weeks more.)
2. **Recording kit:** phone or camera, and which microphone. Recommendation: phone or camera recording **4K 30 fps landscape** (so Shorts can be cropped to 9:16 sharply) and a clip-on lavalier mic.
3. **Recording unit:** one file per chapter (recommended) or one file for the whole video.
4. **Ad-libs:** may the owner say things that are not in the script? Recommendation: allowed, but every unscripted sentence is listed at stop 3 for the owner to keep or cut, because it has no source in the research ledger.
5. **Thumbnail face:** will the owner supply a cut-out PNG of their face (transparent background), or should the studio remove the background locally (free `rembg`, ~170 MB model download)?

## How it fits the current studio

A new brief field selects the mode:

```json
"presenter": { "mode": "ai" }            // today's videos (default when absent)
"presenter": { "mode": "voice" }         // Phase A: owner's recorded voice, no face
"presenter": { "mode": "face", "cropX": 0.5 }   // Phase B: owner on camera; cropX = face centre for 9:16
```

Everything from research to script, and from plan to release, stays. What changes:

| Step (from `engine/steps.cjs`) | AI mode (today) | voice / face mode |
|---|---|---|
| `voice-sample` + `gate:voice` | Gemini sample of names and hooks | Owner records a 30 s test; studio checks level, noise, clipping; owner approves at stop 3 |
| `voice` | Gemini TTS per chapter | Owner records each chapter from the teleprompter page; `npm run recording:import` cleans and imports it |
| `align` | match script to TTS | match script to the recording; keep the **last** take of a repeated sentence; cut long pauses and mistakes (jump cuts); list ad-libs |
| `plan` | beats on words | + `presenter` beats (face mode) and an optional `pip` corner on other beats |
| `render` | graphics | + owner footage from the edited chapter video |
| `qc` / score | as now | + lip-sync check; presenter shots count as motion up to their limit; D = owner's own delivery |
| thumbnails | AI base image | owner's cut-out face composited on the subject side (face mode) |

## Phase A — the owner's own voice (no face)

### A1. Mode switch in the brief and steps

- **Files:** `engine/words/brief.cjs`, `engine/steps.cjs`, `engine/next.cjs`, tests in `tests/words.test.cjs`, `tests/next.test.cjs`.
- `briefIssues` accepts `presenter.mode` ∈ `ai | voice | face` (absent = `ai`); anything else is an issue.
- Steps keep their ids. Let a step's command depend on the project: `command` may be a function `(project) => string`. In `voice` / `face` mode, `voice-sample` → `recording:check`, `voice` → `recording:import`. `npm run next` prints the right one.
- **Tests:** `brief rejects an unknown presenter mode`; `next names recording:import for the voice step in voice mode and voice in ai mode`.

### A2. Teleprompter page

- **Files:** `engine/review/pages/teleprompter.html` (+ registration in `engine/review/register-pages.cjs`), `engine/words/pages.cjs`.
- `npm run review -- <project>` gains a `/teleprompter` page: one chapter at a time, large text (spoken text from `spokenText()`, so pronunciations are shown), adjustable scroll speed, Devanagari font for Hindi. Read-only; no PIN.
- **Test:** `the teleprompter page shows each chapter's spoken text in order` (page data contains every paragraph's spoken text; chapters in script order).

### A3. Recording check (replaces the voice sample)

- **Files:** `engine/presenter/recording-check.cjs` (new), `engine/presenter/commands.cjs` (new, `recording:check`).
- Input: `recordings/sample.(wav|m4a|mp3|mp4|mov)` in the project folder. Decode with FFmpeg. Report: integrated loudness, true peak, noise floor (quietest 10% of 50 ms windows), clipping runs (reuse `clippedRuns` from `engine/align/voice-check.cjs`), sample rate, and for video: resolution and frame rate.
- Pass rules (put limits in `config/qc.json` under new keys, owner-approved values): noise floor ≤ −50 dBFS, no clipping, sample rate ≥ 44.1 kHz; face mode: ≥ 1920×1080, 25–60 fps.
- Writes `work/voice/samples/` files so the existing stop-3 page can play them.
- **Tests:** `a clean test recording passes`; `a clipped recording is rejected with the clip count`; `a noisy recording reports its noise floor` (fixtures generated with FFmpeg `sine` + `anoisesrc`).

### A4. Import and clean the chapter recordings

- **Files:** `engine/presenter/import.cjs` (new), `recording:import` in `engine/presenter/commands.cjs`.
- Input: `recordings/c01.*`, `recordings/c02.*`, … (one per chapter, named by chapter id; reuse `chapterId()` validation from `engine/voice/synthesize.cjs`).
- Audio chain (FFmpeg, free): `highpass=f=80`, `afftdn=nf=-25`, gentle `acompressor`, then convert to 48 kHz stereo PCM → `work/voice/chapters/<cid>.wav` (the same place TTS writes, so `align` and everything after it work unchanged).
- Face mode also writes `work/presenter/<cid>.mp4`: constant 30 fps, yuv420p, BT.709, the original resolution kept (needed for the 9:16 crop), audio removed.
- Each output gets a `.json` beside it with the source file's sha256, like `synthOnce` does, so re-import is skipped when unchanged.
- **Tests:** `import writes a 48 kHz chapter wav for each recording`; `a missing chapter recording is reported by chapter id`; `re-import of an unchanged recording is skipped`.

### A5. Takes, jump cuts and ad-libs

The hardest task. Real speech contains restarts ("The court — the Supreme Court said…"), repeated sentences and long pauses.

- **Files:** `engine/presenter/takes.cjs` (new), `engine/align/split.cjs` (call it before splitting), tests in `tests/presenter.test.cjs`.
- Algorithm (per chapter):
  1. Recognise the whole chapter (existing `runWhisper`).
  2. For each script sentence, find **every** occurrence in the recogniser words (slide a window of the sentence's length ±30 %, score with the existing phonetic matching from `engine/align/match.cjs`; an occurrence needs ≥ 70 % of its matchable words matched). Keep the **last** complete occurrence.
  3. Build an edit list (EDL): the kept sentence spans in script order, each padded 0.12 s; gaps between kept spans longer than 0.35 s are cut to 0.35 s.
  4. Recogniser words not inside any kept span and longer than 3 words in a row = an **ad-lib**. Keep them only if the owner allowed ad-libs (decision 4), placing them where they were said; list each with its text and time.
  5. Write the edited chapter audio (and video in face mode) by concatenating the EDL segments with 10 ms audio fades: `work/voice/chapters/<cid>.wav` is replaced by the edited version; the raw import stays at `work/presenter/raw/<cid>.*`.
  6. Write `work/presenter/<cid>.edl.json` and `work/presenter/<cid>.adlibs.json`.
- Then the existing `splitChapter` aligns the edited audio exactly as it does TTS today.
- Ad-libs appear on the stop-3 page with keep / cut buttons; a kept ad-lib that states a fact needs a claim, like any sentence (the agent adds it to `research.json` and `script.json`).
- **Tests (use the real Hindi/English recogniser fixture style from `tests/align.test.cjs`):** `a sentence said twice keeps the second take`; `a restart inside a sentence is cut`; `pauses longer than 0.35 s are shortened to 0.35 s`; `unscripted words are listed as an ad-lib with their time`; `the edited chapter is shorter than the raw one by exactly the cut time (±20 ms)`.

### A6. Score and rules for a real voice

- **Files:** `engine/score/rubric.cjs`, `engine/score/pages.cjs`, `docs/QUALITY_RUBRIC.md`, `docs/steps/05-voice-sample.md`, new `docs/steps/06-recording.md`.
- Category D becomes "Delivery" in voice/face mode (owner rates their own energy and clarity; the AI review also rates pace from the transcript). The weights and the release bar do **not** change.
- The playbook explains recording: quiet room, mic 15–20 cm away, record a chapter in one go, if you stumble pause one second and repeat the whole sentence (the studio keeps the last take).
- **Test:** `voice mode labels D as Delivery and keeps every weight`.

### A7. End-to-end test for voice mode

- **File:** `tests/e2e/e2e.test.cjs`: add `a voice-mode project goes from idea to a released 95+ package`, with a synthetic recording (the existing fake speech generator) that contains one repeated sentence and one long pause; assert the release package exists, the repeat was cut, and the AI-mode e2e still passes.

**Phase A is done when** all of the above pass and the owner has released one real own-voice video.

## Phase B — face on camera

### B1. Presenter beats

- **Files:** `engine/plan/beat-types.cjs`, `engine/plan/compile.cjs`, `docs/steps/08-plan.md`.
- New beat type `presenter`: fields `{ framing: "wide" | "tight", side: "center" | "left" | "right" }`, `minSec 1.5`, `maxSec 12`, `internalReveals: true` (a speaking face is moving). The compiler alternates `wide`/`tight` automatically between consecutive presenter beats (a "punch-in" so jump cuts look intentional).
- Any graphic beat may add `"pip": "bottom-right" | "bottom-left"`: the owner's face in a 30 %-width rounded box in that corner, kept inside the safe area.
- Planning rule (playbook + `planIssues`): in face mode, a presenter shot at least every 60 s and no more than 50 % of the runtime on presenter beats; never three presenter beats in a row.
- **Tests:** `presenter beats over 12 s are flagged`; `consecutive presenter beats alternate wide and tight`; `a pip outside the safe area is rejected`.

### B2. Render the owner's footage

- **Files:** `styles/base/components/presenter.cjs` (new; packs may override), `engine/render/chapter.cjs` (`loadBeatAssets`), `engine/render/video-source.cjs` (reuse as is).
- A presenter beat opens `work/presenter/<cid>.mp4` (the edited chapter video) with `openVideoSource`, at `inSec` = the beat's start in the chapter's edited timeline (paragraph start + beat offset − the paragraph's `lead`). `wide` = full frame; `tight` = 1.18× centred on `presenter.cropX`; the main style's lower-third shows the owner's name in the first presenter beat of the video.
- `pip` draws the same frame scaled into its corner over the graphic beat.
- Add presenter clips to the chapter render signature (`chapterSignature`) by sha.
- **Tests:** `a presenter beat shows the footage frame at the matching time` (fixture: FFmpeg `testsrc` video with a burned-in frame counter; check the counter at three times); `tight framing crops around cropX`; `pip stays inside the safe area`.

### B3. Lip-sync check

- **Files:** `engine/qc/lipsync.cjs` (new), `engine/qc/run.cjs`.
- For each chapter, cross-correlate the master's audio with the edited presenter audio over three 10 s windows; the offset must be ≤ 40 ms (hard failure above 80 ms, category J).
- **Test:** `a 120 ms audio offset is a hard failure; a 20 ms offset passes` (fixtures: shift the fixture audio with `adelay`).

### B4. Static-interval rule for presenter shots

- **Files:** `engine/qc/run.cjs` (`quietWindows` sibling), `engine/qc/static-interval.cjs`.
- Presenter windows are treated as moving for up to their `maxSec`, because the change detector sees little motion in a talking head. Longer presenter holds are still flagged.
- **Test:** `a 10 s presenter shot is not a static interval; a 14 s one is`.

### B5. Shorts from face footage

- **Files:** `engine/shorts/build.cjs`.
- Presenter beats in Shorts crop 9:16 around `presenter.cropX` from the full-resolution footage. With 4K source this is sharp; with 1080p source the crop is 608×1080 upscaled ×1.78 — refuse below 1440 px source height with a clear message ("record in 4K for Shorts, or the Short will use graphics only").
- **Test:** `a 1080p source makes Shorts use graphics only, with a message`.

### B6. Face thumbnails

- **Files:** `engine/package/thumbnails.cjs`, `engine/assets/ledger.cjs` (origin `owner-supplied`), `docs/steps/13-package.md`.
- Optional `assets/images/thumb_face_1..3.png` (transparent PNG, owner's face cut out): composited on the subject side at 70 % of the thumbnail height, a 6 px white outline for separation; the headline stays on the free side. If decision 5 chose `rembg`, add `npm run face:cutout -- <project> <photo>` (Python in `.venv`, `pip install rembg`; model downloads once).
- The existing contrast and 18 % text-size checks still apply.
- **Tests:** `a face cut-out is placed on the subject side and the headline on the other`; `a face PNG without transparency is rejected`.

### B7. End-to-end test for face mode

- Synthetic face footage: FFmpeg `testsrc2` 3840×2160 with the fake speech as its audio, including one repeated sentence. Assert release, lip-sync ≤ 40 ms, at least one presenter and one pip beat in the master, Shorts at 1080×1920.

**Phase B is done when** all of the above pass and the owner has released one real face video.

## Risks to watch

- **Takes detection on Hindi/Hinglish:** whisper's Devanagari spelling drifts; the phonetic matcher handles single words, but sentence-level occurrence search must be tested on real Hindi recordings before relying on it.
- **Long recordings:** a 6-minute chapter is ~350 MB of 4K footage; keep raw files out of git (add `projects/*/recordings/` and `work/presenter/` to `.gitignore`) and process one chapter at a time.
- **Audio/video drift** from phones recording variable frame rate: always convert to constant 30 fps at import (A4) before cutting.
- **Ad-libbed facts** bypass the research ledger unless stop 3 makes the owner keep or cut each one.

## Owner recording checklist (goes into `docs/steps/06-recording.md`)

1. Quiet room, soft furnishings, phone or camera at eye level, light in front of you.
2. Mic clipped 15–20 cm below your mouth; 4K 30 fps landscape; check focus is on your face.
3. Open the teleprompter (`npm run review -- <project>` → Teleprompter). Record one chapter per file.
4. Stumbled? Pause one second and say the whole sentence again; the studio keeps the last take.
5. Save files as `projects/<project>/recordings/c01.mp4`, `c02.mp4`, … Then tell the agent "recordings are in".
