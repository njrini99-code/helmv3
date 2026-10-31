# 2026-10-23 — Honest numbers (Clubhouse A+ WP-1)

## 2026-10-23 — Standing's "Refreshed" day and one-decimal strokes gained (A20)

```text
Design package: none (Clubhouse A+ handoff, section 5, A20)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- "Refreshed" names the day in the team's time zone, not UTC.
- Strokes gained and the signed deltas print to one decimal on Standing and
  its ladder, with ahead and behind decided on the printed value.

### Why

- See docs/clubhouse/changes/2026-10-23-honest-numbers.md.

### Verification

- `coachhelm-standing-shape.test.ts`, `coachhelm-standing.test.tsx`.
