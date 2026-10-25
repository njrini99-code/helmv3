# 2026-10-24 — Team Stats: the scrambling gauge names its mark

## 2026-10-24 — "Previous", coloured only past the noise

```text
Design package: none (review of #2361, should-fix 2)
PR/commit:      agent/clubhouse-aplus-phase2
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Scrambling's gauge marks the team's own earlier period, so the mark reads
  "Previous" (the phone line: "Previous average 42%"), not "Tour".
- Its bar is green or amber only when the change clears its standard error,
  the same test as the change chip beside it (A1); otherwise neutral ink.
  Greens against the Tour benchmark still colour by side of the mark.

### Verification

- `screens/stats/__tests__/figure-gauge-tone.test.tsx`;
  `stats-total-only.test.tsx` updated for the gauge's new fields.
