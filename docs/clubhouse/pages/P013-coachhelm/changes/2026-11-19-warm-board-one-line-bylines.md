# P013 CoachHelm — Changelog

## 2026-11-19 — A revisit shows the last board; This week bylines on one line

```text
Design package: none
PR/commit: agent/clubhouse-native-polish
Contract IDs: TEAM-17
Actions: none
Data impact: none
Held items: none
```

### Changed

- `app/golf/(dashboard)/dashboard/coachhelm/page.tsx`: `unstable_dynamicStaleTime = 30`. A section switch back to CoachHelm within 30 s paints the board it showed, from the router's copy. Nothing is read and nothing is recorded, so CH-R1 holds: CoachHelm is still never fetched ahead or refreshed unasked. Past 30 s it is read as it opens (E-3, F-15).
- `team/Stories.tsx`, `styles/coachhelm-team.css`: a This week tile's week sits under its title on one line, and the byline is the coin and the first name, ellipsized, so a 138px tile never stacks "Cole · / Week of / Nov 11" (F-14, E-9).

### Why

- Audit 2026-11-19 F-15 (CoachHelm held its skeleton about 3 s on every visit) and F-14.

### Verification

- `shell/__tests__/warm-sections.test.tsx`; the CoachHelm suite.
- `npm run clubhouse:check`. WebKit before and after numbers are in the PR body.
