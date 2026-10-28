# 2026-10-28 — Visual pass: the add form's labels line up

```text
Design package: visual-pass-2026-10-28 (RUBRIC.md, premium-research/team-tabs.md)
PR/commit:      visual-pass-2026-10-28
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Phone add/edit form: the Stage label is inset 16px in 13/500 tertiary, the
  same as Notes and the grouped fields (it sat flush left in another style).
- Phone stage row chevron is ink-500 (ink-400 was 2.8:1 on the phone page).
- Checked and left: the stage chip is a label, not a control (the stage row and
  pipeline stages are 56 and 64px tall); the failed-read copy already matches
  on phone and desktop.

### Verification

- stylelint on recruiting.css: exit 0; recruiting tests pass via
  `scripts/test.sh`.
- Before/after: recruiting--add at 393, light and dark.
