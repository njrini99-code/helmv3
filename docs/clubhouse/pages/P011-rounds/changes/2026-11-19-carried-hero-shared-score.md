# P011 Rounds — Changelog

## 2026-11-19 — A team round lands on its hero; its score rides the push

```text
Design package: none
PR/commit: agent/clubhouse-native-polish
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `TeamRounds.tsx` carries what the row shows (player and day, course, tee,
  score, to par) into the review's phone skeleton (`CarriedRoundHero.tsx`,
  `lib/carry.ts`), so the push lands on the round, not a generic block (E-1).
  A deep link draws the plain block; the server never has a carry.
- The row's score and the review's hero score are marked
  `data-ch-share="round-score"`: the score travels into the hero over the push
  (E-6, `lib/share-morph.ts`).
- `RoundReview.tsx`: "The round" explains the hole-by-hole line only when it
  is drawn; a round posted as a total reads "The round's score against par"
  (F-07).
- `rounds.css`: the skeleton's carried hero takes the phone hero's
  feature-card style.

### Why

- Audit 2026-11-19 E-1, E-6 and F-07.

### Verification

- `screens/rounds/__tests__/carried-round-hero.test.tsx`,
  `lib/__tests__/share-morph.test.ts`.
- `npm run clubhouse:check`. WebKit before and after numbers are in the PR body.
