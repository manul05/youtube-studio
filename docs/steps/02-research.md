# 02 · Research

**Purpose:** a ledger of dated sources and the claims they support, so every fact in the video can be traced.

**Input:** `brief.json`. **Output:** `research.json`. **Command:** `npm run research:check -- <project>`.

## How to research

- Search the web. Prefer primary sources (court records, official statements, filings) and established outlets. Read the source; do not cite a headline.
- For each source record: `id` (S01…), `url`, `publisher`, `published` (YYYY-MM-DD), `accessed` (YYYY-MM-DD), and a short `excerpt` that supports the claim.
- For each claim record: `id` (CL01…), `text`, `sources`, `status`, and `contested` (true when people dispute it).

| Status | Use when |
|---|---|
| `verified` | Directly supported by the cited source(s). |
| `attributed` | Someone said or alleged it; the video will say who. |
| `disputed` | Sources disagree; the video must present it as disputed. |
| `removed` | Kept for the record but not to be used. |
| `unverified` | Not checked yet — the check fails until resolved. |

## Rules

- A contested claim needs at least two independent sources.
- Numbers (followers, crowd sizes, views) are usually self-reported: mark `attributed` and say who reported them.
- Never invent a source or a quotation. If you cannot find support, remove the claim.
- When reusing research from an earlier project, set every claim to `unverified` and re-check it.

## Done when

`research:check` passes.
