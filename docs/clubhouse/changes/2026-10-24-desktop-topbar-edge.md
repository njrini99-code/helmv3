# 2026-10-24 — The desktop top bar's scroll edge (row 41)

## 2026-10-24 — the desktop bar trades its hairline for a scroll-edge shade

```text
Design package: none (Clubhouse A+ handoff, row 41; FINISH_DIRECTIONS S1 item 3)
PR/commit:      agent/aplus-s1
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- shell.css: on desktop (821px and up) the top bar sits flush on the page with
  no bottom line, light and dark; once the canvas has scrolled under it, the
  shared scroll-edge shade (`--ch-scroll-edge-*`, the phone's) fades in below it
  on `::before`, at the quick duration, at once with reduced motion or
  Animations off. The night bar's hairline colour rule is gone.
- shell/large-title.tsx: `watchCanvasScroll` marks the bar `data-scrolled` from
  the desktop canvas's own scroll (Lenis eases the canvas's scrollTop, so its
  scroll events still fire). The shell's hook runs it on desktop and the
  large-title watcher on the phone, swapping across 820px.

### Why

- Row 41: one soft shade under every floating bar instead of a hard hairline;
  the desktop bar was the one left.

### Verification

- large-title.test (watchCanvasScroll, the desktop hook) and scroll-edge.test
  (the desktop rules). Needs a look on desktop Safari in light and dark: the bar
  at rest and after a scroll.
