# LexiLoop

LexiLoop is a front-end-only vocabulary trainer. It uses German → English vocabulary chapters, browser localStorage for progress and imports, and no login or database.

## Run it

```bash
npm run dev
```

The app serves on port 3000. `npm run build` copies the static app to `dist/`.

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
