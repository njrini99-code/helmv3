# 2026-10-24 — Team Hub and Calendar drop a round trip

## 2026-10-24 — Reads that wait on nothing go in the first wave (C2)

```text
Design package: none (Clubhouse A+ Phase 3, C2, row 16)
PR/commit:      agent/aplus-phase3
Contract IDs:   none
Actions:        none
Data impact:    none (the same reads, sent earlier)
Held items:     a speed trace on an iPhone
```

### Changed

- Team Hub read the team's clock, then everything else. The clock is now read
  beside the team, roster, documents and updates; only the formatting after
  waits for it. One round trip fewer on every Hub load.
- A Calendar deep link (`?event=`) read its event after the first wave. It now
  starts with the first wave; its day is placed in the team's zone after.
- Roster's two waves stay: the season's rounds need the roster's ids.

### Verification

- `c2-first-wave.test.ts` (wave depth); `hub`, `wiring-p010-hub` and the four
  Calendar suites pass.
