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

- `THORN` collapses to `ÞORN` — four letters, out of the game.
- `THORNS` collapses to `ÞORNS` — five letters, in.
- `WORTH` becomes `WORÞ` and leaves; `MONTHS` becomes `MONÞS` and arrives.

So most of the new words are six letters long in ordinary English, and a good
number of familiar Wordle answers are gone. **No word in Þorndle is ever
spelled with `t` followed by `h`.** Either the pair is one of the two letters,
or — as in *thyme* (just /t/), *pothole* (t + h across a seam) and *isthmus*
(silent) — the word is one this alphabet cannot write, and it is not in the
game at all.

Which letter a word needs is a matter of sound, not spelling, which is why the
sentence at the top of the page shows all four things `th` can do at once.

## Playing

Seven guesses for a five-letter word. Green is right letter, right place; gold
is right letter, wrong place; black is not in the word; grey keys are ones you
have not tried. The þ and ð keys keep a violet ring in every state, so
"special" never reads as a score.

Thorn sits in the middle row between G and H, edh in the top row between Y and
U. On a physical keyboard, `[` types **þ** and `]` types **ð** (and if your
layout can produce þ or ð directly, those work too).

A new word every day at local midnight. Progress, statistics and the light or
dark theme are kept in `localStorage`; nothing leaves the browser.

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
phonemes `TH` (/θ/) and `DH` (/ð/). A word is only playable if its spelling and
its pronunciation agree on how many /θ~ð/ sounds it has — one check that throws
out *thyme*, *pothole* and *isthmus* without special-casing any of them.

Voicing that real speakers disagree about is handled separately. Where CMUdict
records a word both ways, and for a short hand-kept list of others where it does
not but English does — *truths*, *booths*, *cloths*, *berths*, *mouthy* — both
spellings stay playable as guesses, but neither can be the answer of the day:
nothing in the puzzle would tell you which was meant.

```sh
mkdir -p /tmp/thorndle-corpora && cd /tmp/thorndle-corpora
curl -O https://raw.githubusercontent.com/cmusphinx/cmudict/master/cmudict.dict
curl -o en_freq.txt https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_full.txt
curl -o wordle_all.txt https://raw.githubusercontent.com/tabatkins/wordle-list/main/words
cd -
THORNDLE_DATA=/tmp/thorndle-corpora node tools/build-words.mjs
```

It also reads `/usr/share/dict/american-english` and `british-english` (Debian's
`wamerican` and `wbritish`), which is where the six-letter words come from.
Capitalisation matters on the way in: it is the only thing keeping ARÞUR,
DULUÞ and AGAÞA out.

English contains about 138 five-letter words with a þ or ð in them, and that is
the real ceiling — 107 of them are common and unambiguous enough to be answers.
Rather than let them turn up at their natural rate of roughly once a month, the
schedule interleaves them so **one answer in four** uses a new letter. That
gives 428 daily puzzles — about fourteen months from the epoch in
`tools/build-words.mjs` — after which the sequence repeats. Re-run the build
with a later epoch to reshuffle.

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
lists](https://github.com/hermitdave/FrequencyWords) (CC-BY-SA 4.0) and
[tabatkins/wordle-list](https://github.com/tabatkins/wordle-list). The game it
is a variation on is, of course, Josh Wardle's Wordle.
