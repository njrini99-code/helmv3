# Supabase Drift Guard

`npm run db:drift:check` (→ `scripts/db/check-supabase-drift.mjs`) is a
read-only script that connects directly to Postgres and asserts a fixed
list of production-correctness invariants discovered during the 2026-07
stabilization pass. It never writes.

## Why this exists, and why it doesn't use `schema_migrations`

`docs/audits/SUPABASE_DRIFT_REPORT_2026-07-03.md` found that local
migration filenames and the versions actually recorded in
`supabase_migrations.schema_migrations` are systemically mismatched for
almost every migration since 2026-05-26 (same migration, same name,
different applied timestamp). That makes `supabase migration list
--linked` and any ledger-diffing approach unreliable for answering "is X
actually live in production?" on this project.

This guard instead queries `information_schema` and `pg_proc` directly —
the same method used to verify #651/#728/#772/#732 in the drift report —
which reflects reality regardless of how migrations were bookkept.

## Running it

```bash
# Either:
DATABASE_URL=postgresql://... npm run db:drift:check

# Or:
SUPABASE_PROJECT_ID=qmnssrrolpinvwjjnufo SUPABASE_DB_PASSWORD=... npm run db:drift:check
```

Get the DB password from Supabase Dashboard → Project Settings →
Database → Connection string. Never commit it; export it in your shell
or a local, gitignored env file.

Exit codes: `0` all checks passed, `1` one or more checks failed (see
printed report), `2` missing credentials.

## What it checks today

- **#651** — the 12 Baseball columns found missing in production exist.
- **golf** — the historically-documented golf drift shape holds (expected
  columns present, previously-dropped columns/tables stay dropped). This
  is the extensibility point called out in the drift report: the guard is
  a framework, not Baseball-only.
- **#728** — `recalculate_baseball_season_stats` has no `b.so` reference.
- **#772** — `can_manage_baseball_lift_group` doesn't reference
  `baseball_strength_groups` outside a comment; `baseball_accept_staff_invite`
  doesn't reference `v_invitation.invitee_email`; `baseball_staff_invitations`
  has a canonical `email` column.
- **#732** — no live function references a phantom `public.rate_limits`
  table (and the table itself still doesn't exist).
- **Admin rollup RPCs** — all `get_admin_*_rollup` functions Helm Bridge
  depends on exist, and every one of them (directly or via
  `__admin_rollup_b_gate()`) checks `is_super_admin()` — not solely
  `users.role = 'admin'`. This is the root-cause fix for PR #736: before
  the `admin_rollup_consistent_super_admin_gate` migration, six of the
  eleven rollup RPCs would 42501 the instant `users.role` drifted away
  from `'admin'` for the allowlisted super admin, even though the
  app-layer `requireSuperAdmin()` gate (which only checks
  `SUPER_ADMIN_USER_IDS` + `admin_allowlist`) would still pass — exactly
  reproducing the original incident.
- **`guard_users_role_self_change`** — the trigger blocks a super admin's
  own onboarding/profile-update flow from silently self-demoting away
  from `admin`, not just self-*escalating* to a role outside
  player/coach. The original trigger explicitly allowed `NEW.role IN
  ('player', 'coach')`, which is precisely how baseball onboarding
  clobbered `admin` → `coach` in the #736 incident — that specific
  transition was never actually blocked until this fix.
- **`admin_allowlist` / `users.role='admin'` sync** — flags if the
  allowlist and the legacy role column diverge, so a future demotion is
  caught even though the RPCs no longer depend on `users.role` alone.

## Extending it

Add a new entry to the `CHECKS` array in
`scripts/db/check-supabase-drift.mjs`. Keep every check a plain `SELECT`
— this script must stay provably read-only. Follow the existing
`{ ok, detail }` return shape so failures print an actionable message,
not just a boolean.

## Related docs

- `docs/audits/SUPABASE_DRIFT_REPORT_2026-07-03.md` — the read-only
  verification pass this guard operationalizes.
- `docs/operations/2026-07-03-p0-service-role-key-rotation-runbook.md` —
  separate P0 secret-hygiene finding from the same stabilization pass.
