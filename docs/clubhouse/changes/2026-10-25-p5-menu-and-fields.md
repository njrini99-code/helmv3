# 2026-10-25 — Shared: menu feel and the tournament fields stylesheet (P-5)

```text
Design package: P-5 build plan (P-05-tournaments-from-calendar)
PR/commit:      claude/clubhouse-tournaments-from-calendar
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

## Changed

- `Menu` items take `feel` (`select`, the default, or `warning`), the haptic a
  choice plays; Remove the last round uses `warning`.
- `styles/tournament-fields.css`: the tournament section's rows, rounds list,
  notices and the round pill, loaded by the calendar route and the preview. No
  left accent borders; hairlines, type roles, radius, spacing and focus come
  from the Clubhouse tokens.
