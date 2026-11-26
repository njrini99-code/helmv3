# P006-calendar — Changelog

## 2026-11-25 — Live feed drops reported once per outage (health routine)

```text
Design package: none (reliability fix, no visual change)
PR/commit: agent/health-20261125-2347
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- A calendar feed that drops now reports once per outage, after four failed subscribe statuses in a row, through channelDropReporter, instead of on every failure. The page still re-reads on every change and on Try again.
- Nothing the user sees changes.
