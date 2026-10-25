# 2026-10-25 — Shell: touch claim and Course back (A+ train)

## 2026-10-25 — Pull to refresh yields to a calendar drag; Course has a Back

```text
Design package: none (Clubhouse premium features, build plans P-4 and P-7)
PR/commit:      claude/aplus-preview
Contract IDs:   none (no shell contract changes)
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `PullToRefresh.tsx` reads the shared touch claim
  (`lib/touch-claim.ts`). While a calendar row's hold may still lift
  (`pending`) the pull waits; once the row has lifted, or the drag took the
  move, the pull stays off for that touch. A hold that turns into a drag never
  also pulls the page.
- `nav.ts` knows the course page (`/golf/dashboard/rounds/course/<key>`): it is
  a detail route for coaches and players, with no parent, so Back steps back to
  the round or the library it came from ("Round" for a coach, "Rounds" for a
  player) and the title is "Course".

### Why

- P-4 4.7.1: one finger is in charge at a time, and a drag must not also pull
  the page to refresh.
- P-7: the course history page is reached from a round or the library, so Back
  has to return there (D-41).

### Verification

- The shell tests and the P-4 and P-7 screen tests cover both.
- `npm run clubhouse:check`.
