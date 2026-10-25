# Start here

This folder is a video studio. You give Antigravity, Codex or Claude Code a topic; the studio's commands make, check and score the video; you approve it at five review stops. Nothing is released unless it scores 95+ and you type your PIN.

## One-time setup (about 30 minutes)

1. **Tools** — Node 22+ and FFmpeg must be installed (they are on this PC). In this folder run:
   ```
   npm install
   python -m venv .venv
   .venv\Scripts\python -m pip install -r requirements.txt
   ```
2. **Free API keys** — create a file named `.env` in this folder with:
   ```
   GEMINI_API_KEY=your-key        (https://aistudio.google.com/apikey)
   PEXELS_API_KEY=your-key        (https://www.pexels.com/api/)
   PIXABAY_API_KEY=your-key       (https://pixabay.com/api/docs/)
   ```
3. **Check everything** — `npm run doctor`. Every line should say OK. It also picks the free Gemini model used for the independent review.
4. **Your PIN** — `npm run pin:set` (6+ digits). Agents cannot approve review stops or release without it. Keep it to yourself.
5. **Music** — download 20–30 tracks from the YouTube Audio Library into `library/music/` and list them in `library/music/index.json` (see `library/music/README.md`). Sound effects are optional (`library/sfx/README.md`).
6. **Your channels** — one folder per channel in `library/channels/`, e.g. copy `en-placeholder` to `library/channels/my-english-channel/`, edit `channel.json` (name, handle, language, voice, `"placeholder": false`) and replace `logo.png`. Do the same for your Hindi channel.
7. **Maps of India** — before your first video with a map, open `library/maps/SOURCES.md`, compare a rendered map with the official Survey of India map, and write your name and date on the "Owner confirmation" line.
8. **Styles** — `npm run styles` builds `styles/gallery.html`; open it to see every style.

## Every day (about 45–60 minutes of your time)

1. Fill in `prompts/DAILY.txt` and paste it into your agent.
2. The agent works step by step. At each stop it tells you to run `npm run review -- <project>`, which opens your review page at http://127.0.0.1:8770:
   - **Stop 1 Idea** — angle, hook, titles, thumbnail words, style (3 min)
   - **Stop 2 Script** — read it; red sentences rest on weak or disputed facts (10–15 min)
   - **Stop 3 Voice** — listen to the opening and every name (3 min)
   - **Stop 4 Storyboard** — a still of every shot and the thumbnail drafts (5 min)
   - **Stop 5 Final** — watch it all, press "This drags" where it does, rate five questions, pick the thumbnail and title, save, approve (20–25 min)
   Type your PIN to approve or to request changes (write what to change).
3. When stop 5 is approved and the score is 95+, run `npm run release -- <project>` and type your PIN.
4. Open `projects/<project>/outputs/release/<date>_<slug>/` and follow `UPLOAD_CHECKLIST.md`.

## If something stops

- **"Gemini free-tier limit reached"** (exit code 75): wait, then ask the agent to run the same command again. Finished work is kept.
- **A check fails**: the message names the exact problem; the agent fixes it and re-runs. You never need to edit code.
- **Not sure what is next**: `npm run next -- <project>`.

## Where things are

| What | Where |
|---|---|
| Finished upload folder | `projects/<project>/outputs/release/…` |
| Your review pages | `npm run review -- <project>` |
| Score so far | `npm run score -- <project>` |
| Style gallery | `styles/gallery.html` |
| How quality is judged | `docs/QUALITY_RUBRIC.md` |
| Rules the agents follow | `AGENTS.md` |
