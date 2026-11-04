const STORAGE = {
  progress: 'lexiloop-progress-v1',
  settings: 'lexiloop-settings-v1',
  imports: 'lexiloop-imports-v1',
  images: 'lexiloop-images-v1',
};

const DATA_VERSION = '20261104-audio-v1';

const MODES = [
  { id: 'text', label: 'Text recognition', short: 'Text', description: 'Four meanings, two directions.' },
  { id: 'conjugation', label: 'Conjugation', short: 'Conjugation', description: 'Type the present-tense form.' },
  { id: 'article', label: 'Artikel guess', short: 'Artikel', description: 'Choose der, die, or das.' },
  { id: 'image-word', label: 'Image → word', short: 'Image → word', description: 'Choose the word that matches.' },
  { id: 'word-image', label: 'Word → image', short: 'Word → image', description: 'Spot the right picture.' },
  { id: 'image-spelling', label: 'Image → spelling', short: 'Image → spell', description: 'Type what you see.' },
  { id: 'spelling', label: 'Spelling', short: 'Spelling', description: 'Recall the word from its meaning.' },
];

const ui = {
  selectedChapters: new Set(),
  showChapterModal: false,
  imageFilter: 'all',
  sessionSettings: {
    modes: ['text'],
    questionCount: 10,
    direction: 'reverse',
    shuffle: true,
    weakOnly: false,
    ignoreCase: true,
  },
  lastResult: null,
};

let appData = { chapters: [], entries: [] };
let progress = readStorage(STORAGE.progress, { cards: {}, sessions: [] });
let appSettings = readStorage(STORAGE.settings, { language: 'de-DE', ignoreCase: true, defaultQuestionCount: 10 });
if (appSettings.language === 'fr-FR') {
  appSettings = { ...appSettings, language: 'de-DE' };
  writeStorage(STORAGE.settings, appSettings);
}
let importedChapters = readStorage(STORAGE.imports, []);
let customImages = readStorage(STORAGE.images, {});
let activeView = (window.location.hash || '#home').slice(1) || 'home';
let practice = null;
ui.sessionSettings.ignoreCase = appSettings.ignoreCase;

function readStorage(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
}

