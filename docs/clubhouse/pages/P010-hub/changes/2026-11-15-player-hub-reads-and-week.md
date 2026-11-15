# P010 Team Hub — 2026-11-15

## 2026-11-15 — Each part of the player’s hub fails on its own; trips, replies, files and tasks read right

```text
Design package: none (Nov 15 gap pass, GAP-PASS-FINDINGS.md, GAP-H-02, GAP-H-03, GAP-H-04, GAP-H-13, GAP-H-14, GAP-H-15, GAP-H-16, GAP-H-20, GAP-H-25, GAP-S-17, GAP-S-26, GAP-S-33)
PR/commit:      claude/project-thread-pryzf0
Contract IDs:   100490 (CH-10390), 100491 (CH-10391); CH-10405 row updated
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- `src/app/golf/actions/player-hub-data.ts`, `data/hub.ts`: events, travel and
  tasks each fail on their own and say so in their own section; the other
  sections keep their data (GAP-H-03). No figures changed.
- A link to a task or trip that's gone opens its tab and says so at the top:
  "That task was removed" (CH-10390), "That trip isn’t here" (CH-10391)
  (GAP-S-26).
- The player's hero counts down only to a trip they are on; otherwise a plain
  "Team away" line, and the week marks only their own trip days (GAP-H-02). A
  player with no trips reads "No team travel coming up" (GAP-H-25).
- Replies are made in the queue only; the week tile shows the reply as a
  status, and "Got it" is a secondary key (GAP-H-04). "N replies due" moves to
  the queue and focuses it (GAP-H-13).
- Files list newest first (GAP-H-14). Folder headings get unique ids
  (GAP-H-15). The player's finished tasks fold under "Done (N)" (GAP-H-16).
  The trip pager announces each trip once, politely (GAP-H-20, part; the arrow
  hit area is left to the 44pt sweep).
- The route skeleton draws the tab the link names (`?tab=`) (GAP-S-17).
- The one failure line on the hub's notices (GAP-S-33).

### Why

- GAP-H-03: one failed read blanked the whole player hub.
- GAP-H-02, H-04, H-13 to H-16, H-25, S-26: the player's hub counted down to
  trips they weren't on, offered two places to reply, and dropped deep links
  without a word.

### Verification

- `src/clubhouse/__tests__/hub-gap-pass.test.tsx` (new), `hub.test.tsx`,
  `hub-redesign.test.tsx`, `src/test/golf/actions/player-hub-read-failure.test.ts`,
  `route-skeleton-address.test.tsx`.
- `npm run build` needed before landing (`player-hub-data.ts` is `'use server'`).
