# 11 · Render

**Command:** `npm run render -- <project>`. **Output:** `outputs/master.mp4`.

- Renders each chapter in its own process (unchanged chapters are reused), mixes voice, music and effects, and normalises loudness to −14 LUFS.
- Needs licensed music in `library/music/index.json`; if it says the library is empty, tell the owner.
- A 15-minute video takes roughly 10–20 minutes on this PC. Run it in the background and wait.
