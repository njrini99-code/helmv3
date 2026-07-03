# Audit-log review — prod DB password rotation

**Date:** 2026-05-27
**Project:** `qmnssrrolpinvwjjnufo` (Helm-Production)
**Closes:** `docs/operations/2026-05-17-p0-runbook.md` § 1 last bullet
**Pulled via:** Supabase MCP, `mcp__supabase__execute_sql`

## Window audited

`2026-05-16 00:00 UTC` → `2026-05-28 23:59 UTC`. Covers both the
2026-05-17 leaked-credential rotation (legacy project
`dgvlnelygibgrrjehbyc`, now deleted) and the mid-session 2026-05-27
re-rotation of the current prod password on `qmnssrrolpinvwjjnufo`.

## What was checked

- `public.admin_events` — 10,122 rows in window
- `public.error_logs` — 10,060 rows in window
- `public.login_attempts` — 1 row in window
- `public.audit_log` — 0 rows (table empty, unrelated to rotation)

Filters: case-insensitive matches on `auth`, `login`, `password`,
`credential`, `role`, `rls`, `admin`, `session`, `token`, `service_role`,
`401`, `403`, `unauthorized`, `forbidden`, `jwt` across `event_type`,
`title`, and `message` columns.

## Findings

### 1. Successful logins — known accounts only

36 `event_type='login'` rows, all attributable:

| Account | n | First | Last |
|---|---:|---|---|
| `golf-player-codex-1779039696043@helm.test` (synthetic) | 11 | 17:45 | 17:53 on 2026-05-17 |
| `test@golfhelm.com` (dev account) | 10 | 20:59 | 21:08 on 2026-05-17 |
| `coach-ui-1779052308254@golfhelm.local` (synthetic) | 6 | 21:12 | 21:16 on 2026-05-17 |
| `golf-coach-codex-1779039332836@helm.test` (synthetic) | 5 | 17:36 | 17:38 on 2026-05-17 |
| `admin-ui-1779052548996@golfhelm.local` (synthetic) | 2 | 21:17 | 21:18 on 2026-05-17 |
| `rinin376@gmail.com` (Nick) | 1 | 14:36 | 14:36 on 2026-05-26 |
| `admin@helmsportslabs.com` (Nick / admin) | 1 | 20:27 | 20:27 on 2026-05-26 |

Zero logins on 2026-05-27 — consistent with the password being
unusable that day (no one needed to and no one tried).

### 2. Failed logins — none meaningful

`public.login_attempts` shows exactly one entry in window:
`testcoach@helm.test`, 1 failed attempt at `2026-05-17 17:30:46+00`,
no lockout. No spike, no novel email targets, no foreign IP.

### 3. Auth-flavored chatter — none

- `admin_events`: 0 rows with title containing
  `401`/`403`/`unauthorized`/`forbidden`/`service_role`/etc.
- `error_logs`: 0 of 10,060 rows in window with auth-flavored
  `message` content.

### 4. Background noise (not auth-related)

All 10K+ events in window are the same classes:

- `[v3.composite.synthesis.load] synthesizeForPlayer: load failed …
  Cannot read properties of null (reading 'startsWith')` — null-deref
  upstream of `synthesizeForPlayer`. **Already targeted by PR #105's
  composite null guard.**
- `[triggerPlayerInsightsAfterRound.skip-insufficient] … skipped N
  legacy records (insufficient sample_n)` — expected gating chatter
  logged at `error` severity. PR #105 lowers severity.
- `[pattern-miner.thresholds.starvation] 0 patterns produced for
  player 49ffe06d-…` — expected starvation log; one player's data
  shape never crosses `minSupport=0.05` at 28 rounds.
- `[insights.triggerPlayerInsightsAfterRound.gateMetrics] philosophy
  gate filtered N tier-1 insight(s)` — also targeted by PR #105
  `GATED_OUT` defense.

## Conclusion

**No evidence of credential abuse on the current production project
(`qmnssrrolpinvwjjnufo`) in the rotation window.**

The leaked credential from commit `76dbf1f3` was bound to the legacy
project `dgvlnelygibgrrjehbyc`, which Supabase has fully deleted.
That credential cannot be reused against the current project.

No further action required. The "Still recommended" audit on the
current prod project is now complete — closing the runbook checkbox.
