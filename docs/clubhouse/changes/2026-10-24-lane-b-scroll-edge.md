# 2026-10-24 — One scroll-edge shade for floating bars (row 41, partly)

## 2026-10-24 — the phone bar, Track's bar and the setup dock on one shade

```text
Design package: none (Clubhouse A+ handoff, row 41; lane B, logged by S1)
PR/commit:      b493234ef (agent/clubhouse-aplus-phase2, #2361)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     the desktop top bar was finished by S1 on 2026-10-24 (2026-10-24-desktop-topbar-edge.md)
```

### Changed

- tokens.css: `--ch-scroll-edge-h` (14px) and `--ch-scroll-edge-down` / `-up`, one frame-tinted shade. The phone top bar's scrolled shade reads it; Track's sticky bar and the phone setup dock drop their hard hairline for the shade.
- New scroll-edge.test.ts.

### Why

- Row 41: a soft shade under floating bars instead of a hard hairline.

### Verification

- scroll-edge.test.ts. Needs a look on Track and Round setup.
