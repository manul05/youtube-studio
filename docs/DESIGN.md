# Claude YouTube Studio: Design

Status: draft for owner approval · Date: 2026-10-24 · Location: `F:\YouTube\Test Project\Claude`

## 1. Intent

The owner is a YouTuber publishing **one video a day**, on varied topics, in varied visual styles and in more than one language. Two earlier attempts exist on this PC:

- `..\Antigravity\Antigravity_35_Styles`: strong AI artwork, but debug text is burned into the frames. The voice is sped up 32–35% to fit fixed 15-second slots, followed by dead air. Subtitles are paragraphs, and the promised animations were never wired in. Scored 34/100.
- `..\Codex`: sound engineering (timing from measured narration, a research ledger, QC gates, captions, loudness), but it looks like a slide deck. Single slides hold for 17–20 seconds, it uses almost no artwork, the thumbnail is weak, the code is compressed into unreadable lines, and it is hard-wired to one project. Scored 57/100.

This studio keeps Codex's discipline and fixes what made both unwatchable. **The quality bar must live in the pipeline, not in the agent.** The owner drives the studio daily through Google Antigravity or OpenAI Codex (Claude Code also works). Whichever agent is used, the commands, checks and review stops are the same, so a weaker agent run cannot ship a weaker video. It can only be blocked with a clear list of what to fix.

**Success:** every published video scores **95+** on the rubric in §9, with no hard failure. It takes about 45–60 minutes of the owner's attention, and the rest is agent and machine time.

## 2. Goals, non-goals, anti-goals

**Goals**
1. Any topic, any style pack, English / Hindi / Hinglish, long-form (8–20 min, 16:9) and Shorts (≤ 59 s, 9:16) from the same project.
2. Narration-led timing: the measured voice sets every cut. Audio is never sped up to fit a slot.
3. Dense, purposeful visuals: a meaningful visual change at least every 6 seconds (target median 3–5 s long-form, 1.5–3 s Shorts).
4. AI artwork plus stock footage plus native motion graphics, all matched to the chosen style.
5. A research ledger for every factual claim, with dated sources and attributed allegations.
6. Five human review stops (§7), each a local web page with approve / request-change controls.
7. Upload-ready package: master MP4, Shorts, captions (SRT/VTT), chapters, 3 titles, 3 thumbnails, description with sources, and an asset/licence ledger.
8. Style picker: a gallery with preview clips, topic-based suggestions, and mixing (one main style plus up to two accents).
9. Code a human and any agent can read: normal formatting, no golfed one-line modules, tests.

**Non-goals (for now)**
- Automatic upload to YouTube (the owner uploads; the package is ready for it).
- News or broadcast footage, film clips or any third-party copyrighted media beyond licensed stock.
- Lip-synced avatars, on-camera presenters or voice cloning of real people.
- Porting all 35 legacy styles on day one (see §12 phasing).
- macOS/Linux support (Windows 11 on this PC is the target; nothing should be gratuitously Windows-only).

