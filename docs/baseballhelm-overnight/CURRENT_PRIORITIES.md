# CURRENT PRIORITIES

_Updated 2026-07-29 05:10 EDT. Worked strictly in order. A priority marked
**in progress** with no corresponding commit has STALLED — restart it._

---

## 🔴 THE #1 ITEM FOR THE MORNING (human decision required)

**Six live cross-tenant exposures.** Five are the same mistake — an over-broad
SELECT policy on a table whose rows belong to somebody. The sixth is a typo
that turns a correct rule into `true`, and it is the worst of them. All live in
prod since the 2026-05-27 baseline, all verified from migration source. A
seventh (`baseball_coaches`) is confirmed but deliberately left for a product
decision — see below.

| Table | Policy | What leaks |
|---|---|---|
| **`baseball_messages`** | **`cp.conversation_id = cp.conversation_id`** | **Every private coach↔player message in the database — and INSERT into any conversation. Read the row below.** |
| `baseball_players` | `USING (true)` | Every program's roster PII — email, phone, GPA, SAT/ACT |
| `baseball_teams` | `USING (true)` | Every team's secret `join_code` |
| `baseball_team_invitations` | `USING (is_active = true)` | Every live invitation `code`, with its `team_id` |
| `baseball_player_percentiles` | `USING (true)` | Every player's academic + athletic percentile ranking |

**`baseball_messages` is the one to act on first, and it is also the easiest.**
Three baseline policies compare `cp.conversation_id` to *itself* — always true —
so the predicate means "does the caller participate in any conversation at
all". One conversation anywhere buys every private message everywhere, plus the
ability to post into any thread under your own name. It survived because
`baseball_messages_select` is the same rule written *correctly*, twenty lines
below; permissive policies OR together, so the correct one never mattered.

The fix is **three `DROP POLICY` statements, no `CREATE`, no app change** — each
broken policy already has a correctly-correlated twin. It is safe under old and
new code alike, so it does **not** need to wait for the rest of the sequence
below. If only one thing gets applied in the morning, apply this.

**Only two of the six were reported by recon.** Each of the other four came
from re-asking the previous question one level wider — none needed information
that was not already in the repo:

| # | The question that found it |
|---|---|
| 3 | What *else* uses the same `.eq('code', …)` shape as the join_code leak? → `baseball_team_invitations`, whose policy is named "Anyone can view active invitations by code" and checks no code. Seen twice before and left both times: `20260701000000:173` recorded it as deliberately "untouched"; `20260708141000:86` described the exploit path exactly, narrowed the redemption RPCs, and closed with *"This narrows but does not fully close the surface."* Closing the read closes it — ids stop being discoverable, so the parameter change that migration called for is unnecessary. |
| 4 | What *else* in the baseline is `FOR SELECT … USING (true)`? → `baseball_player_percentiles`. Thirty seconds of grep, and it should have been the first thing run. |
| 5 | *"If a fifth exists it is behind a predicate that is neither `true` nor missing"* — written down at the end of the #4 sweep, then actually executed. → `baseball_coaches`. |
| 6 | Read the policies of the uncovered tables *before* writing their tests. → `baseball_messages`. The task was meant to produce coverage; it produced the worst finding of the run. |

**#5 is confirmed and deliberately NOT fixed.** `baseball_coaches_select` is
`USING (auth.uid() = user_id OR get_my_coach_id() IS NOT NULL)` — the second
clause asks only "am I a coach", never scoping to team or org, so **any coach
reads every coach's email and phone**. It is not in the migration pair because
`20260701014000` explicitly reserved it as a product decision, and because 75
call sites read that table directly (52 already use the
`baseball_coaches_public` view) — each needs auditing before the policy moves.
The question to answer: with recruiting sunset, does any surface still need a
coach to see coaches outside their own organization? Details in
`DATABASE_STATUS.md` §5.

The fix is **written and committed as files, applied to nothing**
(`9c4ad335e`, extended by `2c2c939cf`). It ships as a sequenced pair so no
single step can take production down:

| Step | File | Blast radius |
|---|---|---|
| 1 | `20260729000100_..._a_additive.sql` | **None.** Creates six functions, grants EXECUTE. No policy, no revoke, no ALTER. |
| 2 | *(deploy the companion app changes)* | Works under both old and new policies. |
| 3 | `20260729000200_..._b_policies.sql` | Swaps the four policies. **This is the one that closes the leaks and the one that can break things.** |

