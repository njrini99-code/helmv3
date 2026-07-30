# DATABASE STATUS

_Updated 2026-07-29 10:45 EDT._

_**Findings are now verified against LIVE production `pg_policies`, not just
migration source.** The database became reachable at 13:43Z after the wedged
instance was restarted (see the ops note below), and both questions this
document was blocked on have been answered. Every exposure below was
confirmed present in production exactly as the migration-source analysis
predicted — no out-of-band hotfix had quietly closed any of them, and none
had drifted._

_See **§ Live verification** below for the read-only queries, the row counts,
and the two claims the live read CORRECTED._

_The **fixes**, unlike the findings, are verified by execution: CI on PR
[#1092](https://github.com/njrini99-code/helmv3/pull/1092) applies both
migrations to a fresh Postgres and runs six pgTAP suites — **all green**:_

| Suite | Assertions |
|---|---|
| `baseball_tenant_isolation` | 34/34 |
| `baseball_team_invitation_code_isolation` | 19/19 |
| `baseball_messages_conversation_isolation` | 12/12 |
| `baseball_team_scoped_tables_isolation` | 10/10 |
| `baseball_player_percentiles_isolation` | 9/9 |
| `helm_lifting_sync_identity_refresh` | 9/9 |

_Four of these needed more than one CI run to get there — two RLS recursion
cycles, five anon-callable functions, a miscounted plan, and a fixture using
auth user ids where coach ids were required. None of those was visible to
reading. See "The SQL HAS now been executed" below._

---

## § A trap in this table: `fingerprint` is NULL for most historical rows

Recorded first because it invalidated two of my own measurements before I
caught it, the second time after I had already been burned once.

`admin_events.fingerprint` was added on 2026-07-02. Every error row written
before 2026-07-11 has `fingerprint IS NULL` — 87,653 of 88,782 unresolved rows.

That breaks the obvious query in a way that looks like a real answer:

    SELECT count(DISTINCT fingerprint) ...          -- collapses ALL nulls to 1
    SELECT ... GROUP BY fingerprint ORDER BY ...    -- one giant bogus "group"

SQL buckets NULLs together. **The application does the exact opposite** —
`buildIncidentFeedFromSources` falls back to `row:${id}`, so each null row is
its OWN incident group. Any query that groups by raw `fingerprint` therefore
reports the inverse of what the product does.

Two wrong claims came out of this, both stated confidently before being caught:

1. "one fingerprint accounts for 87,653 rows" — no; that was every
   null-fingerprint row in one SQL bucket. They are 87,653 separate groups.
2. "the single largest error is 82,088 occurrences of `get_admin_errors_rollup`
   timing out" — no. 82,088 was again the null bucket's total, and `min(title)`
   just picked the alphabetically-first title in it. Counting **by title**, the
   rollup timeout's last occurrence was **2026-04-24** with **0 in the last 30
   days** — it is not an open problem at all. The genuine largest unresolved
   error is `Client error: network error`, **71,660 rows**, 2026-04-08 →
   2026-06-25, also historical.

**Rule for anything querying this table: group by
`coalesce(fingerprint, 'row:'||id::text)`, or group by `title`. Never by
`fingerprint` alone.**

---

## § Live verification — read against production, 2026-07-29 10:40 EDT

Everything in this document was previously inferred from migration source.
Migration source tells you what *was applied*; it cannot tell you whether
someone hotfixed a policy by hand afterwards. That gap stayed open all night
because the database was unreachable. It is now closed.

All queries below are **read-only** (`pg_policies`, `information_schema`,
`count(*)`). No migration was applied, no policy altered, no row written.

### Every exposure is live, and matches the source exactly

| Table | Live policy | Predicate in production | Granted to |
|---|---|---|---|
| `baseball_messages` | `Users can view baseball messages` (SELECT) | `cp.conversation_id = cp.conversation_id` | `authenticated` |
| `baseball_messages` | `Users can send baseball messages` (INSERT) | same self-comparison | `authenticated` |
| `baseball_messages` | `Users can update baseball message read status` (UPDATE) | same self-comparison | `authenticated` |
| `baseball_players` | `baseball_players_select` | `true` | `authenticated` |
| `baseball_teams` | `baseball_teams_select` | `true` | `authenticated` |
| `baseball_team_invitations` | `Anyone can view active invitations by code` | `is_active = true` | `authenticated` |
| `baseball_player_percentiles` | `Anyone can view percentiles` | `true` | `authenticated` |
| `baseball_coaches` | `baseball_coaches_select` | `auth.uid() = user_id OR get_my_coach_id() IS NOT NULL` | `authenticated` |

The correctly-correlated twins (`baseball_messages_select` / `_insert` /
`_update`) are confirmed present alongside the broken three, which is what
makes the three `DROP POLICY` statements safe with no `CREATE`: dropping them
leaves working policies behind. **That is now verified against production, not
assumed from the migration file.**

### Two things the live read CORRECTED

**1. Nothing here is exposed to `anon`.** Every policy above is granted to
`authenticated` only. This is not an open-internet leak — it requires an
account. Baseball signup is open self-serve, so the real bar is "anyone who
registers", which is still a genuine cross-tenant confidentiality failure and
still worth fixing today. But the honest severity is *any registered user*,
not *anyone on the internet*, and this document previously did not say which.

**2. `baseball_player_percentiles` has a second policy,
`System can manage percentiles`, which is `FOR ALL USING (true)`** — and on
first read that looks like an unrestricted write hole on top of the read leak.
It is not: it is granted to **`service_role` only**, which bypasses RLS
regardless. Recorded here because the shape is alarming and the next person to
grep for `USING (true)` will find it and reach for the alarm, as I did.

### Blast radius, measured

| Table | Rows exposed |
|---|---|
| `baseball_messages` | **80** across 13 conversation participants |
| `baseball_players` | **35** — with `email`, `phone`, `gpa`, `sat_score`, `act_score` columns confirmed present |
| `baseball_teams` | **13** join codes |
| `baseball_coaches` | **10** email + phone |
| `baseball_team_invitations` | **0** active — the policy is broken, the table is currently empty |
| `baseball_player_percentiles` | **0** — same: real bug, zero rows today |

This sharpens the ordering rather than changing it. `baseball_messages` stays
first: it is the only write hole, it holds 80 real messages, and its fix is
the only one that needs no deploy barrier. The invitations and percentiles
policies are real defects with a currently-empty blast radius — fix them with
the pair, not tonight.

### The blocked P1 is answered

`public_profile_mode`: the live column default is **`'unlisted'::text`**, not
`'private'` as the DDL in the migration file reads, and **all 13 teams are
`unlisted`** with zero `private`. So `baseball_teams_public_profile` is *not*
default-deny and cross-org discovery is not zeroed. The feared impact was
nil.

Worth noting separately: production's column default **drifted** from the
committed DDL. Impact today is zero and recruiting is sunset, so this is a
note, not an action — but it is a second, independent instance of "production
does not necessarily match the migration that created it", which is the entire
reason this section exists.

---

## Status of the P0s in this document

| # | Finding | Status |
|---|---|---|
| 1 | `baseball_players` roster PII readable by any authenticated user | ✅ **CLOSED IN PRODUCTION 2026-07-29 ~17:45Z.** Cross-org player visibility 35 → 16 for a coach, 35 → 1 for a player. |
| 2 | `baseball_teams` join_code world-readable | ✅ **CLOSED.** Same migration. Join codes visible to a non-member: 13 → 1. |
| 3 | `baseball_team_invitations` — every live invite code readable | ✅ **CLOSED** (`2c2c939cf`). Gated to `can_manage_roster`. Table is empty in production today, so this is a fix ahead of the exposure rather than after it. |
| 4 | `baseball_player_percentiles` — every player's academic/athletic ranking readable | ✅ **CLOSED** (`2855a0646`). Also empty in production today. |
| 5 | `baseball_coaches` — every coach's email readable by any coach | ✅ **CLOSED IN PRODUCTION 2026-07-30 ~01:20Z** (`20260729200000_baseball_coaches_org_scope.sql`, applied on the owner's explicit instruction). The "75-call-site audit" that was the blocker is **done and collapsed to zero**: of 74 reads, 66 are self-scoped, 2 are INSERTs, 1 uses the service-role client, and the remaining 5 are same-org by construction. **No call site needed a cross-org read**, so the row-level fix went in without repointing anything. Verified by role impersonation as all 10 coaches: each keeps their own row, and each now sees only their own org. Measured exposure before the fix: 10 coaches across 8 orgs, 10 with email, **0 with phone** — the long-standing "email + phone" wording overstated it. See §5. |
| **6** | **`baseball_messages` — every private conversation in the database, READ AND WRITE** | ✅ **CLOSED** (`e1011f50b`). The three self-comparing policies are gone; only the four correctly-correlated ones remain. See §6. |
| — | Staff-invite accept RPC missing email-ownership check | **RETRACTED — the finding was false.** See the retraction section. |