function escapeAttr(value = '') {
  return escapeHtml(value).replace(/`/g, '&#096;');
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function keyFor(entry) {
  return `${entry.chapterId}:${entry.index}`;
}

function cardFor(entry) {
  const key = keyFor(entry);
  if (!progress.cards[key]) {
    progress.cards[key] = { box: 1, attempts: 0, correct: 0, wrong: 0, history: [] };
  }
  return progress.cards[key];
}

function imageFor(entry) {
  const custom = customImages[keyFor(entry)];
  return custom || (entry.image ? `/${entry.image}` : '');
}

function hasImage(entry) {
  return Boolean(imageFor(entry));
}
function hasArticle(entry) {
  return Boolean(entry.article && ['der', 'die', 'das'].includes(entry.article));
}
function hasConjugation(entry) {
  return Boolean(entry.partOfSpeech === 'verb' && entry.conjugation && Object.keys(entry.conjugation).length);
}
function nounFor(entry) {
  return entry.noun || entry.word.replace(new RegExp(`^${entry.article}\\s+`, 'i'), '');
}
function natureFor(entry) {
  if (hasArticle(entry)) return 'noun';
  if (entry.partOfSpeech === 'verb' || hasConjugation(entry)) return 'verb';
  if (entry.category === 'grammar') return 'grammar';
  if (entry.category === 'key phrases' || /[?!.]/.test(entry.word) || entry.word.trim().split(/\s+/).length >= 3) return 'phrase';
  return 'other';
}
function canUseMode(entry, mode) {
  if (mode.includes('image')) return hasImage(entry);
  if (mode === 'article') return hasArticle(entry);
  if (mode === 'conjugation') return hasConjugation(entry);
  if (mode === 'spelling') return entry.category !== 'grammar';
  return true;
}

function chapterById(id) {
  return appData.chapters.find((chapter) => chapter.id === id);
}

function entriesForSelected() {
  return appData.entries.filter((entry) => ui.selectedChapters.has(entry.chapterId));
}

function normalizeAnswer(value) {
  return String(value || '').trim().normalize('NFC');
}

function normalizedForCompare(value) {
  const answer = normalizeAnswer(value);
  return ui.sessionSettings.ignoreCase ? answer.toLocaleLowerCase() : answer;
}

function formatDate(timestamp) {
  if (!timestamp) return 'No sessions yet';
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(timestamp));
}

function chapterStats(chapter) {
  const entries = appData.entries.filter((entry) => entry.chapterId === chapter.id);
  const cards = entries.map(cardFor);
  const mastered = cards.filter((card) => card.box >= 4).length;
  const attempts = cards.reduce((sum, card) => sum + card.attempts, 0);
  const correct = cards.reduce((sum, card) => sum + card.correct, 0);
  const last = progress.sessions.find((session) => session.chapterIds?.includes(chapter.id));
  return {
    mastered,
    total: entries.length,
    percent: entries.length ? Math.round((mastered / entries.length) * 100) : 0,
    accuracy: attempts ? Math.round((correct / attempts) * 100) : 0,
    attempts,
    last,
  };
}

function totals() {
  const cards = appData.entries.map(cardFor);
  const attempts = cards.reduce((sum, card) => sum + card.attempts, 0);
  const correct = cards.reduce((sum, card) => sum + card.correct, 0);
  return {
    mastered: cards.filter((card) => card.box >= 4).length,
    words: cards.length,
    accuracy: attempts ? Math.round((correct / attempts) * 100) : 0,
    sessions: progress.sessions.length,
  };
}

async function loadData() {
  const index = await fetch(`/data/index.json?v=${DATA_VERSION}`).then((response) => response.json());
  const base = [];
  const chapterIndex = Array.isArray(index) ? index : index.chapters;
  for (const chapterMeta of chapterIndex) {
    const chapter = await fetch(`/data/${chapterMeta.file}?v=${DATA_VERSION}`).then((response) => response.json());
    base.push({ ...chapterMeta, ...chapter, imported: false });
  }
  const chapters = [...base, ...importedChapters.map((chapter) => ({ ...chapter, imported: true }))];
  const entries = chapters.flatMap((chapter) => (chapter.entries || []).map((entry, index) => ({ ...entry, chapterId: chapter.id, index })));
  appData = { chapters, entries };
  if (!ui.selectedChapters.size) ui.selectedChapters = new Set(chapters.map((chapter) => chapter.id));
}

function navButton(route, label, icon) {
  const current = activeView === route ? 'is-active' : '';
  return `<button class="nav-item ${current}" data-route="#${route}" aria-label="${label}"><span class="nav-icon">${icon}</span><span>${label}</span></button>`;
}

function pageMeta() {
  return {
    home: ['Study desk', 'Your vocabulary, one clear next step.'],
    practice: ['Practice', 'Make the recall a little harder.'],
    verbs: ['Verb desk', 'Meanings, examples, and present-tense forms.'],
    results: ['Session complete', 'Notice what moved.'],
    stats: ['Progress notes', 'Patterns worth remembering.'],
    images: ['Image desk', 'Keep the visual cues useful.'],
    settings: ['Settings', 'Tune the trainer to your language.'],
  }[activeView] || ['LexiLoop', 'A quiet space for active recall.'];
}

function shell(content) {
  const [kicker, subtitle] = pageMeta();
  return `<div class="app-shell">
    <aside class="sidebar">
      <button class="brand" data-route="#home" aria-label="Go to home"><span class="brand-mark"><i></i><i></i></span><span>Lexi<span>Loop</span></span></button>
      <div class="sidebar-label">Workspace</div>
      <nav class="sidebar-nav">
        ${navButton('home', 'Home', '⌂')}
        ${navButton('practice', 'Practice', '↗')}
        ${navButton('verbs', 'Verbs', 'Aa')}
        ${navButton('stats', 'Stats', '◒')}
        ${navButton('images', 'Images', '▧')}
        ${navButton('settings', 'Settings', '⊙')}
      </nav>
      <div class="sidebar-foot"><span class="status-dot"></span><span>Local progress on</span></div>
    </aside>
    <main class="main-stage">
      <header class="topbar">
        <div><div class="topbar-kicker">${escapeHtml(kicker)}</div><div class="topbar-subtitle">${escapeHtml(subtitle)}</div></div>
        <div class="topbar-actions"><span class="local-badge"><span class="status-dot"></span>Private · local only</span><button class="avatar-button" data-route="#settings" aria-label="Open settings">LX</button></div>
      </header>
      <div class="page-wrap">${content}</div>
    </main>
    <nav class="mobile-nav" aria-label="Main navigation">
      ${navButton('home', 'Home', '⌂')}
      ${navButton('practice', 'Practice', '↗')}
      ${navButton('verbs', 'Verbs', 'Aa')}
      ${navButton('stats', 'Stats', '◒')}
      ${navButton('images', 'Images', '▧')}
      ${navButton('settings', 'Settings', '⊙')}
    </nav>
  </div>`;
}

function renderHome() {
  const total = totals();
  return `<section class="hero-grid">
    <div class="hero-copy">
      <div class="eyebrow">A visual vocabulary studio</div>
      <h1>Pick a chapter.<br /><em>Make it stick.</em></h1>
      <p class="hero-lede">A focused loop of recognition, recall, and the words that slipped last time.</p>
      <div class="hero-actions"><button class="button button-primary" data-action="start-practice">Start a session <span>↗</span></button><button class="button button-quiet" data-route="#verbs">Study verbs <span>→</span></button><button class="button button-quiet" data-route="#stats">View progress <span>→</span></button></div>
    </div>
    <div class="hero-illustration" aria-hidden="true"><div class="orbit orbit-one"></div><div class="orbit orbit-two"></div><div class="hero-card hero-card-back"></div><div class="hero-card hero-card-front"><span class="card-label">Today’s word</span><strong>Buch</strong><small>book · noun</small><div class="card-streak"><span>✦</span> in the groove</div></div><div class="hero-spark spark-one">✳</div><div class="hero-spark spark-two">+</div></div>
  </section>
  <section class="metrics-row">
    <div class="metric"><span class="metric-label">Mastered</span><strong>${total.mastered}<small>/${total.words}</small></strong><span class="metric-note">words in box 4–5</span></div>
    <div class="metric"><span class="metric-label">Accuracy</span><strong>${total.accuracy}<small>%</small></strong><span class="metric-note">across all sessions</span></div>
    <div class="metric"><span class="metric-label">Sessions</span><strong>${total.sessions}</strong><span class="metric-note">keep the chain warm</span></div>
    <div class="metric metric-accent"><span class="metric-label">Material</span><strong>${appData.chapters.length}<small> lessons</small></strong><span class="metric-note">${total.words} total words</span></div>
  </section>
  <section class="section-block chapter-section">
    <div class="section-heading"><div><div class="eyebrow">Course overview</div><h2>Lessons</h2></div><div class="section-actions"><button class="button button-small" data-route="#settings">+ Import chapter</button></div></div>
    <div class="chapter-list">${appData.chapters.map(renderChapterCard).join('')}</div>
  </section>`;
}

function renderChapterCard(chapter, index) {
  const stats = chapterStats(chapter);
  const accent = ['yellow', 'coral', 'blue', 'mint'][index % 4];
  return `<article class="chapter-card">
    <div class="chapter-select"><span class="chapter-index">${String(index + 1).padStart(2, '0')}</span></div>
    <div class="chapter-card-main"><div class="chapter-heading"><div><h3>${escapeHtml(chapter.title)}</h3><p>${escapeHtml(chapter.description || `${chapter.entries.length} words to revisit.`)}</p></div><span class="chapter-count">${chapter.entries.length} words</span></div><div class="progress-line"><span class="progress-fill ${accent}" style="width:${Math.max(stats.percent, 4)}%"></span></div><div class="chapter-footer"><span>${stats.percent}% mastered</span><span>${stats.last ? `Last score ${stats.last.score}% · ${formatDate(stats.last.endedAt)}` : 'Ready when you are'}</span></div></div>
    <button class="chapter-arrow" data-action="chapter-practice" data-chapter="${escapeAttr(chapter.id)}" aria-label="Practice ${escapeAttr(chapter.title)}">↗</button>
  </article>`;
}

function eligibleEntriesForChapter(chapterId, modes) {
  const activeModes = modes.length ? modes : ['text'];
  return appData.entries.filter((entry) => entry.chapterId === chapterId && activeModes.some((mode) => canUseMode(entry, mode)));
}

function renderChapterModal(effectiveModes) {
  if (!ui.showChapterModal) return '';
  const eligibleChapters = appData.chapters.filter((chapter) => eligibleEntriesForChapter(chapter.id, effectiveModes).length > 0);
  const selectedEligible = eligibleChapters.filter((chapter) => ui.selectedChapters.has(chapter.id));
  const allSelected = eligibleChapters.length > 0 && selectedEligible.length === eligibleChapters.length;
  const totalEligibleWords = selectedEligible.reduce((sum, chapter) => sum + eligibleEntriesForChapter(chapter.id, effectiveModes).length, 0);
  return `<div class="modal-backdrop" data-action="close-chapter-modal">
    <div class="modal-sheet panel" role="dialog" aria-modal="true" aria-labelledby="modal-lesson-title" data-modal-sheet>
      <div class="modal-header">
        <div>
          <span class="panel-kicker">03 · Choose lessons</span>
          <h2 id="modal-lesson-title">Which lessons do you want to practice?</h2>
        </div>
        <button class="modal-close" data-action="close-chapter-modal" aria-label="Close">×</button>
      </div>
      <div class="modal-quick-bar">
        <label class="modal-all-toggle ${allSelected ? 'is-selected' : ''}">
          <input type="checkbox" data-action="toggle-all-chapters" ${allSelected ? 'checked' : ''} />
          <span class="checkmark"></span>
          <div>
            <strong>All eligible lessons</strong>
            <small>${eligibleChapters.length} of ${appData.chapters.length} lessons match your selected mode${effectiveModes.length === 1 ? '' : 's'}</small>
          </div>
        </label>
      </div>
      <div class="modal-chapter-list">
        ${appData.chapters.map((chapter, index) => {
          const matchingCount = eligibleEntriesForChapter(chapter.id, effectiveModes).length;
          const disabled = matchingCount === 0;
          const checked = !disabled && ui.selectedChapters.has(chapter.id);
          return `<label class="modal-chapter-item ${checked ? 'is-selected' : ''} ${disabled ? 'is-disabled' : ''}">
            <input type="checkbox" data-chapter-select="${escapeAttr(chapter.id)}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''} />
            <span class="checkmark"></span>
            <span class="chapter-index">${String(index + 1).padStart(2, '0')}</span>
            <div class="modal-chapter-copy">
              <strong>${escapeHtml(chapter.title)}</strong>
              <small>${disabled ? 'No words for selected mode' : `${matchingCount} eligible word${matchingCount === 1 ? '' : 's'}`}</small>
            </div>
          </label>`;
        }).join('')}
      </div>
      <div class="modal-footer">
        <div class="modal-summary"><strong>${selectedEligible.length} lesson${selectedEligible.length === 1 ? '' : 's'}</strong> · ${totalEligibleWords} words in pool</div>
        <div class="modal-actions">
          <button class="button button-quiet button-small" data-action="close-chapter-modal">Back</button>
          <button class="button button-primary" data-action="confirm-chapter-modal" ${selectedEligible.length ? '' : 'disabled'}>Start session <span>↗</span></button>
        </div>
      </div>
    </div>
  </div>`;
}

function renderPracticeSetup() {
  const s = ui.sessionSettings;
  const activeModes = s.modes.filter((modeId) => appData.entries.some((entry) => canUseMode(entry, modeId)));
  const effectiveModes = activeModes.length ? activeModes : ['text'];
  return `<section class="setup-header"><div class="eyebrow">Session builder</div><h1>Set the frame.<br /><em>Then get moving.</em></h1><p>Choose your recall mode and session shape, then pick your lessons on start.</p></section>
  <section class="setup-layout">
    <div class="setup-main panel">
      <div class="panel-heading"><div><span class="panel-kicker">01 · Mode</span><h2>How do you want to recall?</h2></div><span class="panel-count">${effectiveModes.length} selected</span></div>
      <div class="mode-grid">${MODES.map((mode) => {
        const enabled = appData.entries.some((entry) => canUseMode(entry, mode.id));
        const selected = effectiveModes.includes(mode.id) && enabled;
        return `<label class="mode-card ${selected ? 'is-selected' : ''} ${!enabled ? 'is-disabled' : ''}"><input type="checkbox" data-mode-toggle="${mode.id}" ${selected ? 'checked' : ''} ${!enabled ? 'disabled' : ''}/><span class="mode-check">${selected ? '✓' : ''}</span><span class="mode-icon">${mode.id === 'text' ? 'Aa' : mode.id === 'spelling' ? '⌁' : mode.id === 'conjugation' ? '↻' : '▣'}</span><strong>${mode.label}</strong><small>${mode.description}</small></label>`;
      }).join('')}</div>
      <div class="setup-divider"></div>
      <div class="panel-heading compact"><div><span class="panel-kicker">02 · Shape</span><h2>Give it a rhythm.</h2></div></div>
      <div class="setting-grid">
        <div class="field"><span>Session length</span><div class="session-length-options" role="radiogroup" aria-label="Session length"><label class="session-length-option ${s.questionCount === 10 ? 'is-selected' : ''}"><input type="radio" name="question-count" data-session-setting="questionCount" value="10" ${s.questionCount === 10 ? 'checked' : ''}/><span class="session-length-number">10</span><span class="session-length-copy"><strong>Quick test</strong><small>Focused reset</small></span></label><label class="session-length-option ${s.questionCount === 30 ? 'is-selected' : ''}"><input type="radio" name="question-count" data-session-setting="questionCount" value="30" ${s.questionCount === 30 ? 'checked' : ''}/><span class="session-length-number">30</span><span class="session-length-copy"><strong>Extended test</strong><small>Deeper practice</small></span></label></div></div>
        <label class="field"><span>Text direction</span><select data-session-setting="direction"><option value="mixed" ${s.direction === 'mixed' ? 'selected' : ''}>Mixed directions</option><option value="forward" ${s.direction === 'forward' ? 'selected' : ''}>German → English</option><option value="reverse" ${s.direction === 'reverse' ? 'selected' : ''}>English → German</option></select></label>
      </div>
      <div class="toggle-list"><label class="toggle-row"><span><strong>Shuffle the deck</strong><small>Keep the order unpredictable.</small></span><input type="checkbox" data-session-setting="shuffle" ${s.shuffle ? 'checked' : ''}/><span class="toggle"></span></label><label class="toggle-row"><span><strong>Only weak or wrong words</strong><small>Stay with boxes 1–2 and recent misses.</small></span><input type="checkbox" data-session-setting="weakOnly" ${s.weakOnly ? 'checked' : ''}/><span class="toggle"></span></label><label class="toggle-row"><span><strong>Ignore case in spelling</strong><small>Accents still count; case does not.</small></span><input type="checkbox" data-session-setting="ignoreCase" ${s.ignoreCase ? 'checked' : ''}/><span class="toggle"></span></label></div>
      <div class="setup-inline-start"><button class="button button-primary button-wide" data-action="open-chapter-modal">Choose lessons &amp; start <span>↗</span></button></div>
    </div>
    <aside class="setup-side panel"><div class="panel-kicker">Ready to begin</div><h3>${effectiveModes.length} mode${effectiveModes.length === 1 ? '' : 's'} · ${s.questionCount} questions</h3><div class="selected-chapters">${effectiveModes.map((id) => `<span class="chip"><span class="status-dot"></span>${escapeHtml(MODES.find((m) => m.id === id)?.label || id)}</span>`).join('')}</div><div class="setup-side-note"><span class="note-mark">✦</span><p>Press start to choose all lessons or pick specific chapters for this session.</p></div><button class="button button-primary button-wide" data-action="open-chapter-modal">Begin session <span>↗</span></button></aside>
  </section>${renderChapterModal(effectiveModes)}`;
}

function distractorsFor(entry, mapFn, correctValue, count = 3) {
  const nature = natureFor(entry);
  const others = appData.entries.filter((item) => keyFor(item) !== keyFor(entry) && item.word !== entry.word && item.translation !== entry.translation);
  const sameChapSameCat = shuffle(others.filter((item) => item.chapterId === entry.chapterId && natureFor(item) === nature && entry.category && item.category === entry.category));
  const sameChapSameNature = shuffle(others.filter((item) => item.chapterId === entry.chapterId && natureFor(item) === nature && (!entry.category || item.category !== entry.category)));
  const otherChapSameNature = shuffle(others.filter((item) => item.chapterId !== entry.chapterId && natureFor(item) === nature));
  const sameChapAny = shuffle(others.filter((item) => item.chapterId === entry.chapterId && natureFor(item) !== nature));
  const otherAny = shuffle(others.filter((item) => item.chapterId !== entry.chapterId && natureFor(item) !== nature));
  const candidates = [...sameChapSameCat, ...sameChapSameNature, ...otherChapSameNature, ...sameChapAny, ...otherAny];
  const seen = new Set([normalizedForCompare(correctValue)]);
  const result = [];
  for (const candidate of candidates) {
    const value = mapFn(candidate);
    const norm = normalizedForCompare(value);
    if (!value || seen.has(norm)) continue;
    seen.add(norm);
    result.push(value);
    if (result.length >= count) break;
  }
  return result;
}

function sampleWeightedUnique(entries, shouldShuffle) {
  if (!shouldShuffle) return [...entries];
  const remaining = entries.map((entry) => ({ entry, weight: Math.max(1, 6 - cardFor(entry).box) }));
  const picked = [];
  while (remaining.length) {
    const totalWeight = remaining.reduce((sum, item) => sum + item.weight, 0);
    let threshold = Math.random() * totalWeight;
    let chosenIndex = remaining.length - 1;
    for (let i = 0; i < remaining.length; i += 1) {
      threshold -= remaining[i].weight;
      if (threshold <= 0) {
        chosenIndex = i;
        break;
      }
    }
    picked.push(remaining[chosenIndex].entry);
    remaining.splice(chosenIndex, 1);
  }
  return picked;
}

function questionFor(entry, mode, usedVariants = new Set()) {
  if (mode === 'conjugation') {
    const persons = Object.keys(entry.conjugation || {});
    const unusedPersons = persons.filter((person) => !usedVariants.has(`conj:${person}`));
    const poolPersons = unusedPersons.length ? unusedPersons : persons;
    const person = poolPersons[Math.floor(Math.random() * poolPersons.length)] || 'ich';
    usedVariants.add(`conj:${person}`);
    const correct = entry.conjugation?.[person] || '';
    return { entry, type: mode, person, prompt: entry.translation, correct };
  }
  if (mode === 'text') {
    let direction = ui.sessionSettings.direction;
    if (direction === 'mixed') {
      const canForward = !usedVariants.has('text:forward');
      const canReverse = !usedVariants.has('text:reverse');
      direction = canForward && canReverse ? (Math.random() > 0.5 ? 'forward' : 'reverse') : (canForward ? 'forward' : 'reverse');
    }
    usedVariants.add(`text:${direction}`);
    const correct = direction === 'forward' ? entry.translation : entry.word;
    const distractors = distractorsFor(entry, (item) => (direction === 'forward' ? item.translation : item.word), correct, 3);
    return { entry, type: 'text', direction, prompt: direction === 'forward' ? entry.word : entry.translation, correct, options: shuffle([correct, ...distractors]) };
  }
  if (mode === 'article') {
    return { entry, type: mode, prompt: nounFor(entry), correct: entry.article, options: ['der', 'die', 'das'] };
  }
  if (mode === 'image-word') {
    const distractors = distractorsFor(entry, (item) => item.word, entry.word, 3);
    return { entry, type: mode, prompt: '', correct: entry.word, options: shuffle([entry.word, ...distractors]) };
  }
  if (mode === 'word-image') {
    const nature = natureFor(entry);
    const allImages = appData.entries.filter(hasImage).filter((item) => item.word !== entry.word);
    const sameNatureImages = shuffle(allImages.filter((item) => natureFor(item) === nature));
    const otherImages = shuffle(allImages.filter((item) => natureFor(item) !== nature));
    const imagePool = [...sameNatureImages, ...otherImages];
    const options = shuffle([entry, ...imagePool.slice(0, 3)]);
    return { entry, type: mode, prompt: entry.word, correct: entry.word, options, correctIndex: options.findIndex((item) => item.word === entry.word) };
  }
  if (mode === 'image-spelling') return { entry, type: mode, prompt: '', correct: entry.word };
  return { entry, type: 'spelling', prompt: entry.translation, correct: entry.word };
}

function startSession(overrides = {}, forcedEntries = null) {
  const settings = { ...ui.sessionSettings, ...overrides };
  ui.sessionSettings = settings;
  const requestedModes = settings.modes.length ? settings.modes : ['text'];
  let pool = forcedEntries || entriesForSelected();
  if (settings.weakOnly) pool = pool.filter((entry) => { const card = cardFor(entry); return card.box <= 2 || card.wrong > card.correct; });
  pool = pool.filter((entry) => requestedModes.some((mode) => canUseMode(entry, mode)));
  if (!pool.length) {
    window.alert('Choose at least one chapter with eligible words for the selected mode(s).');
    return;
  }
  const targetCount = Number(settings.questionCount);
  const orderedEntries = [];
  while (orderedEntries.length < targetCount) {
    const pass = sampleWeightedUnique(pool, settings.shuffle);
    if (orderedEntries.length && pass.length > 1 && keyFor(pass[0]) === keyFor(orderedEntries[orderedEntries.length - 1])) {
      [pass[0], pass[1]] = [pass[1], pass[0]];
    }
    orderedEntries.push(...pass);
  }
  const variantHistory = new Map();
  const questions = [];
  for (let index = 0; index < targetCount; index += 1) {
    const entry = orderedEntries[index];
    const entryKey = keyFor(entry);
    if (!variantHistory.has(entryKey)) variantHistory.set(entryKey, new Set());
    const usedVariants = variantHistory.get(entryKey);
    const availableModes = requestedModes.filter((mode) => canUseMode(entry, mode));
    const unusedModes = availableModes.filter((mode) => !usedVariants.has(`mode:${mode}`));
    const modePool = unusedModes.length ? unusedModes : availableModes;
    const mode = modePool[index % Math.max(modePool.length, 1)] || 'text';
    usedVariants.add(`mode:${mode}`);
    questions.push(questionFor(entry, mode, usedVariants));
  }
  practice = { questions, index: 0, answers: [], feedback: null, startedAt: Date.now(), settings };
  activeView = 'practice';
  window.location.hash = '#practice';
  render();
  setTimeout(() => document.querySelector('#spelling-answer, #conjugation-answer')?.focus(), 80);
}

function renderPractice() {
  if (!practice) return renderPracticeSetup();
  const question = practice.questions[practice.index];
  const answered = Boolean(practice.feedback);
  const progressPercent = Math.round((practice.index / practice.questions.length) * 100);
  const answerClass = practice.feedback ? (practice.feedback.correct ? 'is-correct' : 'is-wrong') : '';
  const keyboardHint = question.type === 'conjugation' ? 'Type the form · Press Enter to check' : 'Press 1–4 for choices · Enter to submit or continue';
  return `<section class="practice-top"><div><div class="eyebrow">${practice.settings.modes.length > 1 ? 'Mixed recall' : MODES.find((mode) => mode.id === question.type)?.label || 'Practice'}</div><h1>Stay with the word.</h1></div><div class="practice-top-meta"><span>${practice.index + 1} <small>/ ${practice.questions.length}</small></span><button class="text-button" data-action="quit-session">Quit session</button></div></section>
    <div class="session-rail"><span style="width:${Math.max(progressPercent, 3)}%"></span></div>
    <section class="question-card panel ${answerClass}"><div class="question-meta"><span class="pill">${escapeHtml(chapterById(question.entry.chapterId)?.title || 'Imported')}</span><span class="muted">Box ${cardFor(question.entry).box} · ${question.type === 'text' ? question.direction === 'forward' ? 'recognition' : 'reverse recognition' : 'recall'}</span></div>${renderPrompt(question)}${practice.feedback ? renderFeedback(question, practice.feedback) : ''}</section>
    <div class="keyboard-hint"><span>Tip</span> ${keyboardHint}</div>`;
}

function renderPrompt(question) {
  if (question.type === 'conjugation') {
    return `<div class="prompt-block text-prompt conjugation-prompt"><div class="prompt-kicker">What is the conjugation for ${escapeHtml(question.person)}?</div><h2 class="word-prompt">${escapeHtml(question.entry.word)}</h2><p class="conjugation-question">English meaning: ${escapeHtml(question.prompt)}</p></div>${renderConjugationInput(question)}`;
  }
  if (question.type === 'article') {
    return `<div class="prompt-block text-prompt article-prompt"><div class="prompt-kicker">Which Artikel does this noun take?</div><h2 class="word-prompt">${escapeHtml(question.prompt)}</h2><p class="article-hint">Nominative · singular</p></div><div class="choice-grid article-choice-grid">${question.options.map((option, index) => `<button class="choice-button article-choice" data-action="choice" data-choice="${index}" ${practice.feedback ? 'disabled' : ''}><span class="choice-number">${index + 1}</span>${escapeHtml(option)}</button>`).join('')}</div>`;
  }
  if (question.type === 'word-image') {
    return `<div class="prompt-block"><div class="prompt-kicker">Which picture matches this word?</div><h2 class="word-prompt">${escapeHtml(question.prompt)}</h2><p class="image-meaning">English: ${escapeHtml(question.entry.translation)}</p></div><div class="image-choice-grid">${question.options.map((option, index) => `<button class="image-choice ${practice.feedback && index === question.correctIndex ? 'is-answer' : ''}" data-action="choice" data-choice="${index}" ${practice.feedback ? 'disabled' : ''}><img src="${escapeAttr(imageFor(option))}" alt="" loading="lazy" /><span>${index + 1}</span></button>`).join('')}</div>`;
  }
  if (question.type === 'image-word') {
    return `<div class="prompt-block"><div class="prompt-kicker">Choose the German word</div><div class="single-image-frame"><img src="${escapeAttr(imageFor(question.entry))}" alt="Visual clue for ${escapeAttr(question.entry.word)}" loading="lazy" /></div><p class="image-meaning">English: ${escapeHtml(question.entry.translation)}</p></div><div class="choice-grid">${question.options.map((option, index) => `<button class="choice-button" data-action="choice" data-choice="${index}" ${practice.feedback ? 'disabled' : ''}><span class="choice-number">${index + 1}</span>${escapeHtml(option)}</button>`).join('')}</div>`;
  }
  if (question.type === 'image-spelling') {
    const hint = hasArticle(question.entry) ? '<p class="article-hint">Noun · include der / die / das (or type the noun)</p>' : '';
    return `<div class="prompt-block split-prompt"><div><div class="prompt-kicker">Type the word you see</div><h2 class="word-prompt">${escapeHtml(question.entry.translation)}</h2>${hint}<button class="speak-button" data-action="speak">◖ Hear the word</button></div><div class="single-image-frame"><img src="${escapeAttr(imageFor(question.entry))}" alt="Visual clue" loading="lazy" /></div></div>${renderSpellingInput(question)}`;
  }
  if (question.type === 'spelling') {
    const hint = hasArticle(question.entry) ? '<p class="article-hint">Noun · include der / die / das (or type the noun)</p>' : '';
    return `<div class="prompt-block spelling-prompt"><div class="prompt-kicker">Write the German word</div><h2 class="word-prompt">${escapeHtml(question.prompt)}</h2>${hint}<button class="speak-button" data-action="speak">◖ Hear the word</button></div>${renderSpellingInput(question)}`;
  }
  return `<div class="prompt-block text-prompt"><div class="prompt-kicker">${question.direction === 'forward' ? 'What is the English meaning?' : 'What is the German word?'}</div><h2 class="word-prompt">${escapeHtml(question.prompt)}</h2></div><div class="choice-grid">${question.options.map((option, index) => `<button class="choice-button" data-action="choice" data-choice="${index}" ${practice.feedback ? 'disabled' : ''}><span class="choice-number">${index + 1}</span>${escapeHtml(option)}</button>`).join('')}</div>`;
}

function renderSpellingInput(question) {
  const value = practice.feedback?.answer || '';
  const disabled = practice.feedback ? 'disabled' : '';
  return `<div class="spelling-form"><div class="input-wrap"><input id="spelling-answer" class="spelling-input" value="${escapeAttr(value)}" placeholder="Type the spelling…" autocomplete="off" ${disabled} /><button class="clear-input" data-action="clear-input" aria-label="Clear answer">×</button></div><div class="special-row">${specialChars().map((char) => `<button data-action="insert-char" data-char="${escapeAttr(char)}">${char}</button>`).join('')}</div><button class="button button-primary submit-button" data-action="submit-spelling" ${disabled}>Check answer <span>↗</span></button></div>`;
}

function renderConjugationInput(question) {
  const value = practice.feedback?.answer || '';
  const disabled = practice.feedback ? 'disabled' : '';
  return `<div class="spelling-form conjugation-form"><div class="input-wrap"><input id="conjugation-answer" class="spelling-input" value="${escapeAttr(value)}" placeholder="Type the conjugation…" autocomplete="off" ${disabled} /><button class="clear-input" data-action="clear-conjugation" aria-label="Clear answer">×</button></div><div class="special-row">${specialChars().map((char) => `<button data-action="insert-conjugation-char" data-char="${escapeAttr(char)}" ${disabled}>${char}</button>`).join('')}</div><button class="button button-primary submit-button" data-action="submit-conjugation" ${disabled}>Check conjugation <span>↗</span></button></div>`;
}

function specialChars() {
  if (appSettings.language.startsWith('es')) return ['á', 'é', 'í', 'ó', 'ú', 'ñ'];
  if (appSettings.language.startsWith('de')) return ['ä', 'ö', 'ü', 'ß'];
  if (appSettings.language.startsWith('it')) return ['à', 'è', 'ì', 'ò', 'ù'];
  return ['é', 'è', 'à', 'ç', 'œ'];
}

function diffSpelling(answer, correct) {
  const typed = normalizeAnswer(answer);
  const expected = [...correct].map((char, index) => `<span class="${typed[index] === char ? 'same' : 'different'}">${escapeHtml(char)}</span>`).join('');
  const extra = typed.length > correct.length ? `<span class="different">${escapeHtml(typed.slice(correct.length))}</span>` : '';
  return expected + extra;
}

function renderFeedback(question, feedback) {
  const correctText = question.correct;
  const word = question.entry.word;
  const showDiff = question.type.includes('spelling') || question.type === 'conjugation';
  return `<div class="feedback-panel ${feedback.correct ? 'feedback-good' : 'feedback-bad'}"><div class="feedback-icon">${feedback.correct ? '✓' : '!'}</div><div class="feedback-copy"><strong>${feedback.correct ? 'Correct. Keep the rhythm.' : 'Not quite. Put it back in view.'}</strong><p>${feedback.correct ? `You chose <b>${escapeHtml(feedback.answer || correctText)}</b>.` : `The answer is <b>${escapeHtml(correctText)}</b>${showDiff ? ` · your answer: <span class="diff-answer">${diffSpelling(feedback.answer, correctText)}</span>` : ''}`}</p><div class="feedback-detail"><span class="feedback-word">${escapeHtml(word)} <button class="speak-icon" data-action="speak" data-text="${escapeAttr(speechText(question.entry))}" data-audio="${escapeAttr(audioPath(question.entry))}" aria-label="Hear pronunciation" title="Hear pronunciation">🔊</button></span><span>${escapeHtml(question.entry.translation)}</span>${question.entry.example ? `<span class="example">“${escapeHtml(question.entry.example)}” <button class="speak-icon" data-action="speak" data-text="${escapeAttr(question.entry.example)}" data-audio="${escapeAttr(audioPath(question.entry, 'example'))}" aria-label="Hear pronunciation" title="Hear pronunciation">🔊</button></span>` : ''}</div></div>${hasImage(question.entry) ? `<img class="feedback-image" src="${escapeAttr(imageFor(question.entry))}" alt="${escapeAttr(word)}" loading="lazy" />` : ''}<button class="button ${feedback.correct ? 'button-primary' : 'button-dark'} next-button" data-action="next-question">${practice.index + 1 === practice.questions.length ? 'See results' : 'Next word'} <span>→</span></button></div>`;
}

function renderResults() {
  const result = ui.lastResult;
  if (!result) return renderHome();
  const accuracy = result.score;
  return `<section class="results-hero"><div class="eyebrow">Session complete · ${formatDate(result.endedAt)}</div><h1>That round<br /><em>counts.</em></h1><p>${accuracy >= 80 ? 'You kept the thread. A little more repetition will make it durable.' : 'The misses are useful. They just told you where to look next.'}</p><div class="result-actions"><button class="button button-primary" data-action="retry-mistakes" ${result.mistakes.length ? '' : 'disabled'}>Retry ${result.mistakes.length || 'missed'} words <span>↗</span></button><button class="button button-quiet" data-route="#practice">New session <span>→</span></button></div></section>
    <section class="results-grid"><div class="score-card panel"><span class="metric-label">Score</span><strong>${accuracy}<small>%</small></strong><div class="score-ring" style="--score:${accuracy * 3.6}deg"><span>${result.correct}<small>/${result.total}</small></span></div><p>${result.total} words · ${Math.round((result.endedAt - result.startedAt) / 1000)} sec</p></div><div class="mistakes-card panel"><div class="panel-heading compact"><div><span class="panel-kicker">Review list</span><h2>${result.mistakes.length ? 'Words to bring back' : 'Clean round'}</h2></div><span class="panel-count">${result.mistakes.length} misses</span></div>${result.mistakes.length ? result.mistakes.map((mistake) => `<div class="mistake-row">${hasImage(mistake.entry) ? `<img src="${escapeAttr(imageFor(mistake.entry))}" alt="" loading="lazy"/>` : '<div class="mistake-placeholder">Aa</div>'}<div><strong>${escapeHtml(mistake.entry.word)}</strong><span>${escapeHtml(mistake.entry.translation)}</span></div><span class="mistake-arrow">→</span></div>`).join('') : '<div class="empty-state compact-empty"><span>✦</span><p>No mistakes this time. Let the boxes move.</p></div>'}</div></section>`;
}

function renderStats() {
  const total = totals();
  const modeStats = {};
  const chapterStatsMap = {};
  progress.sessions.forEach((session) => (session.answers || []).forEach((answer) => {
    const bucket = modeStats[answer.mode] ||= { correct: 0, total: 0 };
    bucket.total += 1;
    bucket.correct += answer.correct ? 1 : 0;
    const chapter = chapterStatsMap[answer.chapterId] ||= { correct: 0, total: 0, scores: [] };
    chapter.total += 1;
    chapter.correct += answer.correct ? 1 : 0;
  }));
  const missed = appData.entries.map((entry) => ({ entry, card: cardFor(entry) })).filter((item) => item.card.wrong).sort((a, b) => b.card.wrong - a.card.wrong).slice(0, 6);
  return `<section class="page-intro"><div><div class="eyebrow">Your pattern, over time</div><h1>Progress notes.</h1><p>Accuracy is only one signal. Watch the boxes, the repeats, and the words that keep asking for another look.</p></div><div class="section-actions"><button class="button button-small" data-action="open-progress-import">Import JSON ↑</button><button class="button button-small" data-action="export-progress">Export progress ↓</button></div></section>
    <section class="stats-overview"><div class="stat-hero panel"><span class="metric-label">All-time accuracy</span><strong>${total.accuracy}<small>%</small></strong><div class="big-progress"><span style="width:${Math.max(total.accuracy, 3)}%"></span></div><p>${total.sessions} sessions · ${total.mastered} mastered words</p></div><div class="stat-mini panel"><span class="metric-label">Leitner boxes</span><div class="box-row">${[1,2,3,4,5].map((box) => `<span><i>${appData.entries.filter((entry) => cardFor(entry).box === box).length}</i><small>Box ${box}</small></span>`).join('')}</div><p>Correct answers move a card up. Misses return it to box 1.</p></div></section>
    <section class="stats-columns"><div class="panel stats-panel"><div class="panel-heading compact"><div><span class="panel-kicker">Chapter accuracy</span><h2>Where it is landing</h2></div></div>${appData.chapters.map((chapter) => { const item = chapterStatsMap[chapter.id] || { correct: 0, total: 0 }; const percent = item.total ? Math.round((item.correct / item.total) * 100) : chapterStats(chapter).accuracy; return `<div class="bar-stat"><div><strong>${escapeHtml(chapter.title)}</strong><span>${percent}% · ${item.total || 0} answers</span></div><div class="bar-track"><span style="width:${Math.max(percent, 3)}%"></span></div></div>`; }).join('')}</div><div class="panel stats-panel"><div class="panel-heading compact"><div><span class="panel-kicker">Mode accuracy</span><h2>What feels harder</h2></div></div>${MODES.map((mode) => { const item = modeStats[mode.id] || { correct: 0, total: 0 }; const percent = item.total ? Math.round((item.correct / item.total) * 100) : 0; return `<div class="mode-stat"><span class="mode-stat-icon">${mode.id.includes('image') ? '▣' : mode.id === 'spelling' ? '⌁' : 'Aa'}</span><div><strong>${mode.label}</strong><span>${item.total ? `${percent}% accuracy · ${item.total} answers` : 'No answers yet'}</span></div><b>${item.total ? `${percent}%` : '—'}</b></div>`; }).join('')}</div></section>
    <section class="panel missed-panel"><div class="panel-heading compact"><div><span class="panel-kicker">Most missed</span><h2>Give these another minute.</h2></div></div>${missed.length ? missed.map(({ entry, card }) => `<div class="missed-row"><span class="missed-rank">${String(card.wrong).padStart(2, '0')}</span>${hasImage(entry) ? `<img src="${escapeAttr(imageFor(entry))}" alt="" loading="lazy"/>` : ''}<div><strong>${escapeHtml(entry.word)}</strong><span>${escapeHtml(entry.translation)}</span></div><span class="box-tag">Box ${card.box}</span></div>`).join('') : '<div class="empty-state"><span>✦</span><p>Your miss list is empty. A first session will give it shape.</p></div>'}</section>
    <section class="danger-zone"><div><strong>Reset progress</strong><p>Remove boxes, sessions, and mistakes from this browser. Imported chapters stay safe.</p></div><button class="button button-danger" data-action="reset-progress">Reset progress</button><input type="file" id="progress-file" accept="application/json" hidden /></section>`;
}

function renderImages() {
  const imageCount = appData.entries.filter(hasImage).length;
  const filteredEntries = appData.entries.filter((entry) => {
    if (ui.imageFilter === 'with-image') return hasImage(entry);
    if (ui.imageFilter === 'all') return true;
    return entry.chapterId === ui.imageFilter;
  });
  return `<section class="page-intro"><div><div class="eyebrow">Memory, made visible</div><h1>Image desk.</h1><p>Every picture is a cue. Replace any image with your own reference and keep it in this browser.</p></div><div class="section-actions"><select class="image-filter-select" data-image-filter aria-label="Filter images"><option value="all" ${ui.imageFilter === 'all' ? 'selected' : ''}>All words (${appData.entries.length})</option><option value="with-image" ${ui.imageFilter === 'with-image' ? 'selected' : ''}>With images (${imageCount})</option>${appData.chapters.map((chapter) => `<option value="${escapeAttr(chapter.id)}" ${ui.imageFilter === chapter.id ? 'selected' : ''}>${escapeHtml(chapter.title)}</option>`).join('')}</select><span class="source-note">${imageCount} images · Wikimedia Commons</span></div></section><div class="image-review-grid">${filteredEntries.map((entry) => `<article class="image-review-card panel"><div class="review-image-wrap">${hasImage(entry) ? `<img src="${escapeAttr(imageFor(entry))}" alt="${escapeAttr(entry.word)}" loading="lazy"/>` : '<div class="image-fallback"><span>✦</span><small>No image yet</small></div>'}<span class="review-chapter">${escapeHtml(chapterById(entry.chapterId)?.title || 'Imported')}</span></div><div class="review-copy"><div><strong>${escapeHtml(entry.word)}</strong><span>${escapeHtml(entry.translation)}</span></div><label class="upload-button"><input type="file" accept="image/*" data-image-upload="${escapeAttr(keyFor(entry))}" />Replace image</label><button class="text-button remove-image" data-action="remove-image" data-key="${escapeAttr(keyFor(entry))}" ${customImages[keyFor(entry)] ? '' : 'disabled'}>Remove custom</button></div></article>`).join('')}</div>`;
}

function renderConjugation(conjugation) {
  return `<div class="conjugation-grid">${Object.entries(conjugation || {}).map(([person, form]) => `<div class="conjugation-row"><span>${escapeHtml(person)}</span><strong>${escapeHtml(form)}</strong></div>`).join('')}</div>`;
}

function renderVerbs() {
  const verbCount = appData.entries.filter((entry) => entry.partOfSpeech === 'verb').length;
  const lessonSections = appData.chapters.map((chapter) => {
    const verbs = appData.entries.filter((entry) => entry.chapterId === chapter.id && entry.partOfSpeech === 'verb');
    if (!verbs.length) return '';
    return `<section class="verb-lesson"><div class="section-heading"><div><div class="eyebrow">${escapeHtml(chapter.title)}</div><h2>${verbs.length} verbs</h2></div><span class="panel-count">Present tense</span></div><div class="verb-grid">${verbs.map((entry) => `<article class="verb-card panel"><div class="verb-card-heading"><div><span class="panel-kicker">Infinitive</span><h3>${escapeHtml(entry.word)} <button class="speak-icon" data-action="speak" data-text="${escapeAttr(speechText(entry))}" data-audio="${escapeAttr(audioPath(entry))}" aria-label="Hear pronunciation" title="Hear pronunciation">🔊</button></h3></div><span class="verb-meaning">${escapeHtml(entry.translation)}</span></div>${entry.example ? `<p class="verb-example">“${escapeHtml(entry.example)}” <button class="speak-icon" data-action="speak" data-text="${escapeAttr(entry.example)}" data-audio="${escapeAttr(audioPath(entry, 'example'))}" aria-label="Hear pronunciation" title="Hear pronunciation">🔊</button></p>` : ''}${renderConjugation(entry.conjugation)}</article>`).join('')}</div></section>`;
  }).join('');
  return `<section class="page-intro"><div><div class="eyebrow">German grammar bank</div><h1>Verb desk.</h1><p>Learn what each verb means, see it in context, and keep the present-tense forms close while you practice.</p></div><span class="source-note">${verbCount} verbs · present tense</span></section>${lessonSections}`;
}

function renderSettings() {
  const langOptions = [['fr-FR', 'French · Français'], ['es-ES', 'Spanish · Español'], ['de-DE', 'German · Deutsch'], ['it-IT', 'Italian · Italiano']];
  return `<section class="page-intro"><div><div class="eyebrow">Tune the trainer</div><h1>Make it yours.</h1><p>Language settings stay on this device. They shape speech playback and the special-character row in spelling mode.</p></div></section>
    <section class="settings-layout"><div class="panel settings-panel"><div class="panel-heading compact"><div><span class="panel-kicker">Target language</span><h2>Sound and spelling</h2></div></div><label class="field"><span>Voice language</span><select data-app-setting="language">${langOptions.map(([value, label]) => `<option value="${value}" ${appSettings.language === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label class="toggle-row"><span><strong>Ignore case when checking</strong><small>Accents and diacritics still count as part of the word.</small></span><input type="checkbox" data-app-setting="ignoreCase" ${appSettings.ignoreCase ? 'checked' : ''}/><span class="toggle"></span></label><div class="special-demo"><span>Special characters</span><div>${specialChars().map((char) => `<b>${char}</b>`).join('')}</div></div></div><div class="panel settings-panel"><div class="panel-heading compact"><div><span class="panel-kicker">Bring your own words</span><h2>Import a chapter</h2></div></div><p class="small-copy">Paste one word and translation per line. CSV headers are optional.</p><label class="field"><span>Chapter title</span><input id="import-title" placeholder="e.g. Reise-Woche 1" /></label><label class="field"><span>CSV · word,translation</span><textarea id="import-csv" rows="7" placeholder="book,Buch\nwindow,Fenster\nquiet,ruhig"></textarea></label><button class="button button-primary" data-action="import-csv">Save chapter locally <span>↗</span></button><div class="import-note">${importedChapters.length ? `${importedChapters.length} imported chapter${importedChapters.length === 1 ? '' : 's'} saved on this device.` : 'Imported chapters never leave this browser.'}</div></div></section>`;
}

function renderView() {
  if (activeView === 'practice') return renderPractice();
  if (activeView === 'verbs') return renderVerbs();
  if (activeView === 'results') return renderResults();
  if (activeView === 'stats') return renderStats();
  if (activeView === 'images') return renderImages();
  if (activeView === 'settings') return renderSettings();
  return renderHome();
}

function render() {
  document.querySelector('#app').innerHTML = shell(renderView());
  document.body.classList.toggle('is-practice', activeView === 'practice');
}

function updateCard(entry, isCorrect, mode, answer) {
  const card = cardFor(entry);
  card.attempts += 1;
  if (isCorrect) {
    card.correct += 1;
    card.box = Math.min(5, card.box + 1);
  } else {
    card.wrong += 1;
    card.box = 1;
  }
  card.history = [{ timestamp: Date.now(), correct: isCorrect, mode, answer }, ...(card.history || [])].slice(0, 24);
  writeStorage(STORAGE.progress, progress);
}

function acceptableAnswersFor(question) {
  const targets = new Set([question.correct]);
  if (question.type === 'conjugation') {
    const pronouns = (question.person || '').split('/').map((part) => part.trim()).filter(Boolean);
    for (const pronoun of pronouns) {
      targets.add(`${pronoun} ${question.correct}`);
    }
  } else if (question.type.includes('spelling')) {
    const raw = String(question.correct || '').trim();
    const cleaned = raw.replace(/^(?:…|\.{3})\s*|\s*(?:…|\.{3})$/g, '').trim();
    if (cleaned) {
      targets.add(cleaned);
      targets.add(cleaned.replace(/[!?.]+$/, '').trim());
    }
    if (hasArticle(question.entry)) {
      targets.add(nounFor(question.entry));
    }
    if (raw.includes('/')) {
      raw.split('/').map((part) => part.trim()).filter(Boolean).forEach((part) => targets.add(part));
    }
    const withoutParens = raw.replace(/\s*\([^)]*\)/g, '').trim();
    if (withoutParens && withoutParens !== raw) {
      targets.add(withoutParens);
      if (hasArticle(question.entry)) {
        targets.add(withoutParens.replace(new RegExp(`^${question.entry.article}\\s+`, 'i'), '').trim());
      }
    }
    const parenMatch = raw.match(/\(([^)]+)\)/);
    if (parenMatch?.[1]) {
      const inside = parenMatch[1].trim();
      targets.add(inside);
      if (hasArticle(question.entry)) {
        targets.add(`${question.entry.article} ${inside}`);
      }
    }
  }
  return [...targets].map(normalizedForCompare).filter(Boolean);
}

function answerQuestion(rawAnswer) {
  if (!practice || practice.feedback) return;
  const question = practice.questions[practice.index];
  let answer = rawAnswer;
  if (question.type === 'text' || question.type === 'image-word' || question.type === 'article') {
    answer = question.options[Number(rawAnswer)] || '';
  } else if (question.type === 'word-image') {
    answer = question.options[Number(rawAnswer)]?.word || '';
  }
  const normalizedAnswer = normalizedForCompare(answer);
  const correct = Boolean(normalizedAnswer) && acceptableAnswersFor(question).includes(normalizedAnswer);
  updateCard(question.entry, correct, question.type, answer);
  practice.answers.push({ chapterId: question.entry.chapterId, entryKey: keyFor(question.entry), mode: question.type, correct, answer });
  practice.feedback = { correct, answer };
  render();
}

function nextQuestion() {
  if (!practice) return;
  if (practice.index >= practice.questions.length - 1) {
    const correct = practice.answers.filter((answer) => answer.correct).length;
    const result = {
      startedAt: practice.startedAt,
      endedAt: Date.now(),
      score: Math.round((correct / practice.questions.length) * 100),
      correct,
      total: practice.questions.length,
      chapterIds: [...new Set(practice.questions.map((question) => question.entry.chapterId))],
      answers: practice.answers,
      mistakes: practice.answers.filter((answer) => !answer.correct).map((answer) => ({ entry: appData.entries.find((entry) => keyFor(entry) === answer.entryKey) })).filter((item) => item.entry),
    };
    progress.sessions = [result, ...progress.sessions].slice(0, 50);
    writeStorage(STORAGE.progress, progress);
    ui.lastResult = result;
    practice = null;
    activeView = 'results';
    window.location.hash = '#results';
    render();
    return;
  }
  practice.index += 1;
  practice.feedback = null;
  render();
  setTimeout(() => document.querySelector('#spelling-answer, #conjugation-answer')?.focus(), 60);
}

function speechText(entry) {
  // Nouns: read "der Apfel"; strip parenthetical/slash variants for cleaner audio.
  return String(entry.word || '').replace(/\(.*?\)/g, '').split('/')[0].trim();
}

function pickVoice(lang) {
  const voices = window.speechSynthesis.getVoices();
  const base = lang.slice(0, 2).toLowerCase();
  return voices.find((voice) => voice.lang.replace('_', '-').toLowerCase() === lang.toLowerCase())
    || voices.find((voice) => voice.lang.toLowerCase().startsWith(base)) || null;
}

function speakText(text) {
  if (!text) return;
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    window.alert('Text-to-speech is not available in this browser.');
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = appSettings.language;
  utterance.rate = 0.85;
  const voice = pickVoice(appSettings.language);
  if (voice) utterance.voice = voice;
  else if (!window.speechSynthesis.getVoices().length) window.alert('This browser reports no speech voices at all. In Brave on Linux, install speech-dispatcher + espeak-ng and fully restart the browser.');
  else window.alert('No German voice found on this device. Install one in your system/browser speech settings.');
  utterance.onerror = (event) => console.warn('Speech error:', event.error);
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}

function audioPath(entry, kind = 'word') {
  if (!entry || chapterById(entry.chapterId)?.imported) return '';
  return `/audio/${entry.chapterId}/${entry.index}${kind === 'example' ? '-ex' : ''}.mp3`;
}

let currentAudio = null;

function playClip(src, fallbackText) {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  window.speechSynthesis?.cancel();
  if (!src) return speakText(fallbackText);
  const audio = new Audio(`${src}?v=${DATA_VERSION}`);
  currentAudio = audio;
  audio.onerror = () => speakText(fallbackText);
  audio.play().catch(() => speakText(fallbackText));
}

function speakCurrent(text, audio) {
  if (text) return playClip(audio, text);
  if (!practice) return;
  const entry = practice.questions[practice.index].entry;
  playClip(audioPath(entry), speechText(entry));
}

function importCsv() {
  const titleInput = document.querySelector('#import-title');
  const csvInput = document.querySelector('#import-csv');
  const title = titleInput?.value.trim() || 'Imported chapter';
  const entries = (csvInput?.value || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [word, ...translationParts] = line.split(',');
    return { word: word?.trim(), translation: translationParts.join(',').trim() };
  }).filter((entry) => entry.word && entry.translation && entry.word.toLowerCase() !== 'word');
  if (!entries.length) return window.alert('Paste at least one word,translation row first.');
  const id = `import-${Date.now()}`;
  const chapter = { id, title, description: 'Imported locally from CSV.', entries };
  importedChapters = [chapter, ...importedChapters];
  writeStorage(STORAGE.imports, importedChapters);
  loadData().then(() => { ui.selectedChapters.add(id); activeView = 'home'; window.location.hash = '#home'; render(); });
}

