# Golf Round Lifecycle change ledger

## 2026-08-22 — suppress duplicate recovery after a confirmed scorecard

- SHA: `48b41e1c4d8c86f12f5a2becd11454f5bd3899e2`.
- Incident: `memory/incidents/shot_tracking/INC-2026-08-22-confirmed-snapshot-recovery-prompt.md`.
- Change: Continue Round now compares a local emergency snapshot to the
  server scorecard before offering recovery, clears only snapshots covered by
  an acknowledgement, and skips page-hide backup after all holes are durable.
- Why: iOS backgrounding after a confirmed 18-hole scorecard created a newer
  but identical fallback that blocked the submission summary with a false
  "Recover Unsaved Progress?" drawer.

## 2026-08-22 — require server-backed start and completed-hole checkpoints

- SHA: `a68d7c299` (implementation commit; amended after ledger stamping).
- Incident: `memory/incidents/shot_tracking/INC-2026-08-22-partial-save-round-deletion.md`.
- Change: the round parent is persisted before tracking starts, completed-hole
  writes are acknowledged before the player advances, and Continue Round is
  the normal unfinished-round recovery surface.
- Why: transient saves, app backgrounding, or browser closure must not make a
  started round disappear from the player’s server-backed round list.

## 2026-08-22 — preserve parent rounds on child-write failure

- SHA: `f06c9bf34b72e9b368d49db79fa9c0c88dc0e659`.
- Incident: `memory/incidents/shot_tracking/INC-2026-08-22-partial-save-round-deletion.md`.
- Change: partial-save hole and shot upsert errors retain the `in_progress`
  parent row and prior durable data; a local snapshot from a missing server
  round is discoverable through the player recovery path.
- Why: an active round must remain retryable after a transient save failure,
  including when a user has returned from sign-in without its local round ID.

## 2026-08-22 — active-round stale-shot reconciliation

- SHA: 31cf3f845f19af7ff962b362837210f333fc4fe5 (implementation repair commit).
- Incident: `memory/incidents/shot_tracking/INC-2026-08-22-delete-shot-stale-id.md`.
- Change: server-side `deleteShot` now returns the stable `shot_not_found`
  code when the user-scoped lookup finds no row. Undo and Edit Shot use a
  shared local single-flight guard, reconcile that specific stale reference,
  and wait for cascading edit writes before releasing the guard.
- Why: concurrent Undo/Edit actions could apply multiple local-history
  removals, while an already-completed delete surfaced as a misleading
  production server error to the golfer.

## 2026-08-22 — keep Continue Round on the durable checkpoint path

- SHA: `4276cec7e2556aa4b1dffc92851ba780d2a67b1a`.
- Change: New Round and Continue Round advance only after a completed-hole
  save succeeds. A retry preserves the original forward/return intent, and a
  later shot edit or delete removes its now-invalid completed score before
  any partial save. The Continue Round surface now uses the compact Fairway
  course/progress header and a neutral save-and-exit control.
- Why: active rounds need a single comprehensible persistence path and must
  never serialize both the old completed version and reopened progress of the
  same hole.

## 2026-08-23 — owner-bind and order device recovery snapshots

- SHA: pending commit on PR #1604; not deployed.
- Change: localStorage and IndexedDB snapshots now carry the authenticated
  golf-player identity, shared-device scans hide but do not delete another
  player's data, and browser-mirror saves/clears run in causal order.
  Pre-owner snapshots remain recoverable only for the exact server round after
  Continue Round has verified that player's ownership.
- Why: a delayed browser-database clear could erase a newer snapshot, while an
  unowned shared-device cache could be shown or accidentally re-homed by a
  recovery fallback.

## 2026-08-23 — protect completed round writes at the database boundary

- SHA: pending PR #1609 merge.
- Change: completed rounds and their child records reject direct writes. The
  atomic round RPCs set a transaction-local marker while running as their
  postgres owner; ordinary application roles cannot use that marker to bypass
  the guard.
- Why: a stale client, direct API write, or later feature must not overwrite
  completed score history or re-target a saved qualifier round.

## 2026-08-25 — recap persist crosses helm_private as a definer boundary

- SHA: pending commit (migration 20260825233000).
- Change: `public.save_round_ai_recap` is now SECURITY DEFINER with a pinned
  search_path; EXECUTE stays revoked from PUBLIC/anon and granted to
  authenticated + service_role. `helm_private` remains fully locked — no
  schema grants were added.
- Why: the invoker wrapper resolved `helm_private.save_round_ai_recap` with
  the caller's privileges, and 20260825052141's schema lockdown made that
  impossible for every authenticated user — all production recap persists
  failed 42501 (Sentry JAVASCRIPT-NEXTJS-PT, 9 users). See incident
  INC-2026-08-25-recap-persist-schema-permission in this feature's
  incidents directory.

## 2026-08-25 — privilege-contract suite, anon-grant normalization, rollback captures

- SHA: pending commit on fix/save-round-ai-recap-definer-facade.
- Change: added `supabase/tests/rls/golf_lifecycle_privilege_contracts.sql`
  (25 catalog-level assertions: helm_private schema closure; definer mode,
  owner, pinned search_path and role grants for the recap pair, heartbeat,
  submit_round_atomic and save_partial_round_atomic; the lifecycle guard
  stays private; two surface-wide zero tripwires). Added migration
  `20260825235900_revoke_anon_from_secdef_admin_helpers.sql` aligning
  `log_crm_stage_transition()` / `unresolve_admin_event(uuid[])` to
  production's no-anon contract. Added `supabase/rollbacks/` with the
  verbatim pre-fix production definition of `public.save_round_ai_recap`.
- Why: the 20260825233000 outage proved behavioral tests alone cannot be
  trusted for grant contracts here — local Postgres permitted an
  invoker-wrapper path production denied (open investigation P1-10).
  Contracts are now asserted against the catalog, the chain is aligned to
  the production privilege contract rather than the reverse, and a
  production rollback never requires git archaeology. Contract source: the
  live production catalog, read 2026-08-25.
