# DATABASE STATUS

_Updated 2026-07-29 03:10 EDT._

_Findings are verified from **migration source**; live `pg_policies` state is
still unconfirmed (Supabase's Postgres connections timed out all night — see
the ops note at the bottom). Migration source is authoritative for what was
applied but cannot rule out an out-of-band hotfix, so re-verify live before
acting._

_The **fix**, unlike the findings, is now verified by execution: CI on PR
[#1092](https://github.com/njrini99-code/helmv3/pull/1092) applies both
migrations to a fresh Postgres and runs the pgTAP suite — `Result: PASS`,
34/34. It failed three times first, on defects no amount of reading found.
See "The SQL HAS now been executed" below._

---

## Status of the three P0s in this document

| # | Finding | Status |
|---|---|---|
| 1 | `baseball_players` roster PII readable by any authenticated user | **CONFIRMED.** Fix authored, not applied — see below. |
| 2 | `baseball_teams` join_code world-readable | **CONFIRMED.** Same fix. |
| 3 | Staff-invite accept RPC missing email-ownership check | **RETRACTED — the finding was false.** See §3. |

---

## 🔴 P0 — THREE LIVE CROSS-TENANT DATA EXPOSURES

The most serious findings of the entire run. All three were introduced in the
`20260527000000_prod_public_baseline.sql` baseline and **no subsequent
migration replaces any of them** (verified: grepping `baseball_players_select`
and `baseball_teams_select` across every later migration returns nothing; the
invitation policy is explicitly recorded as left in place — see #3).

They are one mistake made three times: **a secret stored in a column, guarded
by a policy that cannot see the query filtering on it.** RLS evaluates a
predicate per row; it never sees the WHERE-clause literal. So "you may read
this row if you already know its code" is not expressible as a policy, and
every attempt to write it as one collapses into "you may read this row" —
which is what all three did. The fix in each case is the same shape: the
secret becomes an *argument* to a definer-rights function that compares it
server-side.

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

### 3. `baseball_team_invitations` — every live invite code is readable by any logged-in user

_Found 2026-07-29 04:00, after the first two were already fixed. It is the
same leak in the table whose entire purpose is the secret._

```sql
-- supabase/migrations/20260527000000_prod_public_baseline.sql:16699
CREATE POLICY "Anyone can view active invitations by code"
  ON "public"."baseball_team_invitations"
  FOR SELECT TO "authenticated" USING (("is_active" = true));
```

The policy is *named* for a check it never performs. `code` is
`character varying(8)` — a secret in a column — so any authenticated user
could run

```sql
SELECT code, team_id FROM baseball_team_invitations WHERE is_active;
```

and take every live invitation code for every program, then redeem them.

**This was seen twice and left both times**, which is the part worth
remembering:

- `20260701000000_baseball_rls_legacy_policy_cleanup.sql:173` replaced the
  INSERT/UPDATE/DELETE policies with `has_baseball_staff_capability` gates and
  recorded that the SELECT policy "is untouched."
- `20260708141000_gate_secdef_ownership_and_redemption.sql:86` described the
  exploit path exactly — *"an arbitrary authenticated caller can already
  discover any active invitation's id via the permissive ... SELECT policy
  ... and then call either RPC directly"* — gated those RPCs to player
  accounts, and closed with *"This narrows but does not fully close the
  surface ... a complete fix needs the invitation `code` ... threaded through
  as a second parameter, which ... is out of scope for this additive pass."*

Closing the **read** closes it from the opposite end: once ids are no longer
discoverable they are unguessable v4 UUIDs, so the signature change that
migration asked for is unnecessary. The replacement policy is
`has_baseball_staff_capability(team_id, 'can_manage_roster')` — the same gate
its own write policies have used since 20260701000000, so the read finally
matches the writes.

**Fixed in `2c2c939cf`**, folded into the same two migration files rather
than a new pair, so the apply sequence stays three steps instead of five.
18 pgTAP assertions; the load-bearing ones are negative (a coach cannot read
another program's invitation; a rostered non-staff player sees zero while two
are active).

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

### ✅ The SQL HAS now been executed — and it was wrong three times

Updated 2026-07-29 03:10 EDT. This section previously said the SQL had never
been run and that doing so was the first real correctness gate. It has been
run, on PR #1092: CI's `supabase` job builds a fresh Postgres from every
migration and runs the pgTAP suites.

**Current state: `Result: PASS`, 34/34 assertions.** Both migrations apply
cleanly and the tenant-isolation behaviour is verified, not asserted.

It took four rounds to get there, and every defect was invisible to reading.
Two independent adversarial reviewers had already gone through this migration
line by line against the real schema and found none of them:

| # | Defect | Consequence if applied |
|---|---|---|
| 1 | `is_baseball_player_recruiting_discoverable(id)` read `baseball_players` — the table whose policy calls it | `infinite recursion detected in policy` — **every** query against `baseball_players` fails, for everyone |
| 2 | All five functions were anon-callable (`REVOKE ... FROM PUBLIC` does not remove Supabase's role-specific default grant to `anon`) | Anonymous callers could execute the discoverability and join-code resolvers |
| 3 | The staff branch was an inline `EXISTS` over `baseball_team_members`, whose own policy reads `baseball_players` | The same total recursion, by a second path |
| 4 | The pgTAP setup `UPDATE`d `recruiting_activated`, which a trigger write-protects | Suite aborted mid-run |

Defects 1 and 3 would each have taken the whole product down for every user
on apply — a confidentiality fix converted into a total outage. That is the
concrete reason the "do not apply unattended" call was right.

Both policies now contain **only** `SECURITY DEFINER` function calls, and two
pgTAP assertions enforce that no inline table read (` FROM `) ever appears in
either `USING` clause. That is the invariant behind both recursion bugs, and
it is now pinned rather than remembered.

### Still not verified

- The pgTAP suite asserts the **post-step-3** state. Running it after step 1
  only will fail the policy-behaviour groups — a correct failure, not a broken
  test.
- CI proves the SQL is correct against a **fresh** database built from
  migrations. It does not prove it is correct against **production's actual
  state**, which may have drifted. Re-verify live `pg_policies` before
  applying.
- Live `pg_policies` remains unconfirmed: Supabase MCP timed out on every
  attempt through the night, and CI's own seed step hit a Cloudflare 522
  against the production project at 06:03 UTC. See the ops note below.
- Verify step 2 is **deployed**, not merely merged. A merged-but-undeployed
  change looks identical in `git` and fails identically to no change at all.

---

## ⚠️ OPS: production Postgres was intermittently unreachable overnight

Not caused by this work, and worth checking before anything is applied.

- `mcp__supabase__execute_sql` timed out on **every** attempt between 00:30 and
  03:00 EDT — five or more, each "Connection terminated due to connection
  timeout".
- CI's `Seed BaseballHelm CI accounts` step got a **Cloudflare 522** from
  `qmnssrrolpinvwjjnufo.supabase.co` at 06:03 UTC, then
  `createUser failed for demo-coach@baseballhelmdemo.com`.
- Direct probes of the REST and auth endpoints answered **401 in ~0.1s** — so
  the edge is healthy and it is specifically **direct Postgres connections**
  that are failing or exhausted.

That pattern (REST fine, DB connections timing out) points at connection-pool
exhaustion or compute pressure rather than an outage. It is also why the
`public_profile_mode` question below could not be settled, and why the
BaseballHelm smoke job is red on the PR for reasons unrelated to the diff.

---

## Coverage gaps (P0/P1, from recon)

| Gap | Detail |
|---|---|
| RLS test coverage | **~34% of `baseball_*` tables have zero pgTAP coverage** — messaging, tasks, travel, announcements, dev plans. Invitations came off this list with `2c2c939cf`, and finding a two-month-old P0 there the moment it got a test is the whole argument for closing the rest: a cross-tenant hole in any of them would not be caught today. |
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
