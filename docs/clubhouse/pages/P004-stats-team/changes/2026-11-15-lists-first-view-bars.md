# P004 — Changelog

## 2026-11-15 — the phone's leg bars grow from zero on first view; a new window glides over 360 ms

```text
Design package: none (MOTION-AND-VISUAL 3.7)
PR/commit:      worker E2 "lists": ba84d5c80
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     before/after capture of a first view; D-tier check owed
```

### Changed

- `StatsTeamPhone.tsx` (Strokes gained by leg): on the screen's first view in a session each bar grows out from the zero
  line over 360 ms on the iOS curve (`useFirstViewGrow('stats-team-phone', 'x')`), never on a revisit, under Reduce
  Motion, with Animations off, or on a page the server drew. A window change glides over 360 ms on the iOS curve.

### Why

- Spec 3.7.

### Verification

- `stats-team`, `stats-phone-crash` and `motion-glide` tests pass. jsdom only.
