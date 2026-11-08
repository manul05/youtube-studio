# Owner to-do list

What is left for you (the owner). Tick items off as you go; any agent can help with the ones marked "agent can help".

## Before your first video

- [ ] **Set up your two channels** (agent can help): fill in `prompts/SETUP_CHANNEL.txt` once per channel and paste it into Codex, Antigravity or Cursor.
- [ ] **Check 5 music licences** (2 min): in YouTube Studio → Audio Library, look at the licence of the three Kevin MacLeod tracks, "Cylinder Five" (Chris Zabriskie) and "Underworld" (Myuu). `library/music/index.json` assumes the first four need a credit line and "Underworld" does not. If one differs, ask an agent to change `attributionRequired` for that track.
- [ ] **Choose styles**: open `styles/gallery.html` in your browser and note a favourite main style per channel (or write `Style: suggest` in the daily prompt).
- [ ] **OK three build decisions** (or ask an agent to change them, following `docs/MAINTAINING.md`):
  1. The smallest allowed image is 1344 px on the long edge (the design said 1920), because Antigravity images are 1376 px wide; camera zooms never go below 960 source pixels.
  2. Thumbnail headlines use a tall condensed font (Impact) so text is big enough on phones.
  3. Per-check limits (6-second rule, loudness, captions) live in `config/qc.json`, which only the owner should change. Now and then ask an agent "show me `git log -p config/qc.json`" to see whether anyone changed it.

## Before your first video with a map of India

- [ ] Run `npm run maps:check`. Open `library/maps/india_check_map-doc.png` (and the other two) and compare with the official Survey of India political map. If it matches, write your name and the date on the "Owner confirmation" line in `library/maps/SOURCES.md`. The release command also asks you to type YES for every map video.

## Whenever you can

- [ ] **Pixabay key** (turns on stock video): sign in at pixabay.com, open https://pixabay.com/api/docs/, copy the key into `.env` after `PIXABAY_API_KEY=`, then run `npm run doctor`.
- [ ] **Voice speed** (agent can help), after your first real video on each channel: the align step prints "Narration pace N wpm". Ask an agent to put that number in the channel's `channel.json` as `"wpm": N`, so video-length estimates are accurate.

## Your first real videos

- [ ] **CJP video**: fill in `prompts/DAILY.txt` and paste it into your agent. This is the first run with the real Gemini voice and AI review; if a command crashes, paste `prompts/FIX_PROBLEM.txt` (filled in) into the agent.
- [ ] **A second topic** in the other language and a different style.

## Optional improvements (ask an agent, pointing it to `docs/MAINTAINING.md`)

- Music variety: rotate through every matching track instead of alternating the top two.
- A "chat handoff" so a chat model (e.g. Argon 4 in Gemini) can write research and script.
- The deferred minor issues listed in `docs/BUILD_DECISIONS.md`.
