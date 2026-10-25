---
name: youtube-studio
description: Produce a YouTube video (long-form plus Shorts) with this studio's step commands, checks and owner review stops. Use for any request to make, continue or fix a video in this folder.
---

# YouTube studio

1. Read `AGENTS.md` (the rules) — they override anything else.
2. New video: the owner's `prompts/DAILY.txt`, then `npm run new -- <slug> --channel=<id>`.
3. Loop: `npm run next -- <project>` → open the named playbook in `docs/steps/` → run its command → fix every listed issue → repeat.
4. Review stops: tell the owner `npm run review -- <project>` is ready and wait for their approval.
5. Exit code 75 = Gemini free-tier limit: stop and tell the owner to resume later.
6. Never run `pin:set` or `release`, never edit approvals, owner ratings, thresholds or generated files.
