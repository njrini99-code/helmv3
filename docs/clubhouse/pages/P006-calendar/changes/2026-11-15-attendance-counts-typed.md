# 2026-11-15 — calendar

## 2026-11-15 — Attendance counts call the applied function through the typed client

```text
Design package: none (release bookkeeping; no visible change)
PR/commit:      #2526, agent/release-bookkeeping
Contract IDs:   none changed
Actions:        none
Data impact:    none (reads only)
Held items:     none; 20261017102000 is applied in production (2026-11-15)
```

### Changed

- `data/attendance-counts.ts` calls
  `supabase.rpc('golf_event_attendance_counts', { p_event_ids })` from the
  regenerated `database.ts`; the untyped cast it used (the deleted
  attendance-counts-rpc shim in src/lib/golf) is gone. The Sentry ignore for the
  function's PGRST202 is removed, so a missing function pages again.
- The `missing` fallback (PGRST202 / 42883: read the rows) is unchanged. Since
  the migration, that read returns a player only their own rows.

### Verification

- `__tests__/attendance-counts.test.ts`, `__tests__/calendar-parity.test.tsx`,
  `__tests__/classes-parity.test.ts`.
