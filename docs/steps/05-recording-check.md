# 05 · Test recording (then stop 3) — owner's own voice

Used instead of `05-voice-sample.md` when `brief.presenter.mode` is `voice` or `face`.

**Purpose:** check the owner's microphone, room and level before they record the whole video.

**Command:** `npm run recording:check -- <project>`. **Input:** `recordings/sample.wav` (or `.m4a`, `.mp3`, `.mp4`, `.mov`) in the project folder. **Output:** `work/voice/sample/`. **Then:** stop 3.

1. Ask the owner to record about 30 seconds: the opening paragraph from the teleprompter (`npm run review -- <project>` → Teleprompter) and every name in `pronunciations.json`, in the room and with the microphone they will use. Save it as `recordings/sample.<ext>`.
   If the brief plans Shorts, also ask for the Shorts hook lines (the last section of the teleprompter): each line once, a 1 s pause between them, saved as `recordings/hooks.<ext>`. Each Short opens with its hook.
2. Run the command. It reports loudness, peak, noise floor, clipping and sample rate (and resolution and frame rate for face mode).
3. If it lists problems, tell the owner exactly what to change (closer microphone, quieter room, lower input gain) and ask for a new sample. Never change the limits.
4. When it passes, tell the owner stop 3 is ready: they listen and approve.
