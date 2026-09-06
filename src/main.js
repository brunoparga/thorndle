// Þorndle -- a daily five-letter word game played with a 28-letter alphabet.

import { ANSWERS, GUESSES, EPOCH } from './words.js';

const ROWS = 7;
const COLS = 5;
const THORN = 'þ';
const EDH = 'ð';
const STORAGE_KEY = 'thorndle.v1';

const GUESS_SET = new Set(GUESSES);

/*
  Thorn sits in the middle row between G and H, edh in the top row between Y
  and U -- roughly where each one lands in a word, and out of the way of the
  letters people reach for first.
*/
const KEY_ROWS = [
  ['q', 'w', 'e', 'r', 't', 'y', EDH, 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', THORN, 'h', 'j', 'k', 'l'],
  ['enter', 'z', 'x', 'c', 'v', 'b', 'n', 'm', 'back'],
];

// No keyboard types þ or ð, so the two brackets stand in for them.
const KEY_ALIASES = { '[': THORN, ']': EDH };

const LETTER_NAMES = { [THORN]: 'thorn', [EDH]: 'edh' };

/*
  One sentence, four th's, four different jobs. It is the fastest way to show
  that the split the game turns on is about sound and not about spelling.
*/
const SHIBBOLETHS = [
  [['Those', 'edh'], ['potholes', 'split'], ['threaten', 'thorn'], ['Anthony', 'tee']],
  [['Neither', 'edh'], ['hothead', 'split'], ['thanked', 'thorn'], ['Thomas', 'tee']],
];

const KIND_LABELS = {
  edh: EDH,
  thorn: THORN,
  tee: 't',
  split: 't + h',
};

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
      return { ...saved, stats: { ...emptyStats(), ...saved.stats } };
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
    toast(/th/.test(guess) ? 'No word here spells th' : 'Not in word list');
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
    note.textContent = ` — ${source}`;
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

document.getElementById('help-button').addEventListener('click', () => {
  const how = document.getElementById('how');
  how.open = !how.open;
  if (how.open) how.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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

// ---------------------------------------------------------- shibboleth ---

function buildShibboleth() {
  const line = document.getElementById('shibboleth-line');
  const key = document.getElementById('shibboleth-key');
  const sentence = SHIBBOLETHS[game.day % SHIBBOLETHS.length];

  sentence.forEach(([word, kind], i) => {
    const at = word.toLowerCase().indexOf('th');
    const span = document.createElement('span');
    span.className = `th th--${kind}`;
    span.textContent = word.slice(at, at + 2);

    if (i) line.append(' ');
    line.append(word.slice(0, at), span, word.slice(at + 2));

    const item = document.createElement('li');
    if (kind === 'thorn' || kind === 'edh') item.className = 'is-letter';
    const symbol = document.createElement('b');
    symbol.textContent = KIND_LABELS[kind];
    item.append(symbol, ` ${word.toLowerCase()}`);
    key.append(item);
  });
}

// ------------------------------------------------------------------ boot ---

buildBoard();
buildKeyboard();
buildShibboleth();
render();

if (game.status !== 'playing') showResult();
