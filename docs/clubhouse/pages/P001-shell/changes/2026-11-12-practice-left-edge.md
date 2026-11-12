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
