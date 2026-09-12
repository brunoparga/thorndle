# Þorndle

A daily five-letter word game, played with the two letters English threw away.

Live at **<https://thorndle.brunoparga.net/>**.

## The twist

English spells two different sounds with the same `th`. Old English had a
letter for each, and Þorndle gives them back their jobs:

| letter | name | sound | as in |
| --- | --- | --- | --- |
| **þ / Þ** | thorn | unvoiced /θ/ | thin, bath, **þ**anks |
| **ð / Ð** | edh | voiced /ð/ | this, father, mo**ð**er |

Each is one tile. That quietly rebuilds the whole dictionary:

- `WORTH` collapses to `WORÞ` — four letters, out of the game.
- `MONTHS` collapses to `MONÞS` — five letters, in.
- `FATHER` becomes `FAÐER`, `SMOOTH` becomes `SMOOÐ`, `RHYTHM` becomes `RHYÐM`.

So most of the new words are six letters long in ordinary English, and a good
number of familiar Wordle answers are gone.

But a `th` that is **not** one of those two sounds is not a digraph at all, and
keeps both its letters. *Thyme* is said /taɪm/ — a plain `t` with a silent `h` —
so it is spelled `T H Y M E` and plays at its full five letters. Putting `t`
next to `h` is therefore a claim about pronunciation. It is almost always the
wrong one: see [The THYME problem](#the-thyme-problem).

Which letter a word needs is a matter of sound, not spelling, which is why the
tagline at the top of the page shows all four things `th` can do at once —
*Ðose potholes þreaten Anthony*. Half the time it is one of the written ones;
the other half it is generated from a small bank of words, one for each kind of
th, in a fixed frame: *Ðeir goatherds þwack Goethe*.

## Playing

Six guesses for a five-letter word. Green is right letter, right place; gold
is right letter, wrong place; black is not in the word; grey keys are ones you
have not tried. The þ and ð keys are violet in every state, letter and ring
alike, so "special" never reads as a score — and the **þ** button in the top
bar turns all of that off, for anyone who no longer needs the reminder.

Edh sits in the top row between T and Y, thorn in the middle row between F and
G, so each row gains a key rather than displacing one. On a physical keyboard,
`[` types **þ** and `]` types **ð** — the note under the board says so, until
you dismiss it (and if your layout can produce þ or ð directly, those work too).

A new word every day at local midnight. Progress, statistics, the theme and the
other switches are kept in `localStorage`; nothing leaves the browser.

## Layout

```
index.html            the page
src/style.css         one stylesheet, light and dark from the same tokens
src/main.js           the game
src/words.js          generated -- the dictionary and the answer schedule
tools/build-words.mjs builds src/words.js from public corpora
CNAME                 custom domain for GitHub Pages
```

No build step and no dependencies: it is static files that a browser runs as
written. To work on it locally, serve the directory (ES modules will not load
over `file://`):

```sh
python3 -m http.server 8000   # then open http://localhost:8000/
```

## Rebuilding the word list

The interesting part is deciding, for each `th`, whether it is thorn, edh, or
not one sound at all. That comes from
[CMUdict](https://github.com/cmusphinx/cmudict), which distinguishes the
phonemes `TH` (/θ/) and `DH` (/ð/). Counting decides it: a word with as many
/θ~ð/ phonemes as it has `th` spellings collapses every one of them; a word with
none keeps them all as plain letters; and a word somewhere in between cannot be
aligned reliably, so it is dropped.

Where CMUdict records a word both ways it is treated as ambiguous: every
spelling stays playable as a guess, but the word can never be the answer of the
day, since nothing in the puzzle would tell you which was meant.

Anything CMUdict gets wrong or leaves open is settled in the `VOICING` map,
which lists a word's /θ~ð/ sounds in order. Listing more than one reading makes
a word ambiguous by that same rule:

| word | reading |
| --- | --- |
| THYME | no th-sound at all — /taɪm/, a plain `t` and a silent `h` |
| TRUTHS, BOOTHS, CLOTHS, BERTHS | either — real speakers split, so both spellings play and neither is an answer |
| MOUTHY | either — *mouthed* is plainly edh, but *mouthy* does not follow from it |
| THITHER | ÐIÐER or ÞIÐER — only the first th varies; the second is voiced for everyone, so ÐIÞER spells nothing |

The other `-ths` plurals are settled enough to be answers on their own:
BIRÞS, DEAÞS, DEPÞS, EARÞS, FAIÞS, MONÞS, MOUÐS, SMIÞS, TENÞS. The ones that do
split speakers — *oaths*, *paths*, *baths* — collapse to four letters and leave
the game anyway.

```sh
mkdir -p /tmp/thorndle-corpora && cd /tmp/thorndle-corpora
curl -O https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict
curl -o en_freq.txt https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_full.txt
curl -o wordle_all.txt https://raw.githubusercontent.com/tabatkins/wordle-list/main/words
curl -o wordle_answers.txt https://gist.githubusercontent.com/cfreshman/a03ef2cba789d8cf00c08f767e0fad7b/raw/wordle-answers-alphabetical.txt
cd -
THORNDLE_DATA=/tmp/thorndle-corpora node tools/build-words.mjs
```

It also reads `/usr/share/dict/american-english` and `british-english` (Debian's
`wamerican` and `wbritish`), which is where the six-letter words come from.
Capitalisation matters on the way in: it is the only thing keeping ARÞUR,
DULUÞ and AGAÞA out.

English contains about 136 five-letter words with a þ or ð in them, and that is
the real ceiling — 110 of them are settled and common enough to be answers. The
rest stay playable as guesses; a word has to clear a frequency floor to be the
answer of the day, so nobody loses to ÞROVE or ZIÐER. `KEEP_AS_ANSWER` lets a
word through anyway when it earns it: SEEÐE for being the only answer with three
E's, DIÐER for being a good word.

The plain answers are drawn from Wordle's own curated answer list — the most
common 333 of it — rather than from the wider guess list. Wordle's editors keep
plurals and simple past tenses out of the answers, and a frequency count cannot
make that judgement: left to itself it served up PLAYS, TELLS and GONNA.

Rather than let th words turn up at their natural rate of roughly once a month,
the answer pool is built so that **one in four** turns on a th. The two pools
are then shuffled together in a single draw, so which days those are is not
something anyone can predict — a fixed interleave would have put one on every
fourth day like clockwork. The only shape imposed is that no run of plain words
goes past ten days. That gives 444 daily puzzles — about fifteen months from the
epoch in `tools/build-words.mjs` — after which the sequence repeats. Re-run the
build with a later epoch to reshuffle.

## The THYME problem

A `th` that stays two letters does not change the word's length, so a word can
only reach the game that way if it is *already* five letters long. There are 246
five-letter English words spelled with `th`. In every one of them but a single
exception the `th` is a real /θ/ or /ð/, which collapses the word to four
letters and out of the game — or the word is obscure enough that no pronouncing
dictionary carries it, and it is dropped for want of evidence.

The exception is **THYME**, /taɪm/, a plain `t` with a silent `h`. It is the
only word in Þorndle spelled with `t` next to `h`.

The other ways English produces a `th` that is not one sound all need more
room than five letters gives them:

| kind | examples | letters |
| --- | --- | --- |
| plain /t/ | THYME | **5 — plays** |
| plain /t/ | THOMAS, THAMES, ESTHER, ANTHONY | 6–7 |
| `t` + `h` across a seam | POTHOLE, HOTHEAD, ANTHILL, LIGHTHOUSE | 7–10 |
| silent | ASTHMA, ISTHMUS | 6–7 |

CMUdict is wrong about THYME, incidentally — it records `TH AY1 M`, giving it
the /θ/ of *thin*. Overriding that is what the `VOICING` map in the build script
is for.

## Deploying

GitHub Pages, served straight from the branch — there is nothing to compile.

1. **Settings → Pages → Source: Deploy from a branch**, `main` / `/ (root)`.
2. **Custom domain**: `thorndle.brunoparga.net`. The `CNAME` file in this repo
   already says so, so the field should populate itself.
3. DNS at the registrar for `brunoparga.net`: a `CNAME` record for the host
   `thorndle` pointing at `<username>.github.io.`
4. Once the certificate is issued, tick **Enforce HTTPS**.

`.nojekyll` is present so Pages publishes the files as they are.

## Credits

Word list from [CMUdict](https://github.com/cmusphinx/cmudict) (BSD-style
licence), the [OpenSubtitles frequency
lists](https://github.com/hermitdave/FrequencyWords) (CC-BY-SA 4.0),
[tabatkins/wordle-list](https://github.com/tabatkins/wordle-list) and Wordle's
original answer list. The game it is a variation on is, of course, Josh
Wardle's Wordle.