The invitation fix was folded into these two files rather than added as a new
pair, deliberately: a separate A′/B′ would have made the apply sequence five
steps with two deploy barriers, and the extra ordering is exactly what gets
mis-executed at 09:00 with a demo waiting.

Doing 3 before 2 is an outage — join-by-code, join-by-invitation,
Discover/Compare and roster "Add existing player" all return **empty results,
not errors**, so the symptom is "the product quietly stopped working."

**✅ The SQL is verified by execution.** CI on PR #1092 applies both migrations
to a fresh Postgres and runs **six** pgTAP suites, **all passing**: 34/34
tenant isolation, 19/19 invitation codes, 12/12 messages, 10/10 team-scoped
tables, 9/9 player percentiles, 9/9 Lift Lab sync identity — 93 assertions.

The tenant-isolation suite failed three times before it passed: two independent
recursion cycles that would have made *every* query against `baseball_players`
fail on apply, plus five functions left anon-callable. None was visible to
reading; two adversarial line-by-line reviews had already missed them. That is
why each new policy now carries an explicit "USING clause contains no inline
subquery" assertion — and why the `baseball_messages` suite asserts that no
policy on that table may compare a column to itself.

**Action on waking:**
0. **Consider applying migration B SECTION 5 on its own, first.** It is three
   `DROP POLICY` statements against `baseball_messages`, needs no companion app
   change, is safe under old and new code, and closes a live write hole into
   private conversations. It is the only part of this sequence with that
   property.
1. `db-migration-reviewer` on both files (CLAUDE.md mandates it; this is the
   shared Golf + Baseball production database). CI proves the SQL is correct
   against a *fresh* database — not against production's actual state.
2. Re-verify live `pg_policies`. It could not be read overnight; Supabase's
   Postgres connections timed out on every attempt and CI's own seed step got
   a Cloudflare 522. See `DATABASE_STATUS.md` → ops note.
3. Apply step 1. Verify step 2 is deployed by **exercising** it — join a team
   by code, search a transfer by full email — not by reading the diff;
   merged-but-undeployed looks identical in git. Apply step 3.

**Why not applied overnight:** shared production DB with live users; a
mis-scoped RLS policy locks legitimate users out rather than failing safe,
converting a confidentiality bug into an outage. The exposure has been live
~2 months — the marginal risk reduction from applying at 01:00 unattended
versus 09:00 with the owner present does not justify that. Deferred
deliberately, not missed. See `DATABASE_STATUS.md`.

---

## In progress

Nothing. Both parallel workstreams landed and their adversarial reviews were
worked through — see Completed below. The heartbeat (`9234a858`, hourly at
:11) picks up the Queued list.

---

## Completed

| Item | Commit |
|---|---|
| Mission state + recovery contract | `58c49d7fd` |
| Central product-module registry (the sunset mechanism) | `ee8264989` |
| Recruiting hidden from all navigation (13 coach + 4 player entries) | `e5d5bec19` |
| Recon findings landed (75 findings, 16 P0, 19 P1) | `6a669c40c` |
| Middleware closes direct-URL access to recruiting | `9a55282ff` |
| **Recruiting doors closed** at route guards + hub resolver, restoration path kept under test | `2112fc2a7` |
| Bottom nav no longer silently renders 3 tabs for JUCO coach / JUCO+HS players | `88d467ce2` |
| "Sync Athletes" actually syncs; assigning a team seeds its athletes; honest result copy | `b9597ec25` |
| Roster status changes propagate to Lift Lab (`is_active`, never delete) | `8660e0579` |
| RLS tenant-isolation fix authored as a safe 3-step deploy sequence | `9c4ad335e` |
| Public scout-packet share link closed under the sunset | `f72731974` |
| **P0 retracted** — the staff-invite RPC does check email ownership, at 3 layers | `1f9cc239a` |
| Companion app changes so migration B can be applied (6 call sites, not 4) | `d6a8caffc` |
| Roster "Add existing player": cross-tenant browse → exact-email lookup | `278313df3` |
| **Seed's production guard allowlisted production** — now a deny, + 2 bypasses closed | `f7ffa28b9` |
| **Withheld player data was in the public page's HTML**, not just hidden from it | `403a89f5e` |
| Settings hub unified on one design system (28 files) + a11y contrast fix | `7f7528471` |
| RLS recursion ×2, anon grants, pgTAP write-guard — **CI now PASSES 34/34** | `59037eb9…a61a9b0f` |
| Lift Lab account links repair on re-sync (was write-once, permanently stale) | `30f343e2a` and its migration |
| **Cross-tenant invitation-code exposure closed** — the third `USING`-can't-see-the-query leak, seen and skipped by two earlier migrations | `2c2c939cf` |
| **Fourth exposure closed** — `baseball_player_percentiles` was `USING (true)` on a per-player table holding GPA/academic percentiles | `2855a0646` |
| **Every private conversation was readable AND writable by any user in any one conversation** — a self-comparison typo in three baseline policies | `e1011f50b` |
| pgTAP coverage closed for the last five untested tables (tasks, travel, announcements, dev plans + messaging) | `4e0b96ccb` |

