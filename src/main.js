// Þorndle -- a daily five-letter word game played with a 28-letter alphabet.

import { ANSWERS, GUESSES, EPOCH } from './words.js';

const ROWS = 6;
const COLS = 5;
const THORN = 'þ';
const EDH = 'ð';
const STORAGE_KEY = 'thorndle.v1';

const GUESS_SET = new Set(GUESSES);

/*
  Edh goes in the top row between T and Y, thorn in the middle row between F
  and G. Each row grows by one key rather than displacing anything, so the rest
  of QWERTY stays where the fingers expect it.
*/
const KEY_ROWS = [
  ['q', 'w', 'e', 'r', 't', EDH, 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', THORN, 'g', 'h', 'j', 'k', 'l'],
  ['enter', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'back'],
];

// No keyboard types þ or ð, so the two brackets stand in for them.
const KEY_ALIASES = { '[': THORN, ']': EDH };

const LETTER_NAMES = { [THORN]: 'thorn', [EDH]: 'edh' };

/*
  The tagline. The fixed ones are sentences in which every th does something
  different -- thorn, edh, a plain t, and a t and h that merely meet -- so the
  split the game turns on is visible before the rules are read. Thorn and edh
  are written as themselves -- except in the last one, whose whole point is
  that English spelling makes you guess.
*/
const TAGLINES = [
  'Neiðer hothead þanked Thomas',
  'English spelling is hard; it can be learned throughout through tough thorough thought, though.',
];

/*
  The generated ones follow one frame -- <edh word> <t·h noun> <thorn verb>
  <plain-t name> -- with a plural subject so the verb needs no agreement.
*/
const TAGLINE_PARTS = {
  edh: ['Ðose', 'Ðese', 'Ðeir', 'Oðer'],
  seam: ['potholes', 'hotheads', 'anthills', 'lighthouses', 'outhouses', 'penthouses',
         'courthouses', 'foothills', 'goatherds', 'boathouses', 'hothouses', 'guesthouses',
         'knighthoods', 'potholders', 'fatheads', 'nuthatches', 'sweethearts'],
  thorn: ['þreaten', 'þank', 'þrill', 'þwart', 'þrash', 'þump', 'þrottle', 'þwack'],
  tee: ['Anthony', 'Thomas', 'Esther', 'Thompson', 'Beethoven', 'Goethe', 'Thailand'],
};

const pick = (list) => list[Math.floor(Math.random() * list.length)];

function generateTagline() {
  const { edh, seam, thorn, tee } = TAGLINE_PARTS;
  return `${pick(edh)} ${pick(seam)} ${pick(thorn)} ${pick(tee)}`;
}

/** Some of the time a written one, mostly a fresh one. */
const chooseTagline = () => (Math.random() < 0.15 ? pick(TAGLINES) : generateTagline());

const isSpecial = (letter) => letter === THORN || letter === EDH;
const letters = (word) => [...word];

// ------------------------------------------------------------------ time ---

/** Local midnight, so the puzzle turns over when the player's day does. */
function midnight(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function puzzleNumber(now = new Date()) {
  const [y, m, d] = EPOCH.split('-').map(Number);
  const days = Math.round((midnight(now) - midnight(new Date(y, m - 1, d))) / 86400000);
  return Math.max(0, days);
}

function msUntilTomorrow(now = new Date()) {
  return midnight(now) + 86400000 - now.getTime();
}

// ----------------------------------------------------------------- state ---

const emptyStats = () => ({ played: 0, wins: 0, streak: 0, best: 0, distribution: Array(ROWS).fill(0) });

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === 'object') {
      const stats = { ...emptyStats(), ...saved.stats };
      stats.distribution = [...(stats.distribution ?? []), ...Array(ROWS).fill(0)].slice(0, ROWS);
      return { ...saved, stats };
    }
  } catch {
    // A corrupt or unreadable store is not worth failing over; start fresh.
  }
  return { stats: emptyStats() };
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      day: game.day,
      guesses: game.guesses,
      status: game.status,
      stats: game.stats,
    }));
  } catch {
    // Private browsing and friends. The game still plays, it just forgets.
  }
}

const stored = load();
const day = puzzleNumber();