function exportProgress() {
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), progress, settings: appSettings }, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'lexiloop-progress.json';
  link.click();
  URL.revokeObjectURL(link.href);
}

function importProgress(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const payload = JSON.parse(reader.result);
      if (payload.progress?.cards && typeof payload.progress.cards === 'object') {
        progress = { cards: payload.progress.cards || {}, sessions: payload.progress.sessions || [] };
        writeStorage(STORAGE.progress, progress);
        if (payload.settings && typeof payload.settings === 'object') {
          appSettings = { ...appSettings, ...payload.settings };
          ui.sessionSettings.ignoreCase = appSettings.ignoreCase;
          writeStorage(STORAGE.settings, appSettings);
        }
        render();
      }
    } catch {
      window.alert('That file does not look like a LexiLoop progress export.');
    }
  };
  reader.readAsText(file);
}

function insertSpecialChar(char) {
  const input = document.querySelector('#spelling-answer');
  insertCharIntoInput(input, char);
}

function insertConjugationChar(char) {
  const input = document.querySelector('#conjugation-answer');
  insertCharIntoInput(input, char);
}

function insertCharIntoInput(input, char) {
  if (!input) return;
  const start = input.selectionStart ?? input.value.length;
  input.value = `${input.value.slice(0, start)}${char}${input.value.slice(input.selectionEnd ?? start)}`;
  input.focus();
  input.selectionStart = input.selectionEnd = start + char.length;
}

