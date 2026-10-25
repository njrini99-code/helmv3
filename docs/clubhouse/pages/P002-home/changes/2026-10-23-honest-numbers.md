# 2026-10-23 — Honest numbers (Clubhouse A+ WP-1)

## 2026-10-23 — Zero is no change (A2)

```text
Design package: none (Clubhouse A+ handoff, section 5, A2)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- A figure that shows as 0.0 on this page is neutral ink, never a gain or a
  loss. Its tone comes from `changeTone` with the digits it prints.

### Why

- The cross-page entry, docs/clubhouse/changes/2026-10-23-honest-numbers.md,
  holds the reasons.

### Verification

- `__tests__/no-raw-sign-tone.test.ts` and `lib/__tests__/change-tone-zero.test.ts`.

## 2026-10-23 — One change-signal rule (A1)

```text
Design package: none (Clubhouse A+ handoff, section 5, A1)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- A trend on this page compares the newer half of the window with the older
  half and calls it a change only past its standard error; otherwise "No
  clear change". First against last is gone.

### Why

- See docs/clubhouse/changes/2026-10-23-honest-numbers.md.

### Verification

- `strokes-gained.test.tsx`, `stats-team.test.tsx`, `stats-player.test.tsx`.
