# 2026-10-24 — Roster and Rounds speak gain and loss; a toned figure says which way (Clubhouse A+ S2)

## 2026-10-24 — Row 48 leftovers: the last tone words, and the sign-or-word guard (CONS-20)

```text
Design package: none (Clubhouse A+ row 48, CONS-20)
PR/commit:      agent/aplus-s2
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     CoachHelm's good/warn words (owner decision M); the debrief's moved number and Stats profile counts are ratcheted, not yet zero
```

### Changed

- Roster: a player's "needs a look" note is `is-loss` when their scores rose
  ("Scoring up 2.1") and `is-gain` for a good run ("4 rounds under average"),
  painted with the chart's loss and gain inks; a quiet spell ("No rounds in 9
  days") stays a warning, since it says nothing about the scores. Desktop's
  good-run green moves from `--ch-green-700` to `--ch-chart-gain`, a shade
  lighter in light mode. The Roster profile's trend legend tones "Scoring up"
  as a loss, as it did as a warning.
- Round review's debrief: the moved number is `is-gain`/`is-loss`, not
  `is-good`/`is-bad`; same inks.
- The Rounds ribbon's `is-down` stays: it is the bar's geometry (it hangs
  below the line), not a verdict.
- Stats team (phone), putting: a make rate is amber only when it prints below
  the Tour's as whole percents (69.6% against 70% is level).
- A guard, `__tests__/_tone-sign.ts`: every toned element with text carries a
  sign or a word that says which way. Strict on Roster (desktop and phone) and
  Team stats except the phone's putting rates; counted, and only allowed to
  fall, on the player profile tabs and the debrief's moved number.

### Why

- Row 48: colour says good or bad, and a sign or word always goes with it.
  Roster and Rounds still used the old words, and nothing checked the second
  half.

### Tests

- `tone-vocabulary.test.ts`: roster.css leaves the old-word list; rounds.css
  falls from 3 to 1.
- `roster.test.tsx`, `round-debrief.test.tsx`, `stats-team.test.tsx`,
  `stats-player.test.tsx`: the guard, with the counts measured on this base.
