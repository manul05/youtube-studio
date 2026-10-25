# 14 · QC, AI review, final stop and release

1. `npm run qc -- <project>` measures everything code can: frozen-screen intervals, stream specs, full decode, debug text, loudness, silences, captions, sources, licences, thumbnails, and each Short. **Fix every HARD FAIL** — the score is capped at 59 until they are gone. Re-run the step `next` points to, then QC again.
2. `npm run review:ai -- <project>` asks a fresh Gemini model (which never saw the video being made) to score the hook, story, facts, visuals, pacing and packaging from frames and the script. Exit 75 = free-tier limit; ask the owner to run it later.
3. **Stop 5:** tell the owner to run `npm run review -- <project>`, watch, rate and approve. The score combines measured checks, the AI review and the owner's ratings; for each judged category the lower of AI and owner counts.
4. If the owner requests changes or the score is under 95: read `approvals/gate_final.changes.json`, `outputs/score/score.json` and the owner's "drags" markers (seconds), fix the cause (script, beats, images), and follow `next` back through the steps.
5. **Release is the owner's command:** `npm run release -- <project>` (they type the PIN). Never run it yourself.

## What blocks release

Score below 95, any category below 80%, any hard failure, any review stop not approved with the owner's PIN for the current files, a placeholder channel, or a map without the owner's source confirmation.
