# 2026-10-25 — Class awareness (P-10): shared pieces

```text
Design package: P-10 Class awareness (plan 2026-10-24, changelog 2026-10-25)
PR/commit: branch claude/clubhouse-class-awareness
Contract IDs: none
Actions: none
Data impact: none by itself; the flag class_awareness_v1 is delivered to the client by the shell
Held items: the migrations
```

## Changed

- `ClassStatusLine` and `ClassStatusRow` (ui/) draw the one status line and the
  one player row every class surface uses, so the coach views and the player's
  "Coaches see" preview read the same words for the same payload.
- `styles/class-awareness.css` holds the `.ch-ca-*` pieces several pages share.
- `ClubhouseMarker` carries `classAwareness`, read with `useClassAwareness()`.
  The flag registry is server-only, so the shell reads `class_awareness_v1` once
  (ChShellData) and hands it down; false means no RPC, no new column in a query
  and nothing drawn.

## Why

- One vocabulary and one flag path, so a surface cannot word the same moment two
  ways or fetch with the flag off.

## Held pushes (server)

- `src/lib/notifications/class-hold-core.ts` (pure: the hold instruction, the
  default classification by type, the "While you were in class" composer) and
  `class-hold.ts` (the gate `sendPushNotificationDirect` calls, the release, the
  minute job). With `class_awareness_v1` off nothing runs: no read, no RPC, no
  extra field, and a bulk push stays one recipient at a time.
- Every failure sends the push: an error, a 300 ms timeout (the hold is
  cancelled by id so a late commit cannot deliver twice), a missing function, a
  stale heartbeat. The release job is `/api/cron/class-holds-release` every
  minute; it writes the heartbeat first, because the gate holds a push only
  while that heartbeat is fresh.
- `delivered` on the push result is the one signal a push reached a device; the
  "Notified anyway" stamp keys on it.
