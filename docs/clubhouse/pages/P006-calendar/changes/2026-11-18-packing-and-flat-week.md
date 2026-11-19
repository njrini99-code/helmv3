# Calendar packing and flat week — Changelog

## 2026-11-18 — Overlaps side by side; one flat week (R-5, L-069)

```text
Design package: none
PR/commit: agent/clubhouse-polish-fixes (#2586)
Contract IDs: none
Actions: none
Data impact: none (layout and styles only)
Held items: none
```

Owner decisions, 18 Nov 2026:

- **Packing (R-5).** Overlapping events keep the 6 Oct cascade where columns are
  narrow. The Day view's one wide column sets
  them side by side (`TimeGrid pack`, `laneBox(..., packed)`), with no block
  lying over another. In the Week view, a pair
  of overlaps in a column 140px or wider also sits side by side; that is a CSS
  clamp switch in `laneBox`, like the
  cascade's 120px one. This means "Confirn" under "Confirm…" no longer clips.
  Three or more in a week column still
  cascade.
- **Flat week (L-069).** The desk week's light wash (owner, 8 Oct) is gone. The
  week and its pinned head sit on the
  canvas, with the ledger's seams.
- **Phone pill (L-069).** The phone Calendar's chosen-day pill fits its content:
  56 × type-k, down from 64.
