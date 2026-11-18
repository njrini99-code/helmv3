# Shell push edge token — Changelog

## 2026-11-16 — The pushing page's edge reads a token

```text
Design package: MOTION-AND-VISUAL 4.6 (S4.1)
PR/commit: claude/project-thread-10vtd2 (#2550)
Contract IDs: D-64
Actions: none
Data impact: none
Held items: none
```

### Changed

- `.ch-frame-route[data-ch-pushing]` draws its leading-edge hairline with
  `box-shadow: var(--ch-push-edge)`, the same `-1px 0 0 var(--ch-card-ring)`.
  It is now a token, so the CSS ratchet's raw-shadow count for `shell.css`
  stays at its record. Nothing looks different.
