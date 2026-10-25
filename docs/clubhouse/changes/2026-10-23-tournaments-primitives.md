# 2026-10-23 — DeltaChip and TrustChip

## 2026-10-23 — Two shared primitives for Tournaments (P016, plan 4.33 7.A)

```text
Design package: design/handoff v3 (Tournaments)
PR/commit:      branch claude/tournaments-build
Contract IDs:   CH-16801
Actions:        none
Data impact:    none
Held items:     none
```

### Added

- `ui/DeltaChip.tsx`: a signed difference against a baseline, toned green or
  amber only past one standard error (`deltaTone`), otherwise "Level". It always
  draws a 6 px triangle that points up for better and down for worse, whatever
  the sign, so the meaning never rests on hue (gain and loss are 1.31:1 apart in
  light).
- `ui/TrustChip.tsx`: Upcoming, Live, Suspended, Final or Official (D-84), with
  a quieter source label (Card, Coach, Estimate, Pasted) that never changes the
  tone. Live breathes on the live loop and stills under reduced motion.
- Their styles in `styles/ui.css` (`.ch-delta`, `.ch-trust`).

### Why

- Tournaments shows deltas and trust on every view; Stats and Qualifiers can
  adopt them later.
