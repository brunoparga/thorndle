#!/usr/bin/env node
// Builds src/words.js -- the Thorndle dictionary and the daily answer schedule.
//
// The twist: an English <th> pronounced /θ/ or /ð/ collapses into a single
// letter -- thorn (þ) for unvoiced /θ/, edh (ð) for voiced /ð/. THORN becomes
// ÞORN and drops out at four letters; THORNS becomes ÞORNS and joins the game.
// Six-letter English words are the new supply.
//
// A <th> that is *not* one of those two sounds is not a digraph at all, and
// stays two ordinary letters: THYME is /taɪm/ with a silent h, so it is spelled
// t-h-y-m-e and plays at its full five letters. POTHOLE is t + h across a seam,
// ANTHONY is a plain /t/. So t followed by h is a legal spelling here, and
// typing it is a claim about pronunciation.
//
// Voicing comes from CMUdict, which distinguishes the phonemes TH (/θ/) and
// DH (/ð/). Each <th> in a word either has a /θ~ð/ phoneme to answer to or it
// does not, and words where only some of them do cannot be aligned reliably,
// so those are dropped.
//
// Inputs (set THORNDLE_DATA to the directory holding the downloads):
//   cmudict.dict    https://github.com/cmusphinx/cmudict
//   en_freq.txt     https://github.com/hermitdave/FrequencyWords (OpenSubtitles 2018)
//   wordle_all.txt  https://github.com/tabatkins/wordle-list
//   plus /usr/share/dict/{american,british}-english

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const DATA = process.env.THORNDLE_DATA;
if (!DATA) throw new Error('set THORNDLE_DATA to the directory holding the source corpora');
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const THORN = 'þ'; // unvoiced /θ/ -- CMUdict TH
const EDH = 'ð';   // voiced   /ð/ -- CMUdict DH

/**
 * Voicing settled by hand, overriding CMUdict: the /θ~ð/ sounds a word has, in
 * order -- TH for thorn, DH for edh, and an empty reading for a <th> that is no
 * sound at all.
 *
 * A word may list more than one reading. Then every reading is playable as a
 * guess, but the word can never be the answer of the day, because nothing in
 * the puzzle would tell you which was meant.
 */
const VOICING = new Map([
  // CMUdict is plainly wrong here: THYME is /taɪm/, a plain t and a silent h.
  ['thyme', [[]]],

  // The -THS plurals split real speakers straight down the middle.
  ['truths', [['TH'], ['DH']]],
  ['booths', [['TH'], ['DH']]],
  ['cloths', [['TH'], ['DH']]],
  ['berths', [['TH'], ['DH']]],

  // MOUTHED is plainly edh; MOUTHY does not obviously follow it.
  ['mouthy', [['TH'], ['DH']]],

  // THITHER varies in its first th only -- /ˈðɪðər/ or /ˈθɪðər/. The second is
  // voiced for everyone, so ÐIÞER and ÞIÞER are not spellings of anything.
  ['thither', [['DH', 'DH'], ['TH', 'DH']]],
]);

// Below the frequency floor, but kept as answers anyway on their merits as
// puzzles: SEEÐE for its three E's, DIÐER because it is a good word.
const KEEP_AS_ANSWER = new Set(['seethe', 'dither']);

// Real words the system dictionaries only list capitalised, or not at all.
const EXTRA = ['gothic', 'themed', 'mouthy', 'thusly', 'empath', 'thingy', 'methyl'];

// Playable as guesses, never chosen as the answer of the day.
const NOT_AN_ANSWER = /^(fucks?|shits?|cunts?|whores?|bitch|niggas?|dicks?|twats?|pussy|semen|penis|rapes?|raped|kikes?|spics?|dykes?|slurs?)$/;

const ANSWERS_PER_SPECIAL = 4; // one þ/ð answer in every four days
const EPOCH = '2026-09-06';    // day 0 of the daily puzzle

// --------------------------------------------------------------- corpora ---

/** word -> array of pronunciations, each an array of stress-stripped phones */
function loadCmudict() {
  const prons = new Map();
  for (const line of readFileSync(join(DATA, 'cmudict.dict'), 'utf8').split('\n')) {
    if (!line || line.startsWith(';;;')) continue;
    const [head, ...phones] = line.split(' ');
    if (!phones.length) continue;
    const word = head.replace(/\(\d+\)$/, ''); // "read(2)" -> "read"
    if (!/^[a-z]+$/.test(word)) continue;
    const seq = phones.map((p) => p.replace(/\d$/, '')).filter(Boolean);
    if (!prons.has(word)) prons.set(word, []);
    prons.get(word).push(seq);
  }
  return prons;
}

