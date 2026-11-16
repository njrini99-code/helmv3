# 2026-11-15 — rounds

## 2026-11-15 — Live round: a static ball, opaque course-view keys

```text
Design package: clubhouse-handoff/prod-audit-2026-11-15/CLUBHOUSE-PROD-AUDIT-FINAL.md; MOTION-AND-VISUAL.md 4.1 and 4.5
PR/commit:      claude/project-thread-d9q2qs
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     Merging the face-hold keyframes (PL-TRK-03) is motion work, left to the motion thread.
```

### Changed

- The ball's drop-shadow filter is a static 1px stroke (PL-TRK-07).
- The course view's back key and header glass are opaque deep green (0.92) with
  no backdrop blur (PL-TRK-03, MOT-16); the round bar keeps its blur.

### Why

- The production audit's rows (Nov 15), fixed to its specs, with Nick's
  MOTION-AND-VISUAL.md winning where the two differ.

### Verification

- Unit: the Rounds suite.
- Before and after screenshots at 393 and 1440, light and dark, Chromium (tier
  C), in the PR.
