# 2026-10-30 — Night contrast token pass

## 2026-10-30 — Dark ink ramp, tab ink, switcher fill, eyebrow and on-green meta tokens (F-0005, F-0015, F-0035, F-0036, F-0041, F-0043, F-0062)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0005, F-0015,
                F-0035, F-0036, F-0041, F-0043, F-0062; fix plan PR 3)
PR/commit:      claude/audit-fix-03-night-contrast (#2414)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- tokens.css, dark: ink 900 #f1ecdf, 700 #e2dccd, 600 #d0c9b8, 500 #bab3a4, so
  body text on the night workspace reaches Lc 75 (owner decision 1 default: Lc
  75 for neutral body text, Lc 60 for coloured figures, meta and eyebrows).
- tokens.css: --ch-tab-ink is the secondary ink at night and the dark
  --ch-tab-ink-selected override is gone, so the chosen tab falls back to
  forest-800 (F-0043). The dark switcher fill runs fill-600 to 700 with
  #f9f7f1 ink (Lc 75+).
- tokens.css: --ch-ledger-eyebrow is #5f5230 by day and #c9b88a at night
  (F-0035); light --ch-chart-loss is #744a06; new --ch-on-green-ink-meta
  (#d3e3d7) for meta on the green plates.
- ui.css: the section-number coin uses fill-700; a dark .ch-znbig rule keeps
  the big figure on the pale forest ink (F-0005, F-0062); the dark shortcut
  hint (kbd) reads on its plate without a new shadow (F-0036).

### Why

- The audit measured section numbers, tab labels, eyebrows and body text under
  3:1, 4.5:1 or Lc 75 in dark mode. Three roots: the dark ink ramp, tokens
  that turn pale mint at night, and opacity on text.

### Verification

- src/clubhouse/__tests__/contrast-tokens.test.ts (new APCA Lc and WCAG pairs,
  one per finding, plus an opacity-on-text ratchet): red on main, green after.
- shell-reach-css eyebrow pin updated to the new token; elevation-tokens
  home.css raw-shadow ratchet lowered 16 to 15.
