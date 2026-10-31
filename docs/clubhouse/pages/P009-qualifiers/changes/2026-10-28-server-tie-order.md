# 2026-10-28 — Qualifiers: the server decides tie order once

## 2026-10-28 — One standings order for Clubhouse, Fairway and Ask

```text
Design package: none (owner decision 2026-10-28)
PR/commit:      fix/qualifier-tie-order-server
Contract IDs:   none
Actions:        ACT-P009-CONFIRM-SQUAD; chooseQualifierTiePlace
Data impact:    Fairway's confirm writes the board's squad when cards
                differ in length
Held items:     none
```

### Changed

- One function places every qualifier field: `rankStandings` in
  `src/lib/coachhelm/v3/qualifying/ranking.ts`. It uses the board's
  rule (a card a round short below every full card, then to par,
  strokes, more rounds, name). It returns each player's rank, position
  and tie.
- The workspace loader always ranks with it and returns the candidates in
  that order, with `leaderboard_position` and `leaderboard_tied`.
- No caller passes an order any more. `QualifyingOrder`,
  `asQualifyingOrder` and the `order` arguments of `confirmSelection`,
  `chooseTiePlace` and both server actions are gone. An old client that
  still sends one is ignored.
- Clubhouse's board, Fairway's live leaderboard and Ask's
  `get_qualifiers` place with the same function. Manage selections, the
  standings spread and Fairway's workspace draw the rows as given and no
  longer re-sort.
- Level at the cut is "same position" everywhere, so a full card and a
  short card are never tied.
- Ask's `get_qualifiers` counts rounds as the board does and adds rank,
  position and total to par per player.
- Fairway gives no stroke gap between a full card and a card a round
  short: the player panel's lead and line facts say "Leads", "1 round
  fewer in", "Inside" or "Outside" instead. The field stats drop the
  travel-cut gap and keep the spread to the full cards (review of #2404).

### Why

- Owner, 2026-10-28: "the server decides qualifier tie order once, and
  both Clubhouse and Fairway use it". The board's order is the rule
  because Confirm squad saves "Match the board" (decision A).
- Fairway ranked by score alone, so its board and its Confirm could put a
  short card in a place Clubhouse showed outside the line.

### Verification

- `ranking.test.ts`: ties on equal totals share a position; the board
  rule orders inside a tie; a short card ranks below every full card.
- `one-order.test.ts`: the Clubhouse board, the workspace and Fairway's
  leaderboard each call `rankStandings` and agree on order, positions
  and ties over 300 generated fields.
- `standings-parity.test.tsx`: Fairway, the workspace and Clubhouse
  agree on a short card through the real loaders.
- `team-read-tools.test.ts`: Ask's standings follow the same order.
- `FairwayQualifierLeaderboard.board.test.tsx` and
  `qualifier-stats.test.ts`: a full card at +4 above a short card at −2
  shows no "−6 shots" and no "On the line" on either side.