function handleAction(actionElement) {
  const action = actionElement.dataset.action;
  if (action === 'start-practice') { activeView = 'practice'; window.location.hash = '#practice'; render(); return; }
  if (action === 'open-chapter-modal') {
    const activeModes = ui.sessionSettings.modes.filter((modeId) => appData.entries.some((entry) => canUseMode(entry, modeId)));
    const effectiveModes = activeModes.length ? activeModes : ['text'];
    const eligibleIds = appData.chapters.filter((chapter) => eligibleEntriesForChapter(chapter.id, effectiveModes).length > 0).map((chapter) => chapter.id);
    if (!eligibleIds.some((id) => ui.selectedChapters.has(id))) {
      ui.selectedChapters = new Set(eligibleIds);
    }
    ui.showChapterModal = true;
    render();
    return;
  }
  if (action === 'close-chapter-modal') { ui.showChapterModal = false; render(); return; }
  if (action === 'confirm-chapter-modal') { ui.showChapterModal = false; startSession(); return; }
  if (action === 'begin-session') { startSession(); return; }
  if (action === 'chapter-practice') { ui.selectedChapters = new Set([actionElement.dataset.chapter]); ui.showChapterModal = false; startSession(); return; }
  if (action === 'select-all') { ui.selectedChapters = ui.selectedChapters.size === appData.chapters.length ? new Set() : new Set(appData.chapters.map((chapter) => chapter.id)); render(); return; }
  if (action === 'choice') { answerQuestion(actionElement.dataset.choice); return; }
  if (action === 'submit-spelling') { answerQuestion(document.querySelector('#spelling-answer')?.value || ''); return; }
  if (action === 'submit-conjugation') { answerQuestion(document.querySelector('#conjugation-answer')?.value || ''); return; }
  if (action === 'next-question') { nextQuestion(); return; }
  if (action === 'quit-session') { practice = null; activeView = 'home'; window.location.hash = '#home'; render(); return; }
  if (action === 'speak') { speakCurrent(actionElement.dataset.text, actionElement.dataset.audio); return; }
  if (action === 'insert-char') { insertSpecialChar(actionElement.dataset.char); return; }
  if (action === 'insert-conjugation-char') { insertConjugationChar(actionElement.dataset.char); return; }
  if (action === 'clear-input') { const input = document.querySelector('#spelling-answer'); if (input) input.value = ''; input?.focus(); return; }
  if (action === 'clear-conjugation') { const input = document.querySelector('#conjugation-answer'); if (input) input.value = ''; input?.focus(); return; }
  if (action === 'retry-mistakes') { const entries = ui.lastResult?.mistakes.map((mistake) => mistake.entry) || []; if (entries.length) startSession({ modes: ['text'], questionCount: entries.length, weakOnly: false }, entries); return; }
  if (action === 'export-progress') { exportProgress(); return; }
  if (action === 'open-progress-import') { document.querySelector('#progress-file')?.click(); return; }
  if (action === 'reset-progress') { if (window.confirm('Reset all learning progress and session history?')) { progress = { cards: {}, sessions: [] }; writeStorage(STORAGE.progress, progress); render(); } return; }
  if (action === 'import-csv') { importCsv(); return; }
  if (action === 'remove-image') { delete customImages[actionElement.dataset.key]; writeStorage(STORAGE.images, customImages); render(); }
}

