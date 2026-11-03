# LexiLoop

LexiLoop is a front-end-only German → English vocabulary and grammar trainer. It uses static lesson JSON files (`ch01`–`ch09`), browser `localStorage` for Leitner spaced-repetition progress, and no login or database.

> **For AI Agents / Contributors:** Read **[`AGENTS.md`](./AGENTS.md)** first for a compact, token-efficient map of the architecture, lesson schemas, and quiz rules.

## Run & Build

```bash
npm run dev     # Starts local dev server on http://localhost:3000
npm run build   # Builds static bundle to dist/ (used by Vercel)
```

## Add a chapter

1. Add a JSON file under `public/data/`, following the shape of `chapter-01.json`:

```json
{
  "id": "chapter-03",
  "title": "Your chapter title",
  "entries": [
    {
      "word": "das Buch",
      "translation": "book",
      "example": "Bonjour, Marie!",
      "image": "images/chapter-03/bonjour.webp"
    }
  ]
}
```

2. Add `{ "id": "chapter-03", "title": "Your chapter title", "file": "chapter-03.json" }` to `public/data/index.json`.
3. Put consistent, roughly 400px WebP images in `public/images/chapter-03/` and add one source/license object per image to `public/images/ATTRIBUTION.json`. The included `scripts/fetch_commons_assets.py` shows the Commons API and conversion pattern.
4. Restart the dev server and the chapter will appear on Home.

You can also paste `word,translation` rows into Settings → Import chapter. Imported chapters are kept in localStorage, which makes them useful for personal practice without editing the source tree.
