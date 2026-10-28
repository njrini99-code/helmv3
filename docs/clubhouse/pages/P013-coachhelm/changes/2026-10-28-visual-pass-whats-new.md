# 2026-10-28 — What's new: visual pass (row chevron contrast)

## 2026-10-28 — Pre-deploy visual pass, area B (What's new)

```text
Design package: none (visual pass 2026-10-28, RUBRIC.md H8)
PR/commit:      visual-pass-2026-10-28
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- A What's new row's chevron is its only mark that the row opens. The Ledger
  kit draws it in ink-400 (`ui.css` `.ch-lgr__go`), 2.75:1 on the phone page
  and 3.0:1 on the desktop canvas, under the 3:1 floor for icons. On What's
  new it now takes ink-500 (5.4:1 or more in both themes), scoped in
  `whats-new.css` (`.ch-wn .ch-lgr__go`). The same change for every Ledger row
  is requested from the owner of `ui.css`.

### Verification

- Before/after captures of `whats-new` at 393 and 1280, light and dark
  (`/home/claude/vp/before/…`, `/home/claude/vp/after-B/…`).
- stylelint clean on `whats-new.css`; `whats-new.test.tsx` passes.