document.addEventListener('click', (event) => {
  const route = event.target.closest('[data-route]');
  if (route) { event.preventDefault(); ui.showChapterModal = false; activeView = route.dataset.route.slice(1); window.location.hash = route.dataset.route; render(); return; }
  if (event.target.matches('.modal-backdrop')) { ui.showChapterModal = false; render(); return; }
  const action = event.target.closest('[data-action]');
  if (action && action.dataset.action !== 'toggle-all-chapters' && !action.matches('.modal-backdrop')) handleAction(action);
});

document.addEventListener('change', (event) => {
  const toggleAll = event.target.closest('[data-action="toggle-all-chapters"]');
  if (toggleAll) {
    const activeModes = ui.sessionSettings.modes.filter((modeId) => appData.entries.some((entry) => canUseMode(entry, modeId)));
    const effectiveModes = activeModes.length ? activeModes : ['text'];
    const eligibleIds = appData.chapters.filter((chapter) => eligibleEntriesForChapter(chapter.id, effectiveModes).length > 0).map((chapter) => chapter.id);
    ui.selectedChapters = toggleAll.checked ? new Set(eligibleIds) : new Set();
    render();
    return;
  }
  const chapter = event.target.closest('[data-chapter-select]');
  if (chapter) { if (event.target.checked) ui.selectedChapters.add(chapter.dataset.chapterSelect); else ui.selectedChapters.delete(chapter.dataset.chapterSelect); render(); return; }
  const mode = event.target.closest('[data-mode-toggle]');
  if (mode) { const id = mode.dataset.modeToggle; ui.sessionSettings.modes = event.target.checked ? [...new Set([...ui.sessionSettings.modes, id])] : ui.sessionSettings.modes.filter((item) => item !== id); if (!ui.sessionSettings.modes.length) ui.sessionSettings.modes = ['text']; render(); return; }
  const sessionSetting = event.target.closest('[data-session-setting]');
  if (sessionSetting) { const key = sessionSetting.dataset.sessionSetting; ui.sessionSettings[key] = sessionSetting.type === 'checkbox' ? sessionSetting.checked : (key === 'questionCount' ? Number(sessionSetting.value) : sessionSetting.value); if (key === 'questionCount') render(); return; }
  const appSetting = event.target.closest('[data-app-setting]');
  if (appSetting) { const key = appSetting.dataset.appSetting; appSettings[key] = appSetting.type === 'checkbox' ? appSetting.checked : appSetting.value; if (key === 'ignoreCase') ui.sessionSettings.ignoreCase = appSettings.ignoreCase; writeStorage(STORAGE.settings, appSettings); render(); return; }
  const imageFilter = event.target.closest('[data-image-filter]');
  if (imageFilter) { ui.imageFilter = imageFilter.value; render(); return; }
  const imageInput = event.target.closest('[data-image-upload]');
  if (imageInput && imageInput.files?.[0]) { const reader = new FileReader(); reader.onload = () => { customImages[imageInput.dataset.imageUpload] = reader.result; writeStorage(STORAGE.images, customImages); render(); }; reader.readAsDataURL(imageInput.files[0]); return; }
  if (event.target.id === 'progress-file' && event.target.files?.[0]) importProgress(event.target.files[0]);
});

