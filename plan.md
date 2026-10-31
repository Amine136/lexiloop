# LexiLoop implementation plan

## Product shape
LexiLoop is a single-user, front-end-only vocabulary trainer. A static Node-served app keeps chapter source data in `public/data/`, learner progress in `localStorage`, and user imports/images in `localStorage` so it needs no account, server database, or external runtime API.

## Proposed file structure

- `public/data/` — chapter index and replaceable chapter JSON files.
- `public/images/` — resized WebP word images plus `ATTRIBUTION.json`.
- `src/` — application modules: state, data loading, quiz generation, view rendering, and styles.
- `public/manus-routes.json` — static route manifest for the single page.
- `scripts/` — asset fetch/resize and static build helpers.
- `README.md` — repeatable instructions for adding chapters, images, and replacing placeholders.

## Implementation approach

The app uses plain modern JavaScript modules, HTML, and CSS with no runtime dependencies. A small Node HTTP server serves the source tree on port 3000 for Preview. Hash navigation keeps the app single-page while still making Home, Practice, Results, Stats, Images, and Settings distinct views. Chapter JSON is loaded from `/data/index.json` and each listed file; imported chapters are merged at runtime from `localStorage`.

Learning state is keyed by stable `chapterId:entryIndex` identifiers. Each word stores Leitner box, attempts, correct answers, last result, and recent mode history. Session settings select mode pools, question counts, shuffle, weak-only filtering, and mixed mode. Every answer records a mistake, updates the box, and opens an inline feedback panel before the next question. Results and stats are derived from the same localStorage record, with JSON export/import for portability.

Visual modes use only entries with images and gracefully fall back when an image is unavailable. The image review page stores user replacements as data URLs and lets the learner remove them. Speech uses the browser Web Speech API with a target-language selector. Keyboard shortcuts handle `1`–`4`, Enter, and Escape where useful.

## Design direction

### Style options

- **Editorial language studio** (0.07): an ink-dark reading surface with warm paper cards and a sharp citrus accent.
- **Neo-brutalist study desk** (0.06): heavy borders, oversized numerals, and high-contrast utility controls.
- **Soft-focus focus app** (0.05): rounded glass panels, muted gradients, and gentle ambient motion.

### Chosen style: Editorial language studio

- **Design Movement:** Contemporary editorial UI with language-learning flashcard cues.
- **Core Principles:** Make the next action obvious; give progress a physical sense of movement; keep dense information calm; let images support memory rather than decoration.
- **Color Philosophy:** Ink navy is the quiet base, parchment is used for readable learning surfaces, and citrus yellow is reserved for momentum and mastery. Red and green are used only as immediate answer signals.
- **Layout Paradigm:** A left rail on wide screens and a compact bottom/navigation bar on mobile frame a single focused learning column. Home uses offset chapter cards rather than a rigid centered dashboard grid.
- **Signature Elements:** A small uppercase section kicker, a progress “rail” that visually fills as the learner advances, and answer cards with a slightly clipped editorial corner.
- **Interaction Philosophy:** Controls are direct and tactile. Every answer produces instant feedback, and secondary actions stay visible but quiet.
- **Animation:** Use short 160–220ms lifts and opacity transitions. On answer, green/red feedback should snap in, while progress rails fill with a restrained ease-out. Respect reduced-motion preferences.
- **Typography System:** `DM Sans` for interface and body copy, `Space Grotesk` for word prompts and oversized stats. Use system fallbacks so the app remains dependency-free.
- **Brand Essence:** A quiet, visual vocabulary studio for building recall one deliberate session at a time. Personality: focused, warm, exacting.
- **Brand Voice:** Headlines are concise and active. CTAs sound like a coach, not a task manager. Examples: “Pick a chapter. Make it stick.” and “One more round with the words that slipped.”
- **Wordmark & Logo:** A compact `LX` monogram built from two offset vertical strokes, echoing a flashcard edge and a progress rail.
- **Signature Brand Color:** `#F4C95D` citrus yellow.

## Build workflow

1. Create the chapter JSON and image attribution dataset.
2. Implement the static shell, view router, localStorage state, quiz engine, and keyboard interactions.
3. Add the chapter management pages, import/export, image review, and settings.
4. Register host-managed TypeScript/CSS/JSON diagnostics before implementation edits.
5. Run the dev server on port 3000, check the route manifest and HTTP responses, run syntax/build checks, and inspect representative pages with the managed Preview only if a concrete issue needs visual verification.
6. Commit the finished source to `origin/main` so the managed project records a checkpoint.

## Material constraints

The example dataset uses English words with French translations as placeholders. Concrete-word images come from Wikimedia Commons, are downloaded locally, resized to a consistent width around 400px, converted to WebP, and recorded with source file page, author, and license metadata in `public/images/ATTRIBUTION.json`. Abstract words remain text-only.