const game = {
  day,
  answer: ANSWERS[day % ANSWERS.length],
  guesses: stored.day === day && Array.isArray(stored.guesses) ? stored.guesses : [],
  current: '',
  status: stored.day === day ? stored.status ?? 'playing' : 'playing',
  stats: stored.stats,
  busy: false,
};

// A stored guess that is no longer in the dictionary would desync the board.
game.guesses = game.guesses.filter((g) => GUESS_SET.has(g)).slice(0, ROWS);
if (game.status !== 'won' && game.status !== 'lost') game.status = 'playing';

// ----------------------------------------------------------------- rules ---

/**
 * Wordle's two-pass scoring: exact matches first, then the leftovers, so a
 * repeated letter is only flagged as present as often as it really occurs.
 */
function score(guess, answer) {
  const g = letters(guess);
  const a = letters(answer);
  const result = Array(g.length).fill('absent');
  const pool = new Map();

  g.forEach((letter, i) => {
    if (letter === a[i]) result[i] = 'correct';
    else pool.set(a[i], (pool.get(a[i]) ?? 0) + 1);
  });

  g.forEach((letter, i) => {
    if (result[i] === 'correct') return;
    const left = pool.get(letter) ?? 0;
    if (left > 0) {
      result[i] = 'present';
      pool.set(letter, left - 1);
    }
  });

  return result;
}

const RANK = { absent: 0, present: 1, correct: 2 };

/** Best-known state for each letter, across every guess so far. */
function keyboardStates() {
  const states = new Map();
  for (const guess of game.guesses) {
    const marks = score(guess, game.answer);
    letters(guess).forEach((letter, i) => {
      const seen = states.get(letter);
      if (!seen || RANK[marks[i]] > RANK[seen]) states.set(letter, marks[i]);
    });
  }
  return states;
}

// ------------------------------------------------------------------- dom ---

const boardEl = document.getElementById('board');
const keyboardEl = document.getElementById('keyboard');
const toastRail = document.getElementById('toast-rail');
const sheet = document.getElementById('result-sheet');

const tiles = [];

function buildBoard() {
  for (let row = 0; row < ROWS; row++) {
    const rowTiles = [];
    for (let col = 0; col < COLS; col++) {
      const tile = document.createElement('div');
      tile.className = 'tile';
      tile.setAttribute('role', 'gridcell');
      boardEl.append(tile);
      rowTiles.push(tile);
    }
    tiles.push(rowTiles);
  }
}

const keys = new Map();

function buildKeyboard() {
  for (const row of KEY_ROWS) {
    const rowEl = document.createElement('div');
    rowEl.className = 'keyboard__row';

    for (const key of row) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.key = key;

      if (key === 'enter' || key === 'back') {
        button.className = 'key key--wide';
        button.textContent = key === 'enter' ? 'Enter' : '⌫';
        button.setAttribute('aria-label', key === 'enter' ? 'Enter' : 'Backspace');
      } else {
        button.className = isSpecial(key) ? 'key key--special' : 'key';
        button.textContent = key;
        button.setAttribute('aria-label', isSpecial(key)
          ? `${LETTER_NAMES[key]} ${key}`
          : key);
      }

      rowEl.append(button);
      keys.set(key, button);
    }

    keyboardEl.append(rowEl);
  }
}

function paintTile(tile, letter, state) {
  tile.textContent = letter ?? '';
  tile.classList.toggle('tile--special', isSpecial(letter));
  if (state) tile.dataset.state = state;
  else delete tile.dataset.state;

  const name = isSpecial(letter) ? LETTER_NAMES[letter] : letter;
  tile.setAttribute('aria-label', letter ? (state ? `${name}, ${state}` : name) : 'empty');
}

function paintKeyboard() {
  const states = keyboardStates();
  for (const [key, button] of keys) {
    if (key === 'enter' || key === 'back') continue;
    const state = states.get(key);
    if (state) button.dataset.state = state;
    else delete button.dataset.state;
  }
}

/** Redraw everything from `game`, with no animation. Used on load. */
function render() {
  for (let row = 0; row < ROWS; row++) {
    const guess = game.guesses[row];
    const marks = guess ? score(guess, game.answer) : null;
    const typed = row === game.guesses.length ? letters(game.current) : [];

    for (let col = 0; col < COLS; col++) {
      if (guess) paintTile(tiles[row][col], letters(guess)[col], marks[col]);
      else if (typed[col]) paintTile(tiles[row][col], typed[col], 'typed');
      else paintTile(tiles[row][col], '', null);
    }
  }
  paintKeyboard();
}

