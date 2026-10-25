# 10 · Storyboard (then stop 4)

**Command:** `npm run preview -- <project>`. **Output:** `outputs/storyboard/`, `outputs/storyboard-shorts/`, thumbnail drafts. **Then:** stop 4.

- Renders a still of every shot at entry, action and settled moments, contact sheets, the Shorts' vertical stills and three thumbnail drafts — exactly as the final render will draw them.
- Fails if any text leaves the safe area; the message names the shot.
- `npm run thumbs:check -- <project>` checks the thumbnail drafts at phone size.
- If the owner requests changes, the notes name shot ids (e.g. `c03p02b1`): change those beats or images, then re-run `plan`/`images:check`/`preview` as `next` directs.
