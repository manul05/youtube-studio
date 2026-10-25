# 03 · Outline

**Purpose:** a structure that keeps people watching.

**Input:** `brief.json`, `research.json`. **Output:** `outline.json`. **Command:** `npm run outline:check -- <project>`.

## Retention structure

- **Hook (0–30 s):** start inside the story — a moment, a contradiction, a question the viewer now needs answered. `hook.endsAt` ≤ 30.
- **Promise (by ~45 s):** say what they will understand by the end.
- **Chapters (≥ 3):** each with a `title` (becomes a YouTube chapter), a `purpose` and `targetSeconds`. Totals within ±10% of the length target.
- **Re-hooks:** every 60–90 s until the final minute, a line that reopens curiosity ("But that was not the strangest part…"). List them in `rehooks` with `atSeconds` and `line`.
- **Open loops:** raise a question early and pay it off later; note the payoff in `payoff`.
- **Ending:** answer the promise, then a short reason to watch the next video (the endcard follows automatically).

## Done when

`outline:check` passes.