> **All six are now closed in production.** Five went in on the owner's
> explicit instruction on 2026-07-29, after the preconditions were satisfied by
> execution rather than by reading — see "§ DECISION … APPLIED 2026-07-29"
> below for the before/after measurements taken as three real users.
>
> **#5, the last one, closed late on 2026-07-29 (~01:20Z on the 30th).** It had
> been held back because tightening it looked like a product decision (which
> coaches may see which coaches' contact details) — but the 75-call-site audit
> answered that question empirically: not one of the 74 reads needs
> cross-organization access, so there was nothing left to decide. The owner
> authorized the apply and `20260729200000_baseball_coaches_org_scope.sql` went
> in, verified as all ten live coach accounts. The two apply-time caveats
> recorded below (the NULL-`organization_id` row, and `schema_migrations` being
> useless as an apply check on this project) both held up in practice and are
> kept as-is — they are still the right warnings for the next migration.

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
2. ~~**75 call sites** read `baseball_coaches` directly (vs 52 using the
   `baseball_coaches_public` view). Each would need auditing for whether it
   reads own-org or cross-org coaches. That is not a 4am change.~~
   **✅ AUDIT DONE 2026-07-29. This reason no longer holds.** 74 reads in
   `src/` (excluding tests), classified by query shape:

   | | count | effect of org-scoping |
   |---|---|---|
   | `.eq('user_id', <caller>)` | **66** | none — self-scoped |
   | `.eq('id', coachId)` where `coachId` is the caller's own | 3 | none |
   | `INSERT` (onboarding ×2) | 2 | none — a SELECT policy cannot reach a write |
   | service-role client (`admin/data/users.ts:272`) | 1 | none — bypasses RLS |
   | same-org by construction (`coach-notes.ts:263` note authors, `documents.ts:62` uploaders) | 2 | none — both already degrade to a missing name rather than failing |

   **Not one call site requires a cross-organization read.** `documents.ts`
   even documents its own graceful degradation: unknown uploaders "degrade to
   `null` rather than failing the whole page load".
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

#### ✅ APPLIED — and the two things that mattered when applying it

_Written 2026-07-29 23:55Z as pre-apply warnings; the migration went in ~01:20Z
and both warnings proved out, so they are kept verbatim below. Read them before
the next RLS apply — the second one especially._

**Outcome, verified by role impersonation as all ten live coach accounts**
(`SET LOCAL ROLE authenticated` + `request.jwt.claims`, inside a rolled-back
transaction): every coach still sees their own row (`sees_self = 1` for all ten),
and no coach sees outside their own organization. Coach Demo and Demo Strength
Coach see 2 rows each (they share an org); the seven single-coach orgs see 1; the
NULL-org internal `admin` account sees 1 — itself — exactly as warning 1 predicted.
The helper is `SECURITY DEFINER` with `search_path` pinned and `EXECUTE` revoked
from `anon` (a plain `REVOKE ... FROM PUBLIC` is not enough — Supabase issues a
direct grant to `anon`, which has to be revoked by name).

**1. One coach row's visibility changes, and it is not obvious from the diff.**
One of the 10 coaches has `organization_id IS NULL`. The new helper opens with
`SELECT p_org_id IS NOT NULL AND EXISTS (...)`, so it returns false for a NULL
org — meaning after applying, that row is visible **only to itself** via the
`auth.uid() = user_id` clause, and that coach likewise sees only themselves.

That is fail-closed and correct, and it is safe *here* because the row is an
internal account: `644a2cfa-7b2d-4607-bc16-8de078660a6f`, an
`@helmsportslabs.com` address, `coach_type = 'college'`, created 2026-07-03, auth
user attached. **But confirm no customer coach has a NULL `organization_id` before
applying**, or they silently lose sight of their colleagues — which presents as
"the roster page went blank", not as an error.

**2. `supabase_migrations.schema_migrations` cannot tell you whether any of this is
applied.** All six of `20260728030000`, `20260729000100`, `20260729000200`,
`20260729000300`, `20260729120000`, `20260729200000` return **zero rows** from that
table — yet A and B are demonstrably applied, since their helper functions exist and
the policies they rewrote show the new `qual`. Migrations applied through the
Supabase MCP `apply_migration` tool do not record a `schema_migrations` row the way
the CLI does, and most of this project's recent migrations went in that way.

An empty result there is evidence of nothing. Check the objects instead:

```sql
-- helpers
select to_regprocedure('public.shares_my_baseball_organization(uuid)') is not null;
-- policies: read the live predicate rather than inferring it from files
select policyname, cmd, roles::text, qual
from pg_policies where schemaname='public' and tablename='baseball_coaches';
```

Confirmed unapplied that way as of 23:40Z: this section's `20260729200000`
(`shares_my_baseball_organization` absent, live policy still carried
`OR get_my_coach_id() IS NOT NULL`), and — separate lane —
`20260728030000_shot_detail_rls_correlated.sql` for golf, where
`can_read_golf_shot_detail` and `owns_golf_shot` were both absent.

**Both were applied ~01:20Z on 2026-07-30, and both are verified by object
existence + live `pg_policies.qual`, not by `schema_migrations`.**

The golf one delivered **4403ms → 323ms** on the shot-detail read path — a 13.6×
win — with **identical row counts to the pre-change control** (506 putt-detail /
167 approach-miss rows for the measured player; four players see 506 / 477 / 398 /
359 of the 3428 total). It also preserves the read/write asymmetry it was designed
for: a same-org coach gets `can_read = true` on another player's shot detail (2211
rows visible) and `can_write = false`, because `owns_golf_shot` is deliberately a
separate, owner-only predicate rather than a reuse of the read helper.

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

