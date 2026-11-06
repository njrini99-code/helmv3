# Clubhouse cross-page changes

## 2026-11-06 — Redesign sweep: shared pieces the Team view needed

- `ui/Segmented`'s `lg` size is a flat track: the thumb is its only depth.
- `.ch-num` sets its tabular figures `!important` in `base.css`, on every
  Clubhouse screen: a screen's `font` shorthand was resetting them.
- `lib/chart-geometry`'s `placeLabels` takes a preferred place and obstacles.
- `shell/phone-chrome`'s `DeskTop` lets a screen use the desk's glass bar.
- `ui/Modal`'s `bare` draws no head or Close for a panel that has its own; the
  title stays for assistive tech.
