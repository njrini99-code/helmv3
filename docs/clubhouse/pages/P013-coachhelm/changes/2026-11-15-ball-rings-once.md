# 2026-11-15 — coachhelm

## 2026-11-15 — The CoachHelm ball's rings play once on arrival or news, then rest (MAC-15, H393-007)

```text
Design package: none (production audit 2026-11-15, MAC-15, H393-007; spec S3.1)
PR/commit:      worktree-agent-a28a8e337f498ea91 (motion, ambient loops slice)
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     screenshots owed (quick chat header and Ask home ball, at rest after the rings)
```

### Changed

- `styles/coachhelm-ball.css`: the resting ball's two rings
  (`ch-ball-ripple`) play once instead of every 5.6 s forever. They play when
  the ball appears (mount, or the quick chat panel being shown again), half a
  loop apart as before, then nothing moves.
- `chat/BallMark.tsx`: a new `news` prop. A change draws the rings as new
  elements, so they play once more. The quick chat header passes the
  session's working state, so the rings play again as the mark comes back
  with an answer; Ask's home ball plays them on arrival only.
- The thinking loops (`ch-ball-breathe`, `ch-ball-thin`, `ch-ball-drift-*`)
  stay: `thinking` is only drawn while CoachHelm is working (the island's
  lead while a turn is live), and they end with the work.

### Why

- The rings rippled on every screen with the quick chat open, forever, an
  ambient loop that S3.1 retires.

### Verification

- `chat/__tests__/ball-mark-news.test.tsx` (new): a re-render with the same
  news keeps the same ring elements; new news draws new ones; only a resting
  ball has rings. `__tests__/ambient-loops.test.ts` (new): the rest rule plays
  `ch-ball-ripple` once and every `infinite` rule in the ball's sheet is under
  `.ch-ball.is-thinking`. Source and jsdom only; no browser or device run.
