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
  notices and round cards, loaded by the calendar route and the preview. No
  left accent borders; hairlines, type roles, radius, spacing and focus come
  from the Clubhouse tokens.
- `screens/tournaments/RoundCard.tsx` (P-5 4.11.4): a round on the desk and the
  season home. A top label (day, round, status), a plate, the course and how
  it starts; the whole card is one link with a spoken name. A full hairline
  with the reading elevation, never a side bar: `round-card-guard.test.tsx`
  fails any card rule with a left border over 1px or an x-only inset shadow.
  Nothing renders it yet; 4.33's desk and season home take it.
