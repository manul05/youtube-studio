# 04 · Script (then stop 2)

**Purpose:** narration written for the ear, every sentence traceable, plus the three Shorts and name pronunciations.

**Input:** `outline.json`, `research.json`. **Output:** `script.json`, `pronunciations.json`, `shorts.json`. **Command:** `npm run script:check -- <project>`. **Then:** stop 2.

## script.json

`{ "chapters": [ { "id": 1, "title": "…", "paragraphs": [ { "id": "c01p01", "text": "…", "hold": 0.4, "beats": [] } ] } ] }`

- Paragraph ids are `c<chapter 2 digits>p<paragraph 2 digits>`. Leave `beats` empty until step 08.
- **Every sentence ends with a tag:** `… sentence. [[CL03]]` (one or more claim ids, comma separated) or `… [[analysis]]` for your own reasoning. Tags are never spoken or shown.
- Hindi sentences end with `।` before the tag.

## Writing for the ear

- Short sentences; one idea each. Read it aloud in your head.
- Absolute dates ("on 15 May 2026"), never "yesterday" or "हाल ही में".
- Attribute: "according to NDTV", "the party said", "critics alleged". Present disputed claims as disputed.
- Avoid abbreviations with full stops ("Dr.", "U.S.") — they split sentences. Write "Doctor", "the US".
- Numbers: write them as you want them spoken.
- Length: about 155 words per minute in English; the check estimates length.

## pronunciations.json

`{ "Surya Kant": "Soor-ya Kaant" }` — spoken text for names the voice may get wrong. Captions keep the real spelling.

## shorts.json (three Shorts)

`[ { "id": "s1", "hookLine": "…", "fromSentence": "c03p02s1", "toSentence": "c03p04s2" } ]`

- Sentence ids are `<paragraph id>s<n>` (n counts sentences in that paragraph from 1).
- Each Short is the hook line plus a self-contained run of sentences, 30–59 s in total.
- The hook line is a cold open: the most surprising line, no "in this video".
- Avoid spans whose visuals are mostly timelines or maps — they read poorly in 9:16.

## Done when

`script:check` passes, then the owner approves stop 2.
