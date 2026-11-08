# 07 · Align

> **Owner's own recordings** (`brief.presenter.mode` `voice` or `face`): align first edits each chapter — last take of every sentence, no restarts, pauses ≤ 0.35 s — into `work/takes/`, then aligns the edited audio. Unscripted passages are cut and listed for stop 4 (see `06-recording.md`).

**Command:** `npm run align -- <project>`. **Output:** `work/voice/paragraphs/`, `work/align/`.

- Times every spoken word (faster-whisper, matched to the known script) and cuts each chapter into paragraphs. The first run downloads the speech model once.
- Then checks the voice: long pauses inside a paragraph, clipping, and speaking pace.

## Fixing problems

- "N% of words could not be matched" or a long pause or clipping in a paragraph: `npm run voice:retake -- <project> <paragraph-id>`, then run align again.
- Pace outside the target: change `brief.voice.style` (e.g. "unhurried" or "a little faster") and re-record with `npm run voice -- <project>`.
- `npm run voice:check -- <project>` repeats the voice checks without re-aligning.
