# 2026-10-23 — Cross-screen rules (Clubhouse A+ WP-17)

## 2026-10-23 — One failure voice, Today on the phone, sortable headers (B10)

```text
Design package: none (Clubhouse A+ handoff, B10.3 to B10.5)
PR/commit: #2361
Contract IDs: none
Actions: none
Data impact: none
Held items: B10.1 (one place for the create action) and B10.2 (large
titles) wait on the owner's A25 answer
```

### Changed

- Failure notices say what didn't happen and what to do: 84 bodies drop
  "the error has been reported" and keep their own reassurance ("Posted
  rounds are safe. Try again."), and the week's "display problem" guess
  goes.
- The phone calendar has Today whenever it is away from today: another
  day on Day or List, another month on Month. It sits at the right of
  the year's line, out of flow, so the header does not move.
- The desktop roster table's Player, Avg, HCP and Rounds headers sort by
  their column (the Sort players orders), and the column sorted by says
  so with `aria-sort` and an arrow. The phone list and the table share
  one sort module (`screens/roster/sort.ts`).

### Why

- The same thing behaved differently from screen to screen: five ways to
  say a load failed, Today only on desktop, and sorting that worked one
  way on the phone and another on desktop.

### Verification

- New `error-copy.test.ts`; a calendar test for the phone's Today; a
  roster test that a header sorts and carries `aria-sort`.
- WebKit: Today appears only away from today and takes no room; the
  roster headers sort, the arrow's room is kept so labels don't move.
