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
- The next step (`align`) edits each chapter: it keeps the **last** take of every sentence, cuts restarts and stumbles, and shortens pauses over 0.35 s. The edit is in `work/takes/<cid>.edl.json`.
- Unscripted passages (4 words or more that are not in the script) are **cut** and listed in `work/takes/<cid>.adlibs.json`; stop 4 shows each one with a player. If the owner wants one kept, add it to `script.json` at its place, with a claim tag if it states a fact (add the claim to `research.json`). The script stop then needs the owner's approval again, and `align` keeps it on the next run.
- A sentence the recogniser could not find is never cut: the stretch around it is kept, and `align` reports it if too many of its words are unmatched.
