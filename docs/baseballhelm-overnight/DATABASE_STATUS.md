# DATABASE STATUS

_Verified 2026-07-29 ~00:30 EDT against migration source. The Supabase MCP
connection timed out three consecutive times during this check, so **live
`pg_policies` state is unconfirmed** — findings below are verified from
migration source, which is authoritative for what was applied but cannot rule
out an out-of-band hotfix. Re-verify against the live DB before acting._

---

## 🔴 P0 — TWO LIVE CROSS-TENANT DATA EXPOSURES

The most serious findings of the entire run. Both were introduced in the
`20260527000000_prod_public_baseline.sql` baseline and **no subsequent
migration replaces either** (verified: grepping `baseball_players_select` and
`baseball_teams_select` across every later migration returns nothing).

### 1. `baseball_players` — every program's roster PII is readable by any logged-in user

```sql
-- supabase/migrations/20260527000000_prod_public_baseline.sql:18179
CREATE POLICY "baseball_players_select" ON "public"."baseball_players"
  FOR SELECT TO "authenticated" USING (true);
```

`USING (true)` means **any authenticated user on any team** can
`SELECT * FROM baseball_players` and read every other program's full roster:
email, phone, GPA, SAT/ACT scores, height/weight, recruiting status.

The 2026-07-09 `baseball_players_recruiting_guard` migration does **not** fix
this — it adds a trigger raising `ERRCODE 42501`, which constrains writes, not
reads.

**Why this outranks everything else:** BaseballHelm is sold to a college
program on the promise that their roster is theirs. A demo of a product that
leaks every other program's player PII is not an incomplete product, it is a
liability — and it is the one finding that is worse to ship than to delay.

### 2. `baseball_teams` — every team's secret join code is world-readable

```sql
-- supabase/migrations/20260527000000_prod_public_baseline.sql:18377
CREATE POLICY "baseball_teams_select" ON "public"."baseball_teams"
  FOR SELECT TO "authenticated" USING (true);
```

`join_code` is the secret gating team membership. World-readable to any
authenticated user, it defeats the invitation model entirely: anyone with an
account can enumerate codes and join any program.

### 3. Staff-invite accept RPC has no email-ownership check

`supabase/migrations/20260624000081_baseball_staff_roles_scope_audit.sql:268` —
any authenticated user holding a leaked invite token can join any team **as
staff**. Combined with open self-signup, the blast radius is large.

---

## DECISION: prepared tonight, NOT applied unattended

**These fixes are being written and tested, but will not be applied to
production while the owner is asleep.** Reasoning, recorded so it can be
challenged:

- This is the **shared Golf + Baseball production database** with live users. A
  mis-scoped RLS policy does not fail safe — it locks legitimate users out of
  their own data, converting a confidentiality bug into an outage.
- `CLAUDE.md` mandates `db-migration-reviewer` review for any schema/RLS
  change. That gate exists precisely for this situation.
- The exposure has been live since **2026-05-27** (~2 months). The marginal risk
  reduction from applying at 00:30 unattended versus 09:00 with the owner
  present is small; the risk of breaking production overnight is not.
- The brief requires "migrations and reversible, reviewable changes" and
  forbids destructive production modification.

**This is the #1 item for the morning**, called out at the top of
`RELEASE_READINESS.md`. A decision deferred deliberately, not an item missed.

---

## Coverage gaps (P0/P1, from recon)

| Gap | Detail |
|---|---|
| RLS test coverage | **35% of `baseball_*` tables have zero pgTAP coverage** — including messaging, tasks, travel, announcements, invitations, dev plans. A cross-tenant hole in any of them would not be caught. |
| Lift Lab RLS | `helm_lifting_*` (the real Lift Lab schema — **not** `baseball_*`) is largely untested, **including `helm_lifting_set_results`** (the actual weight/rep data an athlete writes) and `helm_lifting_readiness_checkins`. |
| `vitest` rls project | Declared at `vitest.config.ts:99` but **never run in any CI workflow** — so the RLS tests that do exist gate nothing. |

## Dead schema (P1)

- **Elite stat event model** — 8 tables, ~10 dedicated migrations, **zero rows
  in production**. Significant schema/RLS/index investment backing a
  pitch-by-pitch analytics model that has never received a single row.
- **Signals → Actions → Decision-Log → AI-Audit** chain and staff/team
  invitations are **empty in production**.
- `scripts/seed-baseball-demo.ts:598` writes to **3 tables graveyarded
  2026-07-04** — the writes silently no-op while the script's own summary
  reports success.

## Identity model (P1, blocks Lift Lab integration)

- Deactivating a baseball player **does not** deactivate their Lift Lab athlete
  row (`src/app/baseball/actions/roster.ts:215`) — a cut player stays
  `is_active=true` in Lift Lab forever.
- `helm_lifting_athletes.user_id` is **write-once at seed time**, never
  re-synced, and verified stale in production — any player synced before their
  account is linked permanently fails the athlete-self gate at
  `/lifting/dashboard`.
