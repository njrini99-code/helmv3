# 2026-11-11 — coachhelm

## 2026-11-11 — The coach's signal-list board and the player's focus board are retired

```text
Design package: none (owner decision, 11 Nov 2026; the surviving pages are unchanged)
PR/commit:      agent/clubhouse-release-train, b0a7cb39d8 (coach) and 4b5a82a987 (player)
Contract IDs:   29 catalog codes and 130105, 131501 tombstoned (bridge-tombstones.json);
                130101, 130702, 130801, 130806, 130901 to 130903, 131201, 131401 to 131403
                and 131901 reworded for the surviving pages and re-proved
Actions:        ACT-P013-TRY-AGAIN loses its two board-only load-failure contracts
Data impact:    none
Held items:     none
```

### Changed

- The coach's CoachHelm Team page is the drawn golf hole (`TeamBoard`), with no
  switch back: `CoachBoard`, `TeamPatterns`, the coach's `CoursePlan`, the
  `coachhelm` preview and `TEAM_BOARD_FIRST_VIEW` are deleted. "CoachHelm is
  off" on Ask, a read and the player file is the Team page with nothing read.
  `/clubhouse-preview/coachhelm` opens `coachhelm-team`.
- A player's CoachHelm Board is Your week: `PlayerBoard`, `MyCoursePlan`, the
  focus card, the insight row, Cleared lines and the proposals section are
  deleted. The `coachhelm-player` preview draws Your week, and Standing or the
  Deep dive with `?view=`.
- `coachHelmLinks` moved to `screens/coachhelm/links.ts` (Standing and the Deep
  dive use it); the off notice moved to `screens/coachhelm/CoachHelmOffNotice.tsx`.
- The boards' CSS is gone from `coachhelm.css` (and one rule each from
  `coachhelm-dive.css` and `coachhelm-track.css`); `coachhelm-patterns.css` is
  deleted.
- Tests: the cases that only rendered a board are deleted. The write contracts
  run on the shared action row (`coachhelm-focus-actions-row.test.tsx`),
  Re-check reads on `RecheckReads`, proposal answers on `ProposalRow`, the view strip on Your
  week.

### Why

- The owner: the golf hole is the coach's Team page and Your week is a player's
  Board. A worker polished the old player board on 11 Nov, a page no player can
  reach.

### Not done, and what is still old

- A coach's Standing and Deep dive of one player are not removed: the player
  file's "Full standing" link is the only way to the full standing ladder and
  "How {first} plays", and the file has no equivalent. Waiting on the owner.
- The route loading skeletons (CH-13401, CH-13402 in `CoachHelmSkeleton.tsx`)
  still draw the retired boards' shapes before the hole or Your week lands.
- `loadCoachCoachHelm` and `loadPlayerCoachHelm` stay in `data/coachhelm.ts`,
  marked retired; no page reads them.
- The course plan (`coachhelm_course_plan_v1`) has no page: both boards that
  drew it are gone, and its server actions remain.
- Your week draws its "didn't load" card when CoachHelm is off for the player;
  the old board said "CoachHelm is off for your team" (CH-13304).

### Verification

- `npm run test:file` on the CoachHelm tests and the Clubhouse source guards:
  exit 0 after each commit (221 files on the last run).
- Dev server: `/clubhouse-preview/coachhelm` answers 307 to `coachhelm-team`;
  `coachhelm-team`, `coachhelm-player` (Your week), `coachhelm-player?view=standing`
  and `?view=deep-dive`, `coachhelm-ask`, `coachhelm-read`,
  `coachhelm-player-file`, `coachhelm-track` and `coachhelm-brief` answer 200.
- No screenshots: no surviving page changed its look.
