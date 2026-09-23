# INC-2026-09-15 — single phone falsely write-blocked as "updated on another device"

- Feature: `shot_tracking`
- Also affects: `golf_round_lifecycle`
- Status: repaired locally; not deployed (production deploy is owner-authorized).
- Risk: R2 — player-facing write path (no schema / server change)
- First reproduced: 2026-09-15 (Hampden-Sydney, post-round stat entry; every
  phone blocked at the "This round was updated on another device. Reload to
  continue." banner, laptops fine)

## Symptom

A single phone, with no other device touching the round, hits the permanent
B2 write-block banner during shot tracking. Reload clears it and it recurs
the next time the phone is locked or the app is switched mid-entry. Prod
`error_logs` for the affected iPhone (Capacitor UA) show `TypeError: Load
failed` at `auto-save initial attempt` on `/golf/dashboard/rounds/new` — a
foreground save the browser killed mid-flight with an unknown outcome.

## Earliest incorrect state

The client's optimistic-lock token (`lastServerUpdatedAtRef`) falls behind the
server's `updated_at` after a write whose outcome this device never read:

1. A killed foreground save (`Load failed`) that actually landed — never
   recorded as pending, so the next poll/save saw "someone else wrote".
2. iOS firing both `visibilitychange: hidden` and `pagehide` — two beacons
   bumping `updated_at` twice, while the B9 boolean forgave exactly one.
3. A status poll and a save in flight under the same old token both seeing
   the mismatch; the second one blocked.

## Repair

Client-only. Every foreground save goes through `savePartialRoundTracked`,
which marks a pending unreadable write on a recognised transport loss
(`isUnreadableWriteFailure`, `src/lib/golf/round-write-outcome.ts`); the
beacon marks it too and is sent once per hidden period. On the next apparent
conflict with that flag set, the client adopts the server's CURRENT
`updated_at` and retries instead of blocking. The beacon deliberately still
carries NO lock token — a rejection with no reader would silently drop the
last shots before a phone lock (the 2026-06-10 lost-round mode). A device
PROVEN behind is still blocked (B2 kept).

## Regression evidence

`continue-round-client.conflict-block.test.ts`,
`new-round-client.hardening.test.ts` (wiring), and
`src/lib/golf/__tests__/round-write-outcome.test.ts` (classifier).
