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

The page under a push dims with a veil whose opacity moves, not a `filter`, in
the
tap push, the swipe back and the view-transition pop. `--ch-vt-push-dim` is
gone.
`Swap`, the Player File collapse and the Ask composer no longer animate
`height`:
`Swap` takes the new height at once, the file section fades and moves 8px, and
the
composer sizes with `field-sizing: content` where the browser has it. Segmented
labels change colour as the pill lands, so they hold contrast for the whole
glide,
and the pill moves with a translate and its width, no scale. Home's segments are
44px tall.

Tap to first moving frame: the copy of the page is taken a frame after the tap,
so the press state paints first. A thread's settle hold runs on scroll, not a
frame loop. Transitions name `background-color`, not the `background` shorthand,
and the buttons no longer transition `background-position`. The sliding plate
keeps main's translate and width.

Messages: the thread no longer runs its make-room animation when its first
messages land, and a new message folds into the running move instead of adding a
second animation, so it stays on the compositor. The Jump key no longer flashes
in while a thread opens.

Each segmented label now takes its new ink as the pill crosses it, set from the
glide itself. Player Home's segments are 44 tall. The numbers are in
docs/clubhouse/motion/2026-11-07-shell-motion.md.
