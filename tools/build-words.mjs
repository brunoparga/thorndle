#!/usr/bin/env node
// Builds src/words.js -- the Thorndle dictionary and the daily answer schedule.
//
// The twist: every English <th> pronounced /θ/ or /ð/ collapses into a single
// letter -- thorn (þ) for unvoiced /θ/, edh (ð) for voiced /ð/. THORN becomes
// ÞORN and drops out at four letters; THORNS becomes ÞORNS and joins the game.
// Six-letter English words are the new supply, and the letter pair "th" can
// never appear in a Thorndle word: it is always one letter or nothing.
//
// Voicing comes from CMUdict, which distinguishes the phonemes TH (/θ/) and
// DH (/ð/). A word is usable only if its spelling and its pronunciation agree
// on how many /θ~ð/ sounds it has. That one check discards every word where
// <th> is not a single sound -- POTHOLE (t + h), THYME (plain /t/), ISTHMUS
// (silent) -- with no need to special-case them.
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

// Derivable but wrong: EIGHTH is EIGHT + H, so collapsing <th> eats the /t/.
// THITHER is contested at both of its <th>s and too rare to be worth the fight.
const BLACKLIST = new Set(['eighth', 'eighths', 'thither']);

// Words where educated speakers genuinely differ about the voicing, beyond the
// variants CMUdict happens to record -- the -THS plurals are the usual
// offenders. Both spellings stay playable as guesses, but neither can be the
// answer, because nothing in the puzzle would tell you which was meant.
const VOICING_VARIES = new Set(['truths', 'booths', 'cloths', 'berths', 'mouthy']);

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
 * Collapse a word's <th> digraphs into thorn/edh. Returns one spelling per
 * distinct voicing CMUdict attests -- two means the word is genuinely
 * ambiguous (BOOTHS is /buːðz/ or /buːθs/) -- or null when spelling and
 * pronunciation disagree about how many /θ~ð/ sounds there are.
 */
function transform(word, pronunciations) {
  const positions = thPositions(word);

  const patterns = new Set();
  for (const phones of pronunciations) {
    const voicing = phones.filter((p) => p === 'TH' || p === 'DH');
    if (voicing.length !== positions.length) return null; // spelling/sound mismatch
    patterns.add(voicing.join(' '));
  }
  if (!patterns.size) return null;
  if (!positions.length) return [word]; // ordinary word, nothing to collapse

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

// Words that lose letters to the collapse have to come from a real dictionary,
// since this is where six-letter words -- and every þ/ð word -- enter.
for (const source of dictionary) {
  if (BLACKLIST.has(source) || source.length < 5 || source.length > 8) continue;
  const pronunciation = prons.get(source);
  if (!pronunciation) continue;
  const forms = transform(source, pronunciation);
  if (!forms) continue;

  if (VOICING_VARIES.has(source)) {
    const at = thPositions(source);
    if (at.length !== 1) throw new Error(`${source}: VOICING_VARIES expects a single th`);
    const stem = source.slice(0, at[0]);
    const tail = source.slice(at[0] + 2);
    for (const letter of [THORN, EDH]) record(stem + letter + tail, source, true);
    continue;
  }

  for (const form of forms) record(form, source, forms.length > 1);
}

// Every ordinary Wordle guess still counts, whether or not CMUdict knows it.
// It only has to be free of <th>, and free of any /θ~ð/ CMUdict hears in it.
for (const source of wordleWords) {
  if (BLACKLIST.has(source) || thPositions(source).length) continue;
  const pronunciation = prons.get(source);
  if (pronunciation && !transform(source, pronunciation)) continue;
  record(source, source, false);
}

// Invariant: "th" is never two letters in this game.
for (const word of words.keys()) {
  if (word.includes('th')) throw new Error(`"${word}" still spells th as two letters`);
}

// ---------------------------------------------------------- answer pools ---

const eligible = (word, entry, minFreq) =>
  !entry.ambiguous &&
  entry.freq >= minFreq &&
  !NOT_AN_ANSWER.test(word) &&
  dictionary.has(entry.source);

const byFrequency = (a, b) => b[1].freq - a[1].freq || a[0].localeCompare(b[0]);
const entries = [...words.entries()];

// Take every þ/ð word that is not vanishingly rare -- there are only so many.
const special = entries
  .filter(([w, e]) => isSpecial(w) && eligible(w, e, 100))
  .sort(byFrequency)
  .map(([w]) => w);

// Ordinary answers are the most common plain words, sized to hit the ratio.
const ordinary = entries
  .filter(([w, e]) => !isSpecial(w) && wordleWords.has(w) && eligible(w, e, 1000))
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
// /ð/) each count as one letter. "th" never appears: it is always one of those
// two, or -- as in THYME or POTHOLE -- a word this game cannot spell.

/** Every word Thorndle accepts as a guess. */
export const GUESSES = ${JSON.stringify([...all].join(' '))}.split(' ');

/** The daily answers, in order. Day 0 is ${EPOCH}. */
export const ANSWERS = ${JSON.stringify(schedule.join(' '))}.split(' ');

/** UTC date of puzzle #0. */
export const EPOCH = '${EPOCH}';
`;
writeFileSync(join(ROOT, 'src', 'words.js'), file);

const specialCount = all.filter(isSpecial).length;
console.log(`guesses  ${all.length} (${specialCount} with þ/ð)`);
console.log(`answers  ${schedule.length} (${schedule.filter(isSpecial).length} with þ/ð, ` +
            `${(schedule.filter(isSpecial).length / schedule.length * 100).toFixed(0)}%) ` +
            `-- ${(schedule.length / 365).toFixed(1)} years from ${EPOCH}`);
console.log(`first week: ${schedule.slice(0, 7).join(' ')}`);
