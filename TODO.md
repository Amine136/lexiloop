# LexiLoop delivery outcomes

- [x] **Chapter data and asset structure**
  - Vocabulary is organized in chapters.
  - Each chapter is a JSON file in `/data` with `word`, `translation`, optional `example`, and optional `image`.
  - `/data/index.json` lists chapters with `id`, `title`, and `file`.
  - Include two example chapters with 15 entries each using English words with French translations as placeholders.
  - Concrete-word images are downloaded, resized to about 400px, converted to WebP, saved under `/images/<chapter-id>/`, and recorded with source and license in `/images/ATTRIBUTION.json`.
  - Abstract words that are hard to picture may remain without images.

- [x] **Home and chapter selection**
  - Home lists chapters with mastered progress percentage and last score.
  - The learner can select one chapter, several chapters, or all chapters.
  - The app is single-user with no login and progress persists in localStorage.

- [x] **Practice modes and session settings**
  - Text recognition shows a word with four multiple-choice meanings using same-chapter distractors, with both directions via toggle.
  - Visual modes include image-to-word, word-to-image with a 2x2 grid, and image-to-spelling.
  - Spelling shows the meaning or plays the word with Web Speech API text-to-speech, checks exact spelling with an option to ignore case, highlights differences in a wrong-answer correction, and offers configurable special-character buttons.
  - Session settings support one or more modes, number of questions, shuffle, only weak/wrong words, and mixed mode.
  - Only entries with images appear in visual modes; missing images fall back gracefully.
  - Keyboard controls support Enter to submit/next and 1–4 to pick choices.

- [x] **Two practice session lengths**
  - Practice setup offers exactly two choices: Quick test with 10 questions and Extended test with 30 questions.
  - Starting a session generates the selected number of questions, including when the selected vocabulary pool is smaller than the session length.

- [x] **German verb meanings and conjugation study view**
  - Lessons 1–5 include the supplied German verbs with English meanings and contextual examples.
  - Each supplied verb includes present-tense forms for ich, du, er/sie/es, wir, ihr, and Sie/sie.
  - The Verbs view groups entries by lesson and displays meanings, examples, and conjugation forms.
  - Practice includes a Conjugation mode that asks learners to type the correct present-tense form for a named person and submit it with Enter or a check button.

- [x] **Lektion 7: Hobbys & Freizeit**
  - Adds the supplied hobby, leisure, sports, entertainment, and everyday-object nouns with articles, plurals, English meanings, and examples.
  - Adds the supplied Freizeitverben, including compound phrases and separate play-guitar, play-tennis, play-football, and play-chess entries.
  - Each new verb includes present-tense forms for ich, du, er/sie/es, wir, ihr, and Sie/sie for Verbs study and Conjugation practice.

- [x] **Lektion 8: Kein Problem. Ich habe Zeit!**
  - Adds the supplied places, weekdays, times of day, telling-time expressions, planning vocabulary, and key phrases with English meanings and examples.
  - Adds the 13 supplied planning verbs, including irregular sehen, wissen, and können, with present-tense forms for Verbs study and Conjugation practice.

- [x] **Lektion 9: Ich möchte was essen, Onkel Harry.**
  - Adds the supplied food, groceries, meals, courses, kitchen, time-expression, and conversational vocabulary with articles, plurals, English meanings, and examples.
  - Adds the compound food nouns with the correct article and plural determined by the final noun, including Schinkenbrot, Käsebrötchen, Schokoladenkuchen, Fischsuppe, and Eierkuchen.
  - Adds the nine Essverben and full present-tense forms, including stem-changing essen, irregular mögen, and the polite möchte(n) forms.
  - Includes grammar entries for zum = zu + dem, kein/keine/keinen, and möchte + infinitive sentence brackets.

- [x] **Feedback and spaced repetition**
  - After each answer, feedback includes correct word, translation, example, and image if available.
  - Leitner boxes 1–5 are stored per word in localStorage.
  - Wrong answers move to box 1; correct answers move up; weak words appear more often.
  - Answers provide instant green/red feedback.

- [x] **Results and statistics**
  - Results show score, time, mistakes with correct answers and images, and a retry-mistakes action.
  - Stats show accuracy per chapter over time, most-missed words, accuracy per mode, reset progress, and export/import progress as JSON.

- [x] **Image review and target language settings**
  - Image review shows each word with its image and supports replace/upload or remove.
  - Target language settings configure TTS voice and special characters.

- [x] **UX and documentation**
  - The UI is clean, minimal, mobile-first, and dark mode.
  - Mobile, narrow-phone, tablet, and desktop layouts prevent horizontal overflow across navigation, practice, verb, feedback, settings, and results views.
  - Images have consistent sizing, lazy loading, and graceful fallbacks.
  - The README explains how to add a chapter and its images for later replacement with real vocabulary.

- [x] **Validation and checkpoint**
  - The static app serves on the configured Preview port.
  - `GET /manus-routes.json` returns the synchronized route manifest.
  - Diagnostics and available syntax/build checks are clean.
  - Intended changes are committed and pushed to the managed project’s `origin/main`.