---

## Sweeps run, and what each found — including the clean ones

Recorded so the next audit starts where this one stopped instead of repeating
it. **A negative result is only useful if it is written down**, and four of
these six came back clean.

| Sweep | Scope | Result |
|---|---|---|
| `FOR SELECT … USING (true)` | **all** tables | 5 on baseball (#1, #2, #4 + 2 already fixed by earlier migrations), 13 non-baseball. Of the 13, all but one are shared reference data (course library, drills, PGA standards, metrics, `organizations` — institutional info only). The exception is `golf_coaches` → see the cross-product section below. |
| Column compared to itself in a policy | **all** tables | **Contained to `baseball_messages`** (3 policies). No golf equivalent, no other table. Nobody needs to re-run this. |
| Role asserted but never scoped (e.g. `OR get_my_coach_id() IS NOT NULL`) | baseball | Exactly one: `baseball_coaches_select` → #5. |
| Permissive **write** policy (`WITH CHECK (true)` / `USING (true)` on INSERT/UPDATE/DELETE/ALL) | baseball | Exactly one: `baseball_notifications_insert` → below. The rest of the write surface is clean. |
| Table created without `ENABLE ROW LEVEL SECURITY` | baseball | **Zero.** 98 baseball tables created, all with RLS enabled. |
| `SECURITY DEFINER` without a pinned `search_path` | baseball | **Zero outstanding.** Three existed in the baseline (`get_my_baseball_conversation_ids`, `is_baseball_team_member_v2`, one non-baseball); all were already repaired by `20260602165152_harden_search_path_and_revoke_anon_admin_fns.sql`, which does a real `ALTER FUNCTION … SET search_path`. Checked rather than assumed. |

The two sweeps that found the most (`USING (true)` and self-comparison) are
each about thirty seconds of grep.

---

## ✅ `baseball_notifications` — any authenticated user could write a notification to anyone (FIXED)

_Found 2026-07-29 05:45 by sweeping baseball tables for permissive **write**
policies (`WITH CHECK (true)` / `USING (true)` on INSERT/UPDATE/DELETE/ALL).
Exactly one hit in the whole schema — the sweep is otherwise clean, which is
the good news._

```sql
-- supabase/migrations/20260527000000_prod_public_baseline.sql:18078
CREATE POLICY "baseball_notifications_insert"
  ON "public"."baseball_notifications" FOR INSERT WITH CHECK (true);
```

Note there is no `TO` clause, so it applied to every role including `anon` —
but `20260626000030_baseball_notifications_revoke_anon.sql` already revoked
anon's table grant, so the reachable surface is `authenticated` only.

What remains: **any logged-in user can insert a notification row addressed to
any other user**, with attacker-chosen `type`, `title`, `body` and `data`.
Reads are correctly scoped (`_select` is `auth.uid() = user_id`), so this is
not a leak — it is in-app phishing. A convincing "Coach Davis from Texas A&M
viewed your profile — tap to view" lands in a real user's notification feed,
rendered by the product's own UI.

**The obvious fix is wrong, and that is the useful part of this entry.**
`WITH CHECK (auth.uid() = user_id)` would break the product: notifications are
legitimately written *to other people*, through the caller's own session
rather than a service-role client —

| Call site | Writes to |
|---|---|
| `practice.ts:516` | every rostered player, on practice publish |
| `lifting-v11.ts:2411` | one player, coach lift message |

Both use `createClient()` (user-scoped), not `createAdminClient()`. Narrowing
to self-only silently stops practice-publish and coach lift messages — a
"quietly stopped working" failure of exactly the kind this document warns
about elsewhere.

**FIXED in `bcbba306b`** (migration A SECTION 8 + B SECTION 6). I deferred
this at 05:45 as "needs design"; it needed verification instead, and the
verification is what made it safe to do:

- **Those two are the only inserters**, established two ways rather than
  assumed. `from('baseball_notifications')` across `src` returns exactly the
  two inserts above plus `notifications.ts`, which only SELECTs and
  marks-read. `INSERT INTO … baseball_notifications` across every migration
  returns nothing, so no trigger or RPC writes them either — and a definer
  one would bypass RLS regardless.
- The rule that matches the product is therefore *"notify yourself, or a
  player on a team you are staff on"*, expressed as one definer call:
  `WITH CHECK (public.can_notify_baseball_user(user_id))`. No inline subquery,
  so no recursion path.
- **Staff→staff and player→coach are deliberately excluded.** Neither has a
  call site, and the second is the direction an attacker benefits from most —
  a coach acting on a fake notification is worth more than a player doing so.
  Both fail closed; adding either later is a deliberate edit, not an accident.
- `TO authenticated` is now explicit. The baseline policy having no `TO`
  clause is how it covered `anon` in the first place.

10 pgTAP assertions, and the **permitted** cases carry more weight than the
denials: a self-only policy would pass every denial in that suite while
silently disabling practice-publish, so the suite asserts that a coach can
still notify their own player.

---

## 🟠 CROSS-PRODUCT — `golf_coaches` PII is readable by any authenticated user

_Found 2026-07-29 05:40. **Outside this mission's scope** (BaseballHelm), on
the **live revenue product**, and **deliberately not changed**. Reported
because it is the same finding as #5, one product over, and worse._

After fixing `baseball_messages` I re-ran both sweeps across **every** table
rather than only `baseball_*`, on the theory that a shared baseline shares its
mistakes. Two results:

**The self-comparison typo is contained.** `cp.conversation_id =
cp.conversation_id` appears only in the three `baseball_messages` policies.
No golf equivalent exists. That is a real negative result and worth recording
so nobody re-runs the search.

**But `USING (true)` is not contained:**

```sql
-- supabase/migrations/20260527000000_prod_public_baseline.sql:18937
CREATE POLICY "golf_coaches_select_all" ON "public"."golf_coaches"
  FOR SELECT TO "authenticated" USING (true);
```

`golf_coaches` carries `full_name`, `email`, `phone`. This is the **only**
SELECT policy on the table, so there is nothing narrowing it: **any
authenticated user on the project can read every golf coach's contact
details.** Baseball and Golf share one Supabase project and one `authenticated`
role, so a BaseballHelm account can read them too.

**The exact twin of this policy was already recognised as a problem and fixed
— for baseball only.** `20260701014000_baseball_coaches_narrow_select.sql`
dropped `baseball_coaches_select_all` on 2026-07-01, with the reasoning
spelled out: *"let ANY authenticated user read EVERY coach row, including PII
columns (email, phone). Drop it."* Every word of that applies verbatim to
`golf_coaches`. The migration was written narrowly for baseball and the golf
half was never done.

That also makes golf **worse than baseball is today**: baseball at least
retains `baseball_coaches_select` (`auth.uid() = user_id OR
get_my_coach_id() IS NOT NULL`), which requires the reader to be a coach.
Golf requires only being logged in.

**Why it is not fixed here.** GolfHelm is live with real users and is not this
mission's scope; a mis-scoped policy there is a production outage on the
revenue product, decided at 05:40 by an agent that was asked to work on
baseball. The fix is likely small — mirror `20260701014000`, then repoint any
call site that needs cross-org coach identity at a public view, exactly as the
baseball change did — but "likely small" is not the standard for touching a
live product unattended.

**One prerequisite, already checked:** the baseball fix worked because
`20260701011000` had *first* created `public.baseball_coaches_public`, a
definer view exposing non-PII coach identity, and moved the player-facing call
sites (messaging, calendar roster panel, email greetings) onto it. **There is
no `golf_coaches_public`** — grep across migrations and `src` returns nothing.
So the golf fix is two migrations, not one: create the view and move its call
sites, *then* narrow the policy. Dropping `golf_coaches_select_all` on its own
would break every golf surface that renders a coach's name.

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

## DECISION: written as a 3-step sequence — ✅ APPLIED 2026-07-29 ~17:45Z

> **This section's original heading was "NOT applied", and the reasoning below
> for deferring it was correct at the time.** It has since been applied, with
> the owner awake and giving the instruction explicitly. The deferral reasoning
> is kept verbatim underneath because it is the argument that has to be made
> again next time, not a mistake to erase.
>
> **What made it safe was satisfying the file's own precondition rather than
> waiving it.** The precondition read: *"Verify by EXERCISING each flow, not by
> reading the diff."* I had recorded that I could not satisfy it. That was
> wrong — Postgres lets you assume the `authenticated` role and set
> `request.jwt.claims` inside a transaction, which runs the policies exactly as
> a named real user would, and a `ROLLBACK` makes it free. That technique is the
> single most useful thing to carry out of this work:
>
> ```sql
> BEGIN;
>   SET LOCAL ROLE authenticated;
>   SET LOCAL request.jwt.claims = '{"sub":"<user-uuid>","role":"authenticated"}';
>   -- every query here is filtered by RLS as that user
> ROLLBACK;
> ```
>
> Measured before and after, as three real users:
>
> | | player (non-member) | coach, 8-player roster | owner, 14-player roster |
> |---|---|---|---|
> | teams visible | 13 → **1** | 13 → **1** | 13 → **1** |
> | join codes visible | 13 → **1** | 13 → **1** | 13 → **1** |
> | players visible | 35 → **1** | 35 → **16** | 35 → **22** |
> | own roster / self row | 1 → **1** ✓ | 8 → **8** ✓ | 14 → **14** ✓ |
> | messages visible | 9 → 9 ✓ | 9 → 9 ✓ | 73 → 73 ✓ |
> | `resolve_…by_join_code` | 1 → **1** ✓ | 1 → 1 ✓ | 1 → 1 ✓ |
> | `get_…join_context` | 1 → **1** ✓ | — | — |
> | public profile view | 13 → 13 ✓ | 13 → 13 ✓ | 13 → 13 ✓ |
>
> Cross-org player visibility does not fall to zero because the recruiting
> backstop admits players who have **opted in** (`recruiting_activated = true` —
> 9 of 35; all 26 college players correctly excluded). That is the consent model
> working, not the leak persisting.
>
> **Step 2 was already deployed before step 1 was applied** — production is
> `dpl_B9mv3SVZ` / commit `bd1e625d4` (#1092), which contains all eight
> repointed RPC call sites. So the intended order was inverted in practice, and
> `/baseball/join/[code]` had been logging `invitation code resolver failed (is
> migration 20260729000100 applied?)` in the meantime. Sequencing a pair like
> this only helps if the deploy is also held.
>
> Also verified after applying: `anon` holds **zero** privileges on all five
> tables; the anon-facing `baseball_teams_public_profile` still returns all 13
> rows and still carries no `join_code`; and no RLS-denial or recursion error
> appears in the postgres log (the six ERRORs in the window are all my own
> probe typos plus one deliberate `Forbidden` test).

**Written and committed as files (`9c4ad335e`).**

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
- ~~Live `pg_policies` remains unconfirmed~~ — **confirmed 2026-07-29 10:40
  EDT against production.** All six exposures are live and match migration
  source. See § Live verification.
- ~~Verify step 2 is **deployed**, not merely merged.~~ — **confirmed by SHA:
  production is `dpl_B9mv3SVZ` / `bd1e625d4`, and all eight repointed call
  sites are present in that commit.** A merged-but-undeployed change looks
  identical in `git` and fails identically to no change at all, so this was
  checked against the deployment record rather than the branch.
- ~~CI proves the SQL against a **fresh** database, not production's actual
  state.~~ — **now also proven against production**, by role impersonation
  before and after applying. See the table above.

All three flows the migration header warns about — the ones that fail as
**empty results rather than errors** — were exercised through the exact RPC the
app calls, as a real user, after applying:

| Flow | Call | Result |
|---|---|---|
| Join by code | `resolve_baseball_team_by_join_code('DEMOHS1')` as a non-member | **1 row** ✓ |
| Join by code (rest of chain) | `get_baseball_team_join_context(team)` as a non-member | **1 row** ✓ |
| Roster "Add existing player" | `find_baseball_player_by_email_for_roster(team, <full cross-org email>)` | **1 row** ✓ |
| — same, enumeration attempt | …`(team, 'sm')` | **0 rows** ✓ (the leak: an unscoped ILIKE over name *and* email used to return strangers' addresses) |
| — same, wrong address | …`(team, 'nobody@example.invalid')` | **0 rows** ✓ |
| Cross-org team browse | `baseball_teams_public_profile` as `anon` | **13 rows**, no `join_code` column ✓ |

**What is still genuinely unverified:** every measurement is a *count* taken at
the data layer. Counts prove the policies admit and deny the right rows for the
identities probed; they do not prove the UI renders correctly on top of them. No
browser walked these screens. Production also carries little live traffic right
now, so "no errors in the log since applying" is weak evidence, not strong. The
remaining risk is therefore a rendering or call-shape bug in the app, not a
policy that denies too much — the policies themselves have been executed.

---

## ⚠️ OPS: production Postgres was WEDGED — resolved 13:38Z

**Resolved.** This was not intermittency, connection-pool pressure, or "the
edge is healthy so it's just connections" — all of which this section
previously guessed, and all of which were wrong. **Postgres stopped serving
entirely at 04:10:00Z and answered zero queries for 9.4 hours.**

What made it read as flakiness: Supabase's control plane never noticed.
`GET /v1/projects/{ref}` reported `ACTIVE_HEALTHY` throughout, so the status
page was clear and nothing paged. Meanwhile `GET /v1/projects/{ref}/health`
— the per-service endpoint — said `db: UNHEALTHY, "Failed to connect to
database"`, and `get_logs(postgres)` had a 9.4-hour gap where checkpoints
normally appear every ~5 minutes. **The gap is the diagnosis.** Kong answers
`/auth/v1/health` and `/rest/v1/` root without touching Postgres, which is
exactly why probing those two "proved" the edge was fine and proved nothing.

Fixed by `POST https://api.supabase.com/v1/projects/{ref}/restart` (owner-
approved); `db` flipped UNHEALTHY → ACTIVE_HEALTHY in ~3 minutes.

**Root cause of the wedge is still unknown, and the restart destroyed the
evidence** — Postgres logs stop cleanly at 04:10 with no error, no OOM, no
deadlock line. The nightly cron cluster sits on that window
(`v3/causality-attribute` 03:00, `coachhelm-calibration` 03:40,
`coachhelm-insight-lifecycle` 04:00, `refresh-engagement` every 5 min), as
does the recurring ~03:45Z deadlock in #790. Suggestive, not established. **If
this recurs, capture `pg_stat_activity` BEFORE restarting.**

The historical record of the outage follows, kept because the reasoning it
contains is wrong in an instructive way.

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
