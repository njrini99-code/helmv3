# DATABASE STATUS

_Updated 2026-07-29 05:05 EDT._

_Findings are verified from **migration source**; live `pg_policies` state is
still unconfirmed (Supabase's Postgres connections timed out all night — see
the ops note at the bottom). Migration source is authoritative for what was
applied but cannot rule out an out-of-band hotfix, so re-verify live before
acting._

_The **fix**, unlike the findings, is verified by execution: CI on PR
[#1092](https://github.com/njrini99-code/helmv3/pull/1092) applies both
migrations to a fresh Postgres and runs the pgTAP suites — all green:
34/34 (tenant isolation) + 19/19 (invitation codes) + 9/9 (player percentiles)
+ 9/9 (Lift Lab sync). The tenant-isolation suite failed three times first, on
defects no amount of reading found. See "The SQL HAS now been executed" below._

---

## Status of the P0s in this document

| # | Finding | Status |
|---|---|---|
| 1 | `baseball_players` roster PII readable by any authenticated user | **CONFIRMED.** Fix authored, not applied — see below. |
| 2 | `baseball_teams` join_code world-readable | **CONFIRMED.** Same fix. |
| 3 | `baseball_team_invitations` — every live invite code readable | **CONFIRMED.** Fix authored (`2c2c939cf`), not applied. Seen and deferred by two earlier migrations. |
| 4 | `baseball_player_percentiles` — every player's academic/athletic ranking readable | **CONFIRMED.** Fix authored (`2855a0646`), not applied. Never previously noticed. |
| 5 | `baseball_coaches` — every coach's email + phone, readable by any coach | **CONFIRMED, NOT FIXED.** Needs a product decision + a 75-call-site audit. `20260701014000` explicitly reserved it. See §5. |
| **6** | **`baseball_messages` — every private conversation in the database, READ AND WRITE** | **CONFIRMED. The most severe finding of the run.** Fix authored (`e1011f50b`), not applied. See §6. |
| — | Staff-invite accept RPC missing email-ownership check | **RETRACTED — the finding was false.** See the retraction section. |

> **#6 is the one to read first.** It is the only finding that is a write hole
> as well as a read hole, it exposes private coach↔player communications rather
> than profile data, and its fix is three `DROP POLICY` statements that need no
> companion app change — so it can be applied independently of everything else
> in this document.

---

## 🔴 P0 — SIX LIVE CROSS-TENANT EXPOSURES (five fixed in files, one needing a decision)

The most serious findings of the entire run. **All six were introduced in the
`20260527000000_prod_public_baseline.sql` baseline** — not one was added by
later work — and no subsequent migration replaces any of them (verified per
finding, by grepping each policy name across every later migration).

Five are one mistake repeated: **an over-broad SELECT policy on a table whose
rows belong to somebody.** Three of those are the sharper variant — a secret
stored in a column, guarded by a predicate that cannot see the query filtering
on it. RLS evaluates per row and never sees the WHERE-clause literal, so "you
may read this row if you already know its code" is not expressible as a policy;
every attempt collapses into "you may read this row". The fix in each case is
the same shape: the secret becomes an *argument* to a definer-rights function
that compares it server-side.

**#6 is a different animal** — not an over-broad rule but a *typo*
(`cp.conversation_id = cp.conversation_id`) that silently turns a correct rule
into `true`. It is the most severe of the six, and the only one that opens
writes as well as reads.

**How each was found is more transferable than the individual bugs.** Recon
reported only #1 and #2. The rest came from asking progressively narrower
questions, and each question was suggested by the previous answer:

| # | The question that found it |
|---|---|
| 3 | "What *else* uses the same `.eq('code', …)` shape as the join_code leak?" |
| 4 | "What *else* in the baseline is `FOR SELECT … USING (true)`?" — thirty seconds of grep, and it should have been the first thing run |
| 5 | "If a fifth exists, it is behind a predicate that is neither `true` nor missing" — a prediction written down at the end of the #4 sweep, then actually executed |
| 6 | "Before writing tests for the uncovered tables, read their policies" — the audit was meant to produce *coverage*, and produced the worst finding of the run |

The pattern: **every one of these was found by re-asking the previous question
one level wider.** None required new information — only refusing to stop at the
first answer. #5 is left unfixed on purpose; see its section, and challenge
that call.

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
19 pgTAP assertions, **passing in CI**; the load-bearing ones are negative (a
coach cannot read another program's invitation; a rostered non-staff player
sees zero while two are active).

### 4. `baseball_player_percentiles` — every player's academic/athletic ranking

_Found 2026-07-29 04:15, by sweeping the baseline for the whole family instead
of stopping at what had been reported._

```sql
-- supabase/migrations/20260527000000_prod_public_baseline.sql:16710
CREATE POLICY "Anyone can view percentiles"
  ON "public"."baseball_player_percentiles"
  FOR SELECT TO "authenticated" USING (true);
```

Five baseball SELECT policies shipped as `USING (true)` in the baseline.
`baseball_team_coach_staff_select` was properly replaced by `20260624000050`
(`is_baseball_team_staff(team_id) OR coach_id = get_my_coach_id()` — verified,
genuinely scoped); `baseball_coaches_select_all` was **dropped** by
`20260701014000`, which is not the same thing — its sibling policy survives and
is #5 below. #1 and #2 above are the other two. **Nothing had ever touched this
one.**

The policy name reads like league-wide benchmark curves, which would
legitimately be public. The table is not that — `player_id uuid NOT NULL`, one
row per player, holding `percentile_gpa`, `composite_academic`,
`composite_athletic`, exit velocity, pitch velocity and sixty time. So every
authenticated user could pull every player in the database, ranked
academically and athletically.

Derived rather than raw (a percentile, not the GPA) — the only reason this
ranks below #1 rather than beside it.

**Fixed in `2855a0646`** (migration B SECTION 4), gated on
`can_view_baseball_player(player_id)` — the same helper `baseball_players_select`
uses, so a percentile is visible exactly when the player row behind it is. 9
pgTAP assertions. Blast radius is near zero: the only readers are
`recruiting-philosophy.ts`'s two lookups, both of which pass player ids they
already hold, and both sit behind the recruiting sunset.

### 5. `baseball_coaches` — every coach's email + phone, readable by any coach

_Found 2026-07-29 04:40, by following the question the section above ends with:
"if a fifth exists it is behind a predicate that is neither `true` nor
missing." It is. **NOT FIXED — needs a product decision. See below.**_

`baseball_coaches_select_all` (`USING (true)`) *was* dropped, by
`20260701014000_baseball_coaches_narrow_select.sql`. But that migration only
dropped it; the baseline's other SELECT policy was retained and is still live:

```sql
-- supabase/migrations/20260527000000_prod_public_baseline.sql:17827
CREATE POLICY "baseball_coaches_select" ON "public"."baseball_coaches"
  FOR SELECT TO "authenticated"
  USING ((("auth"."uid"() = "user_id") OR ("public"."get_my_coach_id"() IS NOT NULL)));
```

`get_my_coach_id() IS NOT NULL` asks *"am I a coach at all"* — it never ties
the row being read to the reader's team or organization. So **any coach can
read every coach row in the database**, including `email` and `phone`.

This is the shape the earlier sweep could not see: the predicate mentions
`auth.uid()` and `user_id`, so it looks scoped, and only reads as unscoped once
you notice the `OR` makes the first half irrelevant to anyone holding a coach
row. A targeted re-sweep for "asserts a role, never scopes it" across every
baseball SELECT policy returns **this one and nothing else**, so the class is
contained.

**Why it is not fixed here, and this is a judgment call worth challenging:**

1. `20260701014000` explicitly reserved it: *"Tightening coach-sees-all further
   (recruiting cross-program visibility) is a separate product decision and
   intentionally NOT done here."* Overturning a predecessor's stated decision
   unattended is not the same as fixing a bug they missed.
2. **75 call sites** read `baseball_coaches` directly (vs 52 using the
   `baseball_coaches_public` view). Each would need auditing for whether it
   reads own-org or cross-org coaches. That is not a 4am change.
3. Severity is genuinely lower than #1–#4: it requires a coach account, and it
   exposes professional contact details that are typically on an athletics
   department's public staff page — not a player's GPA.

**The decision needed:** with recruiting sunset, is there any surface that
still requires a coach to see coaches outside their own organization? If no,
the fix is one policy swap to `is_baseball_team_staff`-style scoping plus
repointing whichever of the 75 call sites genuinely need cross-org identity at
the existing `baseball_coaches_public` view. If yes, the policy should at
minimum stop exposing `email`/`phone` — a column-level grant or a narrowed
view, not a row-level fix.

---

⚠️ **Known, deliberate gap** (on #4's policy): it does not mirror
`baseball_players_select`'s recruiting-discoverability clause, because that
helper takes `player_type`/`recruiting_activated` as arguments and a
percentiles row carries neither — supplying them would need the inline
subquery that caused the recursion cycles. When recruiting returns, a coach
browsing a *discoverable* player will see the player and not their
percentiles. Fail-closed, and recorded as step (6) of
`PRODUCT_MODULES.recruiting.restore`.

---

### 6. `baseball_messages` — every private conversation, read AND write

_Found 2026-07-29 05:00, by auditing the policies of the previously-uncovered
tables **before** writing their tests. **The most severe finding of the run.**_

```sql
-- supabase/migrations/20260527000000_prod_public_baseline.sql:17377
CREATE POLICY "Users can view baseball messages" ON public.baseball_messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.baseball_conversation_participants cp
    WHERE cp.conversation_id = cp.conversation_id     -- <<<< compares a column to ITSELF
      AND cp.user_id = auth.uid()));
```

`cp.conversation_id = cp.conversation_id` is true for every row. The intended
correlation — `cp.conversation_id = baseball_messages.conversation_id` — is
simply absent, so the predicate collapses to **"does the caller participate in
*any* conversation at all"**. Answer yes once, and you can read every private
message in the database: every coach↔player DM in every program.

**Why it survived two months and several audits.** `baseball_messages_select`
(line 18055) is the same rule written **correctly**, live at the same time,
twenty lines below. That is not a mitigation — multiple PERMISSIVE policies for
one command are combined with **OR**, so the broadest one wins outright — but
it reads like one. Anyone skimming the file finds the correct policy and stops.

**The same typo appears three times, and the write cases are worse:**

| Policy | Command | Effect |
|---|---|---|
| `Users can send baseball messages` | INSERT | `sender_id = auth.uid()` still holds, so the sender cannot be forged — but the **conversation is unconstrained**. A rival program's coach can post into another program's private coach/player thread, under their own name, rendering as a normal message. |
| `Users can update baseball message read status` | UPDATE | No correlation and no `WITH CHECK` of its own — UPDATE on every message row in the database. |
| `Users can view baseball messages` | SELECT | The read half. |

Nothing has ever dropped any of them; grep across every later migration returns
only the baseline definition.

**Fixed in `e1011f50b`. The fix is three `DROP POLICY` statements and no
`CREATE`.** Each broken policy has a correctly-correlated counterpart already
live — `baseball_messages_insert`, `_select`, `_update`, `_update_read`. All
four were read to confirm the survivors carry identical intent, the identical
`sender_id` check where applicable, and the correlation the broken ones lack.
Dropping a permissive policy can only *remove* unintended access; it cannot
take away anything a real participant could do, because the correct sibling
already permits it.

**➜ This section can be applied on its own.** It needs no companion app change
and is safe under both old and new application code. If the rest of the
migration pair has to wait for review, this part does not — and given it is a
live write hole into private communications, it probably shouldn't.

12 pgTAP assertions. The behavioural half carries the weight: the structural
assertions would also pass if someone had "fixed" the typo by dropping the
*wrong* three policies, so the suite proves a real participant kept read AND
write access while an outsider lost both. A generic guard asserts that no
`baseball_messages` policy may compare a column to itself, so the typo cannot
return under a different name.

**The four sibling tables audited alongside it came out clean** —
`baseball_conversations`, `baseball_conversation_participants`,
`baseball_tasks`, `baseball_travel_itineraries`, `baseball_announcements` and
`baseball_developmental_plans` all correlate properly. They now have
regression coverage (`baseball_team_scoped_tables_isolation.sql`, `4e0b96ccb`)
rather than fixes.

---

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
