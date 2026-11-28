# Changelog

## 2026-11-27 — Hover looks are pointer-only; every control answers a press (dsx-08)

```text
Design package: design lab foundation (GAP-H1, GAP-P4), Nick 27 Nov
PR/commit: claude/project-thread-7b225i
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- Hover looks sit behind `(hover: hover)`, so a tap on the phone never leaves a control stuck in its hover look.
- A control with no pressed rule of its own takes the shared pressed look, and a press lets go the moment the tap
  becomes a scroll.
- The round's CoachHelm says info key takes the linen wash while pressed.

Shared part: docs/clubhouse/changes/2026-11-27-headers-and-touch.md.
