# 2026-10-28 — Visual pass: a 760 reading column and readable chevrons

```text
Design package: visual-pass-2026-10-28 (RUBRIC.md, premium-research/components-shell.md)
PR/commit:      visual-pass-2026-10-28
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     switch off-track contrast lives in the shared Switch (worker A); check the 760 column at iPad widths
```

### Changed

- Phone switch rows keep the shared 3:1 track edge (`--ch-switch-track-shadow`)
  on the off track and read `--ch-switch-on-bg` when on, instead of removing
  the edge (the off track was about 1.4:1 on the card).
- Desktop: the section column runs up to 760 (`--ch-measure-reading`) beside
  the 208 rail and 48 gap (was 640).
- Phone: row chevrons and the reorder handle are ink-500 (ink-400 was 2.8:1 on
  the phone page).
- The rank badge uses `--ch-green-100` instead of a raw hex.
- Checked and left: grouped rows and the Version row already exist on both
  layouts.

### Verification

- stylelint on settings.css: exit 0; settings tests pass via `scripts/test.sh`.
- Before/after: settings at 393 and 1280, light and dark.
