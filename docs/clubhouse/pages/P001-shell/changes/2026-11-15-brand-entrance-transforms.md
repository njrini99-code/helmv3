# 2026-11-15 — shell

## 2026-11-15 — Sign-in brand entrance on transforms only (MOT-15)

```text
Design package: none (production audit 2026-11-15, MOT-15)
PR/commit:      worktree-agent-a28a8e337f498ea91 (motion, ambient loops slice)
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     screenshots owed (desktop sidebar brand panel mid-glint, before/after)
```

### Changed

- `styles/shell.css`: the word's entrance (`ch-brand-focus`, now
  `ch-brand-rise`) rises the last 3px into place without the 3px blur filter.
  The glint (`ch-brand-glint`) is a band 250% of the panel wide slid on
  `translateX` from −78% to 18% of its own width, the same path it took as a
  `background-position` from 130% to −30%. Timing, curve and the hand-off pause
  are unchanged.

### Why

- A `filter` keyframe and a `background-position` keyframe repaint on every
  frame; transforms stay on the compositor.

### Verification

- `__tests__/ambient-loops.test.ts` (new): no keyframe in `shell.css`,
  `coachhelm-ask-v2.css` or `coachhelm-ball.css` animates `filter` or
  `background-position`. Source only; no browser or device run.
