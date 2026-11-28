# Changelog

## 2026-11-27 — The insert between blocks shows on touch (dsx-08)

```text
Design package: design lab foundation (GAP-H1, GAP-P4), Nick 27 Nov
PR/commit: claude/project-thread-7b225i
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- The add-between control shows faintly on touch, where hover never revealed it.
- Hover looks sit behind `(hover: hover)`, so a tap on the phone never leaves a control stuck in its hover look.
- A control with no pressed rule of its own takes the shared pressed look, and a press lets go the moment the tap
  becomes a scroll.

Shared part: docs/clubhouse/changes/2026-11-27-headers-and-touch.md.
