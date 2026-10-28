# 2026-10-28 — Visual pass: shared system (tokens, controls, overlays)

## 2026-10-28 — Contrast, opaque overlays and motion fixes in the shared layer

```text
Design package: none (pre-deploy visual pass, rubric RUBRIC.md 2026-10-28)
PR/commit:      visual-pass-2026-10-28
Contract IDs:   none (no behaviour or contract changes)
Actions:        none
Data impact:    none
Held items:     Reduce Motion spinner and the phone overscroll colour need a
                real iPhone (Safari/WebKit) look; the sidebar fold still
                animates its width (owner-approved mot-01, see findings A)
```

### Changed

- `styles/tokens.css`: placeholder ink `#736f66` → `#69655d` (light) and
  `#8f897c` → `#a09a8c` (dark), so field samples hold 4.5:1 on every surface
  (worst: phone inset 4.6, dark raised-2 4.7; were 3.98 and 3.78).
- `styles/tokens.css`: switch tracks reach 3:1 as WCAG 1.4.11 asks. The off
  track's inner edge is ink at 0.42 (3.7:1 on a card); at night the ivory at
  0.3 (3.5:1), and the on track is `#2e8459` (3.6:1 on a card; the deep accent
  was 2.75). The dark on-track's black inner ring is gone.
- `styles/tokens.css`: new shared underline-tab tokens (`--ch-tab-font`,
  `--ch-tab-ink`, `--ch-tab-ink-hover`, `--ch-tab-ink-selected`, `--ch-tab-bar`,
  `--ch-tab-bar-h`, `--ch-tab-gap`) so the profile and Hub tab rows can share
  one language; the bar is the light green at night (7:1; the deep fill was
  2.99:1 on the workspace).
- `styles/tokens.css`: the phone `<html>` canvas is the phone page `#ede9df`
  (was `#f4f1e8`), so a rubber-band shows no paler band; sign-in and
  onboarding keep their own ivory.
- `styles/controls.css`: phone popovers and menus are opaque (the sheet ivory by
  day, the raised surface at night) instead of the unblurred glass token (H16).
- `styles/base.css`: the one spinner keeps turning under Reduce Motion (OQ-18,
  H19); Animations off still stops it. `.ch-sheet` (a reading card) takes the
  card radius 16 instead of 20 (H17).
- `styles/ui.css`: the scoreboard's under-par disc starts at `#c4493b` (the
  eagle's top), so its ivory numeral holds 4.5:1 across the gradient (4.58; the
  top was 3.89).
- `styles/ui.css`: avatar initials floor at 12px on the phone (a 26px coin drew
  10.92px), through `--ch-av-floor`, so no new raw font shorthand.
- `styles/shell.css`: an InlineNotice's Try again is pinned to the row's end,
  centred on the words, which keep their 30rem measure; under 640px and on the
  phone it stays under the words. At 1280 it had floated mid-row.
- `ui/PickerHost.tsx`: the date and time picker grows from its field's corner,
  bottom left when it flips above the field.
- `ui/PhoneBar.tsx` (with `.ch-pbar__tt` in `styles/shell.css`): a pushed bar
  title in plain words ends in an ellipsis instead of being cut.
- `ui/SwipeRow.tsx`: a shutting row keeps its action behind it until it has slid
  home, so no blank strip shows on close.
- `ui/Spinner.tsx`: comment only (the Reduce Motion rule above).

### Verification

- `g3-contrast.py` (dicts updated to the new values): every placeholder pair
  passes; 155 pairs below threshold of 1058, down from 177.
- vitest: states (notice), avatar-sizes, contrast-tokens, look-feel-pass-css (shell.css letter-spacing
  holdouts ratchet 5 → 4), one-spinner, motion-durations-pinned,
  canvas-color-sync, menu-origin, large-title, audit-a11y-motion, SwipeRow,
  controls-consistency, shell, native, team-switch.
- stylelint (clubhouse config) and eslint on the touched files: clean.
- Before and after captures in Chromium at 393 and 1280, light and dark
  (`/home/claude/vp/after-A`).

### Lead follow-ups (same pass)

- Ledger row chevron (`.ch-lgr__go`) reads ink-500 (was ink-400, 2.75:1).
- Week strip: the selected day's letter (`.ch-wks__d.is-on em`) reads the full on-green ink (was the muted ink, 4.23:1 light and 3.22:1 dark).
- The type-role ratchet counts `font: var(--ch-tab-font)` as a role, so tab rows can share the tab token.
- Framed page title (canopy h1, shell.css) scales with the reader's text size: `calc(44 * var(--ch-type-k))` instead of a raw 44px.
