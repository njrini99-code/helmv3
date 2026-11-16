# P011 Rounds — 2026-11-15

## 2026-11-15 — Rounds and Live: failed, empty and waiting states

```text
Design package: none (Nov 15 gap pass, GAP-PASS-FINDINGS.md, GAP-S-10, GAP-S-12,
GAP-S-18, GAP-S-20, GAP-S-24, GAP-S-27, GAP-S-32, GAP-R-03, GAP-R-11, GAP-R-12)
PR/commit:      claude/project-thread-pryzf0
Contract IDs:   110690 (CH-11290), 110691 (CH-11291), 110491 (CH-11391), 110490
(CH-11390); CH-11307, CH-11330, CH-11331, CH-11407, CH-16609 rows updated
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- Round review: when the history fails to load, it says so once, "History
  didn’t load" with Try again (CH-11290, GAP-S-27). Its not-found is the one
  line (CH-11307, GAP-S-24).
- Course page: a coach with no player chosen is asked to choose one, with the
  way to Roster (CH-11391, GAP-S-20); a key that can't be read is the not-found
  page, "This course isn’t here" (CH-1306). Each section is contained
  (CH-11291), and two or more failures are said once (CH-1210).
- A round being continued loads in the tracking screen's own shape
  (`RoundRuntimeSkeleton`, CH-11407, GAP-S-18). On tracking, the hole map and
  the shot log are contained sections (CH-11291, GAP-S-10); scoring keeps
  working if one fails to draw.
- A coach on a player's round flow is told "Only players log rounds"
  (CH-11390, GAP-R-12). The completed-round hop draws the review skeleton
  (GAP-R-11).
- Live: a coach with no team sees the shared not-on-a-team state, and a team
  they may not read gets "Live isn’t available for this team" with Back to Home
  (CH-16609, GAP-S-12). The route loading matches the desk (GAP-S-32). The
  lanes, the player panel and the ribbon are contained sections (CH-16294).

### Why

- GAP-S-27: a failed history silently dropped records, so a personal best read
  as none.
- GAP-S-20: a coach with no player was told the player wasn't on the team.
- GAP-S-12: Live said a bare sentence for a coach with no team.

### Verification

- `round-review.test.tsx` and `review-history-stream.test.tsx` (CH-11290),
  `course-history-route.test.tsx` (CH-11391, CH-1306),
  `course-page-boundaries.test.tsx` and `round-tracking-boundaries.test.tsx`
  (CH-11291), `players-only-rounds.test.tsx`, `round-entry-routes.test.tsx`,
  `LiveView.test.tsx`, `tournaments-live-section-boundaries.test.tsx`.
