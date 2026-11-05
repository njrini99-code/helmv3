# 2026-11-04 — CoachHelm: a guessed cause and a teammate's RSVP leave the player's responses

## 2026-11-04 — A player's payload holds no arm of a likely cause; player Ask holds no teammate

```text
Design package: design-refresh/coachhelm-read/ (CR0; "Coach-only things are absent from the player's DOM and responses")
PR/commit:      agent/clubhouse-redesign-followups
Contract IDs:   CH-13982 (extended)
Actions:        none
Data impact:    none (shapers and tool results only; stored insights unchanged)
Held items:     none
```

### Changed

- `lib/coachhelm/reads/player-cause.ts` (new) owns what a player may read of a
  cause: `playerSeesCause`, `withoutGuessedCause`, `namesWithheldArm`,
  `playerTitle`. The Read, the Board, the Deep dive and player Ask all use it.
  Besides the causal sentences, it matches the arms the engine stored: a slice's
  label, an arm's "16 of 28" and the guess's own sentences.
- `data/coachhelm-map.ts`: `toChInsight` filters at the source for anything but
  a coach's card, so `title`, `lede`, `why` and `week.text` hold no guess on a
  card that never passes the Deep dive. The first sentence the player may read
  becomes the lede.
- `assignAs` is filtered for every viewer: a coach assigning from their Board
  saves it to a focus area the player reads.
- `data/coachhelm-path.ts`: `seen` and the narrowing chips.
  `data/coachhelm-read-view-shape.ts`: the funnel steps, and `sure.checked`
  keeps named lines only. Call 2 (players see the observed funnel) stands,
  without a step that is an arm of the guess.
- Player Ask: `get_upcoming_events` returns the player's own `my_rsvp` and reads
  attendance for that player alone. `get_my_reads` judges each title against its
  evidence and sends no evidence. `get_round_detail` checks the owner first, so
  a teammate's round reads as no round at all.
- Ask route: only a session with no coach row reaches the player branch
  (`CoachContextError.reason === 'not_a_coach'`). A failed coach lookup is a
  500, not a denial. `runPlayerTurn` applies `isCoachHelmEnabledForPlayer`
  before the rate limit, the allowance and the model.

### Why

- `toChDeepInsight` filtered `why` alone, so `lede` and `assignAs.description`
  still carried the cause, and the Read sends the whole `ChInsight` to the
  client.
- The player tool delegated to the coach's read, which returned team counts and
  each teammate who had not replied.
- Any 403 went to the player branch, which ran no team gate.

### Verification

- Regression tests, each confirmed failing on the old code:
  `screens/coachhelm/read/__tests__/read-view-privacy.test.ts`,
  `lib/coachhelm/v3/chat/__tests__/player-tools.test.ts`,
  `lib/coachhelm/v3/chat/__tests__/player-branch-gates.test.ts`,
  `app/api/coachhelm/v3/chat/stream/route.test.ts`. New:
  `lib/coachhelm/reads/__tests__/player-cause.test.ts`.
- No screenshots: this slice ran without a browser, and the visible change is
  limited to a read whose text states a guess. Not checked on a preview link.
