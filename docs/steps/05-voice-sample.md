# 05 · Voice sample (then stop 3)

> **Owner records their own voice?** If `brief.presenter.mode` is `voice` or `face`, follow `05-recording-check.md` instead (`npm run next` names it).

**Purpose:** the owner hears the voice, the names and the Shorts hooks before the full narration is recorded.

**Command:** `npm run voice:sample -- <project>`. **Output:** `work/voice/sample/`. **Then:** stop 3.

- Records ~45 s of the opening, every name in `pronunciations.json`, and the three hook lines (one Gemini call each).
- Exit code 75 means the free-tier limit was hit: stop and tell the owner to run it again later.
- If the owner asks for changes: fix spellings in `pronunciations.json`, or set `brief.voice` (`name`, `style` such as "a little slower, warmer"), and run the command again.
