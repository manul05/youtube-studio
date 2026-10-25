# Quality rubric — what 95+ means

A video is released only when its total is **95 or more**, **every category is at least 80%** of its points, and there are **no hard failures**. Points come from three sources, shown separately on the stop-5 page:

- **measured** — code checks (pass/fail; a failure scores the category 0);
- **AI-judged** — a fresh Gemini review that sees frames, script and thumbnails, never the making;
- **your rating** — the owner's five answers at stop 5.

For judged categories the **lower** of AI and owner counts. Owner levels: Excellent 100%, Good 90%, OK 75%, Weak 50%, Bad 0%.

## Long-form (100 points)

| # | Category | Pts | Sources | 100% looks like | 75% looks like | 50% or less |
|---|---|---|---|---|---|---|
| A | Hook and first 30 s | 10 | AI, owner | Starts inside a concrete moment; a question you need answered; no preamble | Clear topic but generic opening | "Hi guys, in this video…"; logo intro |
| B | Story and script | 15 | AI, owner | Clear promise, re-hooks every 60–90 s, satisfying payoff, natural spoken language | Informative but list-like | Rambling, repetitive, or reads like an essay |
| C | Facts and safety | 10 | measured, AI | Every claim sourced and dated, allegations attributed, disputes shown as disputes | Minor attribution gaps | Unsourced or one-sided claims (hard failure if unledgered) |
| D | Voice | 10 | owner (+ measured silences) | Natural pace, names right, warm delivery | Slightly flat or a mispronounced name | Robotic, rushed, wrong names |
| E | Audio mix | 5 | measured | −14 LUFS ±1, true peak ≤ −1 dBTP, voice ≥ 15 dB over music | — | Any miss |
| F | Visual quality and style coherence | 15 | AI, owner | Strong artwork, consistent style, clean typography, no AI glitches | A few weak images | Mismatched styles, garbled AI text, clutter |
| G | Pacing and motion | 15 | measured, AI, owner | Something meaningful changes every 3–5 s; motion has purpose | Occasional 5–6 s holds | **A two-box slide held 17 s** (hard failure over 6 s) |
| H | Captions and readability | 5 | measured | ≤ 2 lines, ≤ 42 chars/line, ≤ 20 chars/s, synced to the words | — | Any miss |
| I | Packaging | 10 | measured, AI, owner | Thumbnail readable at phone size and clickable; titles ≤ 60 chars and honest | Readable but bland | Unreadable thumbnail, clickbait title |
| J | Technical delivery | 5 | measured | Correct specs, full decode, no debug text | — | Any miss; **debug HUD on screen** is a hard failure |

## Shorts (100 points each)

A Hook in the first 2 s (20) · B Self-contained story (15) · C Facts (10) · D Voice (10) · E Audio (5) · F Visuals (15) · G Pacing: a change at least every 3 s (15) · H Burned captions in the Shorts safe zone (5) · J Technical: 1080×1920, ≤ 59 s (5). A Short below the bar is dropped from the release; it does not block the main video.

## Hard failures (score capped at 59)

Debug text in a frame · an unledgered factual claim · a photorealistic AI image of a real person · a sped-up voice · unintended silence over 1.2 s · a static interval over 6 s · loudness outside −15 to −13 LUFS or true peak above −1 dBTP · a missing licence for any stock or music · failed decode or wrong specs.

## Honesty rule

Nobody changes a threshold, deletes a check, or marks an unperformed review as passed to reach 95. The score page shows which parts were measured, AI-judged and owner-judged.
