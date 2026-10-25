# 13 · Package

**Command:** `npm run package -- <project>`. **Output:** `outputs/package/`.

- Composes the three thumbnails (headline as large as fits, contrast guaranteed, channel mark) and checks them at phone size.
- Writes the description (hook, chapters, sources, music credits, AI note), titles, tags, pinned comment, the synthetic-content disclosure recommendation and the caption files.
- If a thumbnail fails, shorten its words in `brief.thumbTexts` (at most 4 words; short words) or change its background image.
