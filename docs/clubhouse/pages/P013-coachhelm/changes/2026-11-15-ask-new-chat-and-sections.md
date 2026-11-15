# P013 CoachHelm — 2026-11-15

## 2026-11-15 — New chat waits for a reply and can be undone; each card and Practice part fails on its own; no-rounds is the shared empty state

```text
Design package: none (Nov 15 gap pass, GAP-PASS-FINDINGS.md, GAP-H-08, GAP-H-10, GAP-H-12, GAP-H-17, GAP-H-24, GAP-S-10, GAP-S-23, GAP-S-33)
PR/commit:      claude/project-thread-pryzf0
Contract IDs:   130790 (CH-13925), 130491 (CH-13386); CH-13204 row updated
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- Ask: New chat is inert while a reply streams (Stop ends it first). A new chat
  started from one with messages offers "New chat started" with Undo for five
  seconds (CH-13925), which brings the last chat back; asking in the new chat
  removes the offer (GAP-H-08). `useCoachHelmChat` gained `restore`.
- Your week: Accept and Decline belong to the proposal the plan card is, by id,
  and are not drawn when none matches (GAP-H-10).
- Deep dive on a desk: picking a read moves focus to its title (GAP-H-17).
- The read sheet: no empty line under the area name for a player, and no
  "Still gathering" filler; a read with its own next step shows it under "What
  to work on" (GAP-H-24).
- The correction rows' text keys get the 44pt hit area on the phone, with no
  visual change (GAP-H-12, the real target; the cited rule matched nothing).
- Each card on the coach's Team board, the player file and Your week, and each
  part of the Practice pages, is its own section (CH-13204, GAP-S-10). On the
  phone, Your week has one boundary for now.
- A player file and Your week with no rounds use the shared empty state, "No
  rounds yet" (CH-13386, GAP-S-23). TeamBoard's dark hero empty is left for the
  look thread.

### Why

- GAP-H-08: New chat mid-reply threw the reply away with no way back.
- GAP-S-10: one card that crashed took the whole page.
- GAP-S-23: hand-rolled empty blocks drifted from the shared one.

### Verification

- `coachhelm-ask-races.test.tsx` (CH-13925), `useCoachHelmChat.test.tsx`,
  `player-file.test.tsx`, `coachhelm-dive.test.tsx`, `team-panels.test.tsx`,
  `screens/coachhelm/file/__tests__/section-boundaries.test.tsx`,
  `screens/practice/__tests__/section-boundaries.test.tsx`,
  `src/clubhouse/__tests__/coachhelm-no-rounds.test.tsx` (CH-13386).
