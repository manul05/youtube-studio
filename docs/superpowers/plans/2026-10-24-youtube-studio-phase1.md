# Claude YouTube Studio: Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a topic-, style- and language-agnostic YouTube production pipeline in `F:\YouTube\Test Project\Claude`. Any agent (Antigravity, Codex, Claude Code) drives it through one `next` command, and it releases only videos scoring 95+ on the rubric.

**Architecture:** A CommonJS Node 24 CLI (`tools/studio.cjs`) runs a fixed step registry. Each step writes a hash stamp, and human gates are PIN-signed approvals written by a local review server. Frames are drawn with `@napi-rs/canvas` and piped to FFmpeg per chapter, in isolated processes. Voice comes from Gemini TTS over REST, with word timings from `faster-whisper` matched to the known script. QC, an independent Gemini review and the owner's ratings feed one score aggregator that gates `release`.

**Tech Stack:**
- Node 24.16 (CommonJS `.cjs`), `@napi-rs/canvas` 0.1.100, `node:test`, Prettier.
- FFmpeg/FFprobe 8.1.2.
- Python 3.14 with `faster-whisper==1.2.1` (alignment only).
- Gemini API (REST via Node `fetch`), Pexels and Pixabay REST APIs.

**Spec:** `docs/DESIGN.md` (approved 2026-10-24). Section references below (§n) point there.

## Global Constraints

