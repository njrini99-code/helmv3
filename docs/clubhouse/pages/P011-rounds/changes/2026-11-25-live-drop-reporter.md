# P011-rounds — Changelog

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

- The shared live-channel helper gains channelDropReporter, the one-report-per-outage rule for a postgres_changes channel that supabase-js rejoins by itself. Rounds' own live feed is unchanged; the helper lives in its shared channel module.
- Nothing the user sees changes.
