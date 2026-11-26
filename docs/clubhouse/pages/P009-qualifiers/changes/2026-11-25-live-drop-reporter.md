# P009-qualifiers — Changelog

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

- A qualifiers feed that drops now reports once per outage, after four failed subscribe statuses in a row, through channelDropReporter. CLOSED (leaving the page) is not counted.
- Nothing the user sees changes.
