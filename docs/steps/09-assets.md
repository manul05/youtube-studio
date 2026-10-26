# 09 · Images and stock footage

**Commands:** `npm run images:prompts -- <project>`, then generate images, then `npm run images:record -- <project> --origin=agent-generated:<your-agent>`, `npm run photos:search -- <project>`, `npm run photos:pick -- <project> <beat-id> <1-6>`, `npm run stock:search -- <project>`, `npm run stock:pick -- <project> <beat-id> <1-4>`, and finally `npm run images:check -- <project>`.

## Images

1. `images:prompts` writes `assets/IMAGE_PROMPTS.md`: one prompt per art beat (`img_<beat-id>.png`) and three thumbnail backgrounds (`thumb_base_1..3.png`).
2. Generate each image with your own image tool (or the owner pastes the prompts into a chat tool). 16:9, at least 1344 px on the long edge. Save into `assets/images/` with exactly the listed name.
3. `images:record --origin=…` records where they came from: `agent-generated:antigravity`, `agent-generated:codex`, `owner-supplied` or `legacy-antigravity` (re-used earlier artwork).
4. `images:check` lists every missing, wrong-shaped, too-small or duplicate image, and any camera move that would zoom in too far. Fix and re-run.

Never generate photorealistic faces of real people. Look at each image before saving it: garbled text or extra fingers will be marked down in review.

## Stock photos

Beats with `photoQuery` show a real photo instead of AI art.

1. `photos:search` downloads up to six freely licensed candidates per photo beat (Wikimedia Commons always; Pixabay when the owner has a key with full-size access) and a numbered `candidates.jpg` in `assets/photos/_incoming/<beat-id>/`. Only CC0, public domain, CC BY, CC BY-SA and Pixabay-licensed photos of at least 1344 px are offered.
2. Look at the sheet and pick: `photos:pick -- <project> <beat-id> <n>`. It saves `assets/images/img_<beat-id>.png` and records the author, licence and credit line; the description credits it automatically. Never record a photo with `images:record`.
3. Check the photo shows what the narration says (right person, place, building, event). If none fit, change the beat's `photoQuery` (re-run `plan`) and search again — or use an `imagePrompt` instead.

## Stock footage

Needs a Pexels or Pixabay key in `.env` (`npm run doctor` shows WARN when there is none). Without one, use art beats instead of `stock` beats.

1. `stock:search` downloads up to four candidates per stock beat and a `candidates.jpg` sheet in `assets/stock/_incoming/<beat-id>/`.
2. Look at the sheet and pick: `stock:pick -- <project> <beat-id> <n>`. The licence is recorded automatically.
3. If none fit, change the beat's `query` (re-run `plan`) and search again.

## Done when

`images:check` passes (it also checks the photo and stock picks and their licences).
