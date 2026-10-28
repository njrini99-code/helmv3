# 2026-10-28 — Shell: visual pass

## 2026-10-28 — Opaque team switcher, Ledger heading tracking, pushed-title ellipsis

```text
Design package: none (pre-deploy visual pass, rubric RUBRIC.md 2026-10-28)
PR/commit:      visual-pass-2026-10-28
Contract IDs:   none (no shell contract changes)
Actions:        none
Data impact:    none
Held items:     the sidebar fold still animates the sidebar's width (owner
                motion pass mot-01 chose it; a transform fold is an owner
                call); a long pushed title's ellipsis needs a look in iOS
                Safari at the largest Text Size
```

### Changed

- `styles/shell.css` `.ch-tsw`: the team switcher popover is opaque ivory
  (`#faf8f2`, the popover's own) instead of 97% over the green sidebar, and
  grows from the team button's left edge.
- `styles/shell.css` Ledger: the `main[data-canopy] h2, h3` letter-spacing
  (−0.022em at weight 0,2,2, which overrode every heading's role tracking) is
  now a zero-weight default (`--ch-track-section` for h2,
  `--ch-track-card-title` for h3), so a heading's own role tracking wins.
- `styles/shell.css` and `ui/PhoneBar.tsx`: a pushed bar title in plain words
  sits in `.ch-pbar__tt` and ends in an ellipsis inside its 52% slot.
- `styles/shell.css` notice: in a full-width InlineNotice, Try again is pinned
  to the row's end (it followed the 30rem measure and floated mid-row at 1280);
  narrow notices and the phone keep it under the words.
- Shared pieces the shell draws (phone popovers opaque, placeholder ink, the
  spinner under Reduce Motion, switch tracks) are logged once in
  `docs/clubhouse/changes/2026-10-28-visual-pass-system.md`.

### Verification

- vitest shell, native, team-switch, large-title, audit-a11y-motion,
  look-feel-pass-css (shell.css letter-spacing holdouts 5 → 4).
- stylelint and eslint on the touched files: clean.
- Chromium captures at 393 and 1280, light and dark: Home, Settings, Player,
  Calendar, Messages, Roster, Round, plus the bell, team switcher, palette and
  account menu (`/home/claude/vp/after-A`).
