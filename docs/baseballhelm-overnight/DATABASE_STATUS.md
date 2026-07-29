# DATABASE STATUS

_Verified 2026-07-29 ~00:30 EDT against migration source. The Supabase MCP
connection timed out three consecutive times during this check, so **live
`pg_policies` state is unconfirmed** — findings below are verified from
migration source, which is authoritative for what was applied but cannot rule
out an out-of-band hotfix. Re-verify against the live DB before acting._

---

## Status of the three P0s in this document

| # | Finding | Status |
|---|---|---|
| 1 | `baseball_players` roster PII readable by any authenticated user | **CONFIRMED.** Fix authored, not applied — see below. |
| 2 | `baseball_teams` join_code world-readable | **CONFIRMED.** Same fix. |
| 3 | Staff-invite accept RPC missing email-ownership check | **RETRACTED — the finding was false.** See §3. |

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

### ~~3. Staff-invite accept RPC has no email-ownership check~~ — **FALSE. Retracted 2026-07-29 01:20.**

**This finding was wrong.** The check is present and always has been. Verified
by reading both migrations that define the function:

```sql
-- 20260624000062:106 and 20260624000081:312 (identical in both)
SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = v_uid;
...
IF v_email IS NULL OR lower(v_invite.email) <> v_email THEN
  RETURN jsonb_build_object('ok', false, 'reason', 'wrong_email');
END IF;
```

It is enforced at **three** independent layers, not one:

1. **RLS** — `baseball_staff_invitations`' `invitee_select` policy limits an
   authenticated user to invites addressed to their own email.
2. **App** — `acceptStaffInviteImpl` (`src/app/baseball/actions/staff.ts:385`)
   re-checks before calling the RPC, so the UI can render the specific "sent to
   a different address" message rather than a generic failure.
3. **RPC** — re-checked inside the `SECURITY DEFINER` body. This is the layer
   that actually matters: a client calling `supabase.rpc()` directly skips 1
   and 2 entirely.

Recorded as a retraction rather than deleted, because a P0 that turns out not
to exist is itself worth knowing — it says the recon pass produced at least one
false positive at the highest severity, so other findings in this document
deserve the same "read the source" treatment before anyone acts on them.

Pinned so the correction is durable and the check cannot be quietly removed:
`src/app/baseball/actions/__tests__/staff-invite-email-ownership.test.ts`
(9 assertions, including one that fails if a NEW migration redefines the
function — a later `CREATE OR REPLACE` that copied the body without the check
is exactly how this class of regression happens).

**Limitation, stated:** those assertions read the migration source, so they
prove the shipped SQL contains the check, not that the deployed function does.
A pgTAP behavioural test would be stronger.

---

## DECISION: written tonight as a 3-step sequence, NOT applied

**Written and committed as files (`9c4ad335e`). Applied to nothing.**

The fix ships as a sequenced pair rather than one migration, because the
tightened policies break three flows that legitimately read across tenants
today — join-by-code, recruiting Discover/Compare, and roster "Add existing
player" — and all three fail as **empty results, not errors**. Applied alone,
the symptom would be "the product quietly stopped working", which is harder to
diagnose than a crash.

| Step | File | Blast radius |
|---|---|---|
| 1 | `20260729000100_..._a_additive.sql` | **None.** Three `CREATE FUNCTION`s + `GRANT EXECUTE`. No policy, no revoke, no `ALTER`. Cannot change the result of any existing query. |
| 2 | *(deploy companion app changes)* | Works under both old and new policies. |
| 3 | `20260729000200_..._b_policies.sql` | Swaps the two policies, revokes the leftover blanket `GRANT ALL TO anon`. **The leak closes here.** |

Migration A also adds `find_baseball_player_by_email_for_roster()` beyond the
original scope, because `roster.ts`'s "Add existing player" runs an unscoped
ILIKE over name *and* email across every player row. Typing `sm` returns
strangers' email addresses from every program — the leak shipped as a feature,
and the one call site the policy cannot be tightened around (gating on
`can_manage_roster` admits every coach, since every coach holds it on their own
team). The replacement is an exact, case-insensitive email match supplied as an
argument: a coach can confirm an address they already hold, never enumerate.

**Not applied while the owner is asleep.** Reasoning, recorded so it can be
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

### What has NOT been verified about this SQL

Stated plainly because it changes what "reviewed" has to mean in the morning:

- **The SQL has never been executed.** No Postgres has parsed it. plpgsql
  syntax errors, function-overload ambiguity, and RLS evaluation-order
  surprises are all unverified beyond static review. Run
  `supabase/tests/rls/baseball_tenant_isolation.sql` through pgTAP against a
  real database as the *first* correctness gate, not the last.
- That pgTAP suite asserts the **post-step-3** state. Running it after step 1
  only will fail the policy-behaviour groups — a correct failure, not a broken
  test.
- **Live `pg_policies` state is unconfirmed.** The Supabase MCP connection
  timed out three consecutive times during verification, so everything here is
  read from migration source. That is authoritative for what was *applied*, but
  cannot rule out an out-of-band hotfix. Re-verify against the live DB first.
- Verify step 2 is **deployed**, not merely merged. A merged-but-undeployed
  change looks identical in `git` and fails identically to no change at all.

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