document.addEventListener('error', (event) => {
  if (event.target?.tagName !== 'IMG' || event.target.dataset.fallbackApplied) return;
  const image = event.target;
  image.dataset.fallbackApplied = 'true';
  const fallback = document.createElement('div');
  fallback.className = 'image-fallback image-error';
  fallback.innerHTML = '<span>✦</span><small>Image unavailable</small>';
  image.replaceWith(fallback);
}, true);

document.addEventListener('keydown', (event) => {
  if (activeView !== 'practice' || !practice) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    if (practice.feedback) nextQuestion();
    else if (document.activeElement?.id === 'spelling-answer') answerQuestion(document.activeElement.value);
    else if (document.activeElement?.id === 'conjugation-answer') answerQuestion(document.activeElement.value);
    return;
  }
  if (!practice.feedback && /^[1-4]$/.test(event.key)) {
    const choice = document.querySelector(`[data-action="choice"][data-choice="${Number(event.key) - 1}"]`);
    if (choice) { event.preventDefault(); answerQuestion(choice.dataset.choice); }
  }
});

if ('speechSynthesis' in window) window.speechSynthesis.getVoices();
window.addEventListener('hashchange', () => { activeView = (window.location.hash || '#home').slice(1) || 'home'; if (activeView !== 'practice') practice = activeView === 'results' ? null : practice; render(); });

loadData().then(render).catch((error) => {
  document.querySelector('#app').innerHTML = `<div class="load-error"><h1>LexiLoop could not load.</h1><p>${escapeHtml(error.message)}</p></div>`;
});
