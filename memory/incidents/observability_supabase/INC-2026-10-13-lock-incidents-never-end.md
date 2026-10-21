# INC-2026-10-13 — Bridge lock incidents never end (TELEMETRY_DEFECT)

- Feature: `observability_supabase`
- Also affects: `admin_platform`
- Surface: `/admin/database` Locks & Transactions panel (`src/lib/admin/database/locks.ts`)
- Classification: TELEMETRY_DEFECT (the Bridge misreported; no product behaviour was wrong)
- Status: released: b7dbb350b (#2191) is in production 87bd60345 (release:status, 2026-10-15 00:45Z); 0 open lock incidents in the 24h to then
- First seen: the panel shipped with the defect (20260903191000); found 2026-10-13
- Evidence (production, read-only, 2026-10-13T17:40Z): `helm_debug.db_lock_incidents` held 129 rows with `resolved_at` null, newest `detected_at` 2026-10-05T13:10Z, 0 in 24h; the panel read "OPEN INCIDENTS (AT LEAST) 100".

## Root cause

Nothing writes `resolved_at` (locks.ts said so in a comment). `fetchLockIncidents`
counted `resolved_at is null` as open, so every lock incident ever recorded stayed
open forever and the tile saturated at the reader's page ceiling.

## Fix

`record_db_lock_incident` re-stamps `detected_at` on a matching unresolved incident
seen again within 15 minutes, and `db-health-sampler` runs every 5 minutes. An
incident is now active only while unresolved and re-stamped inside
`LOCK_INCIDENT_ACTIVE_WINDOW_MS` (15 min); older unresolved rows render "ended".
The floor flag holds only when every row on a full page is active. No schema change.

## Regression test

`src/lib/admin/database/__tests__/locks.test.ts` (3 cases failed on main);
replay `replay/manifests/lock-incidents-active-window-2026-10-13.yml`.
