# 2026-10-30 — Messages: hairlines, spacing and the thread measure

## 2026-10-30 — The #2409 polish back inside the stylesheet ratchets

```text
Design package: none (main CI after #2409; carried on every audit fix PR,
                #2412 to #2421)
PR/commit:      each claude/audit-fix-* branch
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- messages.css: the poll option shadows and two new inset rings draw their
  1px line as `var(--ch-hairline-w)`, the half-pixel hairline on a dense
  screen, like every other separator.
- messages.css: the poll question's top margin is 8 (was 10) and the poll
  foot's top padding 12 (was 10), on the spacing scale.
- messages.css: the thread and the composer share one measure,
  `--ch-ms-measure` (816px) set on the page roots, so no px page-sized
  max-width is written; the spacing-scale allowlist entry for messages.css is
  removed.

### Why

- #2409 left main red on three ratchets (hairlines 9 > 4, off-scale spacing
  11 > 9, page max-width 2 > 1), so every branch's unit tests failed.

### Verification

- hairlines.test, spacing-scale.test and elevation-tokens.test pass; the
  Messages suites pass.
