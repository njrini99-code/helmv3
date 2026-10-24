# 2026-10-24 — Chart figures in even-width digits (row 113)

## 2026-10-24 — the Rounds ribbon and RoundZones ticks take ch-num

```text
Design package: none (Clubhouse A+ handoff, row 113; lane B, logged by S1)
PR/commit:      3e758fb17, fa775cd71 (agent/clubhouse-aplus-phase2, #2361)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The Rounds season ribbon's y ticks, day numbers and average chip, and
  RoundZones' y ticks, take the `ch-num` class (CONS-39); `svg .ch-num` keeps
  chart text on even digits though a later font shorthand resets it.

### Why

- Row 113: chart labels in tabular digits.

### Verification

- rounds-ribbon.test.tsx; the CONS-39 ratchet is unchanged.
