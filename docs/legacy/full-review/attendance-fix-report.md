# Agent A: attendance — DONE

## Schema source of truth

Live `golf_event_attendance` columns (per `src/lib/types/database.ts:6755-6791`):
`id, event_id, player_id, status, checked_in, checked_in_at, notes, notified_at, rsvp_at, created_at`.

Note: there is a stale `src/lib/types/database.types.ts` that still lists `responded_at`,
`absence_reason`, `reminder_sent`. The Supabase client is wired to `database.ts`
(`src/lib/supabase/client.ts:2`), and `getPlayerEventRSVP` in `golf.ts:2949-2965`
already uses `rsvp_at` — confirming `database.ts` is the live truth.

The migration history shows older `023_golf_events.sql` had `responded_at`/`absence_reason`/
`reminder_sent`, but the production schema has since been migrated to the columns
listed in `database.ts`. We follow `database.ts` per task instructions.

## Fixes

- `src/app/golf/actions/attendance.ts:43-44` — replaced `AttendanceRecord` interface
  fields `absence_reason`, `responded_at`, `reminder_sent` with the live columns
  `checked_in`, `checked_in_at`, `rsvp_at`, `notes`, `notified_at`.
- `src/app/golf/actions/attendance.ts:95-110` (`checkInPlayer`) — write `rsvp_at`
  instead of nonexistent `responded_at`, and additionally set
  `checked_in: true` + `checked_in_at: now` so check-in actually persists.
- `src/app/golf/actions/attendance.ts:152-167` (`bulkCheckIn`) — same fix as
  `checkInPlayer`: `rsvp_at` + `checked_in` + `checked_in_at` in the upsert
  records.
- `src/app/golf/actions/attendance.ts:228-237` (`markNoShow`) — removed the
  `updated_at` write (column doesn't exist in live schema) and added
  `checked_in: false`, `checked_in_at: null` so a no-show clears any prior
  check-in flag, keeping reports accurate.
- `src/app/golf/actions/attendance.ts:275-298` (`getAttendanceReport`) — replaced
  `select('*')` with explicit live columns; report now returns `rsvp_at`,
  `checked_in`, `checked_in_at`, `notes`, `notified_at` instead of the blank
  `responded_at` it was returning before.
- File header docstrings refreshed to describe the live schema; the misleading
  comment claiming "no checked_in / checked_in_at columns exist" was removed
  (those columns DO exist).

## QR decision

DELETED — `verifyQRCodeCheckIn` was a stub that always returned an error. Searched
all of `src/` for callers of `verifyQRCodeCheckIn`, `qr_token`, `qrToken`,
`QRCode`, `QrCode`, and `'qr_code'`. The only matches were inside `attendance.ts`
itself (the stub function and a `'qr_code'` literal in the `CheckInMethod` union
type). There is no QR-scan page, no QR component, no fetch/action wiring — it is
dead code with zero consumers.

Removed:
- `verifyQRCodeCheckIn` function (was at the bottom of the file).
- The `'qr_code'` member of the `CheckInMethod` union (now `'manual' | 'self'`).

This is the smaller blast radius (option B) per the decision rule. No migration
needed. If QR check-in is added later it should be re-introduced as a real
feature with a token table or column at that time.

## Verification

- `npx tsc --noEmit` — clean for `src/`. All remaining TS errors are in
  `helm-vid/` (separate sub-project) and `.next/` (generated). Zero errors in
  `src/app/golf/actions/attendance.ts` and zero new errors anywhere under `src/`.
- No new test added — the change is a schema-rename + dead-code deletion, both
  covered transitively by integration smoke checks. Recommend adding a
  Playwright/RSC test for coach bulk check-in once the calendar route's
  attendance modal lands a stable selector.

## Verification suggestion

You can ask me to verify the calendar check-in flow end-to-end (browser →
`bulkCheckIn` action → `golf_event_attendance` row → `getAttendanceReport`
render) once the dev server is up.