/**
 * Read a word list, keeping case significant: the system dictionaries mark
 * proper nouns with a capital, and that is the only thing standing between
 * ARTHUR, DULUTH, AGATHA and the answer list.
 */
function loadWords(path) {
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((w) => w.trim())
    .filter((w) => /^[a-z]+$/.test(w));
}

function loadFrequencies() {
  const freq = new Map();
  for (const line of readFileSync(join(DATA, 'en_freq.txt'), 'utf8').split('\n')) {
    const sp = line.indexOf(' ');
    if (sp < 1) continue;
    const word = line.slice(0, sp);
    if (/^[a-z]+$/.test(word) && !freq.has(word)) freq.set(word, Number(line.slice(sp + 1)));
  }
  return freq;
}

// ------------------------------------------------------------- transform ---

/** Start offsets of every non-overlapping "th" in a spelling. */
function thPositions(word) {
  const at = [];
  for (let i = 0; i < word.length - 1; i++) {
    if (word[i] === 't' && word[i + 1] === 'h') { at.push(i); i++; }
  }
  return at;
}

/**
 * Spell a word in the game's alphabet. Returns one spelling per distinct
 * voicing CMUdict attests -- two means the word is genuinely ambiguous, as
 * BOOTHS is /buːðz/ or /buːθs/ -- or null when the word cannot be spelled at
 * all.
 *
 * Three outcomes, decided by counting: if the word has as many /θ~ð/ phonemes
 * as it has <th> spellings, every <th> is one of the new letters; if it has
 * none, every <th> stays two ordinary letters (THYME, POTHOLE, ISTHMUS); and
 * anything in between -- some <th> a sound and some not, or a /θ~ð/ spelled
 * some other way -- cannot be aligned, so the word is dropped.
 */
function transform(word, pronunciations) {
  const positions = thPositions(word);

  const decided = VOICING.get(word);
  const patterns = decided
    ? new Set(decided.map((reading) => reading.join(' ')))
    : new Set(pronunciations.map((phones) => phones.filter((p) => p === 'TH' || p === 'DH').join(' ')));
  if (!patterns.size) return null;

  const sounds = [...patterns].map((p) => (p ? p.split(' ').length : 0));
  if (sounds.every((n) => n === 0)) return [word]; // no /θ~ð/: nothing to collapse
  if (sounds.some((n) => n !== positions.length)) return null; // cannot align

  return [...patterns].map((pattern) => {
    const voicing = pattern.split(' ');
    let out = '';
    let cursor = 0;
    positions.forEach((at, i) => {
      out += word.slice(cursor, at) + (voicing[i] === 'DH' ? EDH : THORN);
      cursor = at + 2;
    });
    return out + word.slice(cursor);
  });
}

const len = (word) => [...word].length;
const isSpecial = (word) => word.includes(THORN) || word.includes(EDH);

// ----------------------------------------------------------------- build ---

const prons = loadCmudict();
const freq = loadFrequencies();
const wordleWords = new Set(loadWords(join(DATA, 'wordle_all.txt')));
const dictionary = new Set([
  ...loadWords('/usr/share/dict/american-english'),
  ...loadWords('/usr/share/dict/british-english'),
  ...EXTRA,
]);

/** playable word -> { freq, source, ambiguous } */
const words = new Map();
const record = (form, source, ambiguous) => {
  if (len(form) !== 5) return;
  const f = freq.get(source) ?? 0;
  const existing = words.get(form);
  if (!existing || existing.freq < f) words.set(form, { freq: f, source, ambiguous });
};

/**
 * Record every playable spelling of one source word, if it has any.
 *
 * `needsPronunciation` is what separates the two corpora. Words that change
 * length have to come from a real dictionary and a real pronunciation, since
 * that is where six-letter words -- and every þ/ð word -- enter. Plain Wordle
 * guesses are allowed through unexamined, because a word with no <th> in it
 * has nothing for this game to get wrong.
 */
