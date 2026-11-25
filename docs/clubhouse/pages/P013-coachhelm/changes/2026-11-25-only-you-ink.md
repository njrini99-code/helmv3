# P013 — Changelog

## 2026-11-25 — "Only you" is readable on the plan card's head

```text
Design package: none (a contrast fix)
PR/commit: #2616, health routine, agent/health-20261125-0347
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- The "Only you" label on the player file's "Your plan for …" card takes
  the title bar's ink (`--ch-feature-ink-2`), as the other cards' metas do.

### Why

- look-09 gave the card heads the deep green bar. The label sets its own ink
  (`.ch-hf .vis`), so it kept the card's dark secondary ink on the green:
  1.23:1 in the light theme, on phone and desk. The presentation gate reported
  it on phone (run 45546172944, `file` and `file-long`, contrast).

### Verification

- `file-card-head-ink.test.ts` failed before the fix and passes after it.
- Playwright WebKit on `/clubhouse-preview/coachhelm-player-file` (and
  `?state=long`), 390 and 1440, light and dark: axe color-contrast named `.vis`
  on phone light before, and names nothing after. Not checked on a device.