All work is on PR [#1092](https://github.com/njrini99-code/helmv3/pull/1092)
(draft).

---

## Queued (not started)

| Priority | Item | Note |
|---|---|---|
| ~~P1~~ **DONE** | ~~34% of `baseball_*` tables have zero pgTAP RLS coverage~~ | Closed. Invitations (`2c2c939cf`), messaging (`e1011f50b`), and tasks/travel/announcements/dev-plans (`4e0b96ccb`) all have suites now. Writing them found **two P0s** — the invitation-code leak and the `baseball_messages` typo. Two findings across five previously-untested tables is the evidence for the claim that an untested policy is an unverified claim. |
| P1 | **CI seeds PRODUCTION on every PR** | `seed:baseball:ci` creates auth users and deletes `login_attempts` rows in the production project. Now explicit (`--allow-prod` in package.json) rather than hidden behind a constant named "demo" — but it should probably target a local stack instead. Needs a decision. |
| P1 **BLOCKED** | `public_profile_mode` DDL default is `'private'`; a 2026-07-09 live read recorded `'unlisted'` | If the DDL is what is live, `baseball_teams_public_profile` is default-**deny** and zeroes cross-org discovery. Recruiting is sunset so impact today is zero. Blocked on nothing but database reachability — retried 05:30 EDT, still `Connection terminated due to connection timeout`. One query settles it: `select public_profile_mode, count(*) from baseball_teams group by 1`. |
| ~~P2~~ **DONE** | ~~The `integration` vitest project (5 files) runs in no CI workflow~~ | **The item was right about the gap and wrong about the cause, and the real cause was worse.** `vitest.config.ts` set a root-level `include`, and `extends: true` MERGES array options rather than replacing them — so every project inherited the broad root glob. `integration`, `rls` and `business` set `include` but not `exclude`, so each matched **~870 files instead of 5, 0 and 7**. `unit` looked fine only because it also overrides `exclude`. Consequences: CI's "Business contracts" job was re-running the entire unit suite under a name claiming to check 7 contract files (~170s → 3s once fixed), and the integration tests *were* running — by accident, inside that job. Root `include` removed, integration given its own CI step so nothing is lost. Verified by counting: unit 861 (unchanged), integration 5, business 7, rls 0. |
| P2 | Elite stat event model — 8 tables, ~10 migrations, **zero rows** in production | Dead schema. Decide: keep, or graveyard it. |

---

## Decisions taken tonight (challengeable)

- **Recruiting sunset preserves rather than deletes.** Tests that asserted
  pre-sunset behaviour were kept and re-run under a mock-enabled module
  ("restoration path") instead of being flipped to expect the new behaviour.
  Flipping them would prove the door is shut while deleting the only proof that
  opening it again works.
- **`/player/[id]`, `/team/[id]`, `/program/[id]` stay public.** Only
  `/packet/[token]` was gated. A player's own public profile is not a
  recruiting artifact the way a scout packet is; gating it removes a feature we
  still sell. Same reasoning that kept `/academics` out of the sunset.
- **Bottom-nav sunset fallback is applied at read time, not by editing
  `program-type-variants.ts`.** The variant table still declares Recruiting for
  JUCO/HS because that is still the right answer when the module returns.
- **Roster "Add existing player" narrows from substring browse to exact email.**
  The old search returned strangers' email addresses from every program — the
  leak shipped as a feature. The legitimate capability is "add a player I
  already know of", not "browse players I don't".
