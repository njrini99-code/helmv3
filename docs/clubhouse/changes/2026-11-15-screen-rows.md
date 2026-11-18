# 2026-11-15 — screen rows

## 2026-11-15 — Controls without letterpress, one glass, a field ring

```text
Design package: clubhouse-handoff/prod-audit-2026-11-15/CLUBHOUSE-PROD-AUDIT-FINAL.md; MOTION-AND-VISUAL.md 4.1 and 4.5
PR/commit:      claude/project-thread-d9q2qs
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Segmented labels, a chosen date and a chosen text-field row carry no text
  shadow in either theme (SYS-05): the five letterpress edges in `controls.css`
  are deleted.
- `--ch-field-ring` (a 1px `--ch-border-control` ring) is the edge of an
  outlined field.
- The message-only glass fallbacks (`--ch-glass-blur-msg`,
  `--ch-glass-saturate-msg`, deleted in 4.1) are gone from every read: each
  surface reads the one glass.

### Why

- The production audit's SYS-05 and MOT-16, and MOTION-AND-VISUAL 4.1 (one
  material).

### Verification

- Unit: the CSS suite (segmented weight, glass, ratchets).
- Before and after screenshots at 393 and 1440, light and dark, Chromium (tier
  C), in the PR.