function consider(source, { needsPronunciation }) {
  if (source.length < 5 || source.length > 8) return;
  const pronunciation = prons.get(source);

  if (!pronunciation && !VOICING.has(source)) {
    // With no pronunciation there is no telling thorn from edh from a plain t + h.
    if (needsPronunciation || thPositions(source).length) return;
    record(source, source, false);
    return;
  }

  const forms = transform(source, pronunciation ?? []);
  if (!forms) return;
  for (const form of forms) record(form, source, forms.length > 1);
}

for (const source of dictionary) consider(source, { needsPronunciation: true });
for (const source of wordleWords) consider(source, { needsPronunciation: false });

// Invariant: expanding þ and ð back to "th" must give the English word again.
// This is what catches a misaligned collapse, and it holds for the words that
// keep a literal <th> too, since nothing was collapsed in them.
for (const [form, { source, ambiguous }] of words) {
  const expanded = [...form].map((c) => (c === THORN || c === EDH ? 'th' : c)).join('');
  if (!ambiguous && expanded !== source) {
    throw new Error(`"${form}" expands to "${expanded}", not "${source}"`);
  }
}

// ---------------------------------------------------------- answer pools ---

/** Words that make the player decide what a th is: þ, ð, or two plain letters. */
const teaches = (word) => word.includes(THORN) || word.includes(EDH) || word.includes('th');

const eligible = (word, entry, minFreq) =>
  !entry.ambiguous &&
  (entry.freq >= minFreq || KEEP_AS_ANSWER.has(entry.source)) &&
  !NOT_AN_ANSWER.test(word) &&
  dictionary.has(entry.source);

const byFrequency = (a, b) => b[1].freq - a[1].freq || a[0].localeCompare(b[0]);
const entries = [...words.entries()];

// Take every th word that is not vanishingly rare -- there are only so many.
const special = entries
  .filter(([w, e]) => teaches(w) && eligible(w, e, 100))
  .sort(byFrequency)
  .map(([w]) => w);

// Ordinary answers are the most common plain words, sized to hit the ratio.
const ordinary = entries
  .filter(([w, e]) => !teaches(w) && wordleWords.has(w) && eligible(w, e, 1000))
  .sort(byFrequency)
  .slice(0, special.length * (ANSWERS_PER_SPECIAL - 1))
  .map(([w]) => w);

/** mulberry32 -- a small seeded PRNG, so the schedule is reproducible. */
function shuffled(list, seed) {
  const out = [...list];
  let state = seed;
  const random = () => {
    state |= 0; state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Interleave so a þ/ð word lands every fourth day instead of every fortieth.
const specialQueue = shuffled(special, 20260906);
const ordinaryQueue = shuffled(ordinary, 19980731);
const schedule = [];
let s = 0;
let o = 0;
while (s < specialQueue.length && o < ordinaryQueue.length) {
  schedule.push(specialQueue[s++]);
  for (let i = 1; i < ANSWERS_PER_SPECIAL && o < ordinaryQueue.length; i++) {
    schedule.push(ordinaryQueue[o++]);
  }
}

// ------------------------------------------------------------------ emit ---

const all = [...words.keys()].sort();
const file = `// Generated by tools/build-words.mjs -- do not edit by hand.
//
// Every word is five letters, where þ (thorn, unvoiced /θ/) and ð (edh, voiced
// /ð/) each count as one letter. A "th" that is neither of those sounds is not
// a digraph at all and stays two letters, as in THYME.

/** Every word Thorndle accepts as a guess. */
export const GUESSES = ${JSON.stringify([...all].join(' '))}.split(' ');

/** The daily answers, in order. Day 0 is ${EPOCH}. */
export const ANSWERS = ${JSON.stringify(schedule.join(' '))}.split(' ');

/** UTC date of puzzle #0. */
export const EPOCH = '${EPOCH}';
`;
writeFileSync(join(ROOT, 'src', 'words.js'), file);

const literal = all.filter((w) => w.includes('th'));
console.log(`guesses  ${all.length} (${all.filter(isSpecial).length} with þ/ð, ` +
            `${literal.length} with a literal th: ${literal.join(' ')})`);
console.log(`answers  ${schedule.length} (${schedule.filter(teaches).length} about th, ` +
            `${(schedule.filter(teaches).length / schedule.length * 100).toFixed(0)}%) ` +
            `-- ${(schedule.length / 365).toFixed(1)} years from ${EPOCH}`);
console.log(`first week: ${schedule.slice(0, 7).join(' ')}`);
