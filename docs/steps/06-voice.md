# 06 · Full voice

> **Owner records their own voice?** If `brief.presenter.mode` is `voice` or `face`, follow `06-recording.md` instead (`npm run next` names it).

**Command:** `npm run voice -- <project>`. **Output:** `work/voice/chapters/`.

- One Gemini call per chapter. Finished chapters are cached; changing a chapter's text re-records only that chapter.
- Exit code 75: free-tier limit reached. Stop and tell the owner to run the same command later; it resumes.
- The voice is never sped up or slowed down to fit anything — timing follows the voice.
