# 2026-11-12 — practice left edge

## 2026-11-12 — Practice's pages open on the shared desk left edge

```text
Design package: none (owner's preview walk, 11 Nov 2026, W40)
PR/commit:      agent/preview-fixes-ui
Contract IDs:   none
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- `styles/shell.css`: the desk rule that sets every page's left edge on the wide measure (`main[data-canopy]`,
  `main[data-ch-crh='on']`) now takes `main.ch-prc` too. Practice's pages were centred on their own and sat 76px right of
  every other page at 1920 (title at x 516 against 440), so the title jumped between tabs. Measured after: x 440 at 1920,
  x 280 at 1440, as Roster. Widths are unchanged.

## 2026-11-12 — Two page widths: normal and wide (W40, owner's choice)

```text
Design package: none (owner, 12 Nov 2026: "Two widths: normal + wide")
PR/commit:      agent/preview-fixes-ui
Contract IDs:   none
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- Reading pages keep `--ch-measure-page`; the boards share `--ch-measure-wide` (1360). `coachhelm-team.css`: the Team board's
  desk box drops its extra 48px to match Calendar and Recruiting. `stats-redesign.css`: Stats with a detail open stops at the
  wide measure instead of the window's edge (at 1920 the detail is about 580px; it was 360 to 420 before 11 Nov).
- Measured at 1920 in WebKit: Home, Roster, Practice 400 to 1600; Recruiting, Calendar, CoachHelm Team, Stats 400 to 1760.