- Platform: Windows 11; paths contain spaces and must work from `F:\YouTube\Test Project\Claude` (FFmpeg concat manifests must escape `'` and `\`).
- RAM budget about 2 GB: one isolated child process per chapter; stream frames to FFmpeg; never buffer a whole video.
- Video: long-form 1920×1080, Shorts 1080×1920, **30 fps**, `libx264` CRF 18, `yuv420p`, BT.709 tagged, AAC 48 kHz stereo, `+faststart`. No NVENC.
- Loudness: two-pass `loudnorm` to −14 LUFS integrated; accept −15 to −13 LUFS; true peak ≤ −1.0 dBTP, measured again after AAC encoding.
- Voice: never time-stretched. Unintended silence > 1.2 s is a hard failure; voice:check flags silences > 0.6 s inside a paragraph. English pace 145–165 words per minute; Hindi/Hinglish pace calibrated per channel (±10% band).
- Pacing: long-form longest static interval ≤ 6 s (target median change interval 3–5 s); Shorts ≤ 3 s (median 1.5–3 s).
- Captions:
  - Long-form: SRT/VTT only, not burned in; layouts keep the bottom 12% free of essential text.
  - Shorts: captions burned in.
  - All cues: ≤ 2 lines; ≤ 42 characters per line for Latin (Devanagari limit by rendered width); ≤ 20 characters/s; minimum 0.7 s; no overlaps; within 100 ms of aligned words.
- Alignment: more than 5% interpolated words in any paragraph fails the step.
- Images: ≥ 1920 px on the long edge, correct aspect. No photorealistic depiction of a real, identifiable person. Illustrations of real events carry an "Illustration" tag.
- Packaging: titles ≤ 60 characters, 3 titles, 3 thumbnails. Thumbnail text ≤ 4 words, text height ≥ 18% of thumbnail height at 168×94 and at 320×180, contrast ≥ 4.5:1, text differs from title.
- Scoring:
  - Release needs a total ≥ 95, every category ≥ 80% of its weight, and zero hard failures. Any hard failure caps the score at 59.
  - Owner levels: Excellent 1.0, Good 0.9, OK 0.75, Weak 0.5, Bad 0.
  - Subjective categories take the lower of the AI review and the owner rating.
- Shorts: 3 per video, 30–59 s, own rubric (§9.5). A failing Short is dropped, not blocking.
- Endcard: 20 s. Chapter cards: 2–3 s.
- Cost: no paid API calls. Gemini free tier only (TTS plus review). Images come from the driving agent or the owner. Any paid path must be refused with a message.
- Secrets live in `.env` (git-ignored): `GEMINI_API_KEY`, `PEXELS_API_KEY`, `PIXABAY_API_KEY`. Model IDs live in `config/models.json` (TTS `gemini-3.8-flash-tts`).
- Code style: Prettier, `printWidth` 100; no minified or golfed modules; one responsibility per file.
- Never render debug text (frame counters, layout IDs, shot numbers) in any release frame.
- Fonts: Latin roles from Windows fonts (Segoe UI / Georgia / Consolas). Devanagari uses **Nirmala UI** (`C:\Windows\Fonts\Nirmala.ttc`, shaping verified).

## Review Focus

1. **Hindi and Hinglish text:** Codex's `canonical()` keeps only `[a-z0-9]`, so Devanagari collapses to an empty string. Expected: matching, captions and width checks work for Devanagari, Roman Hinglish and mixed tokens. *Tests: Task 7 and Task 8.*
2. **Gemini free-tier rate limit (HTTP 429) mid-video:** expected: completed chapters stay cached, the run exits with "resume later", and the next run synthesises only the missing chapters. *Test: Task 6.*
3. **Owner-dropped images that are wrong:** for example a 1024×1024 PNG, a JPEG renamed to `.png`, a WebP, or a missing file. Expected: `images:check` names each file with the exact problem, and `next` stays on the assets step. *Test: Task 14.*
4. **Paths with spaces or apostrophes** in concat manifests and FFmpeg arguments. Expected: assembly works under `F:\YouTube\Test Project\Claude\projects\it's-a-test`. *Test: Task 16.*
5. **Editing an upstream file after a gate was approved** (for example the script after stop 4). Expected: every downstream stamp and gate turns stale, and `next` routes back to the earliest stale step. *Test: Task 3.*

---

## Milestone 0: Foundation

### Task 1: Repository scaffold and shared utilities

**Files:**
- Create: `package.json`, `.gitignore`, `.prettierrc.json`, `requirements.txt`, `engine/util/files.cjs`, `engine/util/proc.cjs`, `engine/util/timecode.cjs`, `engine/util/fonts.cjs`, `tools/studio.cjs`
- Test: `tests/util.test.cjs`

**Interfaces:**
- Produces:
  - `files.cjs`: `ROOT`, `rootPath(...parts) → string`, `readJson(p)`, `writeJson(p, obj)` (pretty, trailing newline, atomic via `.partial` then rename), `sha256File(p) → hex`, `sha256Text(s) → hex`, `ensureDir(p)`.
  - `proc.cjs`: `run(exe, args, opts) → {stdout, stderr}` (throws with stderr on non-zero), `ffmpegPath()`, `ffprobePath()` (env `FFMPEG_PATH`/`FFPROBE_PATH`, else `ffmpeg`/`ffprobe`), `probe(p) → ffprobe JSON`, `pythonPath()` (env `STUDIO_PYTHON`, then `config/local.json`, then `python`), `concatManifestLine(absPath) → string` (`file '…'` with `\` → `/` and `'` → `'\''`).
  - `timecode.cjs`: `stamp(seconds, sep='.') → 'HH:MM:SS.mmm'`.
  - `fonts.cjs`: `registerFonts() → [{role, path}]`. Roles: `Sans`, `SansBold`, `Serif`, `Mono`, `Deva`, `DevaBold`. It throws naming the missing role.
  - `tools/studio.cjs <command> [project] [--flags]`: dispatches to a command table; unknown command prints the table.

- [ ] **Step 1:** Run `git init` in `F:\YouTube\Test Project\Claude` and create `package.json`:
  - `"engines": {"node": ">=22"}`
  - dependency `@napi-rs/canvas@0.1.100`; devDependency `prettier`
  - scripts: `test` = `node --test tests/`, `format` = `prettier --write .`, `lint` = `prettier --check .`, plus one `"<cmd>": "node tools/studio.cjs <cmd>"` entry per command added in later tasks.
  - `.gitignore`: `node_modules/`, `.env`, `projects/*/work/`, `projects/*/assets/stock/_incoming/`, `config/local.json`, `config/pin.json`, `__pycache__/`, `*.partial.*`.
  - `requirements.txt`: `faster-whisper==1.2.1`.
  - Run `npm install`.
- [ ] **Step 2: Write failing tests** in `tests/util.test.cjs`:
  - `stamp(3661.2345)` equals `'01:01:01.235'`, and `stamp(0.5, ',')` equals `'00:00:00,500'`.
  - `concatManifestLine("F:\\a b\\it's.mp4")` equals `"file 'F:/a b/it'\\''s.mp4'"`.
  - `writeJson` then `readJson` round-trips, and no `.partial` file remains.
  - `registerFonts()` includes a role `Deva` whose path ends with `Nirmala.ttc`.
- [ ] **Step 3:** Run `npm test`. Expected: FAIL (modules missing).
- [ ] **Step 4:** Implement the four util modules and the CLI dispatcher skeleton (`node tools/studio.cjs help` lists commands).
- [ ] **Step 5:** Run `npm test` and `npm run lint`. Expected: PASS.
- [ ] **Step 6:** Commit with `chore: scaffold studio repo and shared utilities`.

### Task 2: Config, channels and doctor

**Files:**
- Create: `config/models.json`, `config/qc.json`, `engine/config.cjs`, `engine/doctor.cjs`, `library/channels/en-placeholder/channel.json`, `library/channels/en-placeholder/logo.png`, `library/channels/hi-placeholder/channel.json`, `library/channels/hi-placeholder/logo.png`
- Test: `tests/config.test.cjs`

**Interfaces:**
- Produces:
  - `loadEnv() → {GEMINI_API_KEY?, PEXELS_API_KEY?, PIXABAY_API_KEY?}`: parses `.env` with no dependency; existing `process.env` wins.
  - `models() → {tts: string, review: string|null}`.
  - `qc() → object` (every threshold from Global Constraints, keys named as below).
  - `channel(id) → {id, name, handle, language, captionScript: 'deva'|'latin', voice: {name, style}, musicMoods: string[], wpm: number|null, placeholder: boolean}`.
  - `doctor() → {ok, checks: [{name, ok, detail}]}`.

`config/qc.json` keys, with values exactly from the Global Constraints section:
- `lufsTarget: -14`, `lufsMin: -15`, `lufsMax: -13`, `truePeakMax: -1.0`, `voiceToMusicMinDb: 15`
- `silenceHardFail: 1.2`, `silenceInParagraphFlag: 0.6`
- `wpmEnglish: [145, 165]`, `wpmBand: 0.10`
- `staticMaxLong: 6`, `staticMaxShort: 3`, `changeThreshold: 8.0`
- `captionMaxLines: 2`, `captionMaxCharsLatin: 42`, `captionMaxCps: 20`, `captionMinDuration: 0.7`, `captionTimingTolerance: 0.1`
- `bottomSafeFraction: 0.12`, `alignMaxInterpolated: 0.05`, `imageMinLongEdge: 1920`
- `titleMaxChars: 60`, `thumbMaxWords: 4`, `thumbMinTextHeight: 0.18`, `thumbMinContrast: 4.5`, `thumbMaxEdgeDensity: 0.20`
- `releaseMin: 95`, `categoryFloor: 0.8`, `hardFailCap: 59`

**`doctor()` checks:**
- Node ≥ 22, FFmpeg and FFprobe versions, all font roles, Python plus `import faster_whisper`.
- Each key with a minimal call:
  - Gemini: `GET https://generativelanguage.googleapis.com/v1beta/models?key=…`
  - Pexels: `GET https://api.pexels.com/videos/search?query=city&per_page=1` with an `Authorization` header.
  - Pixabay: `GET https://pixabay.com/api/videos/?key=…&q=city&per_page=3`
- The TTS model ID appears in the Gemini model list.
- **Review model selection:** if `models.review` is null, choose the newest listed model whose name contains `flash`, excludes `tts`, `image` and `lite`, and supports `generateContent`. Write it to `config/models.json` and report it.
- Missing keys are reported as failures with the sign-up URL, not thrown.

- [ ] **Step 1: Failing tests:**
  - `loadEnv` reads `A=1` from a temp `.env` and does not override an existing `process.env.A`.
  - `qc().staticMaxLong === 6` and `qc().releaseMin === 95`.
  - `channel('hi-placeholder').captionScript === 'deva'` and `.placeholder === true`.
  - `doctor()` with `fetch` stubbed to return 401 reports `{name:'gemini-key', ok:false}` without throwing.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement `engine/config.cjs` and `engine/doctor.cjs`; add the `doctor` command. Placeholder logos are 512×512 PNGs drawn with canvas (initials on a flat colour).
- [ ] **Step 4:** Run `npm test`. Expected: PASS. Run `npm run doctor`. Expected: it prints all checks, with the key checks failing until the owner adds keys.
- [ ] **Step 5:** Commit with `feat: config, channel profiles and doctor`.

### Task 3: Project model, step registry, stamps and `next`

**Files:**
- Create: `engine/project.cjs`, `engine/steps.cjs`, `engine/stamps.cjs`, `engine/next.cjs`, `templates/project/brief.json`
- Test: `tests/next.test.cjs`

**Interfaces:**
- Produces:
  - `createProject(slug, {channel, date}) → projectDir`: creates `projects/<YYYY-MM-DD>-<slug>/` from `templates/project/`.
  - `openProject(nameOrDir) → {dir, path(rel) → abs, brief}`.
  - `STEPS`: an ordered array of `{id, kind: 'step'|'gate', command, playbook, inputs(project) → relPath[], outputs(project) → relPath[]}`. Step and gate IDs, in order:
    `idea, gate:idea, research, outline, script, gate:script, voice-sample, gate:voice, voice, align, plan, assets, storyboard, gate:storyboard, render, shorts, package, qc, ai-review, gate:final, release`.
  - `writeStamp(project, stepId)` writes `work/stamps/<stepId>.json` = `{inputs: {rel: sha}, outputs: {rel: sha}, at, upstream: {stepId: stampSha}}`.
  - `stepState(project, stepId) → 'done'|'stale'|'todo'|'blocked'`. A step is stale when any input or output hash differs, or when any upstream stamp's hash differs from the one recorded.
  - Gates: state comes from `approvals/<gate>.json` with a matching `contentHash` (Task 4 defines the hash).
  - `nextAction(project) → {stepId, command, playbook, reasons: string[]}`: the earliest step that is not `done`.
  - The CLI `next <project>` prints it in plain English with the exact `npm run …` line.

- [ ] **Step 1: Failing tests** (fixture project in a temp dir with stub steps):
  - A fresh project gives `nextAction(p).stepId === 'idea'`.
  - After stamping `idea` with a filled brief, the next step is `gate:idea`.
  - **(Review Focus 5)** With steps stamped through `storyboard` and gates approved, editing `script.json` makes `nextAction(p).stepId === 'script'`, and `stepState(p, 'gate:storyboard') === 'stale'`.
  - A gate approval whose `contentHash` mismatches counts as `todo`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement. Inputs and outputs per step:

  | Step | Inputs | Outputs |
  |---|---|---|
  | idea | — | `brief.json` |
  | research | `brief.json` | `research.json` |
  | outline | `brief.json`, `research.json` | `outline.json` |
  | script | `outline.json`, `research.json` | `script.json`, `pronunciations.json`, `shorts.json` |
  | voice-sample | `script.json`, `pronunciations.json`, `shorts.json` | `work/voice/sample/*` |
  | voice | `script.json`, `pronunciations.json`, `brief.json` | `work/voice/chapters/*` |
  | align | `work/voice/chapters/*` | `work/voice/paragraphs/*`, `work/align/*.json` |
  | plan | `script.json` + align outputs | `beats.json` |
  | assets | `beats.json` | `assets/ledger.json` |
  | storyboard | `beats.json` + assets | `outputs/storyboard/*` |
  | render | `beats.json`, assets, `work/audio/mixed.wav` | `outputs/master.mp4` |
  | shorts | `shorts.json`, master | `outputs/shorts/*` |
  | package | master, `research.json`, `brief.json` | `outputs/package/*` |
  | qc | all outputs | `outputs/qc/*` |
  | ai-review | `outputs/qc/*` | `outputs/score/ai.json` |
  | release | everything | `outputs/release/*` |

  Glob inputs hash as a sorted list of `(rel, sha)` pairs.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: project model, step registry, stamps and next`.

### Task 4: Review server and PIN-signed approvals

**Files:**
- Create: `engine/review/pin.cjs`, `engine/review/approvals.cjs`, `engine/review/server.cjs`, `engine/review/pages/layout.html`, `engine/review/pages/gate.js`
- Test: `tests/approvals.test.cjs`

**Interfaces:**
- Consumes: `openProject` and `STEPS` (Task 3).
- Produces:
  - `setPin(pin, {reset})`: writes `config/pin.json` = `{salt, iterations: 600000, verifier, setAt}`.
    - The PIN must be ≥ 6 digits. `verifier = HMAC-SHA256(key, 'studio-pin-verifier')`, where `key = PBKDF2-SHA256(pin, salt, 600000, 32)`.
    - Without `{reset:true}` it refuses if the file exists.
    - A reset records `resetAt` and invalidates all approvals (their `pinSetAt` no longer matches).
  - `deriveKey(pin) → Buffer`; it throws `Wrong PIN` if the verifier mismatches.
  - `gateContentHash(project, gateId) → hex`: the sha256 over the sorted `(rel, sha)` pairs of the gate's covered files:
    - `gate:idea`: `brief.json`
    - `gate:script`: `outline.json`, `script.json`, `research.json`
    - `gate:voice`: `pronunciations.json`, `work/voice/sample/*`, `brief.json`
    - `gate:storyboard`: `beats.json`, `assets/ledger.json`, `outputs/storyboard/*`, `outputs/package/thumb_draft_*`
    - `gate:final`: `outputs/master.mp4`, `outputs/shorts/*`, `outputs/package/*`, `outputs/score/owner.json`
  - `writeApproval(project, gateId, key, {decision: 'approve'|'changes', notes, extra})` writes `approvals/<gate>.json` = `{gate, decision, contentHash, at, pinSetAt, sig}`, with `sig = HMAC(key, gate|contentHash|at|decision)`. Change requests also write `approvals/<gate>.changes.json`.
  - `verifyApprovals(project, key) → issues[]`.
  - `startServer(project, {port: 8770}) → url`: binds `127.0.0.1` only and serves one page per gate. Each page's data comes from a per-gate `pageData(project)` function registered by later tasks (Tasks 5, 6, 15, 20). Approve and change forms require the PIN.

- [ ] **Step 1: Failing tests:**
  - `setPin('123456')` then `deriveKey('123456')` succeeds, and `deriveKey('000000')` throws `/Wrong PIN/`.
  - `setPin` again without reset throws.
  - An approval signed with key K verifies; changing one byte of `brief.json` produces a `contentHash` issue; a hand-written approval with a fake `sig` produces a signature issue.
  - After `setPin(…, {reset:true})`, old approvals report `pinSetAt` mismatches.
  - The server rejects a non-loopback `Host` header (returns 403).
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement with `node:crypto` and `node:http`; plain HTML pages, no framework. Add the `pin:set` command (reads the PIN from an interactive TTY prompt only) and the `review` command. `next` treats an approval without `sig` as `todo`.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: review server with PIN-signed approvals`.

---

## Milestone 1: Words (idea → script → voice → timing)

### Task 5: Brief, research, outline and script formats and their checks

**Files:**
- Create: `engine/words/brief.cjs`, `engine/words/research.cjs`, `engine/words/outline.cjs`, `engine/words/script.cjs`, `engine/words/text.cjs`, `templates/project/{research,outline,script,pronunciations}.json`
- Test: `tests/words.test.cjs`

**Interfaces:**
- Produces:
  - **`brief.json`:** `{topic, angle, audience, promise, language: 'en'|'hi'|'hinglish', captionScript: 'latin'|'deva', channel, lengthTargetMin, titles: [3], thumbTexts: [3], mood: [tags], hook, style: {main, accents: {beatType: packId}}, formats: ['long','short']}`. `briefIssues(brief) → string[]`: titles ≤ 60 characters; thumbTexts ≤ 4 words and different from every title.
  - **`shorts.json`** (written at the script step, so the hook lines can be heard at stop 3): `[{id: 's1', hookLine, fromSentence: 'c03p02s1', toSentence: 'c03p04s2'}] × 3`. Sentence IDs are `<paragraphId>s<n>` from `sentences()`. `script:check` estimates each span plus its hook from word count at the channel's wpm: it must be 30–59 s. Task 17 re-checks it with measured audio.
  - **`research.json`:** `{sources: [{id: 'S01', url, publisher, published: 'YYYY-MM-DD', accessed: 'YYYY-MM-DD', excerpt}], claims: [{id: 'CL01', text, status: 'verified'|'attributed'|'disputed'|'removed', contested: bool, sources: ['S01']}]}`.
  - **`outline.json`:** `{chapters: [{id, title, purpose, targetSeconds}], hook: {endsAt: 30}, rehooks: [{atSeconds, line}], payoff}`. `outlineIssues(outline, brief) → string[]`:
    - the gap between consecutive re-hooks (and from 30 s to the first) must be ≤ 90 s;
    - the sum of `targetSeconds` must be within ±10% of `lengthTargetMin × 60`.
  - **`script.json`:** `{chapters: [{id, title, paragraphs: [{id: 'c01p01', text, hold: 0.4, beats: [...]}]}]}`.
    - Every sentence in `text` ends with a tag: `[[CL03]]` (one or more claim IDs, comma-separated) or `[[analysis]]`.
    - `beats` is filled in Task 9.
  - `sentences(text) → [{spoken, tags}]`: splits on `.`, `?`, `!` and `।` (Devanagari danda) followed by a tag.
  - `spokenText(paragraph, pronunciations) → {tts, captions}`: strips tags; `tts` applies `pronunciations.json` substitutions, while `captions` keeps the original spelling.
  - `researchIssues(script, research) → string[]`. It fails on:
    - an untagged sentence;
    - an unknown or `removed` claim;
    - a `contested` claim with fewer than 2 sources;
    - a source missing `published`;
    - relative-date words in spoken text: English `today|yesterday|tomorrow|last week|this week|next week|last month|this month|recently`, and Hindi `आज|कल|परसों|पिछले हफ्ते|इस हफ्ते|पिछले महीने|हाल ही में`.
  - `scriptIssues(script, brief, channel) → string[]`: estimated duration from the word count at the channel's wpm (English default 155) must be within ±15% of the length target.
  - The CLI commands `brief:check`, `research:check`, `outline:check`, `script:check` each print issues, exit non-zero on any issue, and stamp the step on success.
  - `new <slug> --channel=<id>` uses `createProject`.

- [ ] **Step 1: Failing tests:**
  - `sentences('Court spoke. [[CL01]] I think so. [[analysis]]')` returns 2 items with tags `['CL01']` and `['analysis']`.
  - A Hindi sentence ending `।[[CL02]]` parses.
  - `researchIssues` flags `'recently'` and `'हाल ही में'`, an untagged sentence, and a contested claim with 1 source.
  - `spokenText` with `{"Surya Kant":"Soor-ya Kaant"}` gives `tts` containing `Soor-ya Kaant` and `captions` containing `Surya Kant`.
  - `outlineIssues` flags a 120 s re-hook gap.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement. Register gate page data for `gate:idea` (brief, 3 titles, hook, style suggestions as gallery links) and `gate:script`:
  - reading view by chapter;
  - each tagged sentence links its claims and sources;
  - `disputed` and single-source claims shown in red;
  - analysis sentences in grey.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: brief, research ledger, outline and script checks`.

### Task 6: Gemini TTS voice: sample and full chapters

**Files:**
- Create: `engine/voice/gemini.cjs`, `engine/voice/synthesize.cjs`, `engine/voice/check.cjs`
- Test: `tests/voice.test.cjs` (fetch mocked), `tests/live/voice.live.cjs` (real API, run via `npm run test:live`)

**Interfaces:**
- Consumes: `spokenText` (Task 5), `channel()` and `models()` (Task 2).
- Produces:
  - `tts({text, voice, style, language, model}) → Promise<Buffer /* WAV 24 kHz mono s16 */>`.
    - Throws `RateLimited` on HTTP 429 (with `retryAfterSec` if provided) and `ProviderError` otherwise.
    - The request shape follows the current Gemini speech-generation docs (https://ai.google.dev/gemini-api/docs/speech-generation): style goes in the documented style/metadata field, never inside the verbatim text.
    - Confirm the exact field names against the docs at implementation time and record them in a comment with the date checked.
  - `synthesizeChapters(project) → {done: chapterId[], pending: chapterId[]}`.
    - One call per chapter, with paragraphs joined by a blank line.
    - Cache: `work/voice/chapters/<chId>.wav` plus `.json` = `{inputHash: sha256(tts text + voice + style + model + language), wavSha}`.
    - Skips chapters whose cache matches.
    - On `RateLimited` it stops, writes `work/voice/resume.json`, prints "Free-tier limit reached; run `npm run voice` again later", and exits with code 75.
  - `synthesizeSample(project)` writes `work/voice/sample/`:
    - `intro.wav`: the first paragraphs until ≥ 110 words;
    - `names.wav`: all `pronunciations.json` keys spoken as `"Name."` separated by a pause tag;
    - `hooks.wav`: the three Shorts hook lines from `shorts.json`.
  - `retakeParagraph(project, paragraphId)`: one call for that paragraph only; marks the paragraph override in `work/voice/overrides/`.
  - `voiceIssues(project) → string[]`, run after alignment (Task 7) and reported by the `voice:check` command:
    - clipping (any sample at ±1.0 for more than 3 consecutive samples);
    - silences > 0.6 s inside a paragraph (`silencedetect` at −45 dB);
    - wpm outside the band (English 145–165, otherwise channel `wpm` ±10%);
    - it lists paragraph IDs to retake.
- [ ] **Step 1: Failing tests** (mocked `fetch`):
  - **(Review Focus 2)** With 3 chapters where the mock returns 200, then 429 for chapter 2, the first run gives `{done: [1], pending: [2, 3]}`, exit code 75, and `resume.json` exists. A second run with all 200s calls the mock exactly twice (chapters 2 and 3).
  - Changing one word in chapter 3 makes only chapter 3 re-synthesise.
  - The `tts` request body never contains `[[` tags or the style string inside the text.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement. Convert to 48 kHz stereo PCM WAV with FFmpeg after receipt (no tempo change). Register `gate:voice` page data: intro, names (one play button per name, using timestamps from Task 7 alignment of `names.wav`), and hooks.
- [ ] **Step 4:** Run `npm test`. Expected: PASS. Run `npm run test:live` with a key. Expected: a 1-sentence English and a 1-sentence Hindi WAV, each decodes and lasts more than 1 s.
- [ ] **Step 5:** Commit with `feat: Gemini TTS chapter synthesis with free-tier resume`.

### Task 7: Alignment: faster-whisper, Unicode token matching and paragraph splitting

**Files:**
- Create: `engine/align/whisper_words.py`, `engine/align/match.cjs`, `engine/align/split.cjs`
- Test: `tests/align.test.cjs`, `tests/live/align.live.cjs`

**Interfaces:**
- Consumes: chapter WAVs (Task 6), `spokenText` (Task 5).
- Produces:
  - `whisper_words.py <wav> <lang> <out.json>`: uses `faster_whisper.WhisperModel('small', device='cpu', compute_type='int8')` with `word_timestamps=True` and `language` = `'en'` or `'hi'` (Hinglish uses `'hi'`). Writes `[{text, start, end}]`. It loads one file at a time.
  - `canon(token) → string`: NFC, then lowercase, then strip every character not in `\p{L}\p{M}\p{N}`. Devanagari letters and matras survive.
  - `matchWords(sourceTokens, asrWords) → {words: [{id, text, start, end, interpolated: bool}], interpolatedRatio}`.
    - Approach: character-offset alignment over the concatenated `canon` strings, using a Myers/LCS character diff so ASR spelling slips don't break the match.
    - A source token gets timing from the overlapping ASR spans; tokens with no overlap are interpolated between neighbours.
    - Token IDs are `p<paragraphId>-w<index>` and stay stable for repeated words.
  - `mapSubstitutions(ttsTokens, captionTokens, pronunciations) → captionWords` with timings. A substituted span's start/end covers the whole spoken span.
  - `splitChapter(project, chapterId)`: cuts at the midpoint of the gap between the last word of paragraph N and the first word of N+1. Writes `work/voice/paragraphs/<pId>.wav` and `work/align/<pId>.json` = `{words, interpolatedRatio, durationSec}`. Override retakes from `work/voice/overrides/` replace their paragraph.
  - Fails if any paragraph's `interpolatedRatio > 0.05`.
  - The `align` command runs all chapters, then `voice:check`.
- [ ] **Step 1: Failing tests:**
  - **(Review Focus 1)** `canon('कॉकरोच,')` equals `'कॉकरोच'` (not empty), and `canon('Don’t!')` equals `'dont'`.
  - `matchWords` with source `['कॉकरोच','जनता','पार्टी']` and ASR `[{text:'कॉकरोच जनता',start:0,end:1},{text:'पार्टी',start:1,end:1.5}]` returns 3 words, the third starting at 1.0, with `interpolatedRatio > 0`.
  - A Hinglish mix `['CJP','की','rally']` with ASR `[{text:'सीजेपी'…}]` makes the unmatched token interpolated, not thrown.
  - A completely different transcript gives `interpolatedRatio > 0.05`, which `splitChapter` reports as a failure.
  - `mapSubstitutions` maps `Soor-ya Kaant` timing onto the caption tokens `Surya` and `Kant`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement. Install Python deps once: `python -m pip install -r requirements.txt` (doctor already checks the import).
- [ ] **Step 4:** Run `npm test`. Expected: PASS. Run `npm run test:live` on Task 6's live WAVs. Expected: `interpolatedRatio ≤ 0.05` for both the English and Hindi samples.
- [ ] **Step 5:** Commit with `feat: Unicode-aware forced alignment and paragraph splitting`.

### Task 8: Captions: phrases, SRT/VTT and caption checks

**Files:**
- Create: `engine/captions/phrases.cjs`, `engine/captions/export.cjs`, `engine/captions/check.cjs`
- Test: `tests/captions.test.cjs`

**Interfaces:**
- Consumes: aligned words (Task 7), `registerFonts` (Task 1).
- Produces:
  - `phrases(words, {script: 'latin'|'deva', ctx}) → [{id, start, end, text, tokenIds}]`.
    - Break after sentence punctuation (`. ! ? ; : ।`), or when adding a word would exceed 2 lines.
    - Latin wraps at 42 characters per line. Devanagari wraps by rendered width: `measureText` with `Deva` 48px ≤ the width of 42 Latin `n` characters in `Sans` 48px.
    - Minimum duration 0.7 s without overlapping the next cue.
  - `exportCaptions(timelineParagraphs) → {srt, vtt}`, with paragraph offsets applied.
  - `captionIssues(cues, {script, ctx}) → string[]`: lines > 2, Latin line > 42 characters, characters/s > 20 (grapheme count via `Intl.Segmenter`), duration < 0.7, overlaps, and cue edges more than 0.1 s away from their first/last token times.
- [ ] **Step 1: Failing tests:**
  - A 60-word English paragraph yields cues all passing `captionIssues`.
  - A Devanagari paragraph yields cues with 2 lines or fewer, by width.
  - The SRT for a cue at 3661.2 s contains `01:01:01,200`; the VTT starts with `WEBVTT`.
  - Characters/s counts `क्षत्रिय` as 3 graphemes, not 9 code points.
  - A hand-made overlapping pair is flagged.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement (port Codex `phrases` and `exportsFor` logic from `..\Codex\src\captions.cjs`, rewritten readable and Unicode-aware).
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: phrase captions with Devanagari-aware limits and SRT/VTT export`.

---

## Milestone 2: Visuals

### Task 9: Beat plan compiler

**Files:**
- Create: `engine/plan/beat-types.cjs`, `engine/plan/compile.cjs`
- Test: `tests/plan.test.cjs`

**Interfaces:**
- Consumes: `script.json` beats, `work/align/*.json`, the brief style choice.
- Produces:
  - `BEAT_TYPES`: a frozen map from each of the 14 IDs in §6.3 (`art-focus, art-tour, stock, kinetic, quote, stat, compare, timeline, map, document, list, chart, chapter, endcard`) to `{fields: {name: 'required'|'optional'}, minSec, maxSec, internalReveals: bool}`. `maxSec` is 6 for types without internal reveals.
  - The beat intent inside `script.json` paragraphs is `{type, atWord: number, ...typeFields, claim?: 'CLxx', illustration?: bool}`. The first beat of each paragraph must have `atWord: 0`.
  - `compilePlan(project) → beats.json` = `{fps: 30, width, height, chapters: [{id, startFrame, frames}], beats: [{id, chapter, paragraph, type, startFrame, frames, fields, claim, illustration, style}]}`:
    - Beat IDs are `<paragraphId>b<index>` (for example `c01p02b1`), stable while the script's beats are unchanged. Auto-inserted beats use `c01chapter` and `endcard`.
    - Media is not chosen at this step. `art-*` beats carry `imagePrompt`, and `stock` beats carry `query`. The asset step (Task 14) resolves `img_<beatId>.png` and the chosen clip through `assets/ledger.json` keyed by beat ID.
    - Paragraph frame span = `lead (0.18 s) + audio duration + hold`. Boundaries are contiguous integer frames, and chapters start with a `chapter` beat of 2.5 s inserted automatically.
    - Beat start = the time of its `atWord` minus 0.2 s, clamped to the paragraph start. A beat ends where the next one starts.
    - `style` = the accent pack for that beat type if `brief.style.accents[type]` exists, else the main pack.
    - The video ends with a 20 s `endcard` beat.
  - `planIssues(compiled, research) → string[]`. Flags:
    - an unknown type or a missing required field;
    - a beat longer than `maxSec` without `internalReveals` (6 s rule);
    - on-screen text fields (`text`, `quote`, `value`, `items`) on a factual beat without a `claim` that exists and is not removed;
    - `quote` beats without `source` and `date` fields.
  - The `beats` command prints `BEAT_TYPES` with fields and limits; agents plan only from this list.
- [ ] **Step 1: Failing tests:**
  - A paragraph with beats at words 0 and 12 (word 12 at 4.1 s) gives the second beat `startFrame = round((0.18 + 4.1 − 0.2) × 30)` relative to the paragraph.
  - An `art-focus` spanning 7.0 s is flagged `/longer than 6/`; an `art-tour` spanning 9 s with `crops.length ≥ 3` passes.
  - Type `'hologram'` is flagged.
  - A `stat` beat without a claim is flagged.
  - Accents `{map: 'map-doc'}` set `style: 'map-doc'` on map beats only.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement; add the `plan` command (compile plus issues plus stamp).
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: beat plan compiler with pacing and claim rules`.

### Task 10: Render core: frame loop, bounded text, video sources and chapter encoder

**Files:**
- Create: `engine/render/text.cjs`, `engine/render/context.cjs`, `engine/render/video-source.cjs`, `engine/render/chapter.cjs`, `engine/render/render-all.cjs`, `engine/styles/loader.cjs`
- Test: `tests/render.test.cjs`

**Interfaces:**
- Consumes: `beats.json` (Task 9), fonts (Task 1).
- Produces:
  - `drawText(ctx, str, {x, y, width, maxLines, size, minSize, font, color, align, safe})` → the drawn height.
    - Shrinks the size down to `minSize` to fit, and uses the `Deva` role automatically when the string contains `\p{Script=Devanagari}`.
    - Transforms the corners through `ctx.getTransform()` and records a layout issue if outside `safe` (default: x 80–1840, y 40–(height × 0.88) for long-form, i.e. the bottom 12% stays free).
    - Appends every drawn string to the **text audit log** `ctx.__textLog` (used by QC in Task 19).
  - `loadStyle(packId) → {tokens, components, meta}` and `resolveStyle(brief) → (beatType) → style`. An accent inherits the main pack's palette and caption tokens.
  - `openVideoSource(path, {w, h, inSec, fps: 30}) → {frame(i) → Canvas-compatible Image, close()}`. An FFmpeg child decodes `rgba` scaled/cropped to w×h into a pipe, reading sequentially, with a ring buffer of 2 frames.
  - `renderBeatFrame(ctx, beat, tSec, assets, env)` dispatches to `style.components[beat.type]`.
    - `env` = `{words, channel, format, width, height, style}`, where `words` are the aligned words of the beat's paragraph with times relative to the beat start.
    - `assets` resolves the beat's image or clip from `assets/ledger.json` by beat ID.
  - `renderChapter(project, chapterId, {format: 'long'|'short'})`:
    - runs in its own child process (`node engine/render/chapter.cjs …`);
    - pipes RGBA to `libx264 -preset veryfast -crf 18 -pix_fmt yuv420p` with BT.709 tags, writing to `.partial.mp4`, then renames;
    - writes `chapter_NN.mp4.json` = `{signature, sha256, frames, shotIds}`;
    - `signature` = the sha of `beats.json` plus the asset ledger plus the sha of `engine/**` and the used style packs;
    - skips the chapter when the signature and sha match.
  - `renderAll(project, format)` renders chapters sequentially as child processes and then concatenates (Task 16 adds audio).
  - Transitions: a 0.3 s crossfade between beats by default. A pack may override the transition per beat type through `components.transition(prevCanvas, nextCanvas, p)`.
- [ ] **Step 1: Failing tests:**
  - `drawText` with a string that fits only at 40px from 80px returns size ≥ 40 and logs no issue.
  - Text at y = 1000 on 1080p logs an issue `/outside safe/`.
  - A Devanagari string picks the `Deva` font (check `ctx.font` includes `Deva`).
  - A 2-beat fixture chapter at 1280×720 test resolution renders an MP4 whose `nb_frames` equals the plan.
  - A second render prints `CACHE` and does not change the mtime.
  - `openVideoSource` on a 2 s FFmpeg-generated `testsrc` clip yields 60 frames.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement (port the `waitDrain` pipe handling from `..\Codex\src\render.cjs`, rewritten readable).
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: render core with bounded text audit and stock video sources`.

### Task 11: Base pack, part 1: image, stock and text beat types

**Files:**
- Create: `styles/base/style.json`, `styles/base/components/{art-focus,art-tour,stock,kinetic,quote,chapter,endcard}.cjs`, `styles/base/components/index.cjs`, `styles/base/components/shared.cjs` (easing, springs, reveal)
- Test: `tests/beats-a.test.cjs`

**Interfaces:**
- Consumes: `drawText`, `openVideoSource` and the style tokens (Task 10).
- Produces: each component as `(ctx, beat, t, assets, env) → void`, deterministic in `t`. Required fields:
  - `art-focus`: `{imagePrompt, focus: [x, y, w, h] /* 0–1 */, reverse?: bool}`. The camera eases from the full frame to `focus` over the beat (ease-in-out cubic), or the reverse when `reverse: true`.
  - `art-tour`: `{imagePrompt, crops: [[x, y, w, h], …≥ 2]}`. Each crop holds for an equal share, with a 0.5 s eased move between crops.
  - `stock`: `{query, inSec?, lowerThird?}`, graded by the style's `stockGrade` (a 3×3 colour matrix plus vignette strength plus grain amount).
  - `kinetic`: `{text}`. Words reveal on their aligned times (`env.words`).
  - `quote`: `{text, speaker, source, date}`.
  - `chapter`: `{number, title}`.
  - `endcard`: reads `env.channel` (name, logo). Two video boxes and a subscribe circle sit at YouTube end-screen safe positions (1920×1080: boxes at x 1056–1776, y 132–537 and y 579–984; subscribe circle centre (432, 540), r 180). No other element sits behind them.
- The `Illustration` tag renders whenever `beat.illustration` is true, at the pack-defined corner, inside the safe area.
- [ ] **Step 1: Failing tests** (render to canvas, sample pixels):
  - `art-focus` at t = 0 versus t = end differ (the mean absolute difference over a 64×36 downscale is greater than 8).
  - `art-tour` with 3 crops produces 3 visually distinct settled frames.
  - `quote` without `date` throws `/date required/`.
  - `endcard` draws nothing inside the end-screen element rectangles except the background (pixel variance < 2).
  - Every component logs only strings that come from its beat fields or the channel (the text audit contains no `/frame|layout|shot \d/i`).
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: base pack image, stock and text beats`.

### Task 12: Base pack, part 2: data and diagram beat types (including maps)

**Files:**
- Create: `styles/base/components/{stat,compare,timeline,map,document,list,chart}.cjs`, `library/maps/india_states.geojson`, `library/maps/world_countries.geojson`, `library/maps/SOURCES.md`, `engine/render/geo.cjs`
- Test: `tests/beats-b.test.cjs`

**Interfaces:**
- Produces:
  - `stat`: `{value: number, unit?, label, source}`; counts up over 1.2 s.
  - `compare`: `{left: {title, points[]}, right: {title, points[]}}`; points reveal one per ≤ 2.5 s.
  - `timeline`: `{events: [{date: 'YYYY-MM-DD', label}]}`; reveals every ≤ 3 s.
  - `map`: `{region: 'india'|'world', highlight: [ids], pins: [{lon, lat, label}], route?: [[lon, lat], …]}`.
  - `document`: `{title, lines[], highlight: [lineIdx]}`; recreated, never a screenshot of a real document. `beat.illustration` is forced true.
  - `list`: `{items[]}` (2–4 items).
  - `chart`: `{kind: 'bar'|'line', series: [{label, value}], source}`.
  - `geo.cjs`: `project(lon, lat, bbox, w, h)` (equirectangular for India, Robinson-free plate carrée for world) and `loadGeo(name)` (cached, simplified with Douglas–Peucker at 0.01°).
- **Map data rule:** India boundaries must match the official Survey of India depiction. Record the source URL, licence and date in `library/maps/SOURCES.md`, and show the owner the source in the Task 23 checklist. No India map without that file.
- [ ] **Step 1: Failing tests:**
  - `compare` with 3 points per side has its last reveal ≤ 7.5 s.
  - `timeline` with 4 events and `frames = 12 s` reveals all 4 by 12 s, with gaps ≤ 3 s.
  - The `map` projection puts New Delhi (77.21, 28.61) inside the drawn India polygon's bounding box.
  - `chart` with negative values throws `/non-negative/`.
  - The `document` beat logs the `Illustration` tag.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement. Download map data into `library/maps/` (a trusted, licence-recorded source; simplified copies only).
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: base pack data, diagram and map beats`.

### Task 13: Style pack system and the five Phase 1 packs

**Files:**
- Create: `engine/styles/check.cjs`, `engine/styles/preview.cjs`, `engine/styles/gallery.cjs`, `engine/styles/suggest.cjs`, `templates/style-demo/{en,hi}.json`, `styles/{editorial,map-doc,evidence,kinetic,vertical-captions}/{style.json,components.cjs}`
- Test: `tests/styles.test.cjs`

**Interfaces:**
- Consumes: the base components (Tasks 11 and 12), the render core (Task 10).
- Produces:
  - **`style.json` schema:**
    - `{id, name, bestFor: [tags], mixesWith: [ids], formats: ['long','short']}`
    - `palette: {bg, surface, ink, muted, accent, accent2}`
    - `fonts: {display, body, mono, deva}`: roles from Task 1
    - `captionStyle: {size, weight, bg, ink}`
    - `motion: {revealSec, spring: {stiffness, damping}}`
    - `transition: 'crossfade'|'cut'|'wipe'`
    - `musicMoods: [tags]`
    - `imagePromptSuffix: string`
    - `stockGrade: {matrix: [9], vignette, grain}`
    - `qc: {changeThreshold?}`
  - `components.cjs` exports overrides by beat type. Missing types fall back to `styles/base`. An explicit `fallback: ['chart']` list documents intentional fallbacks; any other missing type fails `style:check`.
  - `styleCheck(packId) → {passed, issues, sheet}`:
    - renders every beat type at entry, action and settled states, in 16:9 and (if listed) 9:16, with the `en` and `hi` demo fields;
    - collects `drawText` layout issues;
    - checks contrast ≥ 4.5:1 between `ink` and `bg`/`surface`;
    - writes a contact sheet to `styles/<id>/check.jpg`.
  - **Change-threshold calibration** (part of `styleCheck`): render a 6 s `art-focus` drift-only clip and a `list` reveal clip. The pack's `changeThreshold` must count **zero** change events in the drift clip and **≥ 1** in the reveal clip. It writes the calibrated value to `style.json.qc.changeThreshold` when absent.
  - `stylePreview(packId)` renders a 20 s `preview.mp4` and `card.png` from `templates/style-demo/en.json`.
  - `buildGallery()` writes `styles/gallery.html` (cards, preview video, bestFor tags, mixesWith). The `styles` command serves it through the review server.
  - `suggestStyles(brief) → [{id, reason}] × 3`: ranks by tag overlap between `brief.topic`/`angle` keywords and `bestFor`, excludes packs whose `style:check` has not passed, and never suggests a pack lacking the needed format.
  - **The five packs (§12):**
    - `editorial`: investigative print, light paper, serif display, red accent.
    - `map-doc`: dark cartographic, teal/orange; map, timeline and route overrides.
    - `evidence`: corkboard/evidence board; document and quote overrides with pins and string.
    - `kinetic`: accent-only (`formats: ['long','short']`, `bestFor: ['quote','manifesto']`); kinetic and quote overrides.
    - `vertical-captions`: `formats: ['short']` only; large burned captions in the 9:16 safe zone (x 60–1020, y 280–1500, clear of the YouTube Shorts UI).
- [ ] **Step 1: Failing tests:**
  - `styleCheck('base')` passes.
  - A temp pack missing `quote` and not listing it in `fallback` fails `/quote/`.
  - A temp pack with `ink == bg` fails contrast.
  - The calibration yields 0 events for drift and ≥ 1 for reveal on `editorial`.
  - `suggestStyles({topic: 'border dispute', angle: 'map'})` ranks `map-doc` first.
  - `resolveStyle` with main `editorial` and accent `kinetic` for `quote` gives the quote beat the editorial palette.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement the engine pieces, then the five packs. Run `npm run style:check -- <id>` for each and visually inspect each `check.jpg` (open the image; fix crowding or illegible text before continuing).
- [ ] **Step 4:** Run `npm test`. Expected: PASS. All five `style:check` runs pass.
- [ ] **Step 5:** Commit with `feat: style pack system, gallery, suggestions and five Phase 1 packs`.

### Task 14: Assets: image prompts, image checks, stock search and ledger

**Files:**
- Create: `engine/assets/prompts.cjs`, `engine/assets/images-check.cjs`, `engine/assets/stock.cjs`, `engine/assets/ledger.cjs`
- Test: `tests/assets.test.cjs`

**Interfaces:**
- Consumes: `beats.json` (Task 9), style packs (Task 13), `loadEnv` (Task 2).
- Produces:
  - `writeImagePrompts(project)` → `assets/image_prompts.json` = `[{file: 'img_c01_b02.png', prompt, aspect: '16:9'|'9:16', beatIds}]` and `assets/IMAGE_PROMPTS.md` (numbered, copy-ready).
    - Prompt = the beat's `imagePrompt` field plus the pack's `imagePromptSuffix`, plus the fixed rule text: `"No real, identifiable people; no photorealistic faces of public figures; no legible text unless specified."`
    - It also writes thumbnail base prompts `thumb_base_{1,2,3}.png` (16:9, with "large empty area on the left third for headline text").
  - `checkImages(project) → [{file, problem}]`:
    - missing;
    - wrong format: content sniffed by magic bytes; PNG, JPEG and WebP accepted and normalised to PNG; anything else rejected;
    - long edge < 1920;
    - aspect off by more than 2% from the target;
    - perceptual duplicate (dHash 64-bit, Hamming distance ≤ 5) of another file.
  - `searchStock(project)`:
    - for each `stock` beat's `query`, calls Pexels (`/videos/search`, `orientation` from the format) and Pixabay (`/api/videos/`);
    - downloads up to 4 candidates per beat (the smallest rendition ≥ 1920 wide; ≥ 1080 wide for 9:16) into `assets/stock/_incoming/<beatId>/`;
    - writes `candidates.jpg` (a 4-up frame grid at 2 s) for the agent to view.
  - `pickStock(project, beatId, candidateIdx)` moves the clip to `assets/stock/` and records `{file, provider, url, creator, licence: 'Pexels License'|'Pixabay Content License', durationSec, sha256}` in `assets/ledger.json`.
  - `ledgerIssues(project)`:
    - every `art-*` beat has `assets/images/img_<beatId>.png` and a ledger entry with its origin (`agent-generated:<agent>`, `owner-supplied` or `legacy-antigravity`) and prompt;
    - every `stock` beat has a picked clip;
    - a picked clip shorter than its beat minus `inSec` is flagged `/clip too short/`.
  - Commands: `images:prompts`, `images:check`, `stock:search`, `stock:pick <project> <beatId> <n>`. The `assets` step is stamped when `checkImages` and `ledgerIssues` are both empty. `next` prints the exact missing files.
- [ ] **Step 1: Failing tests:**
  - **(Review Focus 3)** Fixtures: a 1024×1024 PNG gives `/long edge 1024 < 1920/` and `/aspect/`; a JPEG renamed `.png` is accepted and normalised; a `.gif` is rejected `/format/`; a missing file gives `/missing/`; two near-identical images give `/duplicate/`.
  - With `searchStock` and mocked fetch returning 2 Pexels and 2 Pixabay results, the 4 candidate files and `candidates.jpg` exist.
  - `ledgerIssues` flags an unledgered clip.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: image prompts and checks, stock search and asset ledger`.

### Task 15: Storyboard previews and stop 4

**Files:**
- Create: `engine/render/storyboard.cjs`
- Test: `tests/storyboard.test.cjs`

**Interfaces:**
- Consumes: the render core, styles, `beats.json`, `shorts.json` (if present, Task 17), thumbnail drafts (Task 18).
- Produces: `storyboard(project)`:
  - writes `outputs/storyboard/beat_<id>_{entry,action,settled}.png` at `t` = 0.3 s, 45% and `frames/30 − 0.3` s;
  - writes contact sheets `outputs/storyboard/contact_<n>.jpg` (12 beats per sheet, labelled `mm:ss` only, no internal IDs on the image);
  - adds Shorts vertical stills when `shorts.json` exists;
  - fails on any `drawText` layout issue.
  - It registers the `gate:storyboard` page data: contact sheets, a click-through per beat, and the thumbnail drafts.
  - Command: `preview`.
- [ ] **Step 1: Failing test:** a fixture project with 3 beats produces 9 PNGs and 1 contact sheet; a beat with off-safe text fails with its beat ID in the message.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: storyboard previews and stop 4 page`.

---

## Milestone 3: Sound, assembly, Shorts and packaging

### Task 16: Audio mix and master assembly

**Files:**
- Create: `engine/audio/music.cjs`, `engine/audio/sfx.cjs`, `engine/audio/mix.cjs`, `engine/audio/loudness.cjs`, `engine/assemble/master.cjs`, `library/music/index.json` (empty array plus README), `library/sfx/index.json`
- Test: `tests/audio.test.cjs`

**Interfaces:**
- Consumes: paragraph WAVs plus `beats.json` (Tasks 7 and 9), chapter MP4s (Task 10).
- Produces:
  - `library/music/index.json`: `[{file, moods: [tags], bpm, licence: 'YouTube Audio Library', attributionRequired: bool, attributionText?}]`.
  - `pickMusic(brief, styles) → [{chapterId, file}]`: chooses by overlap with `brief.mood ∪ pack.musicMoods`, never repeats a track in consecutive chapters, and throws `No licensed music in library/music` when the index is empty.
  - `sfxEvents(beats) → [{t, kind}]`:
    - `whoosh` on transitions into `art-tour`, `stock` and `chapter`;
    - `hit` on `stat` count completion;
    - `click` per list/timeline reveal;
    - `paper` on `document`;
    - files from `library/sfx/index.json` by kind, with a procedural sine/noise fallback;
    - each event gain −18 dBFS.
  - `buildVoiceTrack(project) → work/audio/voice.wav`: each paragraph delayed by the 0.18 s lead and padded to its frame span.
  - `buildMix(project) → {mixed: path, firstPass}`: music looped/crossfaded per chapter, sidechain-ducked by the voice (`sidechaincompress` threshold 0.02, ratio 8, attack 15 ms, release 350 ms), SFX, `amix normalize=0`, then first-pass `loudnorm` measurement.
  - `voiceToMusicDb(project) → number`: the median over speech regions of (voice RMS − music-after-ducking RMS) in dB. It must be ≥ 15.
  - `assembleMaster(project) → outputs/master.mp4`:
    - concats the chapters (`concatManifestLine`) with `-c:v copy`;
    - second-pass linear `loudnorm` to −14 LUFS with TP −1.5;
    - AAC 320k 48 kHz, BT.709 metadata, `+faststart`;
    - writes to `.partial`, renames, then measures again after encoding into `outputs/qc/audio.json`.
- [ ] **Step 1: Failing tests:**
  - **(Review Focus 4)** Under a temp dir named `it's a test`, two 1 s chapters assemble into a 2 s master.
  - With 10 s of synthetic voice (tone bursts) and music, `voiceToMusicDb` ≥ 15.
  - An empty music index throws `/No licensed music/`.
  - The final measured integrated loudness is within −15 to −13, with TP ≤ −1.0.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement (port the `loudness`/`assemble` flow from `..\Codex\src\audio.cjs`, rewritten readable and project-generic). Extend the `render` command: chapters, then mix, then master.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: music, SFX, ducked mix and master assembly`.

### Task 17: Shorts

**Files:**
- Create: `engine/shorts/nominate.cjs`, `engine/shorts/build.cjs`, `templates/project/shorts.json`
- Test: `tests/shorts.test.cjs`

**Interfaces:**
- Consumes: the beat compiler, the render core, the `vertical-captions` pack, the voice (Task 6), alignment (Task 7) and the mix (Task 16).
- Produces:
  - `shortsIssues(shorts, project)` uses the `shorts.json` format from Task 5 with **measured** durations (aligned words plus hook audio). It requires exactly 3 Shorts, and each span plus its hook must be 30–59 s. Spans are sentence-bounded by construction, so they never cut mid-sentence.
  - `buildShort(project, shortId)`:
    - hook audio comes from `hooks.wav` (Task 6 sample; aligned and split per line);
    - beats are re-compiled for the span at 1080×1920 with the main pack's vertical layouts (and `vertical-captions` for caption rendering);
    - captions are burned in (cues from Task 8, styled by the pack);
    - the static-interval target is 3 s, so beats longer than 3 s without reveals are split into `art-tour`-style crops automatically;
    - the mix and loudness match Task 16;
    - writes `outputs/shorts/<id>.mp4` (≤ 59 s).
  - Command: `shorts`.
- [ ] **Step 1: Failing tests:**
  - A span of 62 s is flagged `/59/`.
  - An unknown sentence ID is flagged.
  - A fixture short renders at 1080×1920 with a duration ≤ 59 s.
  - The text audit includes the caption strings, all within x 60–1020, y 280–1500.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: Shorts from long-form spans with burned captions`.

### Task 18: Packaging: thumbnails, titles and description

**Files:**
- Create: `engine/package/thumbnails.cjs`, `engine/package/thumbs-check.cjs`, `engine/package/description.cjs`
- Test: `tests/package.test.cjs`

**Interfaces:**
- Consumes: `brief.json`, `research.json`, `beats.json` chapters, `channel()`, the thumb base images (Task 14).
- Produces:
  - `composeThumbnails(project) → outputs/package/thumb_{1,2,3}.png` (1280×720; also `thumb_draft_*` at stop 4).
    - Base image plus a headline of ≤ 4 words (from `brief.thumbTexts[3]`, written by the agent) in the main pack's display font.
    - Auto-sized to the largest size that fits the left 55% in ≤ 2 lines.
    - A 6px stroke and drop shadow, plus the channel brand mark if present.
  - `thumbIssues(file, title) → string[]`, run at both 168×94 and 320×180:
    - text cap height ≥ 18% of the thumbnail height, measured from the compositor's recorded text box;
    - WCAG contrast ≥ 4.5:1 between the text fill and the median luminance of the base under the text box;
    - Sobel edge density ≤ 0.20 at 320×180;
    - more than 4 words;
    - text equal to the title (case-insensitive).
  - `writeDescription(project)` → `outputs/package/description.txt`:
    - hook line;
    - chapters (`00:00 Title`, the first at `00:00`, ≥ 3 chapters, each ≥ 10 s, as YouTube requires);
    - sources (publisher, date, URL, for every non-removed claim's sources);
    - music attribution lines where `attributionRequired`;
    - an AI-use note ("Illustrations are AI-generated; narration uses synthetic voice.").
  - It also writes `titles.txt` (3 titles ≤ 60 characters, from the brief), `tags.txt`, `pinned_comment.txt` and `disclosure.txt`. The disclosure is "Yes, select altered/synthetic content" when any `art-*` beat depicts a real event with `illustration: true`; otherwise "Not required".
  - Commands: `package`, `thumbs:check`.
- [ ] **Step 1: Failing tests:**
  - The description for chapters at 0, 95 and 400 s contains `00:00`, `01:35` and `06:40`.
  - A title of 61 characters is flagged.
  - A 5-word thumbnail text is flagged.
  - A low-contrast fixture (grey text on grey) is flagged `/contrast/`.
  - Thumbnail text equal to the title is flagged.
  - The disclosure is `Yes…` for a project with an illustrated real event.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: thumbnails with small-size checks, titles and description`.

---

## Milestone 4: QC, scoring and release

### Task 19: Automated QC

**Files:**
- Create: `engine/qc/static-interval.cjs`, `engine/qc/streams.cjs`, `engine/qc/text-audit.cjs`, `engine/qc/run.cjs`
- Test: `tests/qc.test.cjs`

**Interfaces:**
- Consumes: the master and Shorts, the text audit logs written by the renders (`work/render/textlog_<chapter>.jsonl`, appended by `drawText`), and the caption, audio and ledger checks from earlier tasks.
- Produces:
  - `staticIntervals(videoPath, {threshold}) → {longest, median, histogram, longestAt}`. The algorithm (fixed by this plan):
    ```
    decode with ffmpeg: -vf scale=160:90,format=gray -f rawvideo pipe at the source fps
    anchor = frame 0; events = [0]
    for each frame i: mad = mean(|frame_i − anchor|) over 14,400 px
        if mad ≥ threshold: events.push(i); anchor = frame_i
    intervals = diffs(events ∪ [lastFrame]) / fps
    ```
    The threshold comes from the main pack's calibrated `qc.changeThreshold` (default 8.0).
  - `streamIssues(meta, expected)`: ported from Codex `qc.cjs`, with frames, duration, codecs, BT.709, 48 kHz and stereo.
  - `debugTextIssues(textLogs)`: this replaces §9.1's OCR scan, because the renderer logs every string it draws (which is exact) and no OCR engine is installed. Garbled text inside AI images is judged by the AI review under F. Any drawn string matching `/\bframe\s*\d|layout[_:]|shot\s*\d+\s*\/|\bdebug\b|undefined|NaN|\[object/i` is a hard failure.
  - `runQc(project) → outputs/qc/qc.json` = `{hardFails: [], issues: [{category: 'A'…'J', message, t?}], metrics: {staticLongest, staticMedian, lufs, truePeak, voiceToMusicDb, unintendedSilences, captionIssues, ledgerIssues, researchIssues, decodeOk}, shorts: {s1: {...}}}`:
    - full decode;
    - each issue is tagged with its rubric category: captions → H; `thumbIssues`/title issues → I; ledger and research issues → C; loudness and voice-to-music → E; streams → J;
    - unintended silence = a `silencedetect` (−45 dB, d = 1.2) span that is not inside the endcard or a chapter card;
    - each hard-fail rule from §9 maps to one `hardFails` entry with a timestamp.
  - Command: `qc`.
- [ ] **Step 1: Failing tests:**
  - A generated 10 s clip of a static colour with a single cut at 3 s gives `longest ≈ 7.0 s` (±0.1).
  - A slow 3% zoom over 6 s at threshold 8 gives 0 events.
  - The text log entry `'SHOT 42/60'` is a hard failure; `'Shot of the protest'` is not.
  - A 2 s silent gap mid-voice in a fixture gives a hard failure `/silence/`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: automated QC with static-interval analysis and debug-text audit`.

### Task 20: Independent AI review, score aggregation and stop 5

**Files:**
- Create: `engine/score/rubric.cjs`, `engine/score/ai-review.cjs`, `engine/score/aggregate.cjs`, `engine/review/pages/final.html`
- Test: `tests/score.test.cjs`

**Interfaces:**
- Consumes: `qc.json` (Task 19), `models().review` (Task 2), storyboard and frame sheets, the package (Task 18), and the approvals server (Task 4).
- Produces:
  - `RUBRIC.long` and `RUBRIC.short`: category IDs, weights and sources exactly per §9 and §9.5.
    - Long: A 10, B 15, C 10, D 10, E 5, F 15, G 15, H 5, I 10, J 5.
    - Short: A 20, B 15, C 10, D 10, E 5, F 15, G 15, H 5, J 5.
  - `aiReview(project) → outputs/score/ai.json` = `{model, at, categories: {A: {score: 0–100, reasons: [{t, note}]}, …}}`.
    - It makes one fresh `generateContent` call with: the rubric text; `script.json` spoken text; a research summary (claims and status); frame sheets (a frame every 2 s tiled 4×3 per image at 480×270 per tile); the first 30 s at 1 fps as one sheet; and the 3 thumbnails at 320×180.
    - `responseMimeType: 'application/json'` with a JSON schema. Shorts are reviewed in separate calls.
    - On HTTP 429 it exits 75 with "resume later", the same as Task 6.
  - `ownerScore(project)`: the stop 5 form posts `{A, BG, D, F, I: 'Excellent'|'Good'|'OK'|'Weak'|'Bad', drags: [seconds]}` to `outputs/score/owner.json` (written by the review server only).
  - `aggregate(project) → outputs/score/score.json` = `{total, categories: {id: {fraction, points, sources}}, hardFails, floorsFailed, releasable, explanation[]}`:
    ```
    owner levels → {Excellent:1, Good:.9, OK:.75, Weak:.5, Bad:0}; BG feeds both B and G
    for each category c:
      sources = []
      if c in ai and c in subjective {A,B,D,F,G,I}: sources.push(ai[c].score/100)
      if owner gives c: sources.push(ownerFraction)
      if c is code-only {E,H,J} or no sources: fraction = qcPass(c) ? 1 : 0
      else fraction = min(sources), and 0 if qc has a blocking issue in c
      C: fraction = min(ai.C/100, researchIssues empty ? 1 : 0)
    total = Σ weight·fraction (rounded to 0.1)
    if hardFails non-empty: total = min(total, 59)
    releasable = total ≥ 95 && every fraction ≥ .8 && no hardFails
    ```
    Shorts aggregate separately with `RUBRIC.short`. A Short that is not releasable is listed under `droppedShorts` with reasons.
  - **Stop 5 page:** a player for the master with a "This drags" button that records the current time; the Shorts players; thumbnails with a pick radio; titles with a pick radio; the five rating questions (§9.3 wording); the score breakdown with sources labelled "measured", "AI-judged" and "your rating"; and approve/send-back with the PIN.
  - Commands: `review:ai`, `score`.
- [ ] **Step 1: Failing tests:**
  - All AI 96, owner all Excellent, no QC issues → total 96, releasable.
  - Owner F = Good (0.9) with AI F 100 → F fraction 0.9.
  - Owner B/G = OK → fraction 0.75 → `floorsFailed` includes B and G, not releasable.
  - One hard failure with otherwise perfect inputs → total 59.
  - Shorts with AI A = 70 → dropped, and the long-form is still releasable.
  - The mocked AI call returning invalid JSON throws `/schema/`; HTTP 429 exits 75.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: independent AI review, score aggregation and final review page`.

### Task 21: Release

**Files:**
- Create: `engine/release.cjs`
- Test: `tests/release.test.cjs`

**Interfaces:**
- Consumes: `verifyApprovals` (Task 4), `stepState`/`nextAction` (Task 3), `score.json` (Task 20).
- Produces: `release(project, pin)` (the PIN is read from an interactive TTY prompt in the CLI).
  - It refuses with a list when: any step or gate is not `done`; any signature fails; `score.releasable` is false; the channel is a placeholder; or `library/maps/SOURCES.md` is missing while a map beat is used.
  - Otherwise it copies into `outputs/release/<YYYY-MM-DD>_<slug>/`:
    - `master.mp4`; the passing Shorts; the chosen thumbnail first, then the others;
    - `captions.srt` and `captions.vtt`;
    - `description.txt`, `titles.txt`, `tags.txt`, `pinned_comment.txt`, `disclosure.txt`;
    - `sources.md`, `asset_ledger.json`, `score.json`;
    - `UPLOAD_CHECKLIST.md`: YouTube Studio steps, including uploading the captions file, setting chapters through the description, selecting the disclosure, and using "Test & Compare" with the 3 thumbnails;
    - `release.json` with the sha256 of every file.
- [ ] **Step 1: Failing tests:**
  - A releasable fixture with valid signatures produces all listed files.
  - A tampered approval refuses `/signature/`.
  - A score of 94.9 refuses `/95/`.
  - A placeholder channel refuses `/channel/`.
- [ ] **Step 2:** Run `npm test`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npm test`. Expected: PASS.
- [ ] **Step 5:** Commit with `feat: release packaging gated on score, approvals and PIN`.

### Task 22: Agent and owner documentation, and the end-to-end smoke test

**Files:**
- Create:
  - `AGENTS.md`, `GEMINI.md`, `CLAUDE.md`, `START_HERE.md`
  - `docs/QUALITY_RUBRIC.md`, `docs/STYLE_PACK_GUIDE.md`, `docs/steps/01-idea.md` … `docs/steps/14-release.md`
  - `prompts/DAILY.txt`, `prompts/NEW_STYLE.txt`
  - `.agents/skills/youtube-studio/SKILL.md`
  - `tests/e2e/fixture-en/`, `tests/e2e/fixture-hi/`, `tests/e2e.test.cjs`
- Test: `tests/e2e.test.cjs`

**Interfaces:**
- Consumes: every command above.
- Produces:
  - **`AGENTS.md`** (≤ 60 lines) holds the rules from §11 verbatim in substance:
    - run `npm run next -- <project>` before and after every step; follow the named playbook;
    - never create or edit `approvals/`, `outputs/score/owner.json`, `config/qc.json`, `config/pin.json` or generated files (`beats.json`, `outputs/**`); never run `pin:set`;
    - plan only beat types listed by `node tools/studio.cjs beats`;
    - no photoreal real people; tag every sentence;
    - report anything unchecked; on exit code 75, stop and tell the owner to resume later;
    - never make paid API calls.
  - `GEMINI.md` and `CLAUDE.md` each contain one line: `Read and follow AGENTS.md.`
  - **`docs/steps/*.md`:** one per step, each with: what this step is for; inputs; the exact command(s); done-criteria (the check that must pass); common failures and fixes; and, for agent-authored steps (idea, research, outline, script, plan, image generation, Shorts nomination, thumb texts), the writing guidance:
    - `03-outline.md` includes the retention structure: a hook ≤ 30 s, open loops, a re-hook every 60–90 s, a payoff.
    - `04-script.md` covers writing for the ear, sentence tagging, attribution wording for allegations, and absolute dates.
    - `08-plan.md` gives the beat-type catalogue with when to use each, and the 6 s rule.
    - `09-assets.md` covers image prompt fulfilment via the agent's own image tool or the owner, and stock picking by viewing `candidates.jpg`.
  - **`docs/QUALITY_RUBRIC.md`:** per category, what 100 / 90 / 75 / 50 looks like, with concrete examples (including "a two-box slide held 17 s" as a G fail and "debug HUD" as a hard fail).
  - **`START_HERE.md`** (owner's one page):
    - one-time setup: keys, `npm run doctor`, `npm run pin:set`, music/SFX downloads, channel files;
    - the daily loop (paste `prompts/DAILY.txt`, answer the 5 stops, run `npm run release`);
    - where the release folder is.
  - **`prompts/DAILY.txt`:** fill-ins for topic, channel, language, length, formats, style (`suggest` or a pack id plus accents) and must-include points. Then: "Run `npm run next -- <project>` and follow it until it asks for my review."
  - **The e2e test** (uses mocked Gemini and stock fetch, plus fixture WAVs/images; runs `align` live only when `STUDIO_LIVE=1`) drives a 45-second English fixture and a 45-second Hindi fixture through every step with approvals signed by a test PIN. It asserts: `release/…/master.mp4` exists; `score.json.releasable` (with fixture AI/owner scores at 96/Excellent); the QC static longest ≤ 6; and no hard failures.
- [ ] **Step 1:** Write `tests/e2e.test.cjs` with the assertions above. Run `npm test`. Expected: FAIL (fixtures and docs missing).
- [ ] **Step 2:** Create the fixtures and fix every integration gap the e2e run exposes (each fix gets its own unit test in the owning task's test file).
- [ ] **Step 3:** Write the docs, prompts and skill. Verify that every command named in the docs exists in `package.json` with a test: `tests/docs.test.cjs` greps `npm run ([\w:]+)` across `docs/`, `START_HERE.md`, `AGENTS.md` and `prompts/`, and asserts each is a defined script.
- [ ] **Step 4:** Run `npm test` and `npm run lint`. Expected: PASS.
- [ ] **Step 5:** Commit with `docs: agent rules, step playbooks, rubric, owner guide; test: end-to-end`.

---

## Milestone 5: Production validation (with the owner)

These tasks need the owner at the five stops, so they are run, not unit-tested. Their "test" is the release gate itself.

### Task 23: The CJP video

- [ ] **Step 1: Owner setup.** Check that all of these are in place:
  - keys in `.env`; `npm run doctor` is all green;
  - `npm run pin:set` done by the owner;
  - 20–30 YouTube Audio Library tracks plus SFX listed in their index files;
  - real channel folders replacing the placeholders;
  - the owner has looked at `library/maps/SOURCES.md`.
- [ ] **Step 2:** `npm run new -- cjp --channel=<owner's choice>`. Seed `research.json` from `..\Codex\projects\cjp\research.json` as **leads**: every claim is set to status `unverified` until re-checked against its source, and the check fails while any `unverified` remains. Legacy images from `..\Antigravity\Antigravity_35_Styles\production_15min\assets\images` may be reused only if they pass `images:check` and the no-photoreal-real-people rule. Record them in the ledger as `legacy-antigravity` with the original prompt.
- [ ] **Step 3:** Drive the project with `npm run next` through all five stops. Log any pipeline defect found during the run as a test plus a fix in the owning task's files (with a commit per fix).
- [ ] **Step 4:** Run `npm run release`. Done when `score.json.releasable` is true with the owner's real ratings.
- [ ] **Step 5:** Commit with `chore: CJP release` (the project folder's source files only; `work/` and the media stay git-ignored).

### Task 24: A second topic in a different style and language

- [ ] **Step 1:** The owner picks a topic. Use a different main pack than CJP's, and the other language (Hindi if CJP was English, or vice versa).
- [ ] **Step 2:** Run it end to end, as in Task 23, Steps 2–4.
- [ ] **Step 3:** Phase 1 is done when both releases exist with `releasable: true`. Record the measured render times and owner time per stop in `docs/PHASE1_REPORT.md` and commit.