// ---------------------------------------------------------------- toasts ---

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  toastRail.append(el);
  setTimeout(() => el.remove(), 1700);
}

const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');

function animate(el, className, ms) {
  if (REDUCED_MOTION.matches) return;
  el.classList.add(className);
  setTimeout(() => el.classList.remove(className), ms);
}

// ------------------------------------------------------------------ play ---

function typeLetter(letter) {
  if (game.status !== 'playing' || game.busy) return;
  if (letters(game.current).length >= COLS) return;

  game.current += letter;
  const col = letters(game.current).length - 1;
  const tile = tiles[game.guesses.length][col];
  paintTile(tile, letter, 'typed');
  animate(tile, 'tile--pop', 120);
}

function deleteLetter() {
  if (game.status !== 'playing' || game.busy) return;
  const typed = letters(game.current);
  if (!typed.length) return;

  typed.pop();
  game.current = typed.join('');
  paintTile(tiles[game.guesses.length][typed.length], '', null);
}

function submit() {
  if (game.status !== 'playing' || game.busy) return;

  const guess = game.current;
  const row = game.guesses.length;

  if (letters(guess).length < COLS) {
    tiles[row].forEach((tile) => animate(tile, 'row--shake', 500));
    toast('Not enough letters');
    return;
  }

  if (!GUESS_SET.has(guess)) {
    tiles[row].forEach((tile) => animate(tile, 'row--shake', 500));
    toast('Not in word list');
    return;
  }

  game.guesses.push(guess);
  game.current = '';
  const marks = score(guess, game.answer);
  const won = marks.every((mark) => mark === 'correct');
  const lost = !won && game.guesses.length === ROWS;

  reveal(row, guess, marks, () => {
    paintKeyboard();
    if (won || lost) finish(won);
    else save();
  });
}

/** Flip the row a tile at a time, colouring each at the halfway point. */
function reveal(row, guess, marks, done) {
  const step = REDUCED_MOTION.matches ? 0 : 240;
  game.busy = true;

  letters(guess).forEach((letter, col) => {
    const tile = tiles[row][col];
    setTimeout(() => {
      animate(tile, 'tile--flip', 520);
      setTimeout(() => paintTile(tile, letter, marks[col]), step ? 260 : 0);
    }, col * step);
  });

  setTimeout(() => {
    game.busy = false;
    done();
  }, COLS * step + (step ? 300 : 0));
}

function finish(won) {
  game.status = won ? 'won' : 'lost';

  const stats = game.stats;
  stats.played += 1;
  if (won) {
    stats.wins += 1;
    stats.streak += 1;
    stats.best = Math.max(stats.best, stats.streak);
    stats.distribution[game.guesses.length - 1] += 1;
  } else {
    stats.streak = 0;
  }
  save();

  if (won) {
    tiles[game.guesses.length - 1].forEach((tile, col) => {
      setTimeout(() => animate(tile, 'tile--win', 520), col * 90);
    });
  }

  setTimeout(() => showResult(), won ? 1100 : 600);
}

// --------------------------------------------------------------- results ---

function shareText() {
  const grid = game.guesses
    .map((guess) => score(guess, game.answer)
      .map((mark) => (mark === 'correct' ? '\u{1F7E9}' : mark === 'present' ? '\u{1F7E8}' : '⬛'))
      .join(''))
    .join('\n');
  const tally = game.status === 'won' ? `${game.guesses.length}/${ROWS}` : `X/${ROWS}`;
  return `Þorndle #${game.day + 1} ${tally}\n\n${grid}\n\nhttps://thorndle.brunoparga.net/`;
}

let countdownTimer = null;

