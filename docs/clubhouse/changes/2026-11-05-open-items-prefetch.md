# 2026-11-05 — Shared

## 2026-11-05 — Rows in a long list no longer prefetch on sight

```text
Design package: none
PR/commit:      agent/clubhouse-open-items
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

Every `<Link>` on screen prefetched its page, one RSC request a row: about 20 on
opening Ask's history alone. Ask's history, the shared Ledger row (Roster, Team
rounds, Stats), round cards, Home's rows, Hub, Tournaments, Qualifiers and the
CoachHelm rails now set `prefetch={false}`. Links still navigate; the press
prefetch and the idle first rows still fetch what a reader is about to open.
