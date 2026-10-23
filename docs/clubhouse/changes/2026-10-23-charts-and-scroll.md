# 2026-10-23 — One line chart, and scroll that rests (Clubhouse A+ WP-15, WP-16)

## 2026-10-23 — One line chart (B5)

```text
Design package: none (Clubhouse A+ handoff, B5)
PR/commit: #2361
Contract IDs: none
Actions: none
Data impact: none
Held items: RoundTrend stays on its own renderer (owner question); a
device pass at 60Hz (one scrub tick per point, nothing draws in)
```

### Changed

- `ui/charts/Line.tsx` is the one line chart. Better is up (a lower
  score sits higher with `lowerIsBetter`), a missing value is a gap,
  segments are straight, small multiples share a `domain`, ticks are a
  few round numbers, and a pointer, a finger or the arrow keys read a
  point with a scrub tick. A baseline's words sit beside it where the
  line leaves room, else in a key under the chart (P013 D3). Inside a
  control (`interactive={false}`) it is hidden and takes no focus.
- Stats, phone: the team trend draws on it. Recharts is gone from
  Clubhouse, and the chart loads with the page.
- Stats, desktop: the four leg cards draw on it with their shared scale.
- Roster and Home: every form line draws on it, and `FormRange` gives a
  table, list or leaderboard one score range and one set of round
  slots. The same height is the same score in every row, and a shorter
  line ends under the others' newest round.
- CoachHelm: the Ask trend and the Deep dive score strip draw on it.

### Why

- Eight hand-built line charts disagreed on direction, gaps, scales,
  ticks and scrubbing, so what a coach learned from one did not carry to
  the next.

### Verification

- `Line.test.tsx` (better up, gaps split the path, a shared domain maps
  a value to one pixel, distinct ticks with at least two over a stroke,
  a named image, a well-formed wash under a two-point segment, the
  hidden mode), `FormLine-range.test.tsx`, `one-line-chart.test.ts` (no
  Recharts in Clubhouse) and a render test that the Ask trend's
  reference words never sit on a drawn point.
- WebKit before and after shots: the team trend, the leg cards, the
  form lines on Roster and Home, the Ask trend and the Deep dive strip.

## 2026-10-23 — Scroll that rests (B8)

```text
Design package: none (Clubhouse A+ handoff, B8)
PR/commit: #2361
Contract IDs: none
Actions: none
Data impact: none
Held items: a desktop Safari pass with a trackpad; the Bell's list is
left as it is
```

### Changed

- Lenis runs its frame loop only while something moves: a wheel, a
  touch or a scroll call wakes it, and two still frames put it back to
  sleep. The canvas follows the page's height by observing it, deferred
  while the sidebar folds.
- The mono face is not preloaded.
- Messages rows and Rounds groups skip layout and paint off screen
  (`content-visibility: auto`, with size estimates).

### Why

- An idle page ran a frame callback 60 times a second.

### Verification

- `smooth-scroll-idle.test.ts` and `long-lists-css.test.ts`. Chromium
  (desktop Lenis, which the WebKit emulator does not run): a scroll
  from 0 to 800, then no frames while still.
