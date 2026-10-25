# 2026-10-24 — Three page widths (row 39)

## 2026-10-24 — every page main and form on reading, page or wide

```text
Design package: none (Clubhouse A+ handoff, row 39; lane B, logged by S1)
PR/commit:      bd1afc0ec (agent/clubhouse-aplus-phase2, #2361)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     Settings 640 -> 760 and the qualifier form 1080 -> 1200
                (decision J); three in-page pieces keep a raw width (Hub travel
                card, Messages composer, hero copy line)
```

### Changed

- tokens.css: `--ch-measure-reading` 760, `--ch-measure-page` 1200,
  `--ch-measure-wide` 1360; the unused `--ch-measure-form` is gone.
- 18 page mains and forms map onto them. Wide desktops only: 1240 pages 40px
  narrower; Home 1120 -> 1200, CoachHelm 1180 -> 1200, Recruiting 1320 -> 1360.
- spacing-scale.test.ts: the three tokens, each main's width, and a ratchet on
  other px max-widths of 700 or more.

### Why

- Row 39: fifteen page widths down to three.

### Verification

- spacing-scale.test.ts. Needs a look at 1280 and 1440.
