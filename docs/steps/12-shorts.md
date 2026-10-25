# 12 · Shorts

**Command:** `npm run shorts -- <project>`. **Output:** `outputs/shorts/s1.mp4` … `s3.mp4`.

- Each Short is its hook line, then its span of the narration, re-laid out at 1080×1920 with large burned-in captions.
- Spans are measured from the real recording; each must be 30–59 s. If one is outside, change `fromSentence`/`toSentence` in `shorts.json` (then the voice sample re-records the hooks if a hook line changed).
- In Shorts the picture must change at least every 3 s. Long static shots are converted to crop tours automatically; a Short that still fails QC is left out of the release (it does not block the main video).
