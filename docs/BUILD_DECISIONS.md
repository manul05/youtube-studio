# Build decisions (Phase 1)

Every decision the builder made on the owner's behalf while building Phase 1, in the order made, each with what it costs if wrong. Copied from the build ledger before it was deleted. Pre-flight lines check how tasks fit together; "Final" lines come from the independent whole-branch review.

## Rulings

- T6 gate:voice names play buttons ← T7 alignment of names.wav/hooks.wav. Ruling: T7 also aligns sample files and registers gate:voice page data — T6 runs before alignment exists — cost if wrong: page shows no per-name timestamps.
- T15 storyboard ← T18 thumb drafts (later milestone). Ruling: T15 ships storyboard without drafts; T18 extends the `preview` command to compose drafts — ordering — cost if wrong: stop 4 lacks thumbnails until T18.
- Task 1: Ruling: test script uses glob "tests/*.test.cjs" instead of directory tests/ — node 24 --test treats a bare directory arg as a file — cost if wrong: none
- Task 2: Ruling: doctor also reports malformed config/local.json as a failed check (not in brief) — found when a bad local.json crashed doctor — cost if wrong: none
- Task 3: Ruling: security review fix folded in — doctor sends Gemini key via x-goog-api-key header and redacts all keys from messages — flagged by automated review — cost if wrong: none
- Task 3: Ruling: approval files are approvals/gate_<name>.json (":" replaced by "_") — Windows forbids ":" in filenames — cost if wrong: none
- Task 3: Ruling: gateContentHash lives in engine/next.cjs and each gate's covered files are in STEPS (covers()); Task 4 reuses it — Task 3 needs gate state before Task 4 exists — cost if wrong: one import move
- Task 3: Ruling: render inputs use work/voice/paragraphs/* instead of work/audio/mixed.wav — the mix is produced inside the render command, so it cannot be its own input — cost if wrong: none
- Task 3: Ruling: playbooks numbered 01-idea…14-release with voice-sample=05, voice=06, align=07, plan=08, assets=09 (matching Task 22's 08-plan/09-assets); qc, ai-review, gate:final and release share 14-release — cost if wrong: renames
- Task 3: Ruling: upstream link records the previous step's outputs digest (not its stamp time), so re-running a step with identical outputs does not invalidate downstream work — cost if wrong: none
- Task 3: Ruling: file hashes cached per project by size+mtime in work/stamps/.hashcache.json — avoids re-hashing a 900 MB master on every next — cost if wrong: an edit that preserves size and mtime exactly would go unnoticed
- Task 4: Ruling: security review — approvals are written and verified with a no-cache content hasher; the size+mtime cache stays only for `next` routing — a forged cache could otherwise hide post-approval edits at release — cost if wrong: none (release re-reads by content)
- Task 4: Ruling: security review — `next` does not verify signatures cryptographically (it cannot without the PIN); it only requires a sig to exist. The cryptographic check is verifyApprovals at release with the owner's PIN (Task 21), per design §7 — cost if wrong: `next` may route past a forged approval, but release refuses
- Task 4: Ruling: security review — gate:final also covers outputs/score/ai.json and outputs/score/score.json — post-approval score edits must void the approval — cost if wrong: none
- Task 4: Ruling: verifyApprovals checks PIN generation (pinSetAt) before the signature, so a reset reports "PIN was reset" rather than "bad signature" — clearer for the owner — cost if wrong: none
- Task 4: Ruling: the server only accepts an approval for the gate that is the current next action (409 otherwise) and rejects foreign Host/Origin headers — prevents out-of-order approvals and DNS-rebinding/CSRF — cost if wrong: none
- Task 4: Ruling: page-data registration is loaded via engine/review/register-pages.cjs, which later tasks append to — keeps server.cjs independent of page modules — cost if wrong: none
- Task 5: Ruling: research:check (research step) validates only research.json via ledgerIssues; sentence tags/claims/relative dates run in script:check via researchIssues — the script does not exist at the research step — cost if wrong: none
- Task 5: Ruling: claim status "unverified" added (fails checks until resolved) — Task 23 seeds CJP leads as unverified — cost if wrong: none
- Task 5: Ruling: re-hooks must also continue until the final minute (last re-hook to total−60 s ≤ 90 s) — otherwise one early re-hook would satisfy the rule — cost if wrong: stricter outlines
- Task 5: Ruling: Hindi/Hinglish channels use 155 wpm until the channel's wpm is calibrated from a real voice — no measured rate exists yet — cost if wrong: length estimates off by ~10–15% for Hindi until calibrated
- Task 5: Ruling: brief:check only requires style.main to be non-empty; checking that the pack exists is added in Task 13 when packs exist — cost if wrong: none
- Task 5: Ruling: sentence splitting treats "." + space as a boundary, so abbreviations like "Dr." split a sentence; playbook 04 will tell agents to avoid abbreviations — cost if wrong: an untagged-sentence false positive the agent fixes by rewording
- Task 5: Ruling: CLI commands live in per-area modules (engine/<area>/commands.cjs) merged into tools/studio.cjs — keeps the CLI file small — cost if wrong: none
- Task 5: Ruling: security review — /file serves only media/text allowlist (png/jpg/wav/mp3/mp4/srt/vtt/txt) with nosniff + CSP sandbox and symlink-resolved containment; server pages keep their own types — prevents agent-planted HTML running in the owner's review origin — cost if wrong: none
- Task 6: Ruling: TTS uses the Interactions API (POST /v1beta/interactions, x-goog-api-key, speech_metadata annotation, generation_config.speech_config[].voice) as documented on 2026-10-24; no language field (auto-detected) — the plan said to confirm against current docs — cost if wrong: one-file fix in engine/voice/gemini.cjs
- Task 6: Ruling: live TTS test (npm run test:live) SKIPPED — no GEMINI_API_KEY on this PC. Request shape is unverified against the real service until the owner adds a key — cost if wrong: first real voice run fails with a clear HTTP error
- Task 6: Ruling: voiceIssues (clipping, silences, wpm) moves to Task 7 — it needs aligned paragraph audio and word timings — cost if wrong: none
- Task 6: Ruling: voice settings = channel default voice overridden by optional brief.voice {name, style} — design §8.5 stores voice in the brief — cost if wrong: none
- Task 6: Ruling: names sample is one call ("Name. Name.") without inline pause tags — the docs call the text a verbatim transcript; avoids tags being spoken — cost if wrong: names run together slightly
- Task 6: Ruling: stale chapter/sample files for removed chapters are deleted so downstream inputs match the script — cost if wrong: none
- Task 7: Ruling: Python deps live in a project venv (.venv, git-ignored); pythonPath falls back to it. The earlier global pip install upgraded click 8.1.8→8.5.0 (breaking the owner's semgrep); I restored click 8.1.8 and uninstalled the 5 packages it added globally — owner's global Python is back to its prior state — cost if wrong: none
- Task 7: Ruling: security review — chapter ids validated as integers 1–99 and paragraph ids as c00p00 before any file path is built (also at the voice:retake entry point) — agent-written JSON must not steer writes outside the project — cost if wrong: none
- Task 7: Ruling: matching uses a lossy "sounds-like" romanised skeleton (engine/align/phonetic.cjs) instead of exact canon letters — the real spike showed whisper's Hindi spelling drifts (पंद्रह→पन्द्रा, टिप्पणी→तिप्पनी), so exact matching would fail most Hindi paragraphs; canon() is still exported as the plan specified — cost if wrong: a rare mismatch is caught by the 5% gate
- Task 7: Ruling: "interpolated" counts only words that could not be matched (spec §8.7); words timed proportionally inside a merged recogniser word are counted as `split`, not interpolated. The plan's test expected merged words to count as interpolated (Codex semantics) — the spec wins — cost if wrong: none
- Task 7: Ruling: a word anchors only when ≥50% of its sounds-like letters match AND the matches are dense (≥50%) in the recording — prevents short words stealing scattered letters from unrelated audio — cost if wrong: slightly more interpolation in noisy audio
- Task 7: Ruling: English digits from the recogniser are spelled out (15th→fifteenth, 2026→twenty twenty-six) before matching; words with no matchable letters (e.g. "a") are timed from neighbours but excluded from the 5% ratio — cost if wrong: none
- Task 7: Ruling: faster-whisper gets FFmpeg-decoded float samples instead of a file path — its bundled PyAV (19.x) rejects faster-whisper 1.2.1's open() arguments — cost if wrong: none
- Task 7: Ruling: word ids are "<paragraphId>-w<n>" (e.g. c01p02-w5) rather than "p<pid>-w<n>" — avoids the doubled "p" — cost if wrong: none
- Task 7: Ruling: align stamps only when both alignment and voiceIssues are clean (pace, pauses, clipping) — voice problems must be fixed before visuals are timed to them — cost if wrong: owner must accept/adjust pace before continuing
- Task 7: Ruling: test audio fixtures generated with Edge TTS (committed with README provenance) so the live alignment test runs without a Gemini key — cost if wrong: none
- Task 8: Ruling: cue end may run past its last word (min-duration stretch) — the 100 ms tolerance applies to the start and to "never ends before the last word ends"; otherwise the 0.7 s minimum and the 100 ms rule conflict — cost if wrong: none
- Task 8: Ruling: cues longer than 5 s are broken, and cues that cannot reach 0.7 s are merged with a neighbour — prevents flashing captions — cost if wrong: none
- Task 9: Ruling: security review — paragraph ids validated before path use in align (split/alignProject), voice check and plan compile — cost if wrong: none
- Task 9: Ruling: chapter 1 gets no title card (cold open — the hook must be the first thing seen); chapters 2+ open with a 2.5 s card; the endcard is part of the last chapter — cost if wrong: none
- Task 9: Ruling: types with internal reveals have their own max (art-tour 14 s, timeline 15 s, etc.); non-reveal types are capped at 6 s; minSec per type prevents flashing beats — cost if wrong: tuning of limits
- Task 9: Ruling: "factual" beat types (quote, stat, timeline, document, chart) require a live claim; other text beats may omit it — the plan's "factual beat" was undefined — cost if wrong: under-cited kinetic/list text, still checked by AI review under C
- Task 9: Ruling: beats.json records paragraphStartFrame and lead per beat (renderer looks up aligned words itself) — keeps beats.json small — cost if wrong: none
- Task 10: Ruling: drawText returns {height, size, lines} (the plan said "the drawn height" but its own test checks the size) — cost if wrong: none
- Task 10: Ruling: the text audit is a per-beat Set of unique strings written to work/render/<label>/textlog_NN.jsonl — logging every frame would be millions of lines — cost if wrong: none
- Task 10: Ruling: crossfade blends from a frozen copy of the previous beat's last frame (not a live re-render) — half the drawing work — cost if wrong: a moving previous beat freezes for 0.3 s during the fade
- Task 10: Ruling: Shorts safe area set to x 60–1020, y 280–1500 of 1080×1920 (plan's vertical-captions zone) for all Shorts text — cost if wrong: tuning
- Task 10: Ruling: styleForBeat uses the pack recorded on each compiled beat, applying the main palette when it is an accent — beats.json is the source of truth at render time — cost if wrong: none
- Task 10: Ruling: renders write to work/render/<label>/ (video.mp4 + chapter_NN.mp4) — the plan's work/cjp naming was Codex-specific — cost if wrong: none
- Task 11: Ruling: stockGrade uses {saturate, contrast, brightness, tint, tintAlpha, vignette, grain} applied with canvas filters, not a 3×3 colour matrix — a per-pixel matrix in JS on every 1080p frame is too slow — cost if wrong: less precise grading
- Task 11: Ruling: art-* beats in the art-focus/art-tour schema carry imagePrompt (the plan listed `image`/`label`); the illustration tag comes from beat.illustration — matches Task 9's compiled beats — cost if wrong: none
- Task 11: Ruling: packs may put components in components.cjs or components/index.cjs — base needs several files — cost if wrong: none
- Task 12: Ruling: map data built from Natural Earth (public domain) using the India point-of-view country file for India's outline; states from NE admin-1; library/maps/SOURCES.md records provenance and an "owner confirmation" line that stays NOT YET CONFIRMED until the owner checks it against the Survey of India map — cost if wrong: a map that does not match the official depiction (release check in Task 21 must require the confirmation)
- Task 12: Ruling: compare reveals the i-th point of both sides together (one step ≤ 2.5 s) — required for "3 points per side by 7.5 s" — cost if wrong: none
- Task 12: Ruling: numbers format with Indian grouping (20,00,000) — the first channels are Indian-audience channels — cost if wrong: international English viewers see lakh grouping; make it a channel setting later
- Task 12: Ruling: render-failure test switched from 'stat' to 'hologram' — packs now fall back to base, which draws stat — cost if wrong: none
- Task 13: Ruling: Shorts layout unit = width/760 (≈1.42×) so text sized for 1920-wide screens is readable on phones; compare stacks vertically in Shorts; stock lower-thirds and map pin labels always use white text on their dark bars (Editorial's dark ink was unreadable) — found by visual inspection of check sheets
- Task 13: Ruling: packs declare roles (main / accent / shorts) and explicit `fallback` lists; suggestions exclude base, accent and Shorts-only packs and packs whose last style:check failed — cost if wrong: none
- Task 13: Ruling: the gallery is a static HTML file (styles/gallery.html, opened directly) rather than served by the project review server — the gallery is not project-specific — cost if wrong: none; previews and gallery are git-ignored and rebuilt by `npm run styles`
- Task 13: Ruling: brief:check now fails when style.main or an accent names a pack that does not exist (deferred from Task 5) — cost if wrong: none
- Task 14: Ruling: image origin is recorded with `images:record --origin=…` (agent-generated:<agent> | owner-supplied | legacy-antigravity); images:check requires a matching sha so a swapped image must be re-recorded — cost if wrong: one extra command per video
- Task 14: Ruling: stock downloads only from https *.pexels.com / *.pixabay.com, ≤ 200 MB, video content-type; candidates live in assets/stock/_incoming (git-ignored, untrusted) and are only decoded by FFmpeg — cost if wrong: none
- Task 14: Ruling: cropFor moved to engine/render/crop.cjs (shared by image checks and style packs) — cost if wrong: none
- Task 14: Ruling: `next` names the command (images:check) rather than listing missing files itself; images:check lists each missing file and problem — cost if wrong: one extra command for the agent
- Task 15: Ruling: storyboard stills are JPEG (quality 88) not PNG — ~180 beats × 3 full-HD PNG stills would be ~1.5 GB per video — cost if wrong: slight JPEG artefacts in review stills only
- Task 15: Ruling: Shorts vertical stills are added to the storyboard by Task 17 (Shorts plans do not exist yet); thumbnail drafts appear on the stop-4 page once Task 18 writes them — ordering — cost if wrong: none
- Task 15: Ruling: stills reuse the chapter renderer's own asset loading and word timing (exported loadBeatAssets/beatWords), so a still is exactly what the render will draw — cost if wrong: none
- Task 16: Ruling: levels — voice normalised to -16 LUFS, each chapter's music bed to -30 LUFS before sidechain ducking (threshold 0.02, ratio 8, attack 15 ms, release 350 ms), effects at -18 dBFS; then the mix is normalised in a second linear pass to -14 LUFS / TP -1.5 — the plan gave ducking settings but not bed levels — cost if wrong: music may feel quiet; tune MUSIC_LUFS
- Task 16: Ruling: the effects track is synthesised/mixed in JS block by block (10 s blocks) instead of one FFmpeg input per cue — hundreds of cues would exceed command-line limits and memory — cost if wrong: none
- Task 16: Ruling: STUDIO_LIBRARY_DIR overrides library/ (music, sfx) for tests; music/sfx READMEs tell the owner how to fill index.json — cost if wrong: none
- Task 17: Ruling: security review — second-pass loudnorm values coerced to finite numbers (last JSON block only); music/sfx index entries must be plain audio file names inside library/<kind>/ — cost if wrong: none
- Task 17: Ruling: in Shorts, landscape art sits sharp in a square band over a darkened low-res copy of itself (the standard Shorts look) instead of being cropped to 9:16 — a 9:16 crop of a 1376×768 image would magnify ~432 source px to 1080 — cost if wrong: less full-bleed Shorts frames
- Task 17: Ruling: Shorts captions wrap at 20 Latin characters per line (long-form keeps 42); caption overlay draws the cue in a dark box at the bottom of the Shorts safe area and highlights the word being spoken — cost if wrong: none
- Task 17: Ruling: Shorts re-use long-form beats re-timed onto the span; art-focus beats longer than 3 s become 3-crop tours; other static types are left for the QC static check to flag — cost if wrong: an occasional Short failing the 3 s rule
- Task 17: Ruling: Short beats carry `sourceBeat` and their own aligned `words`; images/clips resolve through sourceBeat (no copies in assets/, which would invalidate the assets stamp) — cost if wrong: none
- Task 17: Ruling: Shorts storyboard stills go to outputs/storyboard-shorts/<id>/ (covered by the storyboard step and gate); `preview` plans the Shorts so stop 4 shows them — cost if wrong: none
- Task 17: Ruling: shortsMeasuredIssues validates the sentence range before the hook, so an unknown sentence is reported first — cost if wrong: none
- Task 18: Ruling: thumbnails use a condensed headline font role ("Condensed": Impact, fallback Arial Bold) unless a pack sets fonts.thumb — with the packs' wide display fonts no word longer than ~5 letters can reach the spec's 18% cap height — cost if wrong: thumbnails look less "on-brand"
- Task 18: Ruling: headline area widened from the left 55% to 62% of the thumbnail (40 px margins) — 55% left too little width for 18% text — cost if wrong: text may overlap the subject (visible at stop 4)
- Task 18: Ruling: the compositor guarantees contrast by choosing white/near-black text from the background under it and adding a scrim when still < 4.5:1; the measured background luminance is stored for the check — cost if wrong: none
- Task 18: Ruling: the 18% text-height rule is checked once from the measured cap height (a share, identical at 168×94 and 320×180); contrast and clutter (Sobel edge density > 160 at 320×180, max 20%) are checked on the image — cost if wrong: clutter threshold may need tuning on real thumbnails
- Task 19: Ruling: static-interval QC samples the encoded video twice per second and uses the motion-compensated detector from Task 13 with the main pack's calibrated threshold; the endcard (and any quiet window longer than the limit) is exempt — cost if wrong: ±0.5 s precision
- Task 19: Ruling: unintended-silence check runs on the narration track (work/audio/voice.wav) with chapter cards and the endcard exempt — the final mix always has a music bed, so silence in the master would never be detected — cost if wrong: none
- Task 19: Ruling: NaN is matched case-sensitively as a whole word in the debug-text audit — case-insensitive "nan" would flag words like "financial" or "Nanded" — cost if wrong: none
- Task 19: Ruling: long-form caption files (outputs/package/captions.srt/.vtt) are written by the package step and re-derived by QC; stream/decode failures, debug text, static > limit, loudness misses, silences, research and ledger problems are hard failures; captions, thumbnails, titles and voice-to-music are blocking issues in their categories — cost if wrong: none
- Task 20: Ruling: the plan's example "AI 96 + owner Excellent → total 96" was loose arithmetic; with D/E/H/J at full marks the rubric sum is 97.0 — test states 97 — cost if wrong: none
- Task 20: Ruling: AI review scores only A, B, C, F, G, I (long) / A, B, C, F, G (Shorts) — it sees frames and text, not sound; D comes from the owner, E/H/J from code — matches design §9's "scored by" column — cost if wrong: none
- Task 20: Ruling: a subjective category with no AI or owner score yet scores 0 (the plan's pseudocode gave such categories 1 via qcPass) — an unreviewed category must not pass — cost if wrong: none
- Task 20: Ruling: owner ratings are saved through POST /gate/gate:final/ratings with the PIN (validated levels, picks, drag markers, per-Short ratings) — the only writer of outputs/score/owner.json; it recomputes score.json so the owner sees the score before approving — cost if wrong: none
- Task 21: Ruling: release recomputes the score in memory from qc.json, ai.json and owner.json (it does not trust or rewrite score.json, which the final approval covers) — cost if wrong: none
- Task 21: Ruling: release also refuses a map video while library/maps/SOURCES.md says "NOT YET CONFIRMED", and the release command requires an interactive terminal (PIN typed by the owner) — cost if wrong: none
- Task 21: Ruling: channel lookup honours STUDIO_LIBRARY_DIR/channels first (tests) and validates channel ids before building paths — cost if wrong: none
- Task 21: Ruling: release files are named master.mp4, short_<id>.mp4, thumbnail_A/B/C.png (A = owner's pick), titles.txt (pick first) plus the package files, sources.md, asset_ledger.json, score.json, UPLOAD_CHECKLIST.md and release.json (sha256 of each) — cost if wrong: none
- Task 22: Ruling: the unintended-silence check subtracts the intended quiet windows (chapter cards, endcard) from each detected silence and flags only a leftover piece ≥ 1.2 s — the narration silence around a card runs a little past the card's window, which the "fully inside" test misread as a 3 s fault — cost if wrong: a real ≤1.2 s gap right next to a card goes unflagged
- Task 22: Ruling: a caption faster than 20 characters/s is held on screen longer (up to the next cue, or 1 s after its last word for the final cue), rounded up to the next whole ms +1 ms; if there is no room it merges with the next cue when the pair fits in 2 lines. The checker stays strict — cost if wrong: captions linger up to ~0.3 s after speech
- Task 22: Ruling: Tasks 23 (CJP video) and 24 (second topic) are owner-gated — they need real Gemini keys, the owner's PIN, music library, real channels, map confirmation and the owner's ratings/release command, none of which an agent may supply — left for the owner as Milestone 5 — cost if wrong: none
- Final: Ruling: re-graded Minor→Important and fixed: multi-word pronunciation + possessive crashed align ("Modi's") — common in Indian news with no agent fix — "a name with a multi-word pronunciation still maps back when it is possessive" RED→GREEN, suite 164/164
- Final: Ruling: re-graded Minor→Important and fixed: searchStock recursive delete from an unvalidated beat id — data loss outside the project — "stock search refuses a beat id that would reach outside the project…" RED→GREEN, suite 164/164
- Final: Ruling: score.json no longer carries scoredAt (side effect of the release comparison) — this also removes the minor "npm run score voids the final approval" — cost if wrong: none
- Final: Ruling: release bar (95 / 80% / 59) moved from config/qc.json into code (RELEASE_BAR); the other per-check limits (static 6 s, LUFS, captions) stay in config/qc.json, guarded only by AGENTS.md and git history — owner should glance at `git diff config/` — cost if wrong: an agent loosening a per-check limit in config would not be caught by code
- Final: Ruling: map India confirmation is now both the SOURCES.md line (once) and a typed YES at every map release — SOURCES.md is agent-editable — cost if wrong: one extra prompt per map video
- Final: Ruling: Hindi numbers are excused (timed from the gap, not counted) rather than spelled in Hindi — no Hindi number lexicon needed, works for Hinglish too — cost if wrong: a non-number word mis-heard as digits is not counted against 5%

## Deferred minor issues (not fixed)

- stop-4 page lists only long-form storyboard sheets, not outputs/storyboard-shorts (owner sees Shorts at stop 5)
- captions are checked per paragraph; a paragraph's last cue held up to 1 s may overlap the next paragraph's first cue in the exported SRT
- silence parser regex misses negative silence_start values at file start
- PIN check has no attempt limit and allows 6 digits
- images:check converts JPEG/WebP to PNG, which then fails an earlier images:record sha (re-record fixes it); WebP untested
- a beat throwing mid-render leaves its stock decoder process open until the child exits
- AI review sends every contact sheet in one request (may hit inline size limit on 30-min videos); a 429 on a Short discards the finished long-form review
- no per-paragraph / per-beat flag controls at stops 2 and 4 (free-text notes only)
- description (5000 chars) and tags (500 chars) lengths unchecked
- spec says image long edge 1920; build uses 1344 + 960 source-px crop rule (Ruling, Task 14) — DESIGN.md not updated, needs owner sign-off

## Final check

- Unit and integration tests: 164 of 164 pass; Prettier clean.
- End-to-end with simulated voice and recogniser: English 97.9 and Hindi 97.9, both releasable.
- Never run against real services: Gemini TTS, Gemini AI review (no key on this PC).

## Presenter mode (docs/FACE_VIDEO_PLAN.md) — owner answers, 2026-11-08

1. Phases: A (own voice) first, then B (face on camera).
2. Recording kit: phone or camera, 4K 30 fps landscape, clip-on lavalier mic.
3. Recording unit: one file per chapter (`recordings/c01.*`, `c02.*`, …).
4. Ad-libs: allowed; every unscripted passage is listed at stop 3 for the owner to keep or cut.
5. Thumbnail face: the owner supplies a cut-out PNG with a transparent background (no background-removal tool).
- Ruling (A1): ad-libs are shown at stop 4 (storyboard), not stop 3 — stop 3 comes before the chapters are recorded, so no ad-libs exist yet — cost if wrong: none.
- Ruling: `npm test` runs one test file at a time (`--test-concurrency=1`, about 2 minutes) — with several heavy image and video test files in parallel, a PC with ~3 GB free memory crashed render children; the checks themselves are unchanged — cost if wrong: a slower test run.
- Ruling (A2): the teleprompter shows the script's real spelling (claim tags removed), not the pronunciation hints written for the AI voice — the owner reads names naturally — cost if wrong: none.
- Ruling (A3): new owner-recording limits in config/qc.json — noise floor ≤ −50 dBFS, voice ≥ −40 LUFS, sample rate ≥ 44.1 kHz, face video ≥ 1920×1080 at 25–60 fps (the plan's values) — cost if wrong: a usable recording is refused; the owner can ask to change a value.
- Found by A3 tests and fixed: clipping must be measured before any mono/stereo conversion, which lowers the level and hid 3,178 clipped runs.
- Ruling (A5): unscripted passages (4+ words) are cut by default and listed at stop 4; to keep one, the agent adds it to the script (with a claim if factual) and the owner re-approves the script — otherwise a kept ad-lib would be spoken but uncaptioned and unchecked — cost if wrong: one extra script approval per kept ad-lib.
- Ruling (A5): in voice/face mode, alignment matches the script's real spelling (pronunciation hints are for the AI voice only); a sentence the recogniser cannot find is never cut — cost if wrong: an unfound stumble stays in the audio.
- Found by the A7 end-to-end test and fixed: Shorts open with a separately recorded hook line, so in voice mode the owner also records the hook lines (`recordings/hooks.*`, shown at the end of the teleprompter); the test-recording step cleans it and places each hook — cost if wrong: none.
- Phase A done: voice-mode end-to-end video released at 97.9 with a retake cut and a 2 s pause shortened.
