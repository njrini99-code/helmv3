# 2026-11-07 — shared

## 2026-11-07 — Shell motion: a push animates transform and opacity only

```text
Design package: design-refresh/redesign-ui-sweep-2026-11-06
PR/commit:      agent/ch-shell-motion
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

The page under a push dims with a veil whose opacity moves, not a `filter`, in the
tap push, the swipe back and the view-transition pop. `--ch-vt-push-dim` is gone.
`Swap`, the Player File collapse and the Ask composer no longer animate `height`:
`Swap` takes the new height at once, the file section fades and moves 8px, and the
composer sizes with `field-sizing: content` where the browser has it. Segmented
labels change colour as the pill lands, so they hold contrast for the whole glide,
and the pill moves with a translate and its width, no scale. Home's segments are
44px tall.
