# P001-shell — Changelog

## 2026-11-28 — 14px text stays 14px on the phone

```text
Design package: design lab foundation 1 (follow-up to QUEUE dsx-07)
PR/commit: fix/ch-14px-detail-role
Contract IDs: none new
Actions: none
Data impact: none
Held items: none
```

### Changed

- The command bar: the 2 rules that read the 14 step before dsx-07 now read the detail,
  `--ch-type-detail` (14/20 on phone and desk). dsx-07 had moved them to the
  callout, which is 15 on a phone, or in a phone rule to the footnote (13), so
  each is 14 on a phone again. Desk rendering is unchanged, and each rule keeps
  its weight through `--ch-fw-*`.

### Why

Owner, 28 Nov 2026: keep 14px text at 14px on the phone. The cross-page entry,
`docs/clubhouse/changes/2026-11-28-type-detail-role.md`.
