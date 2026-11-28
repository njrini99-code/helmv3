# Changelog

## 2026-11-27 — The desk head is the shared page header; the compare grip shows on touch (dsx-08)

```text
Design package: design lab foundation (GAP-H1, GAP-P4), Nick 27 Nov
PR/commit: claude/project-thread-7b225i
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- Every view's desk head (`TourHead`) is the shared `PageHeader`, keeping its `.ch-tour-head` hooks and look.
- Compare's divider grip shows on touch, where there is no hover to reveal it.
- Hover looks sit behind `(hover: hover)`, so a tap on the phone never leaves a control stuck in its hover look.
- A control with no pressed rule of its own takes the shared pressed look, and a press lets go the moment the tap
  becomes a scroll.

Shared part: docs/clubhouse/changes/2026-11-27-headers-and-touch.md.