**Anti-goals (failure even if it "works")**
- A green report on a boring video. Pacing and visual variety are scored, not just file validity.
- Any debug label, frame counter or layout ID visible in a release frame.
- Sped-up voice, clipped words, or unintended silence longer than 1.2 s.
- A factual claim with no ledger entry, or a photorealistic AI depiction of a real, identifiable person.
- A spec that promises visuals the renderer does not implement (Antigravity's failure). Plans may only reference beat types that exist in the engine.
- An agent marking a human review as passed.

## 3. Constraints (this PC, measured)

- Windows 11 Pro; Intel i5-8300H (4C/8T); 16 GB RAM with **~2.7 GB typically free**; GTX 1050 (NVENC unusable: driver too old for FFmpeg 8.1.2); Intel QSV works; F:\ has 320 GB free.
- Node 24.16, FFmpeg/FFprobe 8.1.2 (full build, including `loudnorm`, `ebur128`, `whisper` filter), Python 3.14.6, `@napi-rs/canvas` 0.1.100.
- **Devanagari shaping verified** in `@napi-rs/canvas` with the system font *Nirmala UI* (conjuncts क्ष, श्री, द्वि render correctly). Noto Sans is installed for Latin; no Noto Devanagari, so Nirmala UI is the default Indic font.
- No API keys are configured on the PC today. The design needs `GEMINI_API_KEY` (free tier: voice and AI review), `PEXELS_API_KEY` and `PIXABAY_API_KEY` (stock video, both free). Running cost per video should be **zero beyond existing subscriptions**; anything that would need a paid call must be flagged, never silently used.
- Render work must stay inside ~2 GB RAM: isolate chapters in separate processes (as Codex does), stream frames to FFmpeg, and never hold whole videos in memory.

## 4. Decisions already made by the owner

| Topic | Owner's decision |
|---|---|
| Voice | Google Gemini TTS |
| Language | Varies per video |
| Visuals | Agent-generated AI images **plus** stock footage |
| Formats | Long-form and Shorts |
| Review time | Owner has ample time; asked me to choose the stops (now §7) |
| Daily volume | One video per day |
| Driving agent | Google Antigravity and/or OpenAI Codex |
| First real project | CJP, the Cockroach Janta Party story, already attempted by both tools |
| Base from Codex | Keep its audio-led pipeline, research ledger and QC |
| Image generation | Done by Antigravity/Codex under the owner's plans; no paid image API |
| TTS tier | Gemini free tier (owner has used it for 20-minute videos) |
| Long-form captions | Caption files only (SRT/VTT), not burned in; Shorts burned in |
| Branding | Separate YouTube channel per language |

Everything below marked **(my call)** is the designer's decision, not the owner's, and can be overridden.

## 5. Architecture overview

```
idea → research → outline → script → [STOP 2] → voice sample → [STOP 3] → full voice
     → alignment → beat plan → assets (AI images, stock, maps) → storyboard → [STOP 4]
     → render chapters → master → Shorts → packaging → QC + AI review → [STOP 5] → release package
[STOP 1] sits between idea and research.
```

### 5.1 The control loop: one command tells the agent what to do next (my call)

- `npm run next -- <project>` reads the project's state and prints the single next step: its command, its playbook file (`docs/steps/NN-*.md`) and any blocking issues. Agents are instructed to run this before and after every step. This is what makes Antigravity and Codex behave identically.
- Each step writes `work/stamps/<step>.json` containing hashes of its inputs and outputs. If an upstream file changes, every downstream stamp becomes stale and `next` routes back to it. A previous green check never survives a source change (taken from Codex).
- Human stops are separate gates (§7). Steps after a gate refuse to run until that gate has an approval matching the current content hash.

### 5.2 Engine (my call: keep the proven Codex/Antigravity core)

- **Renderer:** Node + `@napi-rs/canvas` drawing each frame, piping raw RGBA to FFmpeg `libx264` (CRF 18, `yuv420p`, BT.709). There is one isolated child process per chapter, and the master is concatenated without re-encoding.
- **30 fps** for both formats (60 fps on graphics-led content tripled file size for no visible gain in the Antigravity master).
- **Stock video inside canvas:** an FFmpeg child process decodes each clip, already scaled and cropped to the slot size, into raw frames that the renderer composites. This allows titles, captions and transitions over the footage.
- **Rejected alternative:** Remotion/headless Chrome. It is easier for agents to style with HTML/CSS, but the PC audit showed 30–90 ms of capture overhead per frame and RAM pressure. Revisit only if canvas style authoring proves too slow for agents.
- **Determinism:** every motion is a function of time; random values come from seeds.

### 5.3 Project folder (one per video, my call)

```
projects/2026-10-25-cjp/
  brief.json          topic, angle, audience, language, caption script, formats, style choice
  research.json       sources and claims ledger (schema from Codex, generalised)
  outline.json        chapters, retention beats, open loops
  script.json         narration per section, in the chosen language, with claim IDs
  pronunciations.json names → phonetic hints used in the TTS input
  beats.json          compiled: every visual beat with its start/end frame (generated, not hand-edited)
  assets/             images/, stock/ (downloaded, untrusted), thumbs/, ledger.json
  approvals/          written only by the review server (§7)
  work/               stamps, audio, chapter renders, previews
  outputs/            master, Shorts, captions, thumbnails, description, QC, score
```

### 5.4 Repository layout

```
AGENTS.md            the single source of agent rules (read by Codex and Antigravity)
GEMINI.md, CLAUDE.md pointers to AGENTS.md
START_HERE.md        the owner's daily guide (one page)
docs/                DESIGN.md, QUALITY_RUBRIC.md, steps/01-idea.md … 14-release.md, STYLE_PACK_GUIDE.md
engine/              timeline, render, audio, captions, alignment, qa, scoring, review-server
styles/<id>/         one folder per style pack (§6)
library/             music/, sfx/, maps/, fonts/ (owner-supplied media; see §10)
projects/            one folder per video
tools/               CLI (`studio.cjs`), setup doctor, gallery builder
tests/               unit + golden-frame tests
```

## 6. Style system

### 6.1 Style pack

Each `styles/<id>/` contains:

- `style.json` with: palette tokens; fonts per writing system (Latin, Devanagari); caption style; transition set; motion personality (spring stiffness, reveal speeds); music mood tags; an **image-prompt suffix** so AI artwork matches the style; a stock-footage grade (colour treatment, grain); and supported formats (16:9, 9:16).
- `components.cjs`: draw functions implementing the **beat types** (§6.3) in that style's look. A pack must implement every core beat type or declare a fallback to the `base` pack.
- `preview.mp4` (20 s) and `card.png`, produced automatically by `npm run style:preview -- <id>` from a fixed demo script in English and Hindi.

`npm run style:check -- <id>` renders every beat type at entry, action and settled states in 16:9 and 9:16, with Latin and Devanagari text. It runs bounds, contrast and safe-area checks and fails on any missing beat type. A new style is only selectable after this passes.

### 6.2 Choosing and mixing

- **Gallery** (`npm run styles` → local page): every pack's preview clip, best-for tags, and a "mix with" compatibility list.
- **Suggest:** at stop 1 the agent proposes three packs for the topic and tone, with one sentence each, chosen from tags in `style.json`.
- **Mix:** `brief.json` takes `{ "main": "editorial", "accents": { "map": "blueprint", "quote": "kinetic" } }`. Accents can only take over specific beat types and always inherit the main pack's palette and caption style (my call), so mixed videos stay coherent. Maximum two accents.

### 6.3 Beat types (the visual vocabulary)

Plans may use **only** beat types the engine implements (the anti-goal in §2). The core set:

| Beat type | What it shows | Typical length |
|---|---|---|
| `art-focus` | AI image with a purposeful camera move to a named region of interest (not a generic slow zoom) | 3–6 s |
| `art-tour` | One image, 2–3 detail crops in sequence | 6–10 s, changes every 2–4 s |
| `stock` | Stock clip, graded to the style, optional lower third | 2–5 s |
| `kinetic` | Key phrase as animated typography | 2–4 s |
| `quote` | Attributed quote with source and date | 4–6 s |
| `stat` | Animated number with context and source | 3–5 s |
| `compare` | Two sides building in sequence | 4–6 s |
| `timeline` | Dated events revealed along an axis | 5–10 s, reveal every 2–3 s |
| `map` | India/world map, highlight, route or pins (offline GeoJSON) | 4–8 s |
| `document` | Document or headline card with highlight sweeps (recreated, labelled) | 4–6 s |
| `list` | 2–4 items revealed on the voice | 4–8 s |
| `chart` | Bar or line chart building | 4–8 s |
| `chapter` | Chapter title card | 2–3 s |
| `endcard` | Subscribe / next-video end screen (20 s, YouTube end-screen safe areas) | 20 s |

Every beat that holds longer than 6 s must contain internal reveals so that the measured static interval (§9) stays ≤ 6 s.

## 7. The five human stops

Each stop is a page served by `npm run review -- <project>` on `127.0.0.1`. **Only this server writes `approvals/*.json`.** Each approval records the stop, a timestamp and a content hash. Agents are instructed never to create or edit approvals; if a hash mismatches, `next` treats the stop as unapproved.

**Owner PIN (my call):** agents run as the same Windows user, so instructions alone cannot stop a "helpful" agent from writing an approval. At setup the owner chooses a PIN. The review server derives a key from it (PBKDF2, salt stored on disk, PIN never stored) and signs each approval with HMAC over stop + content hash + timestamp. `npm run release` asks the owner to type the PIN once and verifies every signature before assembling the package. `next` treats unsigned approvals as missing. An agent therefore cannot produce a releasable package without the owner.

| Stop | Shows the owner | Owner's action | Time |
|---|---|---|---|
| 1 Idea | 3 title angles, the hook (first 30 s, written out), 3 suggested styles with preview clips | Pick or edit angle and style | ~3 min |
| 2 Script | Full script in reading view; every claim linked to its source; weak or unchecked claims highlighted in red | Approve, or comment per paragraph | 10–15 min |
| 3 Voice | First 45 s of real TTS plus a list of tricky names, each with a play button | Approve voice/style, or fix a pronunciation | ~3 min |
| 4 Storyboard | One still per beat in order (contact sheet with timestamps) plus the 3 thumbnail drafts | Approve, or flag beats to redo | ~5 min |
| 5 Final | The master in a player with a "this drags" marker button, the 3 Shorts, final thumbnails and titles, and the 5-question score form (§9.3) | Score, pick the thumbnail, approve or send back | 20–25 min |

Changes requested at a stop are written to `approvals/<stop>.changes.json` for the agent to act on, then the stop is shown again.

## 8. Pipeline steps

Each step has a playbook in `docs/steps/` with inputs, outputs, exact command, done-criteria and common failures.

1. **Idea (stop 1):** the agent drafts `brief.json`: angle, audience, promise, language, caption script (Devanagari or Roman for Hinglish), length target, 3 title angles, the hook and the style suggestion.
2. **Research:** the agent researches the web and fills `research.json`. Every source has a URL, publisher, publish date, access date and a short supporting excerpt. Claims have an ID, wording, status (`verified`, `attributed`, `disputed`, `removed`) and source IDs. `npm run research:check` fails on any factual script sentence without a claim ID, a single-source claim on a contested point, or relative dates. (Codex's ledger, generalised.)
3. **Outline:** chapters with a retention plan: hook (0–30 s), promise, open loops, a re-hook every 60–90 s, payoff and ending. `npm run outline:check` validates structure and length budget.
4. **Script (stop 2):** written for the ear in the target language. English targets 145–165 words per minute; Hindi/Hinglish rates are calibrated from the measured voice. Claims are tagged inline. Section lengths are derived from the length target.
5. **Voice sample (stop 3):** Gemini TTS (model from config; currently `gemini-3.8-flash-tts`) synthesises the first ~45 s plus every name in `pronunciations.json`. The voice name, the style prompt (`speech_metadata.style`) and the language are stored in `brief.json`.
6. **Full voice (owner decision: Gemini TTS free tier, which the owner has used for 20-minute videos):** to stay within free-tier request limits, synthesise **one call per chapter** (roughly 1–2 minutes of narration, kept under the model's input-token limit), then split into paragraphs using the alignment in step 7 (my call). Retakes are per paragraph and only where `voice:check` flags a problem. On a rate-limit (HTTP 429) the step backs off, saves progress, and resumes from the cache on the next run rather than failing the project. The result is 24 kHz WAV, never time-stretched. Each file is cached by a hash of text + voice + style + model. `npm run voice:check` measures every take for clipping, silences over 0.6 s inside a paragraph, and duration against the expected words-per-minute band, and lists outliers for re-synthesis.
7. **Alignment:** Gemini TTS returns no word timings. Each paragraph is force-aligned against its **known** text using `faster-whisper` (small, int8, CPU) word timestamps matched to the script tokens (my call). This is new work: Codex's `alignSource` (`..\Codex\src\captions.cjs`) only matched Edge TTS word-boundary events to script text, so only its token-matching and punctuation-restoring logic is reusable. Unmatched words are interpolated and counted; more than 5% interpolated in a paragraph fails the step. The FFmpeg 8.1.2 `whisper` filter is the fallback.
8. **Beat plan:** the agent writes beat intents per paragraph (beat type, subject, image or stock query, on-screen text, claim ID). `npm run plan` compiles `beats.json`, snapping beat boundaries to word and phrase timings. It rejects unknown beat types, any interval over 6 s without a reveal, and any on-screen factual text without a claim ID.
9. **Assets:**
   - **AI images (owner decision: generated by Antigravity/Codex on the owner's plans, no paid image API):** `npm run images:prompts` writes `assets/image_prompts.json` and a readable `assets/IMAGE_PROMPTS.md`, each prompt with the style pack's suffix, aspect ratio and target filename. Two equivalent ways to fulfil it: (a) the driving agent's built-in image tool generates each prompt and saves to the listed name; (b) the owner pastes prompts into Antigravity/Codex/ChatGPT and drops files into `assets/images/`. `next` lists exactly which files are still missing. A Gemini image API path is **not** built in Phase 1. `npm run images:check` verifies presence, resolution (≥ 1920 px on the long edge for 16:9), aspect, and a perceptual-duplicate check. Rule: **no photorealistic depiction of real, identifiable people.** Real people appear as labelled illustration, silhouette, name card or quote card.
   - **Stock:** `npm run stock:search` queries the Pexels and Pixabay APIs and downloads candidates into `assets/stock/_incoming/` (treated as untrusted data). The agent chooses by viewing generated thumbnails; chosen clips move to `assets/stock/` with licence, URL and creator recorded in `assets/ledger.json`.
   - **Maps:** offline GeoJSON in `library/maps/` (India states, world countries), drawn natively.
   - Every on-screen illustration of a real event carries an "Illustration" tag (from Codex).
10. **Storyboard (stop 4):** `npm run preview` renders entry/action/settled stills for every beat and a contact sheet, plus thumbnail drafts.
11. **Render:** `npm run render` renders changed chapters only (hash-checked), then the master. Audio mix:
    - voice;
    - music from `library/music/`, chosen by the style and the brief's mood, auto-ducked under the voice;
    - SFX at beat events from `library/sfx/`, with a procedural fallback.
    - Two-pass `loudnorm` to −14 LUFS integrated with true peak ≤ −1.0 dBTP, re-measured after AAC encoding (from Codex).
12. **Shorts:** the agent nominates 3 self-contained 30–59 s segments, each needing a cold-open line. For each, the agent writes a 1-line new hook (synthesised with the same voice) and re-lays the same beats in 9:16 using the style pack's vertical layouts with large burned-in captions. Shorts gating (my call):
    - The new hook lines are played at **stop 3** alongside the voice sample.
    - Vertical storyboard stills appear at **stop 4**.
    - The Shorts are watched and rated at **stop 5**.
    - Each Short must reach 95 on the Shorts rubric (§9.5) to be included in the release. A Short that fails is dropped from the package with its reasons listed, and does not block the long-form release.
    - Phase 1 derives Shorts from a long-form project. Standalone Shorts-only projects (`formats: ["short"]`, a 9:16-first path with no master) come in Phase 2.
13. **Packaging:** 3 titles (≤ 60 chars, no clickbait that the video doesn't pay off); 3 thumbnails (see below); a description with chapters, a sources list and an AI-use note; tags; a pinned-comment draft; and a YouTube "altered or synthetic content" disclosure recommendation (yes when realistic synthetic imagery of events is shown).
    - Thumbnails: an AI base image generated with empty space for text, composited text of ≤ 4 words, and the style's palette.
    - `thumbs:check` downsizes each thumbnail to 168×94 and 320×180 and measures text height (≥ 18% of the thumbnail height), contrast ratio (≥ 4.5:1) and clutter (edge density). It also checks that the text differs from the title.
14. **QC, AI review, final stop, release:** automated QC (§9.1), then the independent AI review (§9.2), then stop 5, then `npm run release`, which assembles `outputs/release/` only when the score is ≥ 95 with no hard failure and every gate is current.

## 9. Quality rubric and the 95+ score

Full rubric with examples goes in `docs/QUALITY_RUBRIC.md`. Categories and weights (long-form):

| # | Category | Weight | Scored by |
|---|---|---|---|
| A | Hook and first 30 s | 10 | AI review + owner |
| B | Story and script | 15 | AI review + owner |
| C | Facts and safety | 10 | Code (ledger) + AI review |
| D | Voice | 10 | Code (levels, pace) + owner |
| E | Audio mix | 5 | Code |
| F | Visual quality and style coherence | 15 | AI review + owner |
| G | Pacing and motion | 15 | Code (static interval) + AI review + owner |
| H | Captions and readability | 5 | Code |
| I | Packaging (titles, thumbnails, description) | 10 | Code (thumbnail checks) + AI review |
| J | Technical delivery | 5 | Code |

**Release requires:** total ≥ 95, every category ≥ 80% of its weight, and zero hard failures.

**Hard failures** (score capped at 59 until fixed): debug text in a release frame; an unledgered factual claim; a photorealistic AI depiction of a real person; a sped-up voice; unintended silence > 1.2 s; a static interval > 6 s; a loudness miss (outside −15 to −13 LUFS, or true peak above −1.0 dBTP); a stale gate; a missing licence for any stock/music asset.

### 9.1 Automated measurements (code)

- **Static interval:** a frame-difference analysis of the encoded master, using a perceptual difference on a 320 px downscale against a threshold calibrated on the style previews. Reports the longest interval, the median change interval, and a histogram.
- Loudness, true peak, voice-to-music ratio during speech (≥ 15 dB), and silence detection.
- **Captions (owner decision: long-form captions are SRT/VTT files only, not burned in; Shorts are burned in).** Sidecar cues: ≤ 2 lines, ≤ 42 characters per line for Latin (Devanagari limit calibrated by rendered width), reading speed ≤ 20 characters/s, minimum 0.7 s, no overlaps, timings within 100 ms of aligned words. Burned Shorts captions and all on-screen text: safe-area bounds on transformed text (from Codex) and contrast. Long-form layouts do not reserve a caption strip, but keep the bottom 12% free of essential text so YouTube's own captions don't cover it.
- Stream specs, frame count, full decode, and a hash chain over every input.
- OCR scan of sampled frames for debug-pattern text (`FRAME`, `LAYOUT`, `SHOT nn/`), as a hard failure.

### 9.2 Independent AI review (my call)

`npm run review:ai` sends the rubric, the script, the research ledger summary, contact sheets (one frame every 2 s, tiled 12 frames per image to keep the request small enough for the free tier), the first-30-second frames and the thumbnails to a Gemini model **in a fresh API call** (free-tier Flash model from `config/models.json`), separate from whichever agent built the video, and requests structured per-category scores with time-coded reasons. Because it is a direct API call rather than the building agent's opinion, it behaves the same whether Antigravity or Codex is driving. Its output is advisory input to the score, not a pass by itself.

### 9.3 Owner score (stop 5)

The owner rates five things on an anchored five-level scale rather than 1–10 (my call). This lets 95 be reached by a genuinely publish-ready video without demanding perfection on every axis.

| Level | Meaning | Share of category points |
|---|---|---|
| Excellent | Nothing I'd change | 100% |
| Good | One small nit | 90% |
| OK | Noticeable weakness | 75% |
| Weak | Needs rework | 50% |
| Bad | Unusable | 0% |

| Owner question | Feeds categories |
|---|---|
| Does the opening grab me? | A |
| Did it stay interesting the whole way? | B and G |
| Does the voice sound right, with names correct? | D |
| Do the visuals look good and fit the style? | F |
| Would I click this thumbnail? | I |

For A, B, D, F, G and I, the category score is the **lower** of the AI review and the owner rating (my call: prevents either from inflating the result). Any category rated OK or worse falls below the 80% floor and blocks release, which is intended. "Drags" markers become fix items, and the stop is shown again after fixes.

### 9.5 Shorts rubric (my call)

| # | Category | Weight |
|---|---|---|
| A | Hook in the first 2 s (cold open, no logo, no "in this video") | 20 |
| B | Self-contained story with a payoff | 15 |
| C | Facts and safety | 10 |
| D | Voice | 10 |
| E | Audio mix | 5 |
| F | Visual quality | 15 |
| G | Pacing: static interval ≤ 3 s, median change 1.5–3 s | 15 |
| H | Burned captions: large, in the 9:16 safe zone clear of YouTube's UI overlays | 5 |
| J | Technical: 1080×1920, ≤ 59 s, loudness as long-form | 5 |

The same release rule applies: ≥ 95, every category ≥ 80%, no hard failures. The owner's ratings map as in §9.3 (thumbnail question omitted).

### 9.4 Honesty rule

No threshold may be changed, and no review marked passed, in order to reach 95. The score page shows which parts were measured, AI-judged and human-judged.

## 10. Media library and keys (owner-supplied)

- `library/music/`: 20–30 tracks from the YouTube Audio Library (free, safe for monetisation), each listed in `library/music/index.json` with mood, tempo and licence. The pipeline picks and loops tracks per chapter.
- `library/sfx/`: a small free SFX set (whoosh, hit, click, riser, paper, typing). Procedural fallbacks exist.
- `library/channels/<channel-id>/` (owner decision: **separate channels per language**): `channel.json` (name, handle, language, default caption script, default voice name and style prompt, default music moods), `logo.png`, an end-screen layout, and an optional thumbnail brand mark. `brief.json` names the channel; the endcard, thumbnails, description footer and voice defaults come from it. Until the owner supplies real files, a neutral placeholder channel per language is used and `next` flags it before release.
- `.env` (git-ignored): `GEMINI_API_KEY` (free tier: TTS and the AI review), `PEXELS_API_KEY`, `PIXABAY_API_KEY`. `npm run doctor` verifies each key with a minimal call, along with FFmpeg, fonts and Python packages.
- Model IDs live in `config/models.json`, because Gemini model names change often. `doctor` reports any deprecated ID.

## 11. Agent instructions (how Antigravity and Codex follow it)

- `AGENTS.md` (concise) contains the rules: run `npm run next` before every step; follow the step playbook; never edit `approvals/`, generated files (`beats.json`, `outputs/`) or thresholds; plan only implemented beat types; no photoreal real people; cite claims; report anything unchecked.
- `GEMINI.md` and `CLAUDE.md` contain one line pointing to `AGENTS.md`.
- `.agents/skills/youtube-studio/SKILL.md` mirrors the daily loop for agents that load skills.
- **Daily prompt:** `prompts/DAILY.txt` is a fill-in template: topic, language, length, style (or "suggest"), any must-include points. The owner pastes it, and the agent takes it from there via `npm run next`.
- **New style prompt:** `prompts/NEW_STYLE.txt` builds a pack from a reference (for example a videozero style page or a screenshot) using `docs/STYLE_PACK_GUIDE.md`, and loops until `style:check` passes.

## 12. Phasing

- **Phase 1 (core, proven on CJP):**
  - Engine, all 14 steps, review server, rubric, QC and AI review.
  - Five style packs chosen for CJP-type content and general use (my call):
    - `editorial` (investigative print);
    - `map-doc` (map documentary);
    - `evidence` (evidence board);
    - `kinetic` (accent);
    - `vertical-captions` (Shorts).
  - **Done when:** the CJP project (English or Hindi, per stop 1) passes release at ≥ 95 with owner review, and one second topic in a different style and language also passes.
- **Phase 2:** port the remaining videozero/Antigravity styles as packs, using the legacy outputs and videozero pages only as visual references. Then add the extra styles identified: photo parallax, newspaper collage, Indian explainer, motion comic, infographic characters.
- **Phase 3 (optional):** a retention feedback loop that reads YouTube Studio exports (CSV) and feeds them into outline guidance.

The CJP research starts from Codex's `projects/cjp/research.json` (20 sources) as **leads**. Every claim is re-verified before use. Legacy AI images in `..\Antigravity\…\production_15min\assets\images` may be reused where they pass the image rules, with their provenance recorded.

## 13. Left to the builder

- Internal module boundaries and function names; test framework (Node's built-in test runner is fine).
- Exact frame-difference threshold calibration method, as long as it is documented and calibrated on the style previews.
- Music chapter-looping and crossfade technique; SFX procedural fallbacks.
- Review server tech (plain Node `http` with static HTML is sufficient).
- `faster-whisper` model size if `small` proves too slow or inaccurate for Hindi (measure first, then document).

## 14. Calls made by the designer (for owner review)

1. Five review stops and their contents (§7).
2. One `npm run next` control loop plus content-hash stamps.
3. Keep the canvas + FFmpeg engine, at 30 fps; Remotion rejected for now.
4. TTS one call per paragraph; forced alignment with `faster-whisper` against the known text.
5. Independent Gemini review call; subjective scores take the lower of AI and owner.
6. No photorealistic AI images of real people; illustrations labelled.
7. Music from the YouTube Audio Library, kept in a local library; a small free SFX set.
8. The phase 1 style packs listed in §12.
9. Mixing limited to one main pack plus two beat-type accents that inherit the main palette.
10. Owner ratings on an anchored five-level scale with an explicit category mapping (§9.3).
11. Owner PIN that signs approvals, verified at release (§7).
12. Shorts gated through stops 3–5 and their own rubric; a failing Short is dropped, not blocking (§8.12, §9.5). Shorts-only projects in Phase 2.
13. Iteration speed: chapter-level re-render by hash already limits a stop-5 send-back to the changed chapters. No separate draft-quality render path in Phase 1.
