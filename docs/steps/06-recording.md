# 06 · Recording the narration — owner's own voice

Used instead of `06-voice.md` when `brief.presenter.mode` is `voice` or `face`.

**Purpose:** bring the owner's chapter recordings into the studio, cleaned and ready to align.

**Command:** `npm run recording:import -- <project>`. **Input:** `recordings/c01.<ext>`, `recordings/c02.<ext>`, … (one file per chapter, numbered like `script.json`). **Output:** `work/voice/chapters/` (and `work/presenter/` in face mode).

## Tell the owner how to record

1. Quiet room with soft furnishings; the same microphone and place as the approved test recording.
2. Clip-on microphone 15–20 cm below the mouth. Face mode: phone or camera at eye level, 4K 30 fps landscape, light in front, focus on the face.
3. Open the teleprompter (`npm run review -- <project>` → Teleprompter) and record **one chapter per file**.
4. Stumbled? Pause for one second and say the whole sentence again. The studio keeps the last take of every sentence and shortens long pauses.
5. Save the files as `recordings/c01.mp4` (or `.wav`, `.m4a`, `.mp3`, `.mov`), `c02…`, then tell the agent "recordings are in".

## Then

- Run the command. It lists any chapter without a recording and any file it cannot read. Ask the owner for exactly those.
- Unscripted passages (ad-libs) are found in the next step (`align`) and shown to the owner at stop 4 to keep or cut. A kept ad-lib that states a fact needs a claim in `research.json`, like every sentence.
