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

- `__tests__/no-raw-sign-tone.test.ts` and
  `lib/__tests__/change-tone-zero.test.ts`.

## 2026-10-23 — Team average pooled per round (A3)

```text
Design package: none (Clubhouse A+ handoff, section 5, A3)
PR/commit: #2356
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- "Team average X over the season" and the spread's team marker read the
  loader's round-pooled `teamAvg`, not the mean of the players' averages.

### Why

- See docs/clubhouse/changes/2026-10-23-honest-numbers.md.

### Verification

- `roster.test.tsx`: "team average is pooled per round".
