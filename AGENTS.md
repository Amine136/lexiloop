# LexiLoop — Agent Context Guide

## 1. Project Overview
Static, zero-dependency **German → English** vocabulary & grammar trainer (`localStorage` state, no backend DB).
- **Live / Deploy:** Vercel static build (`npm run build` → `dist/`), configured via `vercel.json`.
- **Local Dev:** `npm run dev` runs `scripts/dev-server.mjs` on port `3000`.

## 2. File Map (Read Only What You Need)
- `src/app.js` — Single-file SPA: hash router, Leitner box state, quiz generator, answer validator, and view templates.
- `src/styles.css` — Dark-mode responsive styles (`< 700px` mobile, `>= 700px` tablet, `>= 1040px` desktop).
- `public/data/index.json` — Ordered manifest of all lessons (`id`, `title`, `file`, `description`).
- `public/data/chapter-XX.json` — Vocabulary & verb entries per lesson (`ch01`–`ch12`).
- `public/images/chXX/*.webp` & `public/images/ATTRIBUTION.json` — Optional `400px` WebP word cues.
- `index.html` — App shell; bump `?v=...` query params on `styles.css` and `app.js` when deploying asset/code changes.

## 3. Current Lessons (`public/data/`)
| ID | File | Title | Scope |
| :--- | :--- | :--- | :--- |
| `ch01` | `chapter-01.json` | Lektion 1: Name, Herkunft & Länder | 23 entries (10 nouns, 8 verbs, 14 images) |
| `ch02` | `chapter-02.json` | Lektion 2: Familie & Freunde | 40 entries (31 nouns, 9 verbs, 4 images) |
| `ch03` | `chapter-03.json` | Lektion 3: Essen & Trinken | 54 entries (47 nouns, 7 verbs, 5 images) |
| `ch04` | `chapter-04.json` | Lektion 4: Meine Wohnung | 48 entries (36 nouns, 12 verbs, 4 images) |
| `ch05` | `chapter-05.json` | Lektion 5: Dinge, Materialien & Formen | 59 entries (38 nouns, 21 verbs, 4 images) |
| `ch06` | `chapter-06.json` | Lektion 6: Büro & Alltagsgegenstände | 27 entries (27 nouns, 0 verbs) |
| `ch07` | `chapter-07.json` | Lektion 7: Hobbys & Freizeit | 38 entries (20 nouns, 18 verbs) |
| `ch08` | `chapter-08.json` | Lektion 8: Kein Problem. Ich habe Zeit! | 68 entries (24 nouns, 10 verbs, phrases) |
| `ch09` | `chapter-09.json` | Lektion 9: Ich möchte was essen, Onkel Harry. | 70 entries (38 nouns, 8 verbs, grammar, phrases) |
| `ch10` | `chapter-10.json` | Lektion 10: Ich steige jetzt in die U-Bahn ein. | 61 entries (28 nouns, 12 verbs, grammar, phrases) |
| `ch11` | `chapter-11.json` | Lektion 11: Was hast du heute gemacht? | 63 entries (30 nouns, 11 verbs, grammar, phrases) |
| `ch12` | `chapter-12.json` | Lektion 12: Was ist denn hier passiert? | 62 entries (35 nouns, 12 verbs, grammar, phrases) |

## 4. Data Rules & Entry Schemas (CRITICAL when adding a lesson)
Never combine two verbs with `/` in one entry (e.g., split `Hunger haben` and `Durst haben` into separate entries). Keep existing entry order stable because `localStorage` progress keys use `${chapterId}:${entryIndex}`.

- **Noun entry:**
  ```json
  {
    "word": "der Apfel",
    "translation": "apple",
    "article": "der",
    "noun": "Apfel",
    "plural": "die Äpfel",
    "category": "food & groceries",
    "example": "Ich esse einen Apfel."
  }
  ```
- **Verb entry:** Must include `partOfSpeech: "verb"` and all 6 present-tense keys (`ich`, `du`, `er/sie/es`, `wir`, `ihr`, `Sie/sie`) without subject pronouns in the values.
  ```json
  {
    "word": "Hunger haben",
    "translation": "to be hungry",
    "partOfSpeech": "verb",
    "category": "Essverben",
    "example": "Ich habe großen Hunger.",
    "conjugation": {
      "ich": "habe Hunger",
      "du": "hast Hunger",
      "er/sie/es": "hat Hunger",
      "wir": "haben Hunger",
      "ihr": "habt Hunger",
      "Sie/sie": "haben Hunger"
    }
  }
  ```
- **Phrase / Adverb / Grammar entry:** Omit `article` and `partOfSpeech`. Use `"category": "grammar"` for grammar rule notes so they are excluded from Spelling mode.

## 5. Core Architecture & UX Conventions
- **Lesson Selection Flow:** Home (`#home`) is a read-only overview. On Practice (`#practice`), clicking start opens the lesson-picker modal (`renderChapterModal`) which filters eligible lessons by mode.
- **Quiz Engine (`startSession` & `questionFor`):**
  - Uses weighted sampling **without replacement** (`sampleWeightedUnique`) so questions do not repeat within a run.
  - Multiple-choice distractors (`distractorsFor`) match the target's grammatical nature (`noun`, `verb`, `phrase`, `grammar`, `other`).
  - Answer checking (`acceptableAnswersFor`) accepts optional pronouns in conjugation, bare nouns or `article + noun` in spelling, and slash/parenthetical variants.
- **Cache Busting:** Update `DATA_VERSION` in `src/app.js` and `?v=` in `index.html` after data or code changes.