function showResult() {
  const title = document.getElementById('result-title');
  const answerEl = document.getElementById('result-answer');
  const statsEl = document.getElementById('result-stats');
  const distEl = document.getElementById('result-distribution');

  title.textContent = game.status === 'won' ? 'Solved' : 'Out of guesses';
  title.append(Object.assign(document.createElement('span'), {
    className: 'sheet__number', textContent: ` #${game.day + 1}`,
  }));

  answerEl.textContent = '';
  const word = document.createElement('b');
  word.textContent = game.answer;
  answerEl.append('The word was ', word);

  const source = sourceNote(game.answer);
  if (source) {
    const note = document.createElement('span');
    note.textContent = ` - ${source}`;
    answerEl.append(note);
  }

  const summary = [
    ['played', game.stats.played],
    ['win %', game.stats.played ? Math.round((game.stats.wins / game.stats.played) * 100) : 0],
    ['streak', game.stats.streak],
    ['best', game.stats.best],
  ];
  statsEl.textContent = '';
  for (const [name, value] of summary) {
    const group = document.createElement('div');
    const dd = document.createElement('dd');
    dd.textContent = value;
    const dt = document.createElement('dt');
    dt.textContent = name;
    group.append(dd, dt);
    statsEl.append(group);
  }

  const peak = Math.max(1, ...game.stats.distribution);
  distEl.textContent = '';
  game.stats.distribution.forEach((count, i) => {
    const label = document.createElement('span');
    label.textContent = i + 1;
    const bar = document.createElement('span');
    bar.className = 'distribution__bar';
    if (game.status === 'won' && i === game.guesses.length - 1) bar.classList.add('distribution__bar--current');
    bar.style.width = `${Math.max(8, (count / peak) * 100)}%`;
    bar.textContent = count;
    distEl.append(label, bar);
  });

  tickCountdown();
  countdownTimer ??= setInterval(tickCountdown, 1000);

  if (!sheet.open) sheet.showModal();
}

function tickCountdown() {
  const left = msUntilTomorrow();
  const hh = String(Math.floor(left / 3600000)).padStart(2, '0');
  const mm = String(Math.floor((left % 3600000) / 60000)).padStart(2, '0');
  const ss = String(Math.floor((left % 60000) / 1000)).padStart(2, '0');
  document.getElementById('result-countdown').textContent = `${hh}:${mm}:${ss}`;
}

/** A one-line reminder of where a þ/ð word comes from, since that is the joke. */
function sourceNote(word) {
  const spelled = letters(word).map((l) => (isSpecial(l) ? 'th' : l)).join('');
  return spelled === word ? '' : spelled;
}

// ----------------------------------------------------------------- input ---

function press(key) {
  if (howIsOpen()) setHow(false); // playing dismisses the rules
  // Once the day is over the board is a button that reopens the result.
  if (game.status !== 'playing' && key === 'enter') showResult();
  else if (key === 'enter') submit();
  else if (key === 'back') deleteLetter();
  else typeLetter(key);
}

boardEl.addEventListener('click', () => {
  if (game.status !== 'playing') showResult();
});

keyboardEl.addEventListener('click', (event) => {
  const button = event.target.closest('.key');
  if (button) press(button.dataset.key);
});

document.addEventListener('keydown', (event) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === 'Escape' && howIsOpen()) {
    setHow(false);
    return;
  }
  if (sheet.open) return;

  const key = event.key;
  if (key === 'Enter') {
    // Enter on a focused button is that button's business, not the board's.
    if (document.activeElement?.tagName === 'BUTTON' || document.activeElement?.tagName === 'SUMMARY') return;
    press('enter');
  } else if (key === 'Backspace') {
    press('back');
  } else if (KEY_ALIASES[key]) {
    press(KEY_ALIASES[key]);
  } else {
    const lower = key.toLowerCase();
    if (lower.length === 1 && (/[a-z]/.test(lower) || isSpecial(lower))) press(lower);
    else return;
  }
  event.preventDefault();
});

// --------------------------------------------------------------- chrome ---

function applyTheme(theme) {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;

  const dark = theme === 'dark' || (!theme && matchMedia('(prefers-color-scheme: dark)').matches);
  const button = document.getElementById('theme-button');
  button.textContent = dark ? '☀' : '☾';
  button.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
}

let theme = null;
try {
  theme = localStorage.getItem('thorndle.theme');
} catch {
  // Unreadable storage just means the system preference wins.
}
applyTheme(theme);

document.getElementById('theme-button').addEventListener('click', () => {
  const dark = theme === 'dark' || (!theme && matchMedia('(prefers-color-scheme: dark)').matches);
  theme = dark ? 'light' : 'dark';
  applyTheme(theme);
  try {
    localStorage.setItem('thorndle.theme', theme);
  } catch {
    // The choice holds for this visit only.
  }
});

matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (!theme) applyTheme(null);
});

// ---------------------------------------------------------- how to play ---

const stage = document.getElementById('stage');
const howToggle = document.getElementById('help-button');
const howPanel = document.getElementById('how-panel');
const howClose = document.getElementById('how-close');

const howIsOpen = () => stage.dataset.how === 'open';

function setHow(open) {
  if (open) stage.dataset.how = 'open';
  else delete stage.dataset.how;
  howToggle.setAttribute('aria-expanded', String(open));

  if (open) {
    howPanel.scrollTop = 0;
    howClose.focus({ preventScroll: true });
  } else if (howPanel.contains(document.activeElement)) {
    // Only take focus back if the sheet still had it; a click elsewhere on the
    // page has already put it where the player wanted it.
    howToggle.focus({ preventScroll: true });
  }
}

howToggle.addEventListener('click', () => setHow(!howIsOpen()));
howClose.addEventListener('click', () => setHow(false));

// A press anywhere else dismisses it, the way a sheet should.
document.addEventListener('pointerdown', (event) => {
  if (!howIsOpen()) return;
  if (event.target.closest('#how-panel, #help-button')) return;
  setHow(false);
});

document.getElementById('result-close').addEventListener('click', () => sheet.close());

document.getElementById('share-button').addEventListener('click', async () => {
  const text = shareText();
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      await navigator.share({ text });
      return;
    }
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
  } catch {
    toast('Could not share');
  }
});

// ------------------------------------------------------- tagline, primer ---

/** Append text to `host`, with every þ and ð wrapped so it can be tinted. */
function appendRunes(host, text) {
  for (const piece of text.split(/([þðÞÐ])/)) {
    if (!piece) continue;
    if (/^[þðÞÐ]$/.test(piece)) {
      host.append(Object.assign(document.createElement('span'), { className: 'rune', textContent: piece }));
    } else {
      host.append(piece);
    }
  }
}

/** Render a tagline into `host`, replacing whatever was there. */
function renderTagline(text, host) {
  host.textContent = '';
  appendRunes(host, text);
}

const primer = document.getElementById('primer');
const PRIMER_KEY = 'thorndle.primer';

function setPrimer(shown) {
  primer.hidden = !shown;
  document.getElementById('primer-stub').hidden = shown;
  try {
    localStorage.setItem(PRIMER_KEY, shown ? 'shown' : 'hidden');
  } catch {
    // Then it comes back next visit, which is no disaster.
  }
}

document.getElementById('primer-hide').addEventListener('click', () => setPrimer(false));
document.getElementById('primer-restore').addEventListener('click', () => setPrimer(true));

function buildPrimer() {
  appendRunes(document.getElementById('primer-text'), 'Use boþ ðese letters like ðis - noþing to it.');
  let shown = true;
  try {
    shown = localStorage.getItem(PRIMER_KEY) !== 'hidden';
  } catch {
    // Unreadable storage: show it, the safe default.
  }
  primer.hidden = !shown;
  document.getElementById('primer-stub').hidden = shown;
}

// ----------------------------------------------------------- highlights ---

/*
  The violet on thorn and edh -- keys, tiles, wordmark, prose -- is a single
  switch. Off, the two letters look like any other, which some players prefer
  once they no longer need the reminder.
*/
function applyRunes(on) {
  if (on) delete document.documentElement.dataset.runes;
  else document.documentElement.dataset.runes = 'off';
  const button = document.getElementById('runes-button');
  button.setAttribute('aria-pressed', String(on));
  button.setAttribute('aria-label', on ? 'Stop highlighting thorn and edh' : 'Highlight thorn and edh');
}

let runes = true;
try {
  runes = localStorage.getItem('thorndle.runes') !== 'off';
} catch {
  // Unreadable storage: highlights on, the default.
}
applyRunes(runes);

document.getElementById('runes-button').addEventListener('click', () => {
  runes = !runes;
  applyRunes(runes);
  try {
    localStorage.setItem('thorndle.runes', runes ? 'on' : 'off');
  } catch {
    // The choice holds for this visit only.
  }
});

// ------------------------------------------------------------------ boot ---

buildBoard();
buildKeyboard();
renderTagline(chooseTagline(), document.getElementById('tagline'));
buildPrimer();
render();

if (game.status !== 'playing') showResult();
