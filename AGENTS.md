# Claude YouTube Studio — rules for every agent

You are producing a YouTube video with this studio. The studio's commands do the making and the checking; you do the research, writing, planning and image generation. Quality is enforced by the commands, not by you saying it is done.

## The loop

1. Run `npm run next -- <project>` before and after every step. It names the one next step, its command and its playbook in `docs/steps/`.
2. Open that playbook and follow it. Run the command it names.
3. If the command lists issues, fix exactly those and run it again. Never move on while it fails.
4. At a review stop (`gate:…`), tell the owner: "Stop N is ready: `npm run review -- <project>`" and wait. Only the owner approves.
5. A command that exits with code **75** hit the Gemini free-tier limit. Stop and tell the owner to run the same command again later; it resumes where it stopped.
6. A command that **crashes** (a stack trace, not a list of issues) is a studio bug: follow `docs/MAINTAINING.md` (failing test first, never weaken a check), then re-run the step.

Start a new video with `prompts/DAILY.txt` (the owner fills it in) and `npm run new -- <slug> --channel=<channel-id>`.

## Never

- Never create or edit `approvals/`, `outputs/score/owner.json`, `config/qc.json`, `config/pin.json` or `library/maps/SOURCES.md`'s owner confirmation. Never run `npm run pin:set` or `npm run release` (owner only).
- Never hand-edit generated files: `beats.json`, anything in `work/` or `outputs/`. Change the source (brief, research, outline, script, shorts, pronunciations, images) and re-run the command.
- Never lower a threshold, delete a check, or mark something reviewed to make a score pass.
- Never make paid API calls. The studio uses the Gemini free tier, Wikimedia Commons, Pexels and Pixabay only.
- Never put a photorealistic depiction of a real, identifiable person in an image prompt. For real people, places and events use a real photo (`photoQuery`, see `docs/steps/08-plan.md`), or an illustration, silhouette, name card or quote card.
- Never record a stock photo with `images:record`; `photos:pick` records it with its licence and credit.
- Never state a fact on screen or in narration without a claim in `research.json`. Every sentence ends with `[[CLxx]]` or `[[analysis]]`.
- Never use relative dates ("yesterday", "last week", "हाल ही में"). Use absolute dates.
- Never plan a beat type that `npm run beats` does not list.

## Always

- Attribute allegations ("according to …", "… alleged") and keep disputed claims clearly labelled as disputed.
- Mark AI artwork of real events with `"illustration": true` in its beat.
- Plan `stock` video beats only when `npm run doctor` shows a Pexels or Pixabay key (otherwise it shows WARN); use art beats instead.
- Keep a meaningful visual change at least every 6 seconds (3 seconds in Shorts). The plan and QC enforce this.
- Report anything you could not check, and why.

## Where things are

- `START_HERE.md` — the owner's guide; `docs/OWNER_TODO.md` — what the owner still has to do. `docs/DESIGN.md` — why the studio works this way. `docs/MAINTAINING.md` — changing or fixing the studio itself.
- `prompts/` — `DAILY.txt` (a video), `SETUP_CHANNEL.txt` (a channel), `NEW_STYLE.txt` (a style), `FIX_PROBLEM.txt` (a crash).
- `docs/steps/01-idea.md` … `14-release.md` — one playbook per step.
- `docs/QUALITY_RUBRIC.md` — how the 95+ score is judged. `docs/STYLE_PACK_GUIDE.md` — adding a style.
- `projects/<date>-<slug>/` — one folder per video. `styles/` — style packs (`npm run styles` builds the gallery).
