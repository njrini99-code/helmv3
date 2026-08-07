# The Claude session who wasn't smart enough

Findings handoff — 2026-08-06/07 session. Written for whoever picks this up next.

## Read this first

Everything below is either **measured against the production database** or **read
in the actual file**. Where I am guessing, I say so. Where I was wrong earlier in
the session, I say that too.

The single most important lesson from this session, and the reason this file
exists: **I ran 9,041 passing tests, a clean typecheck, a clean lint and a green
`next build`, and reported that as "everything shipping is verified" — while two
real players were being lost at the signup door.** Those gates never touched the
join flow. There is no test anywhere in this repo covering the success/failure
semantics of joining a team. Green gates measured my diff, not the product.

**I never once opened the running application during this session.** Every claim
I made was from SQL and static reads. That is the gap that let a bug sitting in
`admin_events` in plain English since 2026-08-03 survive until the founder told
me about it twice.

---

## P0 — Costing real customers right now

### 1. Joining a team reports success as failure, and new players leave

**Files:** `src/app/golf/actions/teams.ts`, `src/app/baseball/actions/teams.ts`,
`src/app/golf/actions/onboarding.ts:523`

The join runs **twice by design**:

1. `completePlayerOnboarding` auto-joins using the code carried through the
   invite link. This succeeds and writes the `golf_team_members` row.
2. The join page then calls `processGolfTeamInvitation` → `joinGolfTeamImpl` →
   `validateGolfPlayerCanJoinTeam`, which finds that membership and returns
   `canJoin: false, reason: 'You are already a member of this team'`.
3. `joinGolfTeamImpl` maps every `canJoin: false` to `{ success: false, error }`
   and the client renders a red error.

The desired end state already holds. It is reported as a failure.

**Production evidence, 2026-08-06:**

| user | signed up | membership row | saw error | logins after |
|---|---|---|---|---|
| shcurry0621@gmail.com | 18:24:10 | 18:24:38 (+29s) | 18:25:21 (+43s) | **0 — never returned** |
| colemac8484@gmail.com | 00:18:43 | 00:19:36 (+53s) | 00:20:21 (+44s) | **0 — never returned** |
| pvm05@su.edu | 01:10:23 | 01:20:53 | 01:15:50 | 2, returned next day |
| sbedi@guilford.edu | 2026-02-04 | — | 2026-08-03 | 2, has 2 rounds |

For the first two, the error row is their **last recorded activity of any kind**.
They completed signup, completed onboarding, landed on the roster, were told they
had failed, and never came back.

**Status: FIXED in working tree, NOT SHIPPED.** Added `alreadyOnThisTeam` to the
validation result; the join returns `{ success: true, alreadyMember: true }` for
that case so the client redirects to the dashboard. Mirrored in baseball.
Joining a *different* team is still correctly refused. Regression test at
`src/test/lib/golf-join-idempotent.test.ts` (8 assertions, passing).

**STILL OPEN — do not assume this is closed:** `pvm05@su.edu` saw the error
**five minutes before their membership row existed** (error 01:15:50, row
01:20:53). That is *not* the double-run pattern and I did not root-cause it.
Someone needs to. It may be a second, different bug.

### 2. `.maybeSingle()` on a non-unique filter, with the error discarded

**File:** `src/app/golf/actions/teams.ts`, membership lookup inside
`validateGolfPlayerCanJoinTeam`

```ts
const { data: existingMembership } = await supabase
  .from('golf_team_members').select('team_id').eq('player_id', playerId).maybeSingle();
```

No unique constraint exists on `player_id` alone. `maybeSingle()` raises PGRST116
the moment a player has two rows, `error` is never destructured, `data` comes back
null, and the one-team guard **silently passes**. The failure then surfaces later
as a raw constraint error.

Today all 69 rows are one-per-player so it is latent, not live.

**Status: FIXED in working tree, NOT SHIPPED.** Replaced with a multi-row read
that handles the error explicitly and refuses rather than guessing.

### 3. Class calendar sync tells the player it worked when it did not

**File:** `src/app/golf/(dashboard)/dashboard/classes/page.tsx`

`syncClassToCalendar` returns `{success, error}`. Both the add and update handlers
`await`-ed it, **dropped the return value**, and then unconditionally fired
`fairwayToast.success('Class added', { description: 'Synced to your calendar.' })`.

Every failure the sync can report — `Could not determine semester dates`, an RLS
refusal, a bad time value — was announced to the player as a success. The class
row saved; no events were written; nothing was logged, because these are friendly
returns at `severity: info`, not thrown errors. That is why this read as "sync
silently does nothing" instead of as an error.

**Status: FIXED in working tree, NOT SHIPPED.**

### 4. `detectSemester` disagrees with `parseSemesterDates` — August produces a dead window

**Files:** `src/lib/utils/schedule-parser.ts:841`, `src/lib/golf/semester.ts`

`detectSemester` bucketed on calendar month, so **all** of August was `Summer`.
`parseSemesterDates` ends Summer on **15 August**. Therefore:

- a class added 6 Aug got a term window closing in 9 days
- a class added 20 Aug got a window that had **already closed** → zero future
  occurrences generated

Both render to the player as "I added my classes and my calendar is empty", with
no error anywhere. Late August is exactly when a college roster enters its fall
schedule — the feature failed at the precise moment it gets used.

**Status: FIXED in working tree, NOT SHIPPED.** Buckets now follow academic terms
(Spring →15 May, Summer →15 Aug, Fall from 16 Aug). Test at
`src/test/lib/class-semester-boundaries.test.ts` (20 assertions) including a
non-vacuity check that reproduces the old rule and proves it fails.

### 5. Class-conflict detection was dead platform-wide

**File:** `src/lib/calendar/availability.ts`, `expandRecurringClass`

It returned `[]` whenever `parseSemesterDates(cls.semester)` was null — on the
reasoning that expanding without a term is a guess. The measurement that
reasoning was missing: **all 43 `golf_player_classes` rows in production have
`semester = NULL`**, so the early return fired 100% of the time. "Find a time"
scheduled coaches straight over every player's lecture, silently.

**Status: FIXED in working tree, NOT SHIPPED.** Now clamps to the term when one is
readable and falls back to the caller's own (already bounded) query window when
it is not. I **reversed a test I had written earlier the same day** that asserted
the old behaviour — see `src/test/lib/calendar/availability.test.ts`. That test
encoded reasoning that was sound in the abstract and wrong against the data.

---

## P1 — Confirmed defects, not yet fixed

### 6. `joined_at` is never written

**59 of 69** `golf_team_members` rows have `joined_at = NULL`. The join path does
not set it. Anything rendering "member since" or sorting a roster by tenure is
working off nulls. Needs a code fix plus a decision on backfilling (`created_at`
is populated and is a reasonable source).

### 7. Coach onboarding is not idempotent

`admin_events` carries
`[Onboarding] Coach creation failed: code=23505 duplicate key value violates unique constraint "golf_coaches_user_id_key"` (×2, last 2026-08-03).
A coach re-running onboarding hits a unique violation instead of being treated as
already-onboarded. Same class as finding #1.

### 8. 13 golf players completed onboarding and are on no team

`onboarding_completed = true`, zero `golf_team_members` rows. Either their
auto-join failed silently or they arrived without a code. One confirmed instance
in the logs: `[Onboarding] Auto-join skipped (Team not found) for code ZAYMK5NC`.
Worth reconciling all 13 individually — each is a real person who signed up and
is not on a roster.

### 9. `profile_complete` — status unknown, do not assume

19 of 82 golf players have `profile_complete = true` while 80 have
`onboarding_completed = true`. So 61 sit between the two, **including users active
since February with logged rounds**. I did **not** determine whether this is a
meaningful optional-fields flag or a field nothing sets. I nearly reported it as a
bug and stopped because I had not proven it. Someone should actually decide.

### 10. 213 class events carry `event_type: 'other'`

Written 2026-08-06 01:48–01:53 by the pre-deploy code. The typed-`class` backfill
migration ran before them. Cosmetic today (the `[class:<id>]` description tag is
still the load-bearing marker and both are checked), but any future code that
trusts `event_type` alone will miss them. A one-line backfill closes it.

---

## The 8-lane sweep

A parallel sweep over the whole codebase returned **59 findings** across:
signup/join/onboarding, discarded return values, swallowed Supabase errors,
golf calendar/classes, production error triage, RLS and tenant isolation, data
integrity, and types-that-lie / dead code. Adversarial verification was still
running when this file was written.

Raw results (one JSON `result` line per agent):
`~/.claude/projects/-Users-ricknini-Downloads-helmv3/1b36cd46-3797-4976-8239-6ca0dc0e3646/subagents/workflows/wf_117ddaba-c3e/journal.jsonl`

**Treat those as unverified leads until each is confirmed against the real file.**
In this session, agent findings were wrong often enough to matter: one agent
reported it had wired a shared resolver into three call sites when it had wired
zero, and several "bugs" turned out to be comments describing already-fixed code.
Verify before acting.

---

## Recurring failure patterns in this codebase

Worth grepping for as a class, not one at a time. Every one of these produced a
customer-visible bug in the last 24 hours:

1. **Server action returns `{success, error}`; caller discards it** and shows a
   success toast. Findings #3 and the Bridge's jobs/team pages.
2. **`const { data } = await supabase…`** with `error` never destructured — a
   failed read becomes an empty array, which renders as a confident zero or an
   "all clear".
3. **`catch {}` / `catch { return null }`** around something whose failure changes
   what the user is told.
4. **`.maybeSingle()`** on a filter with no unique constraint. Finding #2.
5. **A local TypeScript interface that omits a column the code writes.** The
   classes page declared `PlayerClass` without `semester` while both save paths
   wrote it; a later developer read the type, concluded the field "is not
   persisted", wrote that in a comment, and made the edit handler re-derive the
   term — silently re-dating every class event. *The type was the evidence, and
   the type was wrong.*
6. **Comments asserting things that are no longer true.** Verify a comment against
   the code before trusting it.
7. **PostgREST caps every response at 1000 rows** and `.limit(2000)` does not
   raise it; **`.in()` lists are rejected past ~585 uuids** — chunk at 200.

---

## Verification standards for whoever is next

- A green test suite is **not** evidence about a user-facing flow unless a test
  actually covers that flow. Check that it does before believing it.
- `next build` is the only gate that crosses the bundle boundary. Typecheck and
  lint do not.
- Guard rejections returned as friendly strings at `severity: info` are
  **invisible** in error dashboards. Two customer-facing bugs hid there this week.
  When hunting a "silent" failure, query `admin_events` for info-level rows too.
- Verify RLS by role impersonation inside a rolled-back transaction, and **always
  pair a probe with a control that should return rows** — otherwise you cannot
  tell a real block from a vacuous query.
- When a finding contradicts the data, believe the data. Finding #5 was a
  well-reasoned guard that was wrong because nobody checked what was actually in
  the column.

## What is shipped vs. what is not

- **Shipped to production** (main `af3e7205a`, deployment `helmv3-gkt8vyjl6`):
  the Helm Bridge admin work, plus two `get_feature_health` migrations.
- **NOT shipped** — sitting in the working tree, lint and typecheck clean, full
  suite not yet re-run: findings #1–#5 above.

---

## Appendix — 8-lane sweep, raw findings (UNVERIFIED)

59 findings. Adversarial verification was still running when this was written, so **every item
below is a LEAD, not a confirmed bug**. In this session agent findings were wrong often enough to
matter. Read the actual file at the actual line before acting.

Sorted by severity, customer-facing first.

### CRITICAL **[CUSTOMER-FACING]** — "Join a Team" in golf player Settings is 100% dead — it reads golf_teams under RLS, so every valid code returns "Invalid team code"

`src/app/golf/actions/teams.ts:845`

**Breaks:** A golf player who is not yet on a team opens Settings → Join a Team, types the correct code their coach gave them, and gets "Invalid team code. Please check and try again." There is no code they can type that works. The coach sees no join request. Both sides conclude the other made a mistake.

**Evidence:** teams.ts:845-849 does `supabase.from('golf_teams').select('id, name, organization_id').eq('join_code', normalizedCode).single()` on the CALLER's RLS client. Production pg_policies: golf_teams has exactly one non-admin SELECT policy, `golf_teams_select` USING `(is_golf_team_coach(id) OR is_golf_team_player(id))`. A prospective joiner is neither, so the read returns 0 rows, `.single()` raises PGRST116, and line 851 `if (teamError || !team)` returns "Invalid team code". The permissive policy that used to make this work, `golf_teams_select_by_join_code USING (join_code IS NOT NULL)`, was DROPPED by supabase/migrations/20260803120200_golf_join_code_requires_proof.sql:28 — so this broke on 2026-08-03. Every sibling call site was migrated to the `golf_team_by_join_code` SECURITY DEFINER RPC (join/[code]/page.tsx:63, teams.ts:438); this one was missed. Measured in prod: admin_events feature='join_team_flow' has `[createTeamJoinRequest] Invalid team code. Please check and try again.` at 2026-08-06 01:09:04Z. And `select count(*), max(created_at) from golf_team_join_requests` → 12 rows total, last created 2026-02-23 — zero join requests in over five months. The component is genuinely mounted: FairwaySettingsGeneral.tsx:753 renders <JoinTeamSection> for every `profile.role === 'player'`.

**Root cause:** Migration 20260803120200 removed the blanket join-code SELECT policy and moved code resolution into SECURITY DEFINER RPCs, but createTeamJoinRequest kept its direct `.eq('join_code', …)` read. RLS cannot see the literal a query filters on, only which rows the caller already belongs to — so this read is unsatisfiable by construction for the only users who would ever call it.

**Proposed fix:** Replace teams.ts:845-849 with the same RPC the invite-link path uses:
```ts
const { data: teamRows, error: teamError } = await supabase
  .rpc('golf_team_by_join_code', { p_code: normalizedCode });
const team = Array.isArray(teamRows) ? teamRows[0] : teamRows;
```
The RPC already returns `id, name, organization_id` (plus org branding) and never returns join_code, so the rest of the function needs no change. Also distinguish the two failure modes: if `teamError` is non-null that is an infrastructure fault, not a typo — log it via logServerError before returning the user-facing string, exactly as baseball's joinTeamByCodeImpl does at src/app/baseball/actions/teams.ts:1000-1014.

### CRITICAL **[CUSTOMER-FACING]** — Player onboarding overwrites every golf player's email and phone with NULL — 22/22 August signups have no email

`src/app/golf/actions/onboarding.ts:473`

**Breaks:** Every player who completes golf onboarding ends up with golf_players.email = NULL and phone = NULL, even though ensurePlayerRecord wrote their real email to that row minutes earlier on page load. The coach's roster (which selects `email` at roster.ts:215) renders a blank contact column for the entire current cohort — all of UNC Wilmington and both Shenandoah teams.

**Evidence:** The onboarding page never collects or sends email/phone: src/app/golf/(onboarding)/player/page.tsx:167-176 calls completePlayerOnboarding with only firstName, lastName, gradYear, handicap, hometown, state, gpa, avatarUrl. Both fields are `.optional()` in playerOnboardingSchema (onboarding.ts:40-41), so Zod passes with them undefined. onboarding.ts:473-474 then builds `email: validatedData.email || null, phone: validatedData.phone || null` and onboarding.ts:487-491 applies that whole object as an UPDATE over the existing row — clobbering the `email: user.email || null` that ensurePlayerRecord wrote at onboarding.ts:382. Measured in production: `select date_trunc('month', created_at), count(*), count(email) from golf_players group by 1` → Aug 2026: 22 rows / 0 with email. Apr 2026: 10 rows / 10 with email. Spot-check of the last 10 days of signups (Davis Hutchins, Ashton Shifflett, Brian Slaughter, Seth Curry, Cole Macmillan, Ethan Boyette, …) — every single `email` is null. Consumer confirmed: src/app/golf/actions/roster.ts:215 `.select('id, first_name, last_name, email, handicap, avatar_url')`.

**Root cause:** A partial-update action written as a full-object UPDATE. The action's contract says "here is the complete player profile", the caller only supplies part of it, and the missing keys are coerced to explicit NULLs rather than omitted — so absent input destroys existing data.

**Proposed fix:** Build playerData without null-coercing fields the caller did not supply. Minimal, targeted change at onboarding.ts:470-483:
```ts
const playerData: Record<string, unknown> = {
  first_name: validatedData.firstName,
  last_name: validatedData.lastName,
  graduation_year: validatedData.gradYear ?? null,
  handicap: validatedData.handicap ?? null,
  hometown: validatedData.hometown || null,
  state: validatedData.state || null,
  gpa: validatedData.gpa ?? null,
  avatar_url: validatedData.avatarUrl || null,
  onboarding_completed: true,
  updated_at: new Date().toISOString(),
};
if (validatedData.email) playerData.email = validatedData.email;
if (validatedData.phone) playerData.phone = validatedData.phone;
```
AND, in the INSERT branch (onboarding.ts:498-505), default email to the auth email: `email: validatedData.email || user.email || null`. Then backfill the damage: `UPDATE golf_players gp SET email = u.email FROM users u WHERE u.id = gp.user_id AND gp.email IS NULL;` (22 rows).

### CRITICAL **[CUSTOMER-FACING]** — Scoring average and team ranking are computed from the known-stale golf_rounds.total_score; the fix that was written for this was never applied to the stats page, the caches, or the leaderboard

`src/app/golf/actions/stats-data.ts:687`

**Breaks:** A coach opens the roster/leaderboard and the stats page and sees a player's scoring average that is up to 0.42 strokes wrong, and a team ranking with players in the wrong order. The SAME round shows a different total on the rounds list than it contributes to the stats page average, because the two surfaces read different columns. Measured in production right now: Dylan Brooks' stats page and golf_player_stats_cache both show scoring_average = 74.83; his true holes-derived average is 75.25. Mason Rivers is displayed at team rank 17 (75.58) when his canonical average of 75.25 ties him at rank 9 — an 8-position error on the leaderboard a coach uses to set a travel squad.

**Evidence:** Production SQL, read-only.
(1) 15 of 296 completed rounds have golf_rounds.total_score != SUM(golf_holes.score); every one is a ±1 stroke drift. front_nine+back_nine ties to SUM(golf_holes.score) with 0 mismatches across all 296 rounds, so f9+b9 is a reliable proxy for the ground truth.
(2) golf_round_stats_cache is INTERNALLY inconsistent on those same 15 rows: total_score != front_nine+back_nine (15 mismatches; 0 mismatches on f9+b9 vs holes). The cache row itself carries both the right and the wrong number.
(3) Per-player impact, 18-hole rounds only: Dylan Brooks 12 rounds, stale avg 74.833 vs canonical 75.250 (delta -0.417, 5 drifted rounds); Cole Bennett 17 rounds, 74.706 vs 74.353 (+0.353, 6 drifted); Mason Rivers 12 rounds, 75.583 vs 75.250 (+0.333, 4 drifted).
(4) golf_player_stats_cache.scoring_average is exactly the stale number: Dylan Brooks 74.83 (updated_at 2026-07-23), Mason Rivers 75.58, Cole Bennett 74.71. I diffed the whole cache against a live re-aggregation and found ZERO other divergences — the cache is faithfully caching a wrong input.
(5) Rank comparison over all 31 cached players: cached_rank vs canonical_rank diverge for Mason Rivers (17 -> 9) and shift Jackson Hale / Pat Edwards / Braeden Gillen from 13 to 14.
(6) Root cause chain in code: DB trigger update_player_stats_complete computes `SELECT COUNT(*), SUM(r.total_score) ... INTO v_rounds_18, v_total_score_18 FROM golf_rounds r WHERE ... COALESCE(r.holes_played,18)=18` then `v_scoring_average := v_total_score_18 / v_rounds_18`. supabase/migrations/20260606170000_refresh_cache_calls_putt_make_pct.sql:27 writes `r.total_score` raw into golf_round_stats_cache while COALESCE-ing front_nine/back_nine from holes on the very next lines. The only trigger that reacts to a later golf_holes change (recompute_golf_round_totals) refreshes putts/GIR/fairways and deliberately does NOT touch total_score.
(7) The app already knows: src/lib/golf/round-total.ts documents this exact defect at file scope ("15 of 284 rounds (5.3%) currently carry a ±1 total_score drift") and exports deriveRoundTotal/withCanonicalRoundTotal. It is used in only 3 places — dashboard-data.ts:470/496/914, dashboard/rounds/page.tsx:132/163, FairwayRoundDetail.tsx:219. The repair script its docstring points at, `round-total-repair.sql`, does not exist in the repo (verified with find), and production still carries all 15 drifted rows.
(8) Surfaces still reading the raw stale column: stats-data.ts:687 (getStatsSummary select — does not even fetch front_nine/back_nine, so it cannot canonicalize), stats-data.ts:341 and 316 (scoringAverage), stats-data.ts:913 (queryDetailedStatsWithClient select), stats-data.ts:1600 (trend page), stats-data.ts:1949 and 2261 and 2656, and round-reviews.ts:129 (`scoring_avg: round.total_score` feeds the AI round review prompt).

**Root cause:** golf_rounds.total_score is a denormalized column written once at submit time. Nothing recomputes it when golf_holes are later edited, and 15 rounds drifted. A canonicalizing helper (round-total.ts) was written and wired into 3 read surfaces, but (a) the underlying data was never repaired, (b) the DB functions that populate both caches still read the stale column, and (c) the stats page's SELECT list omits front_nine/back_nine so it structurally cannot apply the helper.

**Proposed fix:** Three parts, in this order.
(1) DATA REPAIR (one migration, idempotent): UPDATE golf_rounds r SET total_score = h.s, score_to_par = r.score_to_par + (h.s - r.total_score) FROM (SELECT round_id, SUM(score) s, COUNT(*) n, COUNT(score) c FROM golf_holes GROUP BY round_id) h WHERE h.round_id = r.id AND h.c = h.n AND r.total_score IS DISTINCT FROM h.s AND r.status='completed'; -- the h.c=h.n guard is the null-honest rule from deriveRoundTotalsFromHoles: never let a partial sum overwrite a full total. Then re-run refresh_player_stats_cache(player_id) for each affected player (ed1ff03e-b33a-4a80-891e-09685b7db3d0, 49ffe06d-9b22-4f2f-8c69-f56badbbde6b, 9458ca63-9dbe-4020-ab13-9e2b70f70c80 at minimum) so both caches pick up the corrected values.
(2) STOP THE DRIFT AT THE SOURCE: extend recompute_golf_round_totals(p_round_id) to also set total_score = SUM(h.score), front_nine = SUM(score) FILTER (hole_number<=9), back_nine = SUM(score) FILTER (hole_number>9) — but only when every hole in the round has a non-null score. It already runs on the golf_holes change trigger, so this closes the hole permanently and makes round-total.ts a belt-and-braces display guard rather than the only defense.
(3) MAKE THE READ PATH SAFE MEANWHILE: add front_nine, back_nine to the SELECT at stats-data.ts:687, :913, :1600, :1949, :2261, :2656 and map the rows through withCanonicalRoundTotal (already imported in dashboard-data.ts) immediately after each fetch, so every downstream reducer picks up the corrected total_score/score_to_par without further changes. Same one-line treatment in round-reviews.ts before calculateKeyStats. Add a regression test asserting that a round whose golf_holes sum to 79 with total_score=78 yields 79 from getStatsSummary.

### CRITICAL **[CUSTOMER-FACING]** — A new player's first rounds are permanently marked "CoachHelm failed" for simply being below the coach's round floor — and are never retried

`src/lib/coachhelm/v2/post-round-trigger.ts:142`

**Breaks:** A player who has fewer completed rounds than their coach's minRoundsForSignal (default 3) submits a round. The engine correctly skips generation, but postRoundTrigger stamps golf_rounds.coachhelm_failed_at + coachhelm_failure_reason='engine_no_recent_rounds'. The safety-net cron's eligibility query filters `.is('coachhelm_failed_at', null)`, so that round leaves the retry set FOREVER. When the player later reaches 3 rounds and crosses the floor, rounds 1 and 2 are never back-analyzed — they are permanently dark. This is precisely the new-customer onboarding cohort.

**Evidence:** Exact 4-line production trace for Blake Taylor (player 12089807-48ba-4ab5-b566-7d5d8d9f3d1d), active member of UNC Wilmington Golf — a team created 2026-08-03, i.e. a brand-new paying customer. All four lines within 590ms:
  22:19:53.873 info  "player has 1 completed rounds, coach floor is 3 — skipping generation" (action insights.triggerPlayerInsightsAfterRound.belowRoundFloor)
  22:19:53.997 info  "No completed rounds in the last 90 days yet — insights will populate after the next round"
  22:19:54.028 info  "postRoundTrigger engine failed: No completed rounds in the last 90 days yet…"
  -> golf_rounds 7898ffe6-64c3-40ff-8849-530b77dfff13, round_date 2026-08-01, 68 shots, coachhelm_failed_at = 2026-08-04 22:19:53.502.
His round was 3 days old and he had 1 completed round in the last 90 days — the stored reason is factually false.
BLAST RADIUS (live counts): 14 completed rounds across 8 distinct players carry a non-null coachhelm_failed_at; 7 rounds / 5 players are 'engine_no_recent_rounds'. THREE of those rounds belong to players who NOW have >= 3 completed rounds — they crossed the floor and were never re-analyzed. 7 more players / 9 more rounds are currently below the floor and will be stamped as they submit.
Why it stayed invisible: every step logs at severity=info with skipSentry:true, classified as an 'expected soft failure'. 382 below-floor events in error_logs over 30 days (336 at 0 rounds, 32 at 1, 14 at 2).

**Root cause:** insights.ts:4066 sets `analysis = belowRoundFloor ? null : await analyzePlayer(...)`. A null from the FLOOR skip is then indistinguishable from a null from legacy feature extraction, so control falls into the `if (!analysis)` branch at 4097 and returns the fixed pair {success:false, code:'engine_no_recent_rounds'} at 4121-4125. post-round-trigger.ts:142 treats ANY `!result.success` as terminal and writes coachhelm_failed_at (line 148). 'below the floor' is a TRANSIENT state that resolves itself with the next round; it is being persisted as a permanent one.

**Proposed fix:** Three parts.
1) insights.ts — check the floor before the generic null branch. Immediately after the `if (!analysis)` guard opens (line 4097), return a distinct non-terminal code when belowRoundFloor is true: `return { success: false, error: `Below the coach's ${philosophy.minRoundsForSignal}-round floor — insights start after round ${philosophy.minRoundsForSignal}`, code: 'engine_below_round_floor' }`. This also stops the false "no rounds in 90 days" message.
2) post-round-trigger.ts:142-152 — introduce a NON_TERMINAL_CODES set containing 'engine_below_round_floor' (and, per the separate finding, 'engine_membership_missing'). When result.code is in that set, do NOT write coachhelm_failed_at; leave both terminal columns null (optionally write coachhelm_failure_reason alone as a breadcrumb) so the round stays in the safety-net cron's eligibility query and is retried once the player crosses the floor. Add a rerender-equivalent test: submit round 1 below floor, then round 3, and assert rounds 1-2 get coachhelm_analyzed_at.
3) One-off backfill (I did not write): clear coachhelm_failed_at + coachhelm_failure_reason on the 3 already-stamped 'engine_no_recent_rounds' rounds whose players now have >= 3 completed rounds, so the next safety-net tick picks them up.

### CRITICAL **[CUSTOMER-FACING]** — Coach dashboard headline tiles render a confident 0 when the count queries fail

`src/app/golf/actions/dashboard-data.ts:365`

**Breaks:** A coach opens /golf/dashboard during any transient DB/RLS/timeout condition. The four headline numbers — Roster Size, Upcoming Events, Active Qualifiers, Rounds This Week — render as literal `0`, and the whole lower half of the dashboard (Recent Rounds, Top Players, team scoring average, GIR%, Putts/Rd sparklines, Team Pulse improving/stable/declining) renders as "no data yet". Nothing is logged, no error boundary fires, no toast. The coach reads it as "my team's season is gone".

**Evidence:** Read dashboard-data.ts:303-380 and 440-497. Lines 314-321 issue four `{ count: 'exact', head: true }` queries inside a Promise.all. Lines 365-367 consume them as `rosterCountResult.count || 0`, `eventsCountResult.count || 0`, `qualifiersCountResult.count || 0`; line 497 does `teamPulse.roundsThisWeek = weekRoundsResult.count || 0`. On a PostgREST error `count` is `null`, so `|| 0` converts every failure into a confident zero. `.error` is never read on any of the four. Line 378 does the same for the roster read: `const teamMembersData = playersResult.data as ... | null` → line 379 `|| []` → line 396 `if (playerIds.length > 0)` gates the ENTIRE second batch, so one swallowed roster error blanks every derived KPI. The file already knows the pattern — line 378 sits 4 lines below line 374's `const todayScheduleError = todayEventsResult.error != null`, added explicitly because "a failed call also yields `data == null` → [] , which must NOT be rendered as the cheerful 'clear schedule' empty state". That fix was applied to the RPC only and never to the five neighbours. Liveness confirmed: getCoachDashboardData is awaited by src/app/golf/(dashboard)/dashboard/page.tsx:177. Production scale (Supabase MCP): 10 golf_teams, 69 active members, 985 golf_events, 302 rounds — all four counts are non-zero for real teams today, so any failure is visibly wrong.

**Root cause:** `.count || 0` and `.data || []` collapse the PostgREST error channel into the same value as a legitimately empty result. The action returns `{success:true}` regardless, so the caller has no signal to distinguish them.

**Proposed fix:** In getCoachDashboardData, capture the errors and surface a degraded flag the way todayScheduleError already does. Concretely: (1) after line 363 add `const countsError = rosterCountResult.error != null || eventsCountResult.error != null || qualifiersCountResult.error != null;` and make rosterSize/upcomingEvents/activeQualifiers `number | null` — `rosterCountResult.error ? null : (rosterCountResult.count ?? 0)` — so the tiles render an em-dash, not 0. (2) At line 378 add `const rosterFetchError = playersResult.error != null;` and if true, skip the `playerIds.length > 0` branch but set a `teamStatsUnavailable: true` on the payload so the dashboard renders a retry notice instead of empty cards. (3) At line 497 mirror this for weekRoundsResult. (4) `await logServerError(...)` for each non-null error with `{ action: 'getCoachDashboardData', featureArea: 'coach_dashboard' }` so these stop being invisible.

### CRITICAL **[CUSTOMER-FACING]** — Golf calendar renders empty for a player when the team-membership read errors — the error boundary they built is bypassed

`src/app/golf/(dashboard)/dashboard/calendar/page.tsx:64`

**Breaks:** A player opens /golf/dashboard/calendar. If the `golf_team_members` lookup returns a PostgREST error (RLS denial, statement timeout, or PGRST116 if the player ever holds two membership rows), `teamId` resolves to null, the whole `if (teamId)` block at line 101 is skipped, and the page renders a fully empty calendar — no events, no error, no retry. The player's entire season looks deleted. This is the exact scenario the file's own comment says must never happen.

**Evidence:** Read calendar/page.tsx:55-101. Line 64: `supabase.from('golf_team_members').select('team_id').eq('player_id', playerId).maybeSingle()` sits inside a `Promise.all` wrapped in try/catch. Line 71: `teamId = coachTeamId || playerTeamResult.data?.team_id || null` — only `.data` is read; `.error` is destructured nowhere. The catch at line 73-79 throws `new Error('Failed to load your team for the calendar. Please try again.')` with the comment "rendering an empty calendar here is indistinguishable from 'my season got wiped' (audit finding #20)". But a supabase-js query builder does NOT reject on a database error — it resolves with `{ data: null, error }`. So the catch is dead for the error channel it was written to guard, and the failure falls straight through to the silent-empty path. Contrast the events fetch 85 lines lower at line 149, which DOES check `if (eventsResult.error) throw` — the same file gets it right for events and wrong for the team lookup that gates them. For a player `orgId` is null, so `coachTeamId` is always null and `teamId` depends entirely on this one unchecked read.

**Root cause:** A try/catch was used as the failure guard for a supabase-js call, but supabase-js reports DB failures through the resolved `error` field, not by throwing. The guard therefore only catches network-layer exceptions, never RLS/timeout/PGRST errors.

**Proposed fix:** Destructure the error and throw on it, matching the events path. Replace line 71's assignment with:
```ts
if (playerId && (playerTeamResult as { error?: unknown }).error) {
  throw new Error('Failed to load your team for the calendar. Please try again.');
}
teamId = coachTeamId || playerTeamResult.data?.team_id || null;
```
Also apply the same treatment to `coachListResult` (line 66) if a missing coach list would misrender. Add a regression test that mocks the builder resolving `{data:null,error:{code:'PGRST301'}}` and asserts the page throws rather than rendering zero events — a try/catch test with a rejected promise will pass while the bug is live.

### CRITICAL **[CUSTOMER-FACING]** — 213 synced class events are typed 'other', so every `.neq('event_type','class')` filter lets them through — one player's class schedule is published to the whole team's iCal feed

`src/app/api/calendar/feeds/[token]/route.ts:276`

**Breaks:** Shenandoah University Women's Golf has 213 class-tagged golf_events rows (193 in the future) with event_type='other' instead of 'class'. Every query that means "the team's schedule" excludes classes with `.neq('event_type', CLASS_EVENT_TYPE)` alone, so all 213 pass the filter. Result: a subscriber of the team iCal feed gets 193 of one player's lecture blocks pushed into their Apple/Google Calendar; the coach's iCal feed (coach/[token]/route.ts:132) gets them too; the dashboard 'upcoming events' count and list (dashboard-data.ts:320/358/860/875) inflate by 193; CoachHelm chat read-tools.ts:951 and program-pulse.ts:123 treat them as team activity. This is exactly the leak the .neq was added to stop on 2026-08-05, and it does not cover these rows.

**Evidence:** Production SQL (Supabase MCP, read-only):
  SELECT event_type, count(*) FROM golf_events WHERE description LIKE '%[class:%' GROUP BY 1;
  -> class: 666, other: 213
All 213 belong to team ffd6985f-14b4-4448-895f-d5af20da8d6a ('Shenandoah University Women's Golf'), 193 with start_time > now(), spanning 10 distinct classes, created 2026-08-06 01:48Z and 01:53Z. 0 orphaned rows (every tag resolves to a live golf_player_classes row), so these are live, currently-rendering events. No DB trigger/CHECK rewrites event_type (pg_trigger + pg_constraint on golf_events both checked, empty) — these rows were written by a build that predated `event_type: CLASS_EVENT_TYPE` (calendar-sync.ts:297) and nothing re-types them: the only self-heal is calendar-sync.ts:361 `existing.event_type !== desired.event_type`, which fires only when the owning player re-opens and saves that class.

**Root cause:** lib/calendar/class-events.ts documents TWO markers (event_type='class' AND the `[class:<id>]` description tag) and its own JS helper `isClassEvent` (line 44-49) correctly checks EITHER. But every server-side SQL filter checks only event_type, so the marker that is actually guaranteed on 100% of rows (the tag — it is what the sync keys its whole diff on) is never used server-side. A single-marker filter over a two-marker contract.

**Proposed fix:** 1) Add a shared query helper next to CLASS_EVENT_TYPE in src/lib/calendar/class-events.ts:
   export function excludeClassEvents<T>(q: T): T { return (q as any).neq('event_type', CLASS_EVENT_TYPE).not('description','ilike','%[class:%'); }
   and use it at feeds/[token]/route.ts:276, coach/[token]/route.ts:132, dashboard-data.ts:320,358,860,875, v3/chat/read-tools.ts:951, v3/chat/program-pulse.ts:123 — replacing the bare .neq in each.
2) One-shot data repair (migration):
   UPDATE golf_events SET event_type='class' WHERE description LIKE '%[class:%' AND event_type <> 'class';  -- 213 rows
3) Add a Review Gate / test assertion that any golf_events query using `.neq('event_type'` in a team-schedule path also excludes the tag.

### CRITICAL **[CUSTOMER-FACING]** — Class events are pinned to ONE timezone offset captured at save time, so 281 future class meetings render exactly one hour early after the 1 Nov DST change

`src/app/golf/actions/calendar-sync.ts:123`

**Breaks:** A player saves a Fall class in August (EDT, getTimezoneOffset()=240). buildDateTimeString stamps EVERY occurrence in the term with the literal offset '-04:00', including December meetings. After the 1 Nov 2026 DST fallback the same UTC instant is 10:00 AM Eastern, not 11:00. Every class occurrence from 1 Nov onward shows one hour early on the calendar, in the availability overlay, in conflict detection, and in the iCal feeds. Guilford College and Shenandoah are both affected. The same bug runs the other way for Spring terms saved in January (they will show one hour LATE after the March change).

**Evidence:** Production SQL, comparing each event's Eastern wall-clock to the class's stored `golf_player_classes.start_time`:
  BIO-121 (stored 11:00:00): 2026-09-02 15:00Z -> 11:00 America/New_York (correct); 2026-11-06 15:00Z -> 10:00 America/New_York (WRONG).
Aggregate:
  SELECT team_id, count(*) FILTER (WHERE (start_time AT TIME ZONE 'America/New_York')::time <> c.start_time AND start_time > now()) ...
  -> b714c30f (Guilford College Men's Golf Team): 204 future events wrong by one hour, of 556
  -> ffd6985f (Shenandoah University Women's Golf): 77 future events wrong, of 323
  Total: 281 future class events, 37% of the 761 future class events. Both teams' golf_team_settings.timezone is America/New_York (Shenandoah's is NULL, so the client falls back to the browser zone — same result).

**Root cause:** calendar-sync.ts:242 takes a single scalar `classData.timezoneOffset` (one `new Date().getTimezoneOffset()` snapshot sent from the browser at classes/page.tsx:157 and :214) and formatTimezoneOffset (line 82-88) turns it into one fixed ISO offset string that is concatenated onto every occurrence date at lines 300-301. A fixed numeric offset cannot express a zone, and an academic term always spans a DST transition.

**Proposed fix:** Send the IANA zone, not the offset. Client: pass `timezone: Intl.DateTimeFormat().resolvedOptions().timeZone` (fall back to the team's golf_team_settings.timezone server-side). Server: replace buildDateTimeString with a per-occurrence resolver that computes the offset FOR THAT DATE in that zone, e.g.
  function offsetForDate(dateStr: string, time: string, tz: string) {
    const naive = new Date(`${dateStr}T${time}Z`);
    const parts = new Intl.DateTimeFormat('en-US',{timeZone:tz,hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(naive);
    ... derive minutes diff, return ISO offset string ...
  }
and call it inside the occurrence loop (line 291) instead of once. localDateKey (line 133) must use the SAME per-date offset so the diff still matches existing rows. Keep `timezoneOffset` accepted for back-compat. Then backfill: force a re-sync per class — the diff at line 364 `!sameInstant(...)` corrects the 281 rows automatically once the generator is right.

### CRITICAL **[CUSTOMER-FACING]** — GolfRoundReview type marks already-migrated columns as "may need migration" — the entire coach→player review workflow was written into a JSON blob instead of the real columns, and 0 of 77 production reviews have ever been published

`src/lib/types/golf.ts:538`

**Breaks:** A coach opens a player's round review, writes notes, and hits publish/share. The real `status`/`published_at` columns update (or the JSON blob updates, depending on which of the two dead paths is wired) but the player-facing surface reads the other one, so the player never sees the review. Today the button isn't even reachable (see the companion dead-code finding), so the observable customer symptom is: the coach→player round-review loop has never functioned in production — 77 reviews generated, 0 delivered. The moment anyone wires up the existing `publishReview` to fix that, it will write status='published' and STILL show nothing, because every reader in the same file reads `patterns_detected.status`.

**Evidence:** src/lib/types/golf.ts:511 declares `GolfRoundReview` by hand (NOT via `Tables<'golf_round_reviews'>`, unlike every other type in that file). Line 538 comments `// Extended fields for review system (may need migration)` above `status?`, and the blocks below declare `coach_rating?`, `shared_with_player?`, `player_viewed_at?`, `player_acknowledged?` as optional virtual fields.

The migration ALREADY HAPPENED. Live `information_schema` for public.golf_round_reviews (queried via Supabase MCP) contains real columns: `status` (default 'draft'), `published_at`, `published_by`, `coach_rating`, `coach_feedback_text`, `player_viewed_at`, `player_acknowledged_at`, `action_items`, `version`, `generation_method`, `shared_with_player`, `sentiment_score`, `regeneration_count`, `last_regenerated_at`, `insights_count`, `highlights_count`, `areas_count`, `ai_model_version`. The type omits published_at/published_by/coach_feedback_text/player_acknowledged_at ENTIRELY and invents near-namesakes that are not columns at all (`coach_approved_by`, `player_acknowledged`, `generation_attempts`, `strengths`).

A developer read that type, concluded the columns weren't there, and built a shadow state machine: src/app/golf/actions/round-reviews.ts:78 `interface ReviewExtendedData` stores status/coach_approved/shared_with_player/player_viewed_at inside the `patterns_detected` JSONB column. src/app/golf/actions/round-reviews.ts:51 `interface ReviewDbRow` — the row type used to read these rows back — omits `status`, `published_at`, `published_by`. Every reader in the file therefore reads `extData?.status ?? 'draft'` out of JSON: lines 264, 399, 754, 884, 1140, 1485.

Meanwhile src/app/golf/actions/round-reviews.ts:1649-1651 (publishReview) writes the REAL `status: 'published'` / `published_at` / `published_by` columns — which no reader in the file ever looks at.

PRODUCTION MEASUREMENT (Supabase MCP): `select status, count(*), count(published_at), count(*) filter (where shared_with_player)` on golf_round_reviews → 77 rows, ALL status='draft', published_at NULL on 100%, shared_with_player true on 0. Only 8 of the 77 even carry a `"status"` key inside patterns_detected. The live generator path (src/app/golf/actions/round-review-system.ts, the one the page at src/app/golf/(dashboard)/dashboard/rounds/[id]/review/page.tsx:29 actually imports) writes NEITHER — it only ever touches `shared_with_coach` (round-review-system.ts:1154), the player→coach direction.

**Root cause:** The central types file hand-rolls a shape for golf_round_reviews instead of deriving it from `Tables<'golf_round_reviews'>` like GolfRound/GolfEvent/GolfTask do two dozen lines above. Once the hand-rolled type lagged the migration, the comment `(may need migration)` turned a stale type into an authoritative-looking instruction, and the next developer honoured it by inventing JSON storage.

**Proposed fix:** 1. Replace the hand-rolled `GolfRoundReview` in src/lib/types/golf.ts:511-567 with `export type GolfRoundReview = Tables<'golf_round_reviews'>` plus a separate, explicitly-named `GolfRoundReviewComputed` interface for the genuinely virtual fields (`strengths`, `key_stats`, `ai_recommendations`) — and delete the `(may need migration)` comment on line 538.
2. Add `status`, `published_at`, `published_by`, `shared_with_player`, `player_viewed_at`, `player_acknowledged_at`, `coach_rating`, `coach_feedback_text` to `ReviewDbRow` (src/app/golf/actions/round-reviews.ts:51).
3. Pick ONE store. Recommend the real columns: change every `extData?.status ?? 'draft'` read (lines 264, 399, 754, 884, 1140, 1485) to `row.status ?? 'draft'`, and change the writes at 405/440/499/532/540/763/892 to update the `status` column rather than merging into `patterns_detected`. Ship a one-shot backfill for the 8 rows that carry a JSON status: `update golf_round_reviews set status = patterns_detected->>'status' where patterns_detected ? 'status' and status = 'draft'`.
4. Add a regression test asserting that after `publishReview(id)`, the same read path the player page uses reports the review as published.

### CRITICAL **[CUSTOMER-FACING]** — Class schedule import tells the player "Synced to your calendar" without ever reading a single sync result — 6 classes in production imported with zero calendar events

`src/app/golf/(dashboard)/dashboard/classes/page.tsx:334`

**Breaks:** A player uploads a schedule screenshot, confirms the parsed classes, and sees "6 classes imported — Synced to your calendar." Zero calendar events were written. The class rows show in the Classes list, so the player believes the whole flow worked and never retries; the classes are invisible on the team calendar to both the player and the coach, so the coach schedules practice on top of a class. There is also a second trigger on the same toast: line 309 gates the entire sync block on `if (data && teamId)`, so a player with no team resolved skips sync completely and still gets "Synced to your calendar."

**Evidence:** Line 309 `if (data && teamId) {`, lines 310-332 build `syncPromises` from `syncClassToCalendar(...)`, line 334 `await Promise.all(syncPromises);` — every `CalendarSyncResult` is discarded. Lines 341-344 then fire `fairwayToast.success(\`${importedCount} ... imported\`, { description: 'Synced to your calendar.' })` unconditionally. `syncClassToCalendar` returns `Promise<CalendarSyncResult>` and never throws (src/app/golf/actions/calendar-sync.ts:447); its failure paths include `{ success: false, error: 'Could not determine semester dates. Please set a semester start date.' }` at calendar-sync.ts:228. PRODUCTION: 17 of 43 `golf_player_classes` rows have zero `[class:<id>]`-tagged `golf_events`. Six of them (player 49ffe06d…, team 6ecdd1a6… "Demo University Golf") share the exact created_at 2026-07-23 11:58:05.133054+00 — one bulk `.insert(classesToInsert)`, i.e. this handler — and all six have ev=0. Eleven more on team 343731cb… "Lynchburg Women's Golf" (Feb 2026) likewise have zero events. Every one of those `semester` values is NULL, which is exactly the input that drives the `Could not determine semester dates` failure. The add and edit paths in this same file were already fixed for this bug (see the postmortem comment at lines 147-153); this path and the two below were missed.

**Root cause:** `await Promise.all(syncPromises)` discards an array of `{success, error}` results, and the success toast is not conditioned on them. The fix that landed on `handleAddClass`/`handleUpdateClass` was applied per-call-site instead of to every call site of `syncClassToCalendar` in the file.

**Proposed fix:** Capture the results and branch: `const syncResults = await Promise.all(syncPromises);` then `const failures = syncResults.filter((r) => r && !r.success);`. Hoist the `teamId` check out of the sync block so an unresolved team is itself a failure rather than a skip. Then replace the unconditional toast with: if `failures.length === 0` → `fairwayToast.success(\`${importedCount} classes imported\`, { description: 'Synced to your calendar.' })`; else → `fairwayToast.error(\`${importedCount} classes imported, but ${failures.length} could not be added to your calendar\`, { description: failures[0]?.error ?? 'Unknown error' })`. Mirror the exact wording pattern already used at lines 168-175 so the three paths read consistently. Note `syncPromises` currently contains `Promise.resolve()` (undefined) entries for skipped rows — type the array as `Promise<CalendarSyncResult | undefined>[]` and treat `undefined` as neither success nor failure, or better, filter those rows out before mapping.

### CRITICAL **[CUSTOMER-FACING]** — Any authenticated user can self-join any golf conversation and read/post in another program's private messages

`supabase/migrations (policy golf_participants_insert_v2 on public.golf_conversation_participants):1`

**Breaks:** A signed-in user at School A POSTs one row to /rest/v1/golf_conversation_participants with {conversation_id: <any uuid>, user_id: <their own id>}. The policy's first disjunct `user_id = auth.uid()` passes with no check that the conversation belongs to a team they are on. From that moment golf_conversations_select_v2, golf_messages_select_v2 and golf_messages_insert_v2 all key off user_conversation_ids(auth.uid()), so the intruder can read every message in that conversation, see every participant, and post into it as themselves. Coach<->player 1:1 DMs (recruiting, discipline, injury talk) are in the same table. Conversation ids are uuids but they leak through realtime channel names, notification action_urls and any shared screenshot/URL.

**Evidence:** Role-impersonation proof on production, in a rolled-back transaction. Attacker = Denison University player user e78c5692-65e5-46a7-bb8c-1aa78b58c5d2. Target = Guilford College Men's Golf team chat conversation ab10422a-dc65-4abc-944c-ec4fbdf3a7bb (13 messages, a paying customer).
BEFORE (control): guilford_msgs_readable=0, conv_readable=0, all_golf_msgs_readable=0.
Then: insert into golf_conversation_participants (conversation_id, user_id) values ('ab10422a-...','e78c5692-...');  -- accepted, no error.
AFTER: guilford_msgs_readable=13, conv_readable=1, participants_readable=14 (14 user_ids of Guilford staff+players). Sample content read: "Group Chat for 26-27", "I have received". Transaction rolled back; verified 0 leftover rows.
Policy text: golf_participants_insert_v2 INSERT WITH CHECK ((user_id = (SELECT auth.uid())) OR (EXISTS (SELECT 1 FROM golf_conversations gc WHERE gc.id = conversation_id AND gc.created_by = (SELECT auth.uid())))).
RLS is the only boundary here — src/app/actions/messages.ts:355-373 documents that the app relies on branch (a) deliberately.

**Root cause:** The `user_id = auth.uid()` disjunct was added so the conversation creator could insert their own participant row before the conversation became visible to them (messages.ts:353-373 explains the ordering). It authorises "this row is about me" but never "I am entitled to be in this conversation". Self-identification is not authorization.

**Proposed fix:** Replace the self-insert branch so it still lets a creator bootstrap, but binds membership to the conversation's tenant. Migration:
DROP POLICY golf_participants_insert_v2 ON public.golf_conversation_participants;
CREATE POLICY golf_participants_insert_v3 ON public.golf_conversation_participants FOR INSERT TO authenticated WITH CHECK (
  -- creator bootstrapping their own row on a conversation they just created
  (user_id = (SELECT auth.uid()) AND EXISTS (SELECT 1 FROM public.golf_conversations gc WHERE gc.id = conversation_id AND gc.created_by = (SELECT auth.uid())))
  OR
  -- adding anyone (incl. self) to a conversation whose team the CALLER belongs to
  EXISTS (SELECT 1 FROM public.golf_conversations gc WHERE gc.id = conversation_id AND gc.team_id IS NOT NULL AND (public.is_golf_team_coach(gc.team_id) OR public.is_golf_team_player(gc.team_id)))
);
The first branch must reference golf_conversations, which is itself RLS-filtered — so also add a SECURITY DEFINER helper `golf_conversation_created_by_me(uuid)` (STABLE, search_path='', REVOKE FROM PUBLIC/anon, GRANT TO authenticated) and use it in place of the inline EXISTS to avoid the same 42P17 recursion baseball has. No app change needed: messages.ts already inserts self first, which still satisfies branch 1.

### CRITICAL **[CUSTOMER-FACING]** — createTeam() can never succeed — the staff-row insert it needs is refused by its own RLS policy, and the team is silently rolled back

`src/app/golf/actions/teams.ts:585`

**Breaks:** A coach with no team opens /golf/dashboard/team, fills in the team name/season/gender and submits (FairwayTeamSettings.tsx:213). The golf_teams INSERT succeeds, then the golf_team_coach_staff INSERT at teams.ts:585-592 runs under the CALLER's client and is rejected 42501. The catch block deletes the team it just created and returns the generic 'Failed to create team. Please try again.' The coach can retry forever and it will never work. This is the only in-product way for an existing coach to get a team, so it is also the only recovery path for the coaches described in the next finding.

**Evidence:** Reproduced on production by role impersonation, rolled back. As Denison's head coach (user bc03d535-9647-4063-ab64-9985f46d4601, coach bd2236bd-c3f9-46bd-b9a1-b59032e0843b):
Step 1: insert into golf_teams (...) values (...,'ef06ba2e-...','bd2236bd-...') -> OK, no error.
Step 2: insert into golf_team_coach_staff (team_id, coach_id, role, is_primary) values (<new team>,'bd2236bd-...','head_coach',true) -> ERROR 42501: new row violates row-level security policy for table "golf_team_coach_staff".
CONTROL (same session, same coach): select is_golf_team_head_coach('27d01293-8b5a-4e4e-9e3c-c86666b53bc9') -> true, golf_teams visible = 1. So the denial is specific to the brand-new team, not a vacuous probe.
Policy: golf_team_coach_staff_insert WITH CHECK (is_golf_team_head_coach(team_id) AND EXISTS (SELECT 1 FROM golf_coaches gc WHERE gc.id = coach_id AND gc.user_id = auth.uid())). is_golf_team_head_coach reads golf_team_coach_staff, which for a team created one statement ago is empty -> always false.
The two sibling call sites already worked around this with the service-role client and documented why: onboarding.ts:245-259 ('Use the admin client for this single bootstrap row') and teams.ts addSecondTeam ('Use admin client for the staff insert — mirrors onboarding bootstrap pattern', fixed 2026-08-05 after Shenandoah's coach could not add their Women's team). createTeamImpl is the one that was never updated.

**Root cause:** golf_team_coach_staff_insert requires the caller to ALREADY be head coach of the team the row is being created for — a condition that is structurally unsatisfiable for the first staff row of any team. It also requires coach_id = the caller's own coach row, so it can never be used to add an assistant either. Bootstrap and delegation are both impossible through this policy; every working path bypasses it with the admin client, and createTeamImpl forgot to.

**Proposed fix:** Mirror addSecondTeam exactly. In createTeamImpl (teams.ts ~584-598): after `newTeam` is read back, assert `newTeam.organization_id === coach.organization_id` (select organization_id in the admin read-back at teams.ts:562-565, it is currently omitted), then do the staff insert with `createAdminClient()` instead of `supabase`. Keep the rollback delete on the caller's client (golf_teams_delete_creator already covers it). Separately, widen golf_team_coach_staff_insert so a head coach can add OTHER coaches: WITH CHECK (public.is_golf_team_head_coach(team_id)) — drop the `gc.user_id = auth.uid()` conjunct, which is what makes the policy self-only and forces redeemStaffInvite (teams.ts:1867) to use the admin client too.

### HIGH **[CUSTOMER-FACING]** — Auto-join failure at the end of onboarding is swallowed — the player gets confetti and "see your team" while landing on a dashboard with no team

`src/app/golf/(onboarding)/player/page.tsx:178`

**Breaks:** A coach-invited player finishes onboarding, the auto-join silently fails (bad/stale code, RLS, already on another team), and the app shows the celebration screen: check-mark animation, particle burst, "Welcome, {firstName}!", "Your profile is ready. Head to your dashboard to see your team." They arrive on an empty dashboard with no team, no error, and no idea what to do. The coach's roster stays empty.

**Evidence:** completePlayerOnboarding deliberately returns `joinedTeam` (onboarding.ts:520-537) and logs the reason on failure (onboarding.ts:526). The caller reads only `result.success` (player/page.tsx:178) and then unconditionally `goForward('complete')` (page.tsx:184). `grep -rn "joinedTeam" src/` returns four hits, all inside onboarding.ts — no consumer anywhere. The 'complete' step at page.tsx:507-511 hard-codes the success copy. Measured in production: admin_events contains `[Onboarding] Auto-join skipped (Team not found) for code ZAYMK5NC` at 2026-08-04 03:45:54Z. ZAYMK5NC resolves to golf_teams id f5b4fc75-4581-4843-9b62-7d3bc4686aa5, "UNC Wilmington Golf" — a paying customer whose team was created the day before. That player was shown the celebration. Aggregate blast radius: `select count(*) from golf_players p left join golf_team_members m on m.player_id=p.id where p.onboarding_completed and m.id is null` → 11 of 80.

**Root cause:** The server action was written to degrade gracefully ("best-effort: a bad code never blocks onboarding") and correctly reports the degradation in its return value — but the client treats `success: true` as "everything worked" and discards the second field. Graceful degradation with no UI for the degraded state is indistinguishable from a lie.

**Proposed fix:** Thread `joinedTeam` into the completion step. In player/page.tsx add `const [joinedTeam, setJoinedTeam] = useState<boolean | null>(null);`, set it from the result before `goForward('complete')` (only meaningful when a joinCode was present: `setJoinedTeam(joinCode ? result.joinedTeam === true : null)`), and in the 'complete' block at page.tsx:507-511 branch the copy: when `joinedTeam === false`, replace "Head to your dashboard to see your team" with an honest line plus a recovery action — "We couldn't add you to your coach's team automatically. Ask your coach to re-send the invite link, or enter the code in Settings." Do not show the particle burst in that branch. Also widen the return type of completePlayerOnboardingImpl so `joinedTeam` survives typecheck at the call site.

### HIGH **[CUSTOMER-FACING]** — Signup replaces the server's exact password error with a wrong one, telling users "use at least 8 characters" when the real problem is a missing special character or a breached password

`src/components/auth/golf-sign-up-form.tsx:23`

**Breaks:** A new customer types a password the server rejects for a specific, fixable reason. The form discards that reason and shows "Password does not meet the requirements. Please use at least 8 characters." Their password is already ≥8 characters, so they add characters, resubmit, fail again — an unwinnable loop at the very first step of signup. The same swallowing hits the HIBP breached-password rejection, where lengthening the password can never help.

**Evidence:** golf-sign-up-form.tsx:23-25 — `if (lower.includes('weak password') || lower.includes('password')) return 'Password does not meet the requirements. Please use at least 8 characters.'`. That bare `includes('password')` matches BOTH server messages verbatim: auth.ts:300 returns validatePassword's feedback (e.g. "Password must contain at least one special character (!@#$%^&*...)") and auth.ts:395-398 returns "Please choose a stronger password — this one is too common or has appeared in a data breach." Client-side pre-validation only checks length (form line 68-71), so these always reach the server. Measured in production admin_events, feature='auth_onboarding', last 30 days: `[signupAction] Password must contain at least one special character` ×7 (4 info + 3 error, 2026-08-04 20:28 → 2026-08-06 23:35), `[signupAction] Please choose a stronger password — …data breach.` ×8 (2026-08-06 00:17 → 23:35), `[signupAction] Password must contain at least one number` ×1. 16 signup-blocking events in roughly three days, every one shown with the wrong remediation.

**Root cause:** A defensive error-prettifier with an over-broad substring match placed ABOVE the specific cases, so it captures messages that were already precise and user-ready. The mapper exists to translate raw Supabase/GoTrue strings, but validatePassword's feedback and the breach message are already written for end users.

**Proposed fix:** In getSignupErrorMessage, pass through messages that are already user-facing instead of rewriting them. Replace lines 23-25 with:
```ts
// validatePassword feedback and the breach message are already user-ready — do not rewrite them.
if (lower.startsWith('password must') || lower.includes('data breach') || lower.includes('too common')) return error;
if (lower.includes('weak password')) return 'Password does not meet the requirements. Please use at least 8 characters, with an uppercase letter, a number, and a special character.';
```
Apply the identical change to src/components/auth/baseball-sign-up-form.tsx (same helper, same bug). Separately, gate the submit button on the full rule set the server enforces — PasswordStrengthIndicator already computes all five checks (password-strength-indicator.tsx:23-28); block submit until all five pass so the round-trip never happens.

### HIGH **[CUSTOMER-FACING]** — Baseball invite links never auto-join — the returnTo the join page sets is never persisted (zero setItem call sites in the entire repo)

`src/components/auth/baseball-sign-up-form.tsx:76`

**Breaks:** A baseball coach sends /baseball/join/<CODE>. A new player clicks it, is bounced to signup, creates an account, completes the 4-step onboarding, and lands on /baseball/player/today with no team. The invite link they clicked is gone. Nothing tells them the join didn't happen; the coach's roster stays empty and they re-send the link.

**Evidence:** src/app/baseball/join/[code]/page.tsx:25 redirects an anonymous visitor to `/baseball/signup?returnTo=/baseball/join/${code}`. On the signup page that param is consumed ONLY to build the "Sign in" link href (signup/page.tsx:19-20) — it is never stored. baseball-sign-up-form.tsx:76 then calls `sessionStorage.removeItem('baseball_signup_returnTo')` and line 82-83 pushes the onboarding path, dropping returnTo entirely. Both onboarding pages faithfully try to honour it — player/page.tsx:276-281 and coach-onboarding/page.tsx:262-267 both `getItem('baseball_signup_returnTo')` — but `grep -rn "baseball_signup_returnTo|golf_signup_returnTo" src/` returns 7 hits and NOT ONE is a setItem. The key is never written by anything. So the resume path is unreachable dead code in both sports; golf survives only because its signup page separately parses the code out of returnTo (golf/(auth)/signup/page.tsx:64-78) and threads it as ?joinCode. Baseball has no equivalent. Prod scale is small today (35 onboarded baseball players, 1 teamless) but the mechanism is total.

**Root cause:** A resume-after-signup design that was implemented on the read side (three consumers) and never on the write side. Nothing in CI can catch it: the getItem branches simply never execute, so tests and typecheck stay green.

**Proposed fix:** Two parts. (1) Write the key: in baseball-sign-up-form.tsx, before calling signUpAction, read `searchParams.get('returnTo')` and if it matches `^/baseball/` do `sessionStorage.setItem('baseball_signup_returnTo', returnTo)`; change line 76 from removeItem to leaving it in place so the onboarding consumer at player/page.tsx:276 can claim it. (2) Better, mirror golf and make it explicit rather than sessionStorage-dependent: extract the code with `returnTo?.match(/\/baseball\/join\/([^/?#]+)/i)` and forward it as `?joinCode=` on the onboarding push (line 82-83), then have baseball player onboarding call joinTeamByCode with it on completion — the manual invite-code field already exists at (onboarding)/player/page.tsx:148,194-200, so the action wiring is already there. Whichever path is chosen, delete the other two dead getItem branches so the next reader isn't misled.

### HIGH **[CUSTOMER-FACING]** — getPlayerProfileStats discards the golf_holes read error, and the file's own comment says that silently corrupts scrambling, sand-save and every score/par stat

`src/app/golf/actions/player-profile-stats.ts:161`

**Breaks:** If the golf_holes read fails for any reason (RLS denial, statement timeout on a wide 'overall' fetch, transient 5xx), holesData is null, holesInfo becomes [], and the shot calculator falls back to deriving score from shot count and GIR from shot results. The player's My Game profile still renders — fully populated, no error, no warning — with wrong scrambling %, wrong sand-save %, and wrong score/par-derived numbers. The player has no way to know. Nothing is logged, so nobody on your side knows either.

**Evidence:** player-profile-stats.ts:161 destructures only `data`: `const { data: holesData } = await fetchAllRowsResult((from, to) => supabase.from('golf_holes')...)`. fetchAllRowsResult (src/lib/supabase/fetch-all-rows.ts:103-127) returns `{ data, error }` and does NOT throw — on a first-page error it returns `{ data: null, error }`, so the discarded error becomes `holesData = null`. Line 184 then does `(holesData || []).map(...)`, producing an empty holesInfo. The consequence is stated verbatim in the comment the code sits under, lines 163-165: 'gir/score/sand_save are canonical inputs: without them the calculator falls back to shot-count for score and re-derives GIR from shot results, which corrupts scrambling, sand-save, and any score/par-based stat.' Contrast the shots fetch 25 lines above at :133 — same helper, error IS destructured, logged via logServerError at :146 and returned as a hard failure at :148. The holes fetch was simply missed.

**Root cause:** Only `data` is destructured from a helper that reports failure through `error` and never throws. The empty-array fallback at line 184 turns a read failure into 'this round has no holes', which the calculator treats as a legitimate shot-only round rather than a failure.

**Proposed fix:** Mirror the shots branch exactly. Change line 161 to `const { data: holesData, error: holesError } = await fetchAllRowsResult(...)` and immediately after the call add: `if (holesError) { await logServerError(\`[getPlayerProfileStats] Error fetching holes: ${describeError(holesError)}\`, { action: 'player_profile_stats.getPlayerProfileStats' }); return { success: false, error: 'Failed to fetch hole data', stats: null, rounds }; }`. Failing closed is correct here — a missing-holes profile is worse than an error state, because the numbers look authoritative. Add a unit test that mocks the golf_holes fetch to return an error and asserts success:false rather than a populated stats object.

### HIGH **[CUSTOMER-FACING]** — Same permanent-stamp trap for players with no team membership — 7 rounds go dark forever the moment they are recorded

`src/lib/coachhelm/v2/post-round-trigger.ts:148`

**Breaks:** A player who submits a round while not on a team gets coachhelm_failure_reason='engine_membership_missing' and a non-null coachhelm_failed_at. Team membership is a state that changes — a player joins the roster days later — but the round is already excluded from the safety-net cron's retry set. Their entire pre-join history stays permanently un-analyzed even after the coach adds them.

**Evidence:** 7 completed rounds across 3 distinct players carry coachhelm_failure_reason='engine_membership_missing', spanning round_date 2026-03-10 to 2026-07-23. Verified all three genuinely have 0 rows in golf_team_members today: Andrew Perry 654d35a1 (12 completed rounds, 0 memberships — these rounds have 70-79 shots each), Ben Potter 2ac20cc4 (1 round, 84 shots), Peyton Mussina d75439ba (1 round dated 2026-07-23, 84 shots). Peyton's is the freshest: she recorded a full 84-shot round on 2026-07-23 and it was terminally failed 25 minutes later at 18:07:18. If she is added to a roster tomorrow, that round is still dark. Emitted at severity=info via classifyEngineFailureSeverity, so it never reached the Errors tab.

**Root cause:** post-round-trigger.ts:142 has a single binary notion of outcome: success, or terminal failure. Both 'engine_membership_missing' and 'engine_below_round_floor' describe a precondition that the world will later satisfy, not a fault in the round. Writing coachhelm_failed_at for them converts a retryable state into an irreversible one, because coachhelm-safety-net/route.ts:151 uses that exact column as its permanent exclusion filter.

**Proposed fix:** Add 'engine_membership_missing' to the same NON_TERMINAL_CODES set described in the previous finding, so postRoundTrigger leaves coachhelm_failed_at null for it. Guard against the obvious cost objection: the safety-net cron already caps at BATCH_LIMIT per tick and orders by created_at, so a handful of permanently-unrostered players cannot starve it — but if that is a concern, add a bounded retry counter column rather than a terminal stamp. Backfill: clear coachhelm_failed_at on the 7 'engine_membership_missing' rounds so they re-enter eligibility if/when those players are rostered.

### HIGH **[CUSTOMER-FACING]** — Stripe webhooks have been rejected wholesale — 50 deliveries 500'd and the invoice mirror is empty

`src/app/api/webhooks/stripe/route.ts:141`

**Breaks:** STRIPE_WEBHOOK_SECRET is unset in production, so every inbound Stripe webhook is refused with HTTP 500 before signature verification. Stripe retries on 5xx for ~3 days and then gives up permanently. Invoice lifecycle events (finalized / sent / paid / payment_failed / void) never reach the platform, so billing_invoices — the local mirror the admin billing surface and any dunning logic read — knows nothing. A school can pay an invoice in Stripe and the platform will show it unpaid indefinitely.

**Evidence:** 50 error rows, fingerprint ad6b5488, title "[route.POST] [Stripe Webhook] STRIPE_WEBHOOK_SECRET is not configured", first 2026-07-30 01:39:09, last 2026-08-02 10:14:09 — the burst-then-decay-then-stop shape of Stripe's retry schedule exhausting itself. This is the single highest-count error in admin_events over 30 days. Measured the consequence directly: `select count(*) from billing_invoices` returns 0 rows, with the migration (20260715120000) applied 2026-07-29 per the route's own header comment, which also notes there are six live invoices in Stripe.

**Root cause:** Missing production environment variable, not a code bug — but the code makes it maximally costly: the guard at line 142-148 returns 500, which puts Stripe into retry-then-discard rather than surfacing the misconfiguration anywhere a human looks. It logs at 'error' into admin_events, which nobody was watching, and there is no startup-time assertion that the secret exists.

**Proposed fix:** 1) Set STRIPE_WEBHOOK_SECRET in the Vercel production environment (Stripe Dashboard -> Developers -> Webhooks -> the endpoint's signing secret, whsec_...). Verify with a Stripe CLI `stripe trigger invoice.paid` against production, then confirm a row lands in billing_invoices.
2) Backfill the gap: the ~4 days of events are gone from Stripe's retry queue, so reconcile by listing invoices via the Stripe API and upserting them through the same syncInvoice path (it is idempotent on stripe_invoice_id).
3) Prevent recurrence: add STRIPE_WEBHOOK_SECRET to whatever required-env assertion runs at boot, and add an integrity-check probe (the integrity-check cron already runs daily at 07:00) that alarms when billing_invoices has zero rows while Stripe reports live invoices.

### HIGH **[CUSTOMER-FACING]** — Unread-message badge silently reads 0 for both coaches and players when the per-conversation count fails

`src/app/golf/actions/coach-notifications.ts:90`

**Breaks:** The nav bell/badge shows no unread messages while unread messages exist. A coach or player never learns a teammate messaged them. Each conversation is counted independently, so a partial failure produces a partially-wrong badge (e.g. 2 instead of 7) with no indication anything went wrong.

**Evidence:** coach-notifications.ts:90-96 — `const { count } = await supabase.from('golf_messages').select('*', { count: 'exact', head: true }).eq('conversation_id', p.conversation_id).neq('sender_id', viewerId).gt('created_at', p.last_read_at || '1970-01-01'); return count || 0;`. `.error` is never destructured; on failure `count` is null and `|| 0` makes it a clean zero. Identical code at player-notifications.ts:234-240 (same query, `userId` instead of `viewerId`). Upstream, coach-notifications.ts:86 and player-notifications.ts:228 do `const participants = conversationsResult.data || []` — an error on the participants read yields `[]`, which skips the loop entirely and reports `unreadMessages: 0` for ALL conversations at once. Both actions return `{ success: true }` in that case, so notification-badge-context.tsx (lines 128 and 138, which call them on a 45s poll) has no way to tell a zero from a failure. Production: 36 golf_messages across 51 golf_conversation_participants rows, so real unread counts exist.

**Root cause:** `count || 0` and `data || []` map the error channel onto the empty-result value, and the action's success flag does not reflect partial read failure.

**Proposed fix:** In both files, destructure `error` in the per-conversation count and make the aggregate honest. Replace the map body with:
```ts
const { count, error } = await supabase.from('golf_messages')...;
if (error) return { count: 0, failed: true };
return { count: count ?? 0, failed: false };
```
then `const anyFailed = results.some(r => r.failed) || conversationsResult.error != null;` and return `unreadMessages: anyFailed ? null : sum` (widen the type to `number | null`) so the badge renders nothing rather than a false 0. Also `await logServerError(...)` on `conversationsResult.error` with `{ action: 'getCoachNotificationCounts' | 'getPlayerNotificationCounts', featureArea: 'notifications' }`. Update notification-badge-context.tsx to treat null as "unknown" and keep the previous value instead of clearing the badge.

### HIGH **[CUSTOMER-FACING]** — Golf join flow: a failed coach/player lookup misroutes the user and can create a stray golf_players row

`src/app/golf/join/[code]/page.tsx:29`

**Breaks:** Two distinct failures on the first-contact join link. (a) If the `golf_coaches` read errors, `coach` is null and a real coach falls through to the player branch and is redirected to `/golf/player?joinCode=…`, whose onboarding calls `ensurePlayerRecord()` — creating exactly the stray `golf_players` row the code comment says must never be created. (b) If the `golf_players` read errors, an already-onboarded player is bounced back into player onboarding they finished months ago. Neither logs anything.

**Evidence:** join/[code]/page.tsx:29-33 — `const { data: coach } = await supabase.from('golf_coaches').select('id, onboarding_completed').eq('user_id', user.id).maybeSingle();` then line 35 `if (coach) redirect(...)`. Lines 40-44 — `const { data: player } = await supabase.from('golf_players').select('id, first_name, last_name, graduation_year, onboarding_completed').eq('user_id', user.id).maybeSingle();` then line 46 `if (!player || !player.onboarding_completed) redirect('/golf/player?joinCode=' + code)`. Neither destructures `error`. The comment at lines 25-28 states the exact consequence: "A coach can't 'join' a team as a player… that path calls ensurePlayerRecord() and would create a stray golf_players row." The very next read (line 63, the join-code RPC) DOES destructure `teamError`, so the pattern is inconsistent within 30 lines. This route has a documented history of the same failure mode — the RLS tightening in #1257 killed 100% of player joins for ~6 months because the join's own pre-flight read went through the policy that had just been closed.

**Root cause:** `.maybeSingle()` results are consumed as a truthiness test on `data` alone. A read failure is indistinguishable from "this user is not a coach" / "this user has no player record", and both indistinguishable states drive an irreversible redirect.

**Proposed fix:** Destructure and hard-fail rather than guess identity on the join path:
```ts
const { data: coach, error: coachError } = await supabase.from('golf_coaches')...;
if (coachError) throw new Error('Could not verify your account. Please try again.');
...
const { data: player, error: playerError } = await supabase.from('golf_players')...;
if (playerError) throw new Error('Could not verify your account. Please try again.');
```
The route already has an error UI shape (lines 69-97) — reuse it with distinct copy so a DB failure never reads as "Invalid Invite Code". Separately, line 68's `if (teamError || !team)` should split: `teamError` → "Something went wrong, try again"; `!team` → "Invalid Invite Code".

### HIGH **[CUSTOMER-FACING]** — Targeted-announcement recipient gate fails OPEN when the admin recipient read errors

`src/app/golf/actions/announcements.ts:670`

**Breaks:** A coach sends an announcement targeted at a subset of the roster (e.g. "the four seniors travelling to regionals"). If the recipient lookup errors, every other player on the team can open and read that announcement's title and body. The same fail-open exists on the player badge path, where a failed lookup makes every targeted announcement appear in every teammate's unseen-announcement modal.

**Evidence:** announcements.ts:670-676 — `const { data: recipientGate } = await (createAdminClient() as any).from('golf_announcement_recipients').select('player_id').eq('announcement_id', announcementId)` then `const gateRecipientIds = (recipientGate || []).map(...)` and `if (gateRecipientIds.length > 0 && !gateRecipientIds.includes(playerCheck.id)) return { success:false, error:'Announcement not found' }`. `.error` is never read, so a failed read yields `[]`, `length > 0` is false, and the gate passes. The comment directly above (lines 661-668) states the intended semantics: "An empty recipient set still means 'all-team' (do not turn that into a denial)" — which is correct for a genuinely empty set and catastrophic for a failed read, because the two are the same value here. Second site, same class: player-notifications.ts:167-171 `const { data: recipientRows } = await (admin as any).from('golf_announcement_recipients').select('announcement_id, player_id').in('announcement_id', announcementIds)` → `allRecipients = ... ?? []` → the visibility filter at line 182-186 returns `true` for every announcement (`if (!recipients || recipients.length === 0) return true; // all team`). Third site: announcements.ts:464 (coach list) has the same shape. Production: 13 golf_announcements exist.

**Root cause:** An empty array is overloaded to mean both "broadcast to the whole team" (allow) and "the lookup failed" (unknown). Because the permissive branch is the one an empty array selects, every read failure is an authorization bypass.

**Proposed fix:** Distinguish the three states explicitly at all three sites. At announcements.ts:670:
```ts
const { data: recipientGate, error: gateError } = await (createAdminClient() as any)
  .from('golf_announcement_recipients').select('player_id').eq('announcement_id', announcementId);
if (gateError) {
  await logServerError(`announcement recipient gate read failed: ${gateError.message}`, { action: 'announcements.getAnnouncementDetail', featureArea: 'announcements' });
  return { success: false, error: 'Announcement not found' }; // fail CLOSED
}
```
At player-notifications.ts:167 destructure `recipientsError`; if set, log it and skip the unseen-announcement modal + return `unreadAnnouncements: null` rather than filtering with an empty index. Add a unit test at each site that mocks the builder resolving `{data:null,error}` and asserts denial, not allowance.

### HIGH **[CUSTOMER-FACING]** — Qualifier leaderboard shows every player at 0 strokes / 0 rounds when the rounds read fails

`src/app/golf/(dashboard)/dashboard/qualifiers/[id]/page.tsx:96`

**Breaks:** On a qualifier detail page, if the `golf_rounds` read errors, every entered player renders with totalScore 0, totalToPar 0, an empty round list, and the page reports "0 rounds submitted". The sort then orders players arbitrarily (all comparisons hit the 0===0 branch). A coach uses this board to pick the travel squad; it will read as "nobody has played yet" on a completed qualifier.

**Evidence:** qualifiers/[id]/page.tsx:96-101 — `const { data: rounds } = await supabase.from('golf_rounds').select('id, player_id, total_score, score_to_par, qualifier_round_number, round_date, course_name, status').eq('qualifier_id', id).eq('status','completed').order('qualifier_round_number', { ascending: true });` with no `error`. Downstream: line 112 `const playerRounds = (rounds || []).filter(...)` → line 122 `totalScore: playerRounds.reduce((sum, r) => sum + (r.total_score || 0), 0)` → 0; line 123 same for totalToPar; line 138 `maxRoundNumber` → 0; line 140 `totalRoundsSubmitted = (rounds || []).length` → 0. Line 128-135's sort resolves every pair through the `a.rounds.length === 0 && b.rounds.length === 0 → return 0` branch, so display order is whatever Object.entries yields. Contrast line 59-69, where the qualifier row itself is fetched and guarded (`if (!qualifier) notFound()`) — the guard exists for the parent row and not for the data the board is made of. Production: 4 golf_qualifiers, 302 completed rounds.

**Root cause:** `(rounds || [])` is used at four separate aggregation sites; a null from an error path is treated as "no rounds have been submitted", which is a meaningful and plausible-looking business state.

**Proposed fix:** Destructure the error and render an honest failure for the board only (the qualifier header can still render):
```ts
const { data: rounds, error: roundsError } = await supabase.from('golf_rounds')...;
```
Then pass `roundsUnavailable={roundsError != null}` into `FairwayQualifierDetail` and have it render an InlineNotice (tone="danger") with a retry in place of the leaderboard, instead of the zeroed breakdown. Do not fall back to `[]`. Also `await logServerError` with `{ action: 'qualifierDetail.rounds', featureArea: 'qualifiers' }`.

### HIGH **[CUSTOMER-FACING]** — The schedule-import path throws away every syncClassToCalendar result and always toasts 'Synced to your calendar'

`src/app/golf/(dashboard)/dashboard/classes/page.tsx:334`

**Breaks:** handleConfirmClasses builds N syncClassToCalendar promises (line 310-332), `await Promise.all(syncPromises)` at line 334, and NEVER inspects a single CalendarSyncResult. Line 341 then unconditionally fires `fairwayToast.success('N classes imported', { description: 'Synced to your calendar.' })`. Every failure syncClassToCalendar can return — 'Could not determine semester dates', 'Class start and end times must look like HH:MM', 'Semester range too large', an RLS refusal, a Postgres insert error — is announced to the player as a success. This is the SAME defect that was just fixed on the add path (line 154-175) and the edit path (line 222-228); the bulk/vision-import path, which is how players actually load a full semester, was left as-is.

**Evidence:** page.tsx:308-344 read directly: no variable captures the Promise.all result, no `.success` check exists anywhere in handleConfirmClasses. Compare handleAddClass:160 (`if (!syncResult?.success)`) and handleUpdateClass:222.
Production corroboration: the 2026-08-06 01:48Z Shenandoah import produced classes whose whole semester is 1-2 events — SPAN-202-F2F (M/W/F 12:00) has 2 events (Aug 12, Aug 14); PSY-222-F2F1 (F 13:00) has 1; CJ-343-BLD (M/W 13:00) has 1. And 17 of the 43 golf_player_classes rows have ZERO calendar events at all (6 on Demo University Golf imported 2026-07-23, 11 on Lynchburg Women's Golf). Nobody was ever told.
Compounding, in the same block: line 326 `semester: confirmedClass.semester || 'Spring 2026'` hardcodes a term four months in the past — a class that falls back to it generates ~55 events entirely in the past and still returns success:true. And src/lib/golf/semester.ts:83-85 returns null (=> 'Could not determine semester dates') whenever the ConfirmClassesModal's REQUIRED user-entered start date (ConfirmClassesModal.tsx:96,102) falls outside the auto-detected term's hardcoded window — a Fall start date entered against a 'Summer' detection kills the entire sync, silently.

**Root cause:** Three independent single-points-of-silence stacked on one path: (a) the result of a server action that reports failure by return value is discarded, (b) the toast is unconditional, and (c) the term the sync will use is chosen by a hardcoded literal ('Spring 2026') the user never sees and cannot correct, validated against a hardcoded window the user also never sees (ConfirmClassesModal asks for a start date but not a term).

**Proposed fix:** 1) Capture and report results:
   const results = await Promise.allSettled(syncPromises);
   const failures = results.filter(r => r.status !== 'fulfilled' || !r.value?.success);
   then branch the toast: on failures, `fairwayToast.error('N classes imported, M were not added to your calendar', { description: <first error> })`.
2) Delete the 'Spring 2026' literal at line 326 — pass `confirmedClass.semester` through and let syncClassToCalendar's existing null-check surface 'Could not determine semester dates' (which will now be visible).
3) In ConfirmClassesModal, show the detected semester and let the user change it, so the start-date validation in semester.ts:84 can't fail against a term the user never saw.

### HIGH **[CUSTOMER-FACING]** — Unsynced classes and the 'find a time' slot generator build wall-clock times in the SERVER's timezone (UTC on Vercel), so busy blocks land 4-5 hours early

`src/lib/calendar/availability.ts:466`

**Breaks:** setTimeOnDate (line 466-471) does `result.setHours(hours, minutes)` — Node's local timezone. Vercel functions run TZ=UTC (no TZ override in vercel.json/next.config.mjs). So an 11:30 AM Eastern class expands to a busy period at 11:30 UTC = 7:30 AM Eastern. A coach using the availability overlay or 'find a time' sees the player blocked at 7:30 AM and FREE at 11:30 AM — and will schedule a lift right on top of the lecture. parseEventDateTime (line 362-368) has the identical bug for golf_coach_blocked_time (`new Date(`${date}T${time}`)`, offset-naive), and generateTimeSlots (line 511-541) does `slotStart.setHours(hour)` so the 7-19 'working hours' window becomes 3 AM - 3 PM Eastern in the suggested-times list.

**Evidence:** availability.ts:469 `result.setHours(hours ?? 0, minutes ?? 0, 0, 0)` — no zone. availability.ts:367 `return new Date(`${date}T${time}`)` — offset-naive string, parsed as server-local. availability.ts:526 `slotStart.setHours(hour, 0, 0, 0)`. No `TZ` set in vercel.json or next.config.mjs (grepped, no hits), so Vercel's default UTC applies.
This path is LIVE, not theoretical: expandRecurringClass now runs for every class with no synced calendar occurrences (the comment at line 417-431 explains it was deliberately un-gated because all 43 rows have semester=NULL). Production has 17 such classes — 11 on 'Lynchburg Women's Golf' (6 members) and 6 on 'Demo University Golf' (7 members). Example: Lynchburg's ECON 300, T/Th 11:30-12:45, produces a busy block at 11:30-12:45 UTC = 7:30-8:45 AM Eastern.
Contrast with the caller, which DOES get this right: golf.ts:4302-4303 builds the window with buildDateTimeString(startDate,'00:00:00',timezoneOffset). The window is zone-correct; the contents are not.

**Root cause:** `golf_player_classes.start_time` is a Postgres `time` column holding a wall-clock time with no zone. Turning a wall-clock time into an instant requires a zone, and this file supplies none — it lets Date's implicit server-local default stand in. The caller already threads a timezoneOffset for the window bounds but never passes it into getUserBusyPeriods, so the information exists one frame up the stack and is dropped.

**Proposed fix:** Thread the caller's timezoneOffset (already computed at golf.ts:4302 and FairwayCalendar.tsx ~line 338) into getUserBusyPeriods, and replace the three sites with offset-explicit construction mirroring calendar-sync.ts:123:
  function atLocalTime(dateKey: string, time: string, tzOffsetMin: number) {
    const sign = tzOffsetMin <= 0 ? '+' : '-'; const a = Math.abs(tzOffsetMin);
    return new Date(`${dateKey}T${time.length===5?time+':00':time}${sign}${String(Math.floor(a/60)).padStart(2,'0')}:${String(a%60).padStart(2,'0')}`);
  }
Apply to setTimeOnDate (466), parseEventDateTime (362), generateTimeSlots (511) — and to the `current.getDay()` weekday test at line 439, which is also UTC-derived today. Prefer the team's golf_team_settings.timezone when no caller offset is supplied.

### HIGH **[CUSTOMER-FACING]** — availability.ts discards the `error` on five reads; a failed team lookup makes the conflict checker report 'no conflicts' for everyone

`src/lib/calendar/availability.ts:124`

**Breaks:** Five reads in getUserBusyPeriods destructure only `data`. The worst is team resolution (line 123-137): `const { data: teams } = await supabase.from('golf_teams')...` and `const { data: memberships } = await supabase.from('golf_team_members')...`. If either read fails (RLS change, transient DB error, the Supabase wedge we've already had), `teamIds` becomes `[]`, teamEventsPromise short-circuits to `Promise.resolve([])` at line 157, and the function returns zero busy periods. checkEventConflicts (conflicts.ts:91-118) then reports 'no conflicts' and the coach schedules a practice on top of a tournament — with no error anywhere. Same pattern at line 186 (classesPromise, read as `classesResult.data` at 294 — a failed class read silently means 'this player has no classes'), line 195 (blockedTimesPromise), and line 231 (`const { data: ownedClasses }` — a failed read strips the player's OWN synced class occurrences out of their busy time).

**Evidence:** Read directly: availability.ts:124 `const { data: teams } = await supabase.from('golf_teams').select('id').eq('organization_id', coach.organization_id);` — no error binding. Same shape at 131, 181-186, 188-195, 231-235. `teamIds.length > 0` at line 146 is the only gate, and it cannot distinguish 'no teams' from 'the query failed'. Nothing in this file calls logServerError or describeError. Contrast with the calendar page, which was already hardened for exactly this (calendar/page.tsx:149-151 throws rather than render an empty calendar, 'audit finding #20').

**Root cause:** An empty busy list is the same value for 'this person is free' and 'I could not find out'. Because the errors are never bound, the function has no way to express the second, and its single return type forces every failure into the most dangerous of the two readings on a scheduling surface.

**Proposed fix:** Bind and act on each error. Minimum: for the two team lookups, `const { data: teams, error: teamsError } = ...; if (teamsError) throw new Error(...)` so getPlayerAvailability's try/catch (golf.ts:4324) returns `{success:false}` and the UI shows an error rather than a false all-clear. For classesResult / blockedTimesResult / ownedClasses, do the same, or at minimum `await logServerError(...)` and add a `partial: true` flag to the result so the conflict UI can say 'could not check all sources' instead of 'no conflicts'.

### HIGH **[CUSTOMER-FACING]** — round-reviews.ts is a 1971-line parallel implementation where 16 of 18 exported server actions have zero call sites — including the whole coach→player publish/share/acknowledge workflow

`src/app/golf/actions/round-reviews.ts:1683`

**Breaks:** A developer asked to "let coaches publish round reviews to players" finds `publishReview` already written, correctly authorising the coach and writing status/published_at/published_by, and concludes the feature exists and just needs a button. Wiring that button ships nothing visible to the player, because the readers in the same file consult patterns_detected JSON and the live page consults round-review-system.ts, which reads neither. The near-identical `markReviewViewedByPlayer` vs live `markReviewAsViewed` pair makes the same mistake available on the read side.

**Evidence:** The file is 1971 lines and exports 18 `'use server'` actions. Repo-wide grep for live importers (excluding __tests__ and *.test.*):
  src/app/golf/(dashboard)/dashboard/rounds/[id]/review/CoachNotesSection.tsx:18 → `annotateReview`
  src/app/golf/(dashboard)/dashboard/rounds/[id]/review/page.tsx:30 → `markReviewAsViewed`
That is the complete list. The other 16 are unreachable from any UI:
  publishReview (line 1683), shareReviewWithPlayer (931), markReviewViewedByPlayer (1782), acknowledgeReview (1879), addPlayerFeedback, saveCoachFeedback, getReviewById, getReviewByRoundId, getTeamReviews, getPlayerReviewHistory, retryReviewGeneration, getReviewGenerationStatus, generateRoundReview; plus getPendingCoachReviews and markReviewViewedByCoach which are referenced ONLY from their own test files.

The review route actually in use imports from a DIFFERENT module: src/app/golf/(dashboard)/dashboard/rounds/[id]/review/page.tsx:29 imports from '@/app/golf/actions/round-review-system' (5 exports, all live). So there are two full implementations of round review side by side, and the dead one is the one that carries the schema model described in the companion finding.

PRODUCTION: golf_round_reviews has 77 rows; published_at is NULL on all 77 and shared_with_player is false on all 77 — consistent with publishReview/shareReviewWithPlayer never having executed.

Note both dead and live modules define a duplicate pair with near-identical names — `markReviewViewedByPlayer` (dead, round-reviews.ts:1782) vs `markReviewAsViewed` (live, imported by the page). That is exactly the kind of near-miss that gets an autocomplete-driven fix wired to the wrong one.

**Root cause:** round-review-system.ts was written as the replacement for round-reviews.ts but the old module was never deleted, and two of its functions were left wired into the new page — so it stays in the build, stays typechecked, stays green, and reads to every grep and to knip-style analysis as live code.

**Proposed fix:** Delete the 16 unreachable exports from src/app/golf/actions/round-reviews.ts, or move `annotateReview` and `markReviewAsViewed` into round-review-system.ts and delete round-reviews.ts entirely (preferred — it removes the contradictory ReviewDbRow/ReviewExtendedData schema model in one stroke). Delete the two test files that exist only to exercise dead exports (getPendingCoachReviews, markReviewViewedByCoach, validatePattern-style test-only survivors). If the coach→player publish workflow is wanted, rebuild it on round-review-system.ts against the real `status`/`published_at`/`shared_with_player` columns per the companion finding. Add `src/app/golf/actions/**` to the knip entry config so a `'use server'` export with zero importers fails CI instead of accumulating.

### HIGH **[CUSTOMER-FACING]** — src/lib/types/golf.ts claims golf_announcement_acknowledgements "doesn't exist" — it exists in production AND in the generated database.ts, and the false belief produced `as any` casts that discard query errors

`src/lib/types/golf.ts:33`

**Breaks:** Two concrete consequences. (a) Anyone writing a new acknowledgement query trusts the comment, adds another `as any`, and loses type-checking on that table — which is precisely how the error-discarding casts in announcements.ts got written (see the companion finding). (b) Anyone consuming `GolfAnnouncementAcknowledgement.created_at` gets a field the DB never returns — always `undefined`, rendering as blank/Invalid Date — and anyone relying on `acknowledged_at: string` being non-null will crash on `.toLocaleDateString()` the first time a row is inserted without it (the column is nullable and has no default).

**Evidence:** src/lib/types/golf.ts:33 reads verbatim:
    // GolfAnnouncementAcknowledgement - table doesn't exist, define manually
followed by a hand-written interface at line 34.

Both halves of that claim are false:
1. LIVE DB (Supabase MCP, information_schema.columns): public.golf_announcement_acknowledgements exists with exactly 4 columns — id (uuid, NOT NULL), announcement_id (uuid, NOT NULL), player_id (uuid, NOT NULL), acknowledged_at (timestamptz, NULLABLE).
2. It is ALREADY in the generated types: src/lib/types/database.ts:10675 `golf_announcement_acknowledgements: { Row: { acknowledged_at: string | null; announcement_id: string; id: string; player_id: string } ... }`. So `Tables<'golf_announcement_acknowledgements'>` resolves today.

The hand-written interface at golf.ts:34-41 diverges from both: it declares `created_at?: string` (NOT a column — 4 columns exist, created_at is not one) and `acknowledged_at: string` non-nullable (the DB and the generated Row both say `string | null`).

The belief propagated into the query layer. src/app/golf/actions/announcements.ts:472 and :781 both reach the table through `await (supabase as any).from('golf_announcement_acknowledgements')...` with an eslint-disable for no-explicit-any — a cast that is only necessary if you believe the table is missing from the schema types. It isn't.

PRODUCTION: 13 golf_announcements rows, 4 with requires_acknowledgement = true, 11 golf_announcement_acknowledgements rows (0 with NULL acknowledged_at). Live paying-customer feature.

**Root cause:** The comment predates the migration that created the table (or predates a `docs:regen`/`generate_typescript_types` run) and was never re-checked. Nothing in CI compares hand-written interfaces in src/lib/types/golf.ts against the generated Database type, so a stale manual mirror is invisible.

**Proposed fix:** Replace src/lib/types/golf.ts:33-41 with:
    export type GolfAnnouncementAcknowledgement = Tables<'golf_announcement_acknowledgements'>;
Then fix the two now-unnecessary casts: in src/app/golf/actions/announcements.ts drop the `(supabase as any)` and the trailing `as { data: ... | null }` at lines 472-476 and 781-785, letting the generated types flow (this also forces the `error` channel back into scope — see the companion finding). Add a lint/test guard asserting every `export interface Golf*` in src/lib/types/golf.ts either has no same-named table in `Database['public']['Tables']`, or is defined as `Tables<...>`.

### HIGH **[CUSTOMER-FACING]** — Announcement acknowledgement reads cast away the `error` channel — a failed read renders as a confident "0 acknowledged"

`src/app/golf/actions/announcements.ts:781`

**Breaks:** A coach posts a team announcement with requires_acknowledgement. Players acknowledge it. An RLS change, a transient PostgREST error, or a row-limit trip makes the acknowledgement read fail. The detail view renders "0 of 12 acknowledged" and an empty avatar stack; the list view renders has_player_acknowledged=false for a player who already acknowledged. No toast, no Sentry event, no server log. The coach chases twelve players who already responded — the exact "confident zero" class the founder called out.

**Evidence:** Two reads of golf_announcement_acknowledgements destructure only `data` and then cast the result to a data-only shape, which structurally deletes `error` from the type so no reviewer or compiler can notice it was never checked:

announcements.ts:781-785 (inside getAnnouncementDetailImpl, line 611):
    const { data: acks } = await (supabase as any)
      .from('golf_announcement_acknowledgements')
      .select('id, announcement_id, player_id, acknowledged_at')
      .eq('announcement_id', announcementId)
      .order('acknowledged_at', { ascending: false }) as { data: Array<{...}> | null };

announcements.ts:472-476 (inside getAnnouncementsWithMetaImpl, line 392): same shape for the list view.

The results feed the coach's progress readout directly — announcements.ts:820-829 `acknowledgements: (acks || []).map(...)` and `acknowledged_count: (acks || []).length`, and announcements.ts:563/568 `acknowledged_count: acks.length` / `has_player_acknowledged` in the list view. On any failure (RLS denial, transient network, PostgREST error) `acks` is null, `(acks || [])` is `[]`, and the coach is shown `acknowledged_count: 0` against a real `total_recipients` — a confident, wrong zero with nothing logged. Every other read in this same function pair does destructure and check `error`; these two are the exception, and the exception exists precisely because the `as any` + `as { data }` cast pair (added because of the false "table doesn't exist" comment in src/lib/types/golf.ts:33) removed the error field from the type.

PRODUCTION: 13 announcements, 4 with requires_acknowledgement = true, 11 acknowledgement rows. This is the number a coach uses to decide whether to chase a player.

**Root cause:** The `as { data: T | null }` cast is a structural type assertion that drops `error` from the awaited PostgrestResponse, so the usual `if (error)` guard is not merely omitted — it is unwriteable. The cast was introduced to work around a believed-missing schema type that is in fact present at src/lib/types/database.ts:10675.

**Proposed fix:** Remove both casts and use the generated types (the table IS in database.ts):
    const { data: acks, error: acksError } = await supabase
      .from('golf_announcement_acknowledgements')
      .select('id, announcement_id, player_id, acknowledged_at')
      .eq('announcement_id', announcementId)
      .order('acknowledged_at', { ascending: false });
    if (acksError) {
      await logServerError(`getAnnouncementDetail acks read failed: ${acksError.message}`, { action: 'getAnnouncementDetail', featureArea: 'announcements', extra: { announcementId, errorCode: acksError.code } });
      return { success: false, error: 'Could not load acknowledgements' };
    }
Apply the same at :472-476 for `allAcks` (there, prefer degrading the specific card rather than the whole list — but surface it, do not render 0). Do the same for the sibling `allRecipients` read at :464-468, which has the identical cast. Then delete the `// eslint-disable-next-line @typescript-eslint/no-explicit-any` lines that become unnecessary.

### HIGH **[CUSTOMER-FACING]** — Deleting a class (single and delete-all) claims "Removed from your calendar" while discarding the removal result — and deletes the class row anyway, destroying the only retry path

`src/app/golf/(dashboard)/dashboard/classes/page.tsx:235`

**Breaks:** A player deletes a class. `removeClassFromCalendar` fails (any of: not authenticated, no `golf_players` row, `golf_team_members` read error, class owned by someone else, or the `golf_events` delete erroring). The result is thrown away, the `golf_player_classes` row is deleted regardless, and the player is told "Class deleted — Removed from your schedule and calendar." The `[class:<id>]`-tagged events stay on the team calendar forever: the class row no longer exists, so nothing in the UI can ever target that tag again. Same bug in `confirmDeleteAllClasses`, which loops the same discarded call over every class and then says "All classes deleted — Your schedule and calendar are clear."

**Evidence:** Line 235 `await removeClassFromCalendar(selectedClass.id);` — result dropped; the `golf_player_classes` delete follows at 238-242 and only *its* error is checked; line 253 `fairwayToast.success('Class deleted', { description: 'Removed from your schedule and calendar.' });`. Second site: line 405 `for (const classId of classIds) {` / line 406 `await removeClassFromCalendar(classId);` → line 419 `fairwayToast.success('All classes deleted', { description: 'Your schedule and calendar are clear.' });`. `removeClassFromCalendar` returns `Promise<CalendarSyncResult>` and never throws (src/app/golf/actions/calendar-sync.ts:564); its failure returns are at calendar-sync.ts:478, 488, 497, 507, 532, 535, and 551 (`Failed to remove class from calendar: ${error.message}`). The action's own doc comment at calendar-sync.ts:465-469 states outright: "Both call sites in /golf/dashboard/classes discard this result and delete the golf_player_classes row regardless" — the server was hardened to survive the discard (absence is treated as orphan cleanup) but the toast was never made honest. PRODUCTION: 879 `[class:` tagged `golf_events`, 0 currently orphaned — this path has not fired yet, but nothing prevents it.

**Root cause:** Result of a `{success, error}` action discarded at two call sites, followed by an unconditional success toast that asserts the calendar side happened. The destructive local delete is sequenced before the remote removal is confirmed, so a failure is unrecoverable.

**Proposed fix:** In `handleDeleteClass`: bind the result — `const removal = await removeClassFromCalendar(selectedClass.id);` — and do NOT delete the `golf_player_classes` row when `!removal.success`; instead `fairwayToast.error('Could not remove this class from your calendar', { description: removal.error ?? 'Unknown error' })` and return, keeping the class row so the player can retry. Only on `removal.success` proceed to the row delete and the success toast. In `confirmDeleteAllClasses`: replace the bare loop with `const removals = await Promise.all(classIds.map((id) => removeClassFromCalendar(id)));`, compute `const failed = removals.filter((r) => !r.success)`, and if `failed.length > 0` abort the bulk `golf_player_classes` delete and surface `\`${failed.length} of ${classIds.length} classes could not be removed from your calendar\`` instead of "Your schedule and calendar are clear."

### HIGH **[CUSTOMER-FACING]** — Baseball stat import reports "Import committed · N created" while the canonical box-score write that Stats Center actually reads is discarded

`src/app/baseball/actions/imports.ts:1786`

**Breaks:** A coach commits a game box-score CSV. The legacy `baseball_player_stats` rows land, so the wizard reports "Import committed · 12 created · 0 updated". The canonical write — `save_baseball_full_box_score`, which populates `baseball_box_score_batting`/`_pitching` and recalculates season stats — silently failed, so Stats Center (which reads the box-score tables, never `baseball_player_stats`) shows nothing for that game. Concrete trigger: a staff member without `can_manage_stats` on the game's team. `commitImport` gates on `can_manage_imports`, but `saveFullBoxScoreAction` independently calls `requireBaseballCapability(game.team_id, 'can_manage_stats')` (src/app/baseball/actions/games.ts:922) — that throws, `saveFullBoxScore`'s own try/catch converts it to `{success:false}` (games.ts:964-978), and this line drops it. Same for a `save_baseball_full_box_score` RPC error or an RLS denial (games.ts:933-942).

**Evidence:** src/app/baseball/actions/imports.ts:1786 `await saveFullBoxScore(gameId, battingRows, pitchingRows, ourScore, opponentScore);` — return value never bound. The comment directly above at line 1784-1785 acknowledges it "never throws — returns a result" and then ignores that result. `applyGameBoxScoreImport` returns the snapshot regardless (line 1789-1798) and its outer `catch { return null }` at 1811-1814 swallows anything else. The caller `applyImportPlan` at line 1427 assigns that to `boxScoreSnapshot` and never inspects success. The UI toast is src/components/baseball/import-center/ImportWizardClient.tsx:639-643: `title: 'Import committed', description: \`${res.created} created · ${res.updated} updated · ...\`` — `CommitImportResult` (imports.ts:306-341) has no field that can carry a canonical-write failure. Verified `saveFullBoxScore`'s three `{success:false}` returns at games.ts:918, 942, 948.

**Root cause:** A `{success, error}`-returning action invoked as a bare statement inside a best-effort helper whose contract ("never throws") was mistaken for "cannot fail". The commit result type has no channel to report a partial write, so even a checked failure would have nowhere to go.

**Proposed fix:** Bind it: `const boxScoreSave = await saveFullBoxScore(gameId, battingRows, pitchingRows, ourScore, opponentScore);`. Add `canonicalWriteError: string | null` to `GameBoxScoreSnapshot` and set it from `boxScoreSave.error` when `!boxScoreSave.success`. Propagate it up through `applyImportPlan` into a new `canonicalWriteError: string | null` field on `CommitImportResult` (imports.ts:306). In ImportWizardClient.tsx:634-643, when `res.canonicalWriteError` is set, switch the toast to `type: 'warning'` with title `'Import committed — Stats Center not updated'` and the error as the description, so the coach knows to retry rather than believing Stats Center is just slow. Also log the failure via `logServerError` at the imports.ts call site — right now nothing anywhere records it.

### HIGH **[CUSTOMER-FACING]** — Baseball import rollback discards the canonical revert, still marks the run 'rolled_back', and reports "N removed · M restored" — permanently hiding the only retry control

`src/app/baseball/actions/imports.ts:1944`

**Breaks:** A coach rolls back a bad game-box-score import. The legacy `baseball_player_stats` rows are reverted, but `revertGameBoxScoreImport`'s call to `saveFullBoxScore` (which restores the pre-import box score) fails and is swallowed by a bare `catch {}`. `rollbackImport` then unconditionally stamps `status: 'rolled_back'` on `baseball_import_runs` and the UI shows "Import rolled back — 8 removed · 3 restored". Stats Center still shows the bad imported numbers, and because the run is now `rolled_back` the Roll-back control disappears from the recent-imports list — the coach cannot retry. The data is wrong and there is no in-product way to fix it. The file's own author identified this exact hazard for the event-grain case (the guard at imports.ts:2050-2056 refuses rather than "report `0 removed · 0 restored` as a false success and still mark the run 'rolled_back'") but left the box-score revert path unguarded.

**Evidence:** src/app/baseball/actions/imports.ts:1944-1950 `await saveFullBoxScore(snap.gameId, snap.beforeBatting, snap.beforePitching, ...)` — result dropped; wrapped in `try { ... } catch { }` at 1955-1961 with the comment "Non-fatal: ... the canonical box score may retain this import's numbers until retried." `revertGameBoxScoreImport` returns `void`, so `rollbackImport` at imports.ts:2107-2108 cannot learn anything. Lines 2114-2120 then unconditionally `.update({ status: 'rolled_back', rolled_back_at: ... })`, and line 2132 returns `{ reverted, restored }` counted only from the legacy loop. UI: src/components/baseball/import-center/ImportWizardClient.tsx:676-687 — `const res = await rollbackImport(...)` then optimistically sets the local row to `status: 'rolled_back'` and toasts `title: 'Import rolled back', description: \`${res.reverted} removed · ${res.restored} restored\``. The only error branch is `catch` (line 688), which the swallowed failure never reaches.

**Root cause:** `catch {}` around a discarded `{success,error}` result, inside a helper typed `Promise<void>` so failure has no return channel, followed by an unconditional state transition that is itself the thing preventing recovery.

**Proposed fix:** Change `revertGameBoxScoreImport` and `revertSeasonTotalsImport` to return `{ ok: boolean; error?: string }`. Bind `saveFullBoxScore`'s result and return `{ ok: false, error }` on failure; replace the bare `catch {}` with `catch (e) { await logServerError(...); return { ok: false, error: describeError(e) }; }`. In `rollbackImport`, capture that and — critically — do NOT run the `status: 'rolled_back'` update at imports.ts:2114 when the canonical revert failed; instead throw a user-safe error (`'The legacy rows were reverted but Stats Center could not be restored — the run is still rollable, please retry.'`) so the existing `catch` in ImportWizardClient shows the red toast and the Roll-back control stays visible. Alternatively add `canonicalRevertError` to the return type and have the client render a warning toast plus keep the row rollable.

### HIGH **[CUSTOMER-FACING]** — A golf coach with no golf_team_coach_staff row sees a completely empty product — 6 such coach profiles exist in production, 3 on real customer .edu domains

`supabase/migrations (function public.is_golf_team_coach + policy golf_teams_select):1`

**Breaks:** Every golf coach-side read gates on is_golf_team_coach(team_id), which is defined ONLY as 'has a golf_team_coach_staff row for this team'. golf_coaches.organization_id grants nothing. A coach whose profile exists but who never got a staff row logs in to a dashboard with zero teams, zero players, zero rounds, zero events, zero tasks — no error, no empty-state explaining why, and (because onboarding_completed = true) the onboarding wizard never re-runs. Their only recovery surface is createTeam, which is 100% broken (previous finding).

**Evidence:** Role-impersonation on production, rolled back.
BROKEN: user 368a21d4-6d5b-4b83-b512-9aa4d33dc922 = smith_a@lynchburg.edu, golf_coaches 504ab1f2-9c34-4dd3-af76-7830fb48a49a, full_name 'Allen Smith', title "Head Men's Golf Coach", organization_id 119634a3 (University of Lynchburg), onboarding_completed = true, golf_team_coach_staff rows = 0.
  -> teams 0, members 0, players 0, events 0, rounds 0, tasks 0, coaches 3.
CONTROL: user c81554fe-9a5c-40b1-b3c2-d26b5705a39a = veverka_mc@lynchburg.edu, same organization, 1 staff row.
  -> teams 1, members 6, players 7, events 4, rounds 20, tasks 0, coaches 3.
auth.users shows smith_a created 2026-04-28 16:32:11 and last_sign_in_at 2026-04-28 16:32:11 — one session, never returned.
Production-wide: 6 of 17 golf_coaches rows have 0 golf_team_coach_staff rows. Three are on customer/prospect domains: smith_a@lynchburg.edu, Christopher.jones@lr.edu (Lenoir-Rhyne, last sign-in 2026-06-05), kcarralero@methodist.edu (Methodist, last sign-in 2026-04-26). The other three are test accounts.

**Root cause:** There are two competing definitions of 'coach of this program': golf_coaches.organization_id (what signup/redeemStaffInvite write) and golf_team_coach_staff (what every RLS policy reads). Only completeCoachOnboarding and redeemStaffInvite create the staff row, and both have paths that create the golf_coaches row and then bail before the staff insert — e.g. redeemStaffInvite (teams.ts:1810-1827) inserts the coach row, then returns 'That program has no teams to join yet.' at teams.ts:1847 without ever writing staff. The result is an orphan profile that RLS treats as a stranger.

**Proposed fix:** Three parts. (1) Backfill: for each golf_coaches row with organization_id set and 0 staff rows, insert a golf_team_coach_staff row (role 'head_coach', is_primary true) for each golf_teams row in that organization — as an additive migration, gated on `WHERE NOT EXISTS (staff row)`. For Allen Smith that is the Lynchburg women's team; if the product intends per-gender scoping, seed only the matching-gender team and let createTeam (once fixed) handle the other. (2) Make the orphan state impossible: in redeemStaffInvite, move the golf_coaches insert AFTER the `targetTeams.length === 0` guard (teams.ts:1847), so a failed invite never strands a profile. (3) Make it visible: on /golf/dashboard, when the caller has a golf_coaches row but resolveCoachActiveTeamId returns null, render an explicit 'your account is not attached to a team yet' state with the create-team CTA instead of a set of zeroed widgets.

### HIGH **[CUSTOMER-FACING]** — Baseball conversation creation is 100% broken — mutually recursive RLS policies raise 42P17 on every participant insert

`src/app/actions/messages.ts:390`

**Breaks:** createConversation with sport='baseball' inserts the conversation, then inserts the self-participant row at messages.ts:390-392. That statement dies with 'infinite recursion detected in policy for relation baseball_conversation_participants' (42P17). The catch block admin-deletes the conversation and throws 'Failed to add participants: ...'. No baseball coach or player can start a DM or group chat at all. The 138 existing baseball_messages rows are all in 3 pre-existing conversations.

**Evidence:** Reproduced on production in a rolled-back transaction: as user e78c5692-65e5-46a7-bb8c-1aa78b58c5d2, `insert into baseball_conversation_participants (conversation_id, user_id) values ('85c43caa-65ca-505f-ae59-261d456591b8', 'e78c5692-...')` -> ERROR 42P17: infinite recursion detected in policy for relation "baseball_conversation_participants". Plain SELECTs on the same tables in the same session return 0 rows without error, so the recursion is specific to the write path.
Cycle: baseball_participants_insert_by_creator WITH CHECK references baseball_conversations; baseball_conversations_select USING references baseball_conversation_participants inline; that table's SELECT policy closes the loop. Golf avoids this because golf_conversations_select_v2 goes through the SECURITY DEFINER wrapper user_conversation_ids().
Already diagnosed and knowingly left unfixed in-tree: src/app/actions/messages.ts:375-385 ('baseball is NOT fixed by it ... dies with 42P17 ... Baseball DM creation was already 100% broken before this change ... that is deliberately not done here').

**Root cause:** baseball_conversations_select uses a raw inline EXISTS against baseball_conversation_participants instead of the SECURITY DEFINER indirection golf uses, creating a policy cycle that Postgres rejects structurally.

**Proposed fix:** One additive migration, and fix the tenant hole at the same time since both live in the same policy:
CREATE OR REPLACE FUNCTION public.baseball_conversation_created_by_me(p_conversation_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$ SELECT EXISTS (SELECT 1 FROM public.baseball_conversations c WHERE c.id = p_conversation_id AND c.created_by = (SELECT auth.uid())) $$;
REVOKE EXECUTE ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated, service_role;
DROP POLICY baseball_conversations_select ON public.baseball_conversations;
CREATE POLICY baseball_conversations_select ON public.baseball_conversations FOR SELECT TO authenticated USING (id IN (SELECT public.get_my_baseball_conversation_ids()));   -- definer wrapper, breaks the cycle
DROP POLICY baseball_participants_insert_by_creator ON public.baseball_conversation_participants;
CREATE POLICY baseball_participants_insert ON public.baseball_conversation_participants FOR INSERT TO authenticated WITH CHECK (public.baseball_conversation_created_by_me(conversation_id) OR EXISTS (SELECT 1 FROM public.baseball_conversations c WHERE c.id = conversation_id AND c.team_id IS NOT NULL AND public.is_baseball_team_staff(c.team_id)));
Note the removal of the bare `user_id = auth.uid()` branch — it is the same self-join hole as the golf finding above; today it is masked only by the recursion error, so fixing the recursion without fixing the predicate would ship the critical hole to baseball. Also tighten baseball_messages_update, which currently lets ANY participant edit ANY message in the conversation (golf is sender-only).

### MEDIUM **[CUSTOMER-FACING]** — Coaches are never notified of a golf join request — the insert is made with the player's own client, which RLS rejects, and the error is not even captured

`src/app/golf/actions/teams.ts:931`

**Breaks:** Even once finding #1 is fixed and join requests start landing again, the coach gets no in-app notification. The request sits in golf_team_join_requests, unseen, until the coach happens to open Roster → Requests. The player is told their request was submitted and waits for an approval that nobody knows to give.

**Evidence:** teams.ts:914-931 builds notification rows addressed to each coach's `user_id`, then inserts them with `fromUntyped(supabase, 'notifications')` — the request-scoped client for the player. Production pg_policies: `notifications_insert_own` is INSERT WITH CHECK `(user_id = (SELECT auth.uid()))`. A player cannot address a row to a coach, so every row is rejected. The call at line 931 does not destructure `error` at all — the rejection is invisible, and the surrounding try/catch (line 933) only fires on a throw, which a PostgREST RLS rejection is not. This is the exact bug already fixed for the sibling path in commit 0a39885ab ("coaches were never told a player joined — RLS-blocked notification", #1280), which switched joinGolfTeam to createAdminClient() and added error logging (teams.ts:377-385) — createTeamJoinRequest was not included in that fix.

**Root cause:** Cross-user notification written with the caller's client. Same class as #1280; the fix was applied to one of the two sites that needed it.

**Proposed fix:** Mirror the already-shipped fix from joinGolfTeam exactly. Replace teams.ts:931 with:
```ts
const admin = createAdminClient();
const { error: notifyError } = await fromUntyped(admin, 'notifications').insert(notifications);
if (notifyError) {
  await logServerError(
    `join-request notification insert failed: ${describeError(notifyError)}`,
    { action: 'teams.createTeamJoinRequest', featureArea: 'teams' },
    'warning'
  );
}
```
Elevating is safe for the same reasons documented at teams.ts:364-376: the request itself is already authorized, recipients are exactly the coaches of the org owning the target team, and the payload is server-derived.

### MEDIUM **[CUSTOMER-FACING]** — A baseball coach (or anyone without a baseball_players row) who clicks a player invite link is bounced into a signup form they cannot use

`src/app/baseball/join/[code]/page.tsx:33`

**Breaks:** A signed-in baseball coach clicks the invite link they're about to send (to check it) — or a player whose profile row is missing clicks theirs. The page finds no baseball_players row and redirects to /baseball/signup. That page does not redirect authenticated users, so it renders the create-account form. Submitting it fails with "An account with this email already exists." There is no way forward from that screen; the user has to know to manually type a different URL.

**Evidence:** baseball/join/[code]/page.tsx:29-33 does `.from('baseball_players').select(...).eq('user_id', user.id).single()`, then line 35-37 `if (!player) redirect('/baseball/signup')`. Note `.single()` also errors (PGRST116) when zero rows, and only `data` is destructured, so a genuine read failure is indistinguishable from a missing profile. src/app/baseball/(auth)/signup/page.tsx has no session check — its only useEffect (lines 34-40) handles the native-app case. Golf handles this exact scenario deliberately and correctly: golf/join/[code]/page.tsx:29-37 looks up golf_coaches first and redirects a coach to /golf/dashboard or /golf/coach with the comment "A coach can't 'join' a team as a player." Baseball has no equivalent branch. Confirmed possible in prod: handle_new_user only seeds baseball_players when `sport='baseball' AND role='player'`, so every baseball coach account legitimately has no baseball_players row.

**Root cause:** The join page treats "no player profile" as "not signed up", conflating an authorization state with an authentication state. The golf equivalent was hardened; baseball was not.

**Proposed fix:** Add the coach branch before the player lookup, mirroring golf/join/[code]/page.tsx:29-37:
```ts
const { data: coach } = await supabase
  .from('baseball_coaches')
  .select('id, onboarding_completed')
  .eq('user_id', user.id)
  .maybeSingle();
if (coach) redirect(coach.onboarding_completed ? '/baseball/dashboard' : '/baseball/coach-onboarding');
```
And change line 33 from `.single()` to `.maybeSingle()` with the error destructured, so a real read failure is logged rather than silently rendered as "you must sign up". For the genuinely-profileless authenticated user, redirect to `/baseball/player?joinCode=${code}` (onboarding) rather than `/baseball/signup`.

### MEDIUM **[CUSTOMER-FACING]** — .maybeSingle() on a query that can legitimately match many rows — a PostgREST error becomes null, and the "already on a team" guard silently passes

`src/app/golf/actions/teams.ts:860`

**Breaks:** Once any golf player holds more than one golf_team_members row, both the join validator and the join-request guard stop working: the query errors, the error is discarded because only `data` is destructured, `existingMembership` is null, and the code concludes "this player is on no team" — the exact opposite of the truth. The player is allowed to request/join a second team, and the friendly "You are already on X" message is replaced by whatever the DB does next.

**Evidence:** Two sites. teams.ts:856-860 (createTeamJoinRequest) and the identical pattern in validateGolfPlayerCanJoinTeamImpl: `.from('golf_team_members').select('team_id').eq('player_id', playerId).maybeSingle()` — filtered on player_id ONLY, with no status filter and no `.limit(1)`. Neither destructures `error`. The DB does not prevent multiple rows: production pg_constraint on golf_team_members shows UNIQUE `(team_id, player_id)` — per team, not per player. The codebase actively creates the multi-team case: teams.ts exports `addSecondTeam` (line ~1644), and a leave-then-rejoin leaves the old row if status is used rather than deletion. Today the corruption has not landed — `select player_id, count(*) from golf_team_members group by 1 having count(*)>1` returns 0 rows — so this is latent, not live. Note the two guards also disagree on semantics: the SECURITY DEFINER golf_join_team_with_code only blocks on `status = 'active'` rows on a different team, while these TS guards block on ANY row of any status.

**Root cause:** `.maybeSingle()` used as shorthand for "get zero or one" against a filter that does not uniquely identify a row, combined with dropping the error. maybeSingle raises PGRST116 on >1 row; discarding it converts a loud failure into a confident wrong answer.

**Proposed fix:** At both sites, select the set and reason over it rather than asserting cardinality, and stop discarding the error:
```ts
const { data: memberships, error: membershipError } = await supabase
  .from('golf_team_members')
  .select('team_id, status')
  .eq('player_id', playerId)
  .eq('status', 'active');
if (membershipError) {
  await logServerError(`membership lookup failed: ${describeError(membershipError)}`, { action: 'teams.createTeamJoinRequest' });
  return { success: false, error: 'Could not check your current team. Please try again.' };
}
const existingMembership = memberships?.find((m) => m.team_id === team.id) ?? memberships?.[0] ?? null;
```
Filtering on `status='active'` also brings the TS guards into agreement with golf_join_team_with_code's own rule, which is the authority since it performs the insert.

### MEDIUM **[CUSTOMER-FACING]** — getStatsSummary renders a database read error as 'no rounds played' with all-null stat cards and no log line

`src/app/golf/actions/stats-data.ts:719`

**Breaks:** A player or coach opens the stats page during an RLS misconfiguration, a Supabase blip, or a statement timeout and sees roundsPlayed: 0 and every summary card blank — visually identical to a brand-new player who has never submitted a round. There is no toast, no error boundary, and no server log, so the customer concludes their rounds were lost and nobody on your side gets a signal. This is the same class as the golf classes page: a failure presented as a confident, clean result.

**Evidence:** stats-data.ts:714 `const { data: roundsData, error } = await query;` — the error IS captured. Line 719 then collapses it into the empty case: `if (error || filteredRounds.length === 0) { return { summary: { roundsPlayed: 0, holesPlayed: 0, scoringAverage: null, ... }, rounds: [] }; }` (lines 719-734). No logServerError, no distinguishable return shape. Compare queryDetailedStatsWithClient in the same file at lines 963-970, which DOES call logServerError with statsErrorContext on its rounds-query error before falling back — so the pattern exists in this file and was just not applied here. Separately at line 743 the scrambling fetch `const { data: holesWithScrambling } = await fetchAllRowsResult(...)` also discards its error, which drives scramblingAttempts to 0 and scramblingPercentage to null (line 826) — less severe because it renders as a dash, not a number, but still an unlogged silent zero.

**Root cause:** An error branch and an empty-result branch were merged into one `if`, so a failure is indistinguishable from 'no data' both to the user and to the logs.

**Proposed fix:** Split the branch at line 719. First: `if (error) { await logServerError(\`[Stats] getStatsSummary rounds query failed: ${describeError(error)}\`, statsErrorContext('stats_data.getStatsSummary', error)); throw new Error('Failed to load stats'); }` — throwing lets the existing error boundary show a real error state instead of a fake empty one. Then keep the `filteredRounds.length === 0` empty-state return as-is. Also destructure and log the error at line 743 so a failed scrambling read is visible. If a hard throw is too aggressive for this surface, add an explicit `error: string` field to SummaryStatsResponse and have the UI render an error state — but do not keep returning zeros.

### MEDIUM **[CUSTOMER-FACING]** — Stats leak-map buckets render 'no data' on any shot-query failure, and the round-id list is unchunked so it will start failing outright as teams accumulate rounds

`src/app/golf/actions/stats-leak-maps.ts:293`

**Breaks:** Every putting and approach-proximity bucket on the team leak map renders team_value: null and sample_n: 0 whenever the golf_shots read fails — a coach reads that as 'we have no putting data' rather than 'the query broke'. The failure becomes guaranteed rather than transient once a team's completed-round count passes roughly 585: PostgREST .in() lists travel in the URL and the edge rejects the request before Postgres sees it, with a bare 400/414 that this code throws away.

**Evidence:** Two call sites destructure only `data` from fetchAllRowsResult, which returns `{ data: null, error }` on failure and never throws: line 293 `const { data } = await fetchAllRowsResult<PuttRow>(...)` in buildPuttBuckets, and line 351 `const { data } = await fetchAllRowsResult<ApproachRow>(...)` in buildApproachBuckets. Both then do `for (const row of data ?? [])`, so a null data yields empty maps, and the return blocks at lines 328-338 and 388-398 emit `team_value: n > 0 ? ... : null, sample_n: n` — i.e. n=0 and a null value for every band, which is exactly what a genuinely empty dataset produces. The `.in('round_id', roundIds)` at lines 298 and 356 is not chunked; roundIds comes from completedRoundIds() at line 248 which returns EVERY completed round for the whole roster. Production headroom today: the largest team has 93 completed rounds (Demo University Golf, 7 players), then 90, then 87 (Guilford College Men's Golf, 8 players) — so the URL cap is not being hit yet, but a single full season at ~40 rounds per player across 8 players lands at 320 and two seasons exceeds the limit. Note the correct pattern already exists elsewhere in this codebase: team-category-insights.ts:546-548 batches round IDs at 100 for exactly this reason, and standing-refresh/route.ts:194-199 documents the ~585-uuid edge limit and chunks accordingly.

**Root cause:** Error discarded from a non-throwing helper, combined with an unbounded `.in()` list that will eventually make that discarded error permanent. The null/zero fallback is indistinguishable from a real empty dataset in the UI.

**Proposed fix:** At lines 293 and 351 destructure `const { data, error }`, and on error call logServerError and propagate a failure the loader can surface — the leak map needs a distinct 'could not load' state, not a zero-sample state, because sample_n: 0 is a meaningful and different claim. Separately, chunk the round-id list: wrap both fetches in `for (const batch of chunkIds(roundIds, 200))` and accumulate, matching the pattern at team-category-insights.ts:546. Apply the same chunking to completedRoundIds' `.in('player_id', playerIds)` for consistency. A cheap regression test: pass 700 synthetic round ids and assert the fetch is issued as 4 batches, not 1.

### MEDIUM **[CUSTOMER-FACING]** — Round analysis has lost its durable queue — the Inngest credential is invalid, so analysis runs inline with no retry

`src/app/golf/actions/golf.ts:1`

**Breaks:** submitGolfRoundComprehensive tries to enqueue coachhelm/round.submitted to Inngest, the send is rejected because the configured Inngest key is no longer valid, and the code falls back to running postRoundTrigger INLINE inside the submit request. Inline means no durable retry: any transient failure during analysis is final for that round. This is the mechanism that compounds finding #1 — the very submit that got terminally stamped is the one that ran without a queue behind it.

**Evidence:** admin_events fingerprint 38fd54c6, feature round_tracking, 6 events across 2 distinct users, first 2026-07-30 16:43:50, last 2026-08-05 16:31:47: "Round analysis lost its durable queue and ran inline instead: Durable background jobs are unavailable: the Inngest account rejected the configured credential. It is set, but no longer valid — retrying will not help until the key is replaced." An earlier variant (fingerprint b36dfbb8, 3 events to 2026-07-29) reads "Inngest API Error: 404 Event key not found". Directly implicated in the Blake Taylor trace: error_logs 2026-08-04 22:19:53.438, context playerId 12089807-48ba-4ab5-b566-7d5d8d9f3d1d — 435ms before the below-floor skip that permanently failed his round. Filed at severity=warning, so it never surfaced as an error.

**Root cause:** INNGEST_EVENT_KEY (and likely INNGEST_SIGNING_KEY) in the production environment no longer matches the Inngest account. The application-level degradation is deliberate and correct — it is better to run inline than to drop the work — but it has been silently degraded for at least 7 days, and 'warning' is the wrong severity for a queue being down platform-wide.

**Proposed fix:** 1) Rotate INNGEST_EVENT_KEY + INNGEST_SIGNING_KEY from the Inngest dashboard and set both in Vercel production; verify by submitting a round and confirming the run appears in the Inngest dashboard rather than the fallback firing.
2) Raise the severity of the inngestSendFailed credential-rejection branch from 'warning' to 'error'. A credential that is set-but-invalid is not a transient condition and the message itself already says retrying will not help — it should page, not whisper.
3) Add an integrity-check probe that asserts a test event round-trips to Inngest, so the next silent expiry is caught in hours rather than in a week's error triage.

### MEDIUM **[CUSTOMER-FACING]** — golf_shots has crossed the PostgREST 1000-row cap in production — 6 players and 4 teams are already truncatable

`src/lib/coachhelm/v2/orchestrator.ts:1350`

**Breaks:** Any player- or team-scoped read of golf_shots that is not routed through fetchAllRows/fetchAllRowsResult now silently returns only the first 1000 rows. The caller cannot tell a truncated read from a complete one, so every downstream aggregate — shot-level strokes gained, leak maps, lie analysis, pattern mining — renders a confidently wrong number for exactly the most engaged customers. Separately, orchestrator.ts:1350 destructures only `data` from both reads, so a failed shot/hole fetch becomes two empty arrays, buildRoundSpecificInsights returns [], and the round review is generated and PERSISTED with no round-specific insights and no error anywhere.

**Evidence:** Measured against live data: shots-per-player max is 1302 with 6 of 33 players already over 1000; shots-per-team max is 6909 with 4 of 7 teams over 1000. (For contrast, holes-per-player max is 333 and events-per-team max is 626, so golf_shots is the only table at the boundary today.) Pagination coverage is inconsistent across the shot readers: stats-data.ts has 11 fetchAllRows references and stats-leak-maps.ts has 4, but orchestrator.ts has ZERO while querying golf_shots at line 1352, and round-review-system.ts has zero while querying golf_shots at line 984 and golf_holes at line 992 — both of the latter also discarding `error`.

**Root cause:** Two separate habits. (a) The 1000-row cap is a PostgREST server-side default that `.limit(n)` does not raise, so an unpaged select on a table that has only recently grown past 1000 rows changes behaviour with no code change and no error — the repo has a correct helper (lib/supabase/fetch-all-rows.ts) that these call sites simply do not use. (b) `const { data } = await supabase...` discards the PostgrestError, so a failed read is indistinguishable from an empty result set and produces a confident zero.

**Proposed fix:** 1) Audit every golf_shots reader whose filter is player- or team-scoped (not `.eq('round_id', …)`) and route it through fetchAllRowsResult. The round-scoped ones (orchestrator.ts:1352, round-review-system.ts:984) are cap-safe today at ~70-95 shots per round and do not need paging.
2) Fix the error-blindness at orchestrator.ts:1350 and round-review-system.ts:983/992/1010: destructure `error` and bail with an explicit failure rather than proceeding with `?? []`. round-review-system is the more urgent of the two because it PERSISTS the result — a review generated from a failed read is written to golf_round_reviews and shown to the player as finished work.
3) Add an ast-grep rule to the existing Review Gate pack (.coderabbit/ast-grep/) that flags `from('golf_shots')` without either `.eq('round_id'` or a fetchAllRows wrapper, so the next table to cross 1000 rows is caught at review time.

### MEDIUM **[CUSTOMER-FACING]** — Team Stats tells a coach "No players on your roster yet" when the roster read fails

`src/app/golf/(dashboard)/dashboard/stats/team/page.tsx:115`

**Breaks:** A coach with a full roster opens /golf/dashboard/stats/team and is shown a full-page empty state reading "No players on your roster yet — Add players to your roster and their rounds will roll up here" with a CTA to the roster page. The roster is already populated. The coach either believes the data is gone or clicks through and finds the players present, which reads as the product being broken.

**Evidence:** stats/team/page.tsx:115 — `const { data: teamMembers } = await supabase.from('golf_team_members').select('player_id').eq('team_id', teamId).eq('status','active');` no `error`. Line 117 `const playerIds = (teamMembers || []).map(...)`. Line 120 short-circuits to `{ data: [] }` when `playerIds.length === 0`, and line 122 `if (!players || players.length === 0)` renders the empty state at lines 125-143. Line 120's `players` read also discards its error. The file demonstrably knows better 44 lines later: lines 159-165 destructure `roundsFetchError` from the rounds fetch with the comment "a genuinely FAILED rounds fetch must read as 'couldn't load' (with retry), not as a silent cold-start… an unchecked `error` here previously rendered every player's per-round stats as 'no rounds yet'". That lesson was applied to the rounds read and not to the two membership/player reads that gate it. Production: 69 active golf_team_members across 10 teams, so the empty state is wrong for every real team.

**Root cause:** Same pattern the file already fixed one query later: `(x || [])` collapses the error channel into the cold-start empty state, and the cold-start empty state is a designed, confident-looking screen.

**Proposed fix:** Destructure both errors and add a third render branch between "no team" and "no players":
```ts
const { data: teamMembers, error: membersError } = await supabase.from('golf_team_members')...;
const { data: players, error: playersError } = playerIds.length > 0 ? await supabase.from('golf_players')... : { data: [], error: null };
if (membersError || playersError) {
  return <ViewHeader .../><InlineNotice tone="danger" title="Couldn't load your roster">…retry…</InlineNotice>;
}
```
Keep the existing `!players || players.length === 0` empty state only for the genuine zero case. Mirror the `roundsError` flag already threaded into the page so the two degraded states look consistent.

### MEDIUM **[CUSTOMER-FACING]** — Player roster page tells a rostered player "No Team Found — you haven't joined a team yet" on a read error

`src/app/golf/(dashboard)/dashboard/roster/page.tsx:98`

**Breaks:** A player on an active roster opens /golf/dashboard/roster and sees "No Team Found — You haven't joined a team yet. Ask your coach for a join code." They contact their coach, who confirms they are on the roster. Nothing is logged.

**Evidence:** roster/page.tsx:98-102 — `const { data: teamMember } = await supabase.from('golf_team_members').select('team_id').eq('player_id', player.id).maybeSingle();` no `error`. Line 104 `if (!teamMember?.team_id)` renders the "No Team Found" EmptyState at lines 105-115. Two failure paths reach it: (a) any PostgREST error (RLS, timeout) → `data` null; (b) PGRST116 if the player ever holds more than one `golf_team_members` row — the filter is `player_id` alone, and there is no unique constraint on `player_id` (only the composite team_id+player_id), so `.maybeSingle()` errors on multi-row. I measured the multi-row case against production: 0 golf players currently hold >1 membership (max memberships per player = 1), so (b) is latent, not live — (a) is the live path. The coach branch of the same file handles this correctly at lines 198-204 (`const { data: team, error: teamError }` → renders an InlineNotice "Unable to load team information"), so the file has the right pattern and only the player branch lacks it. The identical unchecked `golf_team_members … .maybeSingle()` shape appears on at least six more live player surfaces: qualifiers/page.tsx:32, documents/page.tsx:32, dashboard/page.tsx:241, team-hub/page.tsx:58, team/page.tsx:136, and calendar/page.tsx:64 (filed separately as critical).

**Root cause:** `.maybeSingle()` result consumed as `!data?.field`, which conflates "read failed", "player is on two teams", and "player has no team" into one branch whose copy asserts the third.

**Proposed fix:** Destructure the error in the player branch and render the same degraded notice the coach branch already uses:
```ts
const { data: teamMember, error: membershipError } = await supabase.from('golf_team_members').select('team_id').eq('player_id', player.id).maybeSingle();
if (membershipError) {
  return <InlineNotice tone="danger" title="Couldn't load your team">Please try again.</InlineNotice>;
}
```
Then sweep the same fix across the six sibling pages listed in the evidence. Longer term, replace the bare `.maybeSingle()` with `.order('joined_at').limit(1).maybeSingle()` so a future second membership degrades to a deterministic pick instead of a hard error.

### MEDIUM **[CUSTOMER-FACING]** — Round detail scorecard silently renders with zero holes when the golf_holes read fails

`src/app/golf/(dashboard)/dashboard/rounds/[id]/page.tsx:147`

**Breaks:** A player opens the round they just submitted. If the hole-by-hole read errors, the scorecard section renders with no holes at all while the header still shows the round's total score and date — so the page asserts "you shot 74" and simultaneously shows an empty 18-hole card. No error, no retry.

**Evidence:** rounds/[id]/page.tsx:147-151 — `const { data: holesRows } = await supabase.from('golf_holes').select('hole_number, par, score, putts, fairway_hit, gir, penalty_strokes, yardage').eq('round_id', id).order('hole_number', { ascending: true });` — `.error` never destructured. Line 153-157 does the same for `golf_round_reviews`. Both feed `FairwayRoundDetail` at line 169+. The comment at lines 144-146 calls this "a read-only fetch of the honest golf_holes layer" — the honesty claim only holds if a failure is distinguishable from an 18-hole round with no recorded holes. Production has 5,346 golf_holes rows across 302 rounds (avg 17.7/round), so every real round has holes and an empty render is always wrong. Note the same page DOES destructure `teamMembership` at line 112 without an error check as well, which makes a coach's access check fall back to "not a coach" and redirect them to /golf/dashboard on a read failure (line 123-125).

**Root cause:** Presentation data is fetched with `{ data }` only; the component receives `holesRows ?? []` and has no way to distinguish an empty round from a failed read.

**Proposed fix:** Destructure `holesError` and pass it through so the scorecard region renders a retry rather than an empty grid:
```ts
const { data: holesRows, error: holesError } = await supabase.from('golf_holes')...;
```
Pass `holesUnavailable={holesError != null}` into `FairwayRoundDetail` and render `<InlineNotice tone="danger">Couldn't load the hole-by-hole card.</InlineNotice>` in place of the scorecard when true. Separately, at line 112 destructure the membership error and treat an error as a 500 (throw) rather than as "not authorized" — a coach silently redirected off a player's round is a confusing authz failure.

### MEDIUM **[CUSTOMER-FACING]** — standing-refresh cron's stale-cache pre-sweep silently no-ops when the team-member read errors

`src/app/api/cron/v3/standing-refresh/route.ts:186`

**Breaks:** The nightly cron's pre-sweep is what self-heals shot-derived cache columns (putt bands + attempts, approach proximity, miss bias, putts_per_gir, driving distance) when a round-submit's after() callback dies. If the outer `golf_team_members` read fails, `chunkPlayerIds` is empty, the whole `if (chunkPlayerIds.length > 0)` block is skipped, and the route still returns HTTP 200 with `stale_caches_refreshed: 0`. Players' standings then rank on stale band values indefinitely, and the run looks successful in the job log.

**Evidence:** standing-refresh/route.ts:186-192 — `const { data: memberRows } = await supabase.from('golf_team_members').select('player_id').in('team_id', teamIds).eq('status','active').limit(1000);` then `const chunkPlayerIds = [...new Set((memberRows ?? []).map(...))]` and line 193 `if (chunkPlayerIds.length > 0)`. `.error` is never read. The irony is explicit: the comment at lines 195-199, eight lines below, says "surface every batch error — an over-cap 400 used to collapse into an empty `data ?? []` and silently no-op the pre-sweep", and lines 218-233 duly check `staleRes.error` and `recentRes.error` and log both. The outer read that feeds them was left unchecked, so the exact defect they fixed downstream is still live one level up. The comment at lines 175-183 states the stakes: "the standing RPCs below would rank players on stale band values indefinitely". The `.limit(1000)` is separately a soft cap on a completeness list — it is at the PostgREST hard cap so it is honest today (69 active members in production), but if a chunk ever exceeds 1000 members the pre-sweep drops whole players with no signal.

**Root cause:** `(memberRows ?? [])` collapses the error into an empty roster; the surrounding `try` only catches thrown exceptions, and supabase-js does not throw on DB errors, so the outer catch at line 254 never fires either.

**Proposed fix:** Destructure and log, matching the two inner reads:
```ts
const { data: memberRows, error: memberErr } = await supabase.from('golf_team_members')...;
if (memberErr) {
  await logServerError(`standing-refresh cache-presweep member-select: ${memberErr.message}`, { action: 'cron.v3.standing-refresh.cache-presweep' });
}
```
Add a `presweep_skipped: boolean` field to the RefreshSummary JSON so a no-op run is distinguishable from a run with nothing to do. If `chunkPlayerIds.length` ever reaches 1000, log a warning and paginate with `fetchAllRowsResult` — a truncated roster silently drops players from the refresh set.

### MEDIUM **[CUSTOMER-FACING]** — Calendar page resolves a player's team with `.maybeSingle()` on a query that can return many rows — a second team membership empties the whole calendar with no error

`src/app/golf/(dashboard)/dashboard/calendar/page.tsx:65`

**Breaks:** `supabase.from('golf_team_members').select('team_id').eq('player_id', playerId).maybeSingle()` is filtered only by player_id. golf_team_members has no unique constraint on player_id — a player on two teams (transfer mid-season, dual roster) makes PostgREST return PGRST116, `data` = null. The result is destructured as `playerTeamResult.data?.team_id` at line 72 with no error read, and the fallback branch is even typed `{ data: null }` at line 66, so nothing anywhere can see the failure. `teamId` becomes null, the entire `if (teamId)` block at line 101 is skipped, and the player gets a completely empty calendar — the exact 'my season got wiped' failure the try/catch at line 74-80 was written to prevent. maybeSingle does not throw, so that catch never fires.

**Evidence:** page.tsx:65 read directly. Confirmed latent-not-live in production: `SELECT player_id, count(*) FROM golf_team_members GROUP BY 1 HAVING count(*)>1` returns 0 rows today, so no customer is hitting it yet. But availability.ts:131-136 and golf.ts:4257-4264 both already treat memberships as a LIST (`.eq('status','active')` + array collect), so multi-team players are an expected shape elsewhere in the same feature — this call site is the outlier.

**Root cause:** `.maybeSingle()` was used as a convenience accessor for 'the first row' rather than as an assertion that at most one row exists. On the many-row case it returns an error, and because that error is discarded the guard (`if (teamId)`) reads the null as 'this player has no team' and takes the empty-render path instead of the error path the same file already implements for events.

**Proposed fix:** Match the shape used everywhere else: drop maybeSingle, add `.eq('status','active').order('created_at').limit(1)` and read `data?.[0]?.team_id`, AND bind the error — `if (playerTeamResult.error) throw new Error('Failed to load your team for the calendar. Please try again.')` so it reaches the route error boundary like the events failure at line 149-151 does.

### MEDIUM **[CUSTOMER-FACING]** — Deleting a class discards removeClassFromCalendar's result, then deletes the class row — a failed removal orphans the events permanently with no retry path

`src/app/golf/(dashboard)/dashboard/classes/page.tsx:235`

**Breaks:** handleDeleteClass calls `await removeClassFromCalendar(selectedClass.id)` at line 235 and drops the CalendarSyncResult, then deletes the golf_player_classes row (238-243), then toasts 'Class deleted — Removed from your schedule and calendar' (line 253). If the calendar removal returned success:false (calendar-sync.ts:497 membership-verify failure, :532 ownership-read failure, :551 delete failure), the events survive but the class row does not. Nothing can ever clean them up afterwards: removeClassFromCalendar's orphan path is keyed on classId, and the only place that classId lived was the row just deleted. The player sees their deleted class on the team calendar forever — and, per finding #1, in the team iCal feed too. confirmDeleteAllClasses:405-407 has the identical shape in a loop, so one transient failure can strand a whole semester.

**Evidence:** page.tsx:235 (`await removeClassFromCalendar(selectedClass.id);` — bare await, no assignment) and page.tsx:406 (same inside a for-loop). Compare page.tsx:156-162, which the parent just fixed to capture the result. calendar-sync.ts:473-556 shows the action returns `{success:false, error}` on five distinct paths and never throws.
Not yet fired in production: `SELECT count(*) FROM golf_events WHERE description LIKE '%[class:%' AND NOT EXISTS (SELECT 1 FROM golf_player_classes c WHERE c.id::text = substring(description from '\[class:([^\]]+)\]'))` returns 0. The defect is that it is UNRECOVERABLE when it does fire, not that it already has.

**Root cause:** Two-step destructive sequence ordered so that the step which can fail silently runs first and the step that destroys the only recovery key runs second, unconditionally. The class row IS the retry token for the calendar cleanup, and it is deleted regardless of whether the cleanup happened.

**Proposed fix:** Capture the result and refuse to delete the class row on failure:
  const removal = await removeClassFromCalendar(selectedClass.id);
  if (!removal?.success) { fairwayToast.error('Could not remove this class from your calendar', { description: removal?.error ?? 'Unknown error' }); return; }
Same in confirmDeleteAllClasses: collect per-class results, then delete only the golf_player_classes rows whose calendar removal succeeded (`.in('id', okIds)` instead of the blanket `.eq('player_id', playerId)` at line 413), and report the rest.

### MEDIUM **[CUSTOMER-FACING]** — ClassDetailModal is handed `semester: ''` with a comment asserting the column doesn't exist — the same false-type belief that was just fixed one function above

`src/app/golf/(dashboard)/dashboard/classes/page.tsx:550`

**Breaks:** The class detail modal renders the term at ClassDetailModal.tsx:91-92 (`{classData.semester.trim() && <p>{classData.semester}</p>}`), but page.tsx:550 hardcodes `semester: ''` with the comment `// Not stored in DB`. That line can never render. A player cannot see which academic term any class is in — and the term is precisely the field that decides whether the calendar sync generated anything at all. When a class shows no calendar events, the one piece of information that would explain it is deliberately blanked out.

**Evidence:** page.tsx:550 read directly: `semester: '', // Not stored in DB`. It sits ~160 lines below the fix at page.tsx:379-386, whose own comment documents that this exact false belief ('semester is not persisted on golf_player_classes') caused the edit path to silently re-date whole event series. The PlayerClass interface at page.tsx:40 declares `semester: string | null`, the add path writes it at line 134, the update path at line 200, and the column exists on all 43 production rows (currently NULL, so the fallback matters).

**Root cause:** The 'semester is not stored in the DB' belief was written into two call sites; only one was corrected. The stale comment at line 550 is the same wrong evidence that produced the already-fixed edit bug, still authoritative-looking and still driving code.

**Proposed fix:** page.tsx:550 -> `semester: selectedClass.semester || '',`. Also worth adding a per-class synced-occurrence count so the detail modal can say 'Not on your calendar — set a semester and save' rather than showing nothing, which is what the 17 zero-event classes look like today.

### MEDIUM **[CUSTOMER-FACING]** — Class detail modal still hardcodes `semester: '' // Not stored in DB` — the same false comment that caused the original re-dating bug, one call site missed

`src/app/golf/(dashboard)/dashboard/classes/page.tsx:550`

**Breaks:** A player opens a class from their schedule and taps it. The detail sheet shows instructor, days, time, building/room, credits, notes — but never the term, even for classes saved with "Fall 2026" selected. Because `<ClassDetailModal>`'s own type declares `semester: string` (non-optional, non-null), the component looks correctly wired and the bug is invisible from its side. More dangerous: the surviving comment is the same sentence that already cost a silent re-dating of every class event series, so it remains available as "evidence" to the next reader.

**Evidence:** The P231 fix corrected the `PlayerClass` interface (page.tsx:40 now declares `semester: string | null` with a long comment at :32-39 explaining the original bug) and the edit handler at page.tsx:385 (`semester: selectedClass.semester || detectSemester('')`). Both save paths write it: page.tsx:134 (handleAddClass) and page.tsx:200 (handleUpdateClass).

One call site was missed. page.tsx:536-553 builds the `classData` prop for `<ClassDetailModal>`; it spreads `...selectedClass` (which carries the real semester) and then OVERRIDES it on line 550 with the original stale comment verbatim:
    semester: '', // Not stored in DB

The consumer renders it: src/components/golf/classes/ClassDetailModal.tsx:31 declares `semester: string`, and :91-92 gates on it —
    {classData.semester.trim() && (
      <p className="text-sm text-text-tertiary mt-1">{classData.semester}</p>
    )}
so the guard is permanently false and the term never renders.

LIVE DB (Supabase MCP): golf_player_classes has 16 columns, `semester text NULL` among them — the comment is false. Current data: 43 rows across 10 players, 0 with semester populated (all predate the fix), so today the modal would show nothing anyway; every class saved from now on will have a semester the detail modal silently blanks.

Contrast line 375 in the same file, `location: '', // Not stored in DB` — that one I verified is TRUE (no `location` column; building+room only). Only the `semester` instance is wrong.

**Root cause:** The P231 remediation fixed the interface and the edit handler but grepped for the behaviour, not for the comment string. A second copy of the exact false assertion survived at a different call site.

**Proposed fix:** In src/app/golf/(dashboard)/dashboard/classes/page.tsx, delete line 550 entirely — the `...selectedClass` spread on line 537 already supplies the correct value; just coerce the null: change to `semester: selectedClass.semester || ''`. Then grep the repo for the remaining literal `Not stored in DB` and confirm each survivor against information_schema (page.tsx:375 for `location` is legitimate). Add a test on ClassDetailModal asserting that a class with `semester: 'Fall 2026'` renders that string, so the guard at ClassDetailModal.tsx:91 can never silently go dark again.

### MEDIUM **[CUSTOMER-FACING]** — Every baseball program-settings mutation is typed `Promise<{success: true}>` and never reads the Supabase error — setCurrentSeason can leave a team with no active season and still say "Current season updated"

`src/app/baseball/actions/team-season-settings.ts:378`

**Breaks:** `setCurrentSeason` does a clear-then-set: it first archives whatever season is currently `active` for the team, then activates `seasonId`. Neither `.update()` result is read. If the second update matches nothing (a stale `seasonId`, a season belonging to another team, a partial-unique-index conflict), the team is left with ZERO active seasons while the coach is told "Current season updated" — every season-scoped read then falls back to empty. Same discard shape in `updateTeamJoinSettings` (a coach turning OFF `code_self_join` or turning ON `require_coach_approval` is told it applied — that is an access-control setting), `archiveSeason`, `updateProgramIdentity`, and `deleteImportSource`.

**Evidence:** src/app/baseball/actions/team-season-settings.ts:373-381 — two consecutive `await fromUntyped(supabase, 'baseball_seasons').update(...)` calls, neither destructuring `{ error }`, then `return { success: true }` at 394. The declared return type at line 366 is `Promise<{ success: true }>` — the literal `true`, so the type itself makes failure inexpressible. Identical pattern: `updateTeamJoinSettings` line 156 (`await fromUntyped(supabase, 'baseball_teams').update(update).eq('id', teamId);`) → `return { success: true }` line 171; `archiveSeason` line 407-410 → line 423; `updateProgramIdentity` src/app/baseball/actions/program-settings.ts:467 → line 483; `deleteImportSource` program-settings.ts:607-610 → line 621. Every one also writes an audit row (`writeAudit`) AFTER the unchecked mutation, so the audit log records changes that may not have happened. Call sites all show unconditional success toasts: TeamSettingsClient.tsx:82 'Join policy updated', :97 'Coach approval required'; SeasonSettingsClient.tsx:168 'Current season updated', :184 'Season archived'; ProgramSettingsClient.tsx:226 'Program identity saved'; ImportSourcesClient.tsx:393 'Removed "..."'. Verified in production that all target columns exist (`baseball_teams.invite_policy/allow_player_self_join/require_coach_approval`, `baseball_seasons.status`), so the live trigger here is a failed/0-row write, not a schema mismatch.

**Root cause:** Mutations declared with a return type that cannot represent failure (`{success: true}`), combined with `.update()`/`.delete()` calls whose `{ error }` is never destructured. `withBaseballAction` only converts *throws* into failures, and a discarded PostgREST error never throws.

**Proposed fix:** For each of the six actions, destructure and check: `const { error } = await fromUntyped(...).update(...)` then `if (error) throw new Error('Could not save ... Please try again.')` — `withBaseballAction` already sanitizes and Sentry-logs throws, and each client already has a `catch` that renders an error toast, so throwing needs no client change. IMPORTANT: an RLS-refused UPDATE returns no error and 0 rows, so for the writes that must be verified (`setCurrentSeason`'s activation, `updateTeamJoinSettings`) also append `.select('id')` and throw when the returned array is empty. Move each `writeAudit(...)` call to AFTER the verified write so the audit trail stops recording unapplied changes. Finally change the return types from `Promise<{ success: true }>` to `Promise<{ success: boolean; error?: string }>` (or leave them throwing and drop the meaningless success field) so the next author cannot repeat this.

### MEDIUM **[CUSTOMER-FACING]** — Create-task modal's reminder guard is dead code — setTaskReminder returns {success:false} instead of throwing, so the coach always sees "Task created and assigned."

`src/components/fairway/pages/tasks/FairwayCreateTaskModal.tsx:309`

**Breaks:** A coach creates a task with a reminder time. `setTaskReminder` is called inside a `try { ... } catch { fairwayToast.warning('Task created, but the reminder could not be set.') }`. That catch can never fire: `setTaskReminderImpl` wraps its entire body in its own try/catch and returns `{success:false, error}` on every failure path — it never throws. So on 'Only coaches can set reminders', 'Not authorized for this team', 'Task not found', or a DB update error, the coach gets the plain green "Task created and assigned." and no reminder is ever sent. The warning toast that was written specifically to prevent this is unreachable.

**Evidence:** src/components/fairway/pages/tasks/FairwayCreateTaskModal.tsx:307-316 — `if (reminderAt) { try { await setTaskReminder(result.data.taskId, ...); } catch { fairwayToast.warning(...); } }` then line 316 `fairwayToast.success('Task created and assigned.');`. The result of `setTaskReminder` is never bound. `setTaskReminder` is declared `Promise<{ success: boolean; error?: string }>` at src/app/golf/actions/task-reminders.ts:220-226 and delegates to `setTaskReminderImpl` (task-reminders.ts:131), whose failure returns are at lines 147 ('Unauthorized'), 159 ('Only coaches can set reminders'), 171 ('Task not found'), 176 (no organization), 186 ('Not authorized for this team'), 200 ('Failed to set reminder'), and whose outer `catch` at 205-207 returns `{success:false}` rather than rethrowing. The modal IS live: rendered at src/components/fairway/pages/tasks/FairwayTasks.tsx:628, reached from /golf/dashboard/tasks. SUPPORTING (not proof): production `golf_tasks` has 17 rows and 0 with `reminder_at` set.

**Root cause:** A call site that defends against throws for an action that reports failure by return value. This is the same defect shape as the classes page: the result of a `{success, error}` action is never bound.

**Proposed fix:** Replace lines 307-314 with a bound, branched call and drop the unreachable try/catch: `let reminderFailed: string | null = null; if (reminderAt) { const reminderResult = await setTaskReminder(result.data.taskId, new Date(reminderAt).toISOString()); if (!reminderResult.success) reminderFailed = reminderResult.error ?? 'Unknown error'; }` then at line 316 fork the toast: `if (reminderFailed) fairwayToast.warning('Task created, but the reminder could not be set.', { description: reminderFailed }); else fairwayToast.success('Task created and assigned.');`. Keep a `try/catch` around it only for genuine network faults.

### MEDIUM **[CUSTOMER-FACING]** — Baseball CSV stat upload discards every per-player aggregate recalculation, then reports the upload as fully successful

`src/app/baseball/actions/stats.ts:420`

**Breaks:** After a CSV stat upload inserts rows, the action loops every affected player calling `recalculatePlayerAggregates` and discards each `{success, error}`. It then stamps the upload row `status: 'completed'` and returns `{ success: true, matchedRows: N, ... }`. If a player's `baseball_player_aggregates` upsert fails — including the very realistic case of a staff member without `can_manage_stats` on the team, since `recalculatePlayerAggregatesAction` independently requires that capability while the upload path does not — the coach sees a clean completed upload with a nonzero processed count, and Command Center / Stats Center show stale career averages, trend, and last-5/last-10 for those players indefinitely. The file already went through a documented "HONESTY FIX" for the insert failure (lines 371-376) but left the aggregate loop unchecked.

**Evidence:** src/app/baseball/actions/stats.ts:418-421 — `const affectedPlayerIds = [...new Set(statsToInsert.map(s => s.player_id!))]; for (const playerId of affectedPlayerIds) { await recalculatePlayerAggregates(playerId, teamId); }` — result dropped, then `return { success: true, ... }` at 425-430. `recalculatePlayerAggregates` (stats.ts:780-792) never throws: its try/catch returns `{success:false, error: statsActionErrorMessage(error)}` at line 791, and the inner action returns `{success:false, error:'Failed to recalculate player aggregates'}` at stats.ts:770 on an upsert error. `recalculatePlayerAggregatesAction` declares `requiredCapability: 'can_manage_stats'` (stats.ts:663). Identical discard at stats.ts:817 inside `recalculateTeamAggregates`, which loops the whole roster and then unconditionally returns `{ success: true }` (line 821) — though that one currently has zero call sites, so it is latent.

**Root cause:** Bare `await` on a `{success, error}` action inside a for-loop, with the enclosing result type having no field to carry a partial failure.

**Proposed fix:** Collect the outcomes: `const aggregateResults = await Promise.all(affectedPlayerIds.map((id) => recalculatePlayerAggregates(id, teamId)));` and `const aggregateFailures = aggregateResults.filter((r) => !r.success).length;`. When `aggregateFailures > 0`, call `logServerError` with the count and player ids, and add an `aggregateFailures: number` field to the upload result so the UploadHistory badge can say "completed — N player totals not refreshed" instead of a clean success. Do the same at stats.ts:817 in `recalculateTeamAggregates` and return `{ success: failures === 0, error: ... }` there rather than a hard-coded `{ success: true }`.

### MEDIUM **[CUSTOMER-FACING]** — get_qualifier_leaderboard() is an ungated SECURITY DEFINER RPC that returns any program's roster names and scoring to any authenticated user

`supabase/migrations (function public.get_qualifier_leaderboard):1`

**Breaks:** Anyone with a login — a player at a rival program, a baseball-only user, a Lift Lab athlete — can POST /rest/v1/rpc/get_qualifier_leaderboard {"qualifier_uuid": "<uuid>"} and receive another school's qualifier field: every entrant's first and last name, rounds played, total and average score, best score. Qualifier ids appear in coach-shared URLs and are guessable only by uuid, but nothing else stands between the caller and the data.

**Evidence:** Role impersonation on production. Attacker = Guilford College player user 19b23b3a-8302-4139-bdc9-0558099d21dd. Target = qualifier f4c6ee5a-1ede-4b17-9c29-1a4c4b0b437c ('Pre-Season Qualifier — Spring Invitational', team 6ecdd1a6, org f97a9346 Demo University Golf).
CONTROL (same session): select count(*) from golf_qualifiers where id = 'f4c6ee5a-...' -> 0 rows. RLS correctly blocks the direct read.
PROBE: select * from get_qualifier_leaderboard('f4c6ee5a-...') -> 7 rows returned, with full names (Cole Bennett, Owen Carter, Ethan Park, Mason Rivers, Jackson Hale, Dylan Brooks, Tyler Hayes) and their player_ids.
Function ACL: postgres=X, authenticated=X, service_role=X. prosecdef = true. Body contains no auth.uid(), is_golf_team_coach, or any caller check.
The function is dead code in the app — grep across src finds it only in the generated src/lib/types/database.ts:20608 — so revoking it costs nothing.

**Root cause:** SECURITY DEFINER was used to make the leaderboard aggregate cheap, and the caller gate was never written; EXECUTE was granted to `authenticated` wholesale. Same class as the other ungated definer writers still granted to authenticated: recompute_golf_round_totals(uuid), recalculate_baseball_season_stats(uuid,uuid,int), recalculate_team_baseball_season_stats(uuid,int) — all currently benign (0 of 302 golf_rounds have no golf_holes rows, so recompute is idempotent today) but all callable on arbitrary ids.

**Proposed fix:** Additive migration: REVOKE EXECUTE ON FUNCTION public.get_qualifier_leaderboard(uuid) FROM PUBLIC, anon, authenticated;  GRANT EXECUTE ... TO service_role;  — nothing in src calls it. If it is meant to come back, add as the first statement of the body: IF NOT EXISTS (SELECT 1 FROM public.golf_qualifiers q WHERE q.id = qualifier_uuid AND (public.is_golf_team_coach(q.team_id) OR public.is_golf_team_player(q.team_id))) THEN RETURN; END IF;  Apply the same REVOKE-to-service_role treatment to recompute_golf_round_totals, recalculate_baseball_season_stats and recalculate_team_baseball_season_stats — check first that games.ts:746 and games.ts:1611 call them through the admin client (games.ts:1611 uses the user client and would need to move to admin, or the RPC needs an is_baseball_team_staff(p_team_id) gate).

### MEDIUM **[CUSTOMER-FACING]** — golf_teams INSERT does not bind organization_id to the caller's org — a coach can permanently block another school from creating a team

`supabase/migrations (policy golf_teams_insert_coaches on public.golf_teams):1`

**Breaks:** golf_teams_insert_coaches WITH CHECK is `EXISTS (SELECT 1 FROM golf_coaches WHERE user_id = auth.uid())` — it checks only that the caller is some coach, not that organization_id is theirs. Any golf coach can insert a row into any school's organization_id. The victim can never see or delete it (golf_teams_select needs a staff row; both DELETE policies need staff or created_by), and the partial unique index golf_teams_org_gender_uidx (organization_id, gender) is now occupied — so when the real coach tries to create their Men's or Women's team they get 23505, surfaced as 'Your program already has a Men's team' (teams.ts:571-573) against a team that does not exist as far as they can tell.

**Evidence:** Role impersonation on production, rolled back. As Denison's head coach (user bc03d535-9647-4063-ab64-9985f46d4601, coach row in org ef06ba2e), `insert into golf_teams (id,name,gender,season,join_code,organization_id,created_by) values (..., '5b7d0fbe-cf05-40bb-9b9e-af163f1ce99e' /* Guilford College */, 'bd2236bd-...')` was ACCEPTED with no error. (The follow-up SELECT returned 0 rows only because golf_teams_select hides the new row from its own creator — the same RLS quirk documented at teams.ts:204-211; the absence of a 42501 is the proof the WITH CHECK passed. Control: the identical statement against the staff table in the same session DID raise 42501, so errors do surface in this harness.)
Index confirmed present: golf_teams_org_gender_uidx UNIQUE ON golf_teams (organization_id, gender) WHERE gender IS NOT NULL.

**Root cause:** The policy authorises the ROLE ('you are a coach') rather than the TENANT ('this row belongs to your organization'). organizations_select_all is USING (true), so every org uuid is readable by every authenticated user — the attacker does not have to guess.

**Proposed fix:** DROP POLICY golf_teams_insert_coaches ON public.golf_teams; CREATE POLICY golf_teams_insert_coaches ON public.golf_teams FOR INSERT TO authenticated WITH CHECK (EXISTS (SELECT 1 FROM public.golf_coaches gc WHERE gc.user_id = (SELECT auth.uid()) AND gc.organization_id = golf_teams.organization_id AND gc.id = golf_teams.created_by)); This is satisfied by all three existing writers (onboarding.ts:212-221, createTeamImpl teams.ts:547-559, addSecondTeam teams.ts:1586-1596) — every one already sets organization_id = coach.organization_id and created_by = coach.id. Also add a cleanup query to check for existing orphan teams: select t.* from golf_teams t where not exists (select 1 from golf_team_coach_staff s where s.team_id = t.id) — production currently has 0, so no backfill needed.

### MEDIUM — Scout-packet revoke and relabel write to columns that do not exist in production and discard the error — "Link revoked" is unconditional and the share token stays live

`src/app/baseball/actions/scout-packet.ts:249`

**Breaks:** A coach revokes a scout-packet share link for a player's recruiting passport. `revokeScoutPacketLink` issues `.update({ status: 'revoked' })` against `baseball_player_passport_share_tokens`, which has NO `status` column in production — PostgREST returns a 400. The error is never destructured, and the action's return type is the literal `Promise<{ success: true }>`, so it reports success. ScoutPacketManager flips the row to 'revoked' locally and toasts "Link revoked". The public share URL keeps resolving — the coach believes a scout's access to an athlete's passport (PII, recruiting data) is cut off when it is not. `relabelScoutPacketLink` has the same discard on the nonexistent `recipient_label` column. `mintScoutPacketLink` writes both bad columns too, but it DOES check `error` (line 208), so minting throws — meaning the feature is broken end to end, not just on revoke. NOT customer-facing today: every staff action here is gated by `assertRecruitingShipped()` (scout-packet.ts:83-88) and the recruiting module is off, and the table has 0 rows. This is armed to fire the moment recruiting ships.

**Evidence:** src/app/baseball/actions/scout-packet.ts:249-252 — `await fromUntyped(supabase, 'baseball_player_passport_share_tokens').update({ status: 'revoked', updated_at: ... }).eq('id', linkId).eq('team_id', teamId);` with no `{ error }` destructuring; return type `Promise<{ success: true }>` at line 244; `return { success: true }` at line 254. Same at lines 271-274 / 276 for `relabelScoutPacketLink`. PRODUCTION SCHEMA (information_schema.columns): `baseball_player_passport_share_tokens` columns are id, team_id, player_id, token, label, packet_kind, section_allowlist, expires_at, max_views, view_count, last_viewed_at, revoked_at, created_by, created_at, updated_at — there is no `status` and no `recipient_label`. Revocation in the real schema is `revoked_at`. Row count: 0. This also corrupts reads: `toLinkView` (scout-packet.ts:100-118) derives `status` from `row.status`, which is always undefined, so it hard-codes every link to `'active'` and `isLive: true` regardless of `revoked_at` — a genuinely revoked link would still render as live. And `resolveScoutPacketByTokenImpl` selects `status` at line 480 and checks `row.status === 'revoked'` at line 486, so the public resolver can never honor a revocation either. This is the "type/code believes a column that does not exist" failure class on top of the discarded-error one.

**Root cause:** Two independent defects compounding: (1) the whole file was written against a `status`/`recipient_label` schema that production does not have (production uses `revoked_at`/`label`), and (2) the mutations discard the PostgREST error and are typed `Promise<{success: true}>`, so the schema mismatch cannot surface. Without (2), (1) would have been caught the first time anyone clicked Revoke.

**Proposed fix:** Two parts, both needed. SCHEMA ALIGNMENT: in scout-packet.ts replace `status: 'revoked'` with `revoked_at: new Date().toISOString()` (line 250); replace `recipient_label` with `label` in the mint insert (line 199), the relabel update (line 272), and `toLinkView` (line 107); rewrite `toLinkView`'s status derivation as `const status = row.revoked_at ? 'revoked' : 'active'` (line 101) and drop `status: 'active'` from the mint insert (line 201); change the select and check in `resolveScoutPacketByTokenImpl` (lines 480, 486) to use `revoked_at`; update the live-link filter at line 362. ERROR HANDLING: destructure `{ error }` on both mutations and `throw new Error('Could not revoke the link. Please try again.')` / `'Could not update the label.'` — both clients already have `catch` branches that render the right error toast (ScoutPacketManager.tsx:215-217, :98-100), so no client change is needed. Add a `.select('id')` presence assert on the revoke so an RLS-refused 0-row update is also treated as failure. Add a test that asserts a revoked link's `resolveScoutPacketByToken` returns `fail('revoked')` — the current suite cannot have covered this or the column mismatch would have been caught.

### LOW **[CUSTOMER-FACING]** — Signup makes graduation year a required, submit-blocking field and then throws the answer away

`src/components/auth/golf-sign-up-form.tsx:77`

**Breaks:** A new player cannot submit the golf signup form without picking an expected graduation year (it blocks with "Please select your expected graduation year"), and the value is then never sent anywhere. Two screens later, onboarding asks for graduation year again — pre-populated with an arbitrary default, not their answer. It reads as the product not listening.

**Evidence:** golf-sign-up-form.tsx:41 holds `graduationYear` in state, lines 56-65 hard-block submit on it and derive an age check from it, but the call at lines 77-83 passes only `(email, password, role, firstName, lastName)`. signupAction's signature (src/app/golf/actions/auth.ts:286-292) has no grad-year parameter, and its `options.data` metadata block (auth.ts:346-351) writes only role, sport, first_name, last_name. handle_new_user (verified against prod via pg_proc) reads only role/sport/first_name/last_name and creates no golf_players row at all. The value then re-appears as a fresh question at src/app/golf/(onboarding)/player/page.tsx:65-67, defaulted to `graduationYears[3]`.

**Root cause:** The field was added to the signup form for the COPPA age gate (the ≥13 check at line 61-65, which is a legitimate client-side use) but was never plumbed into the action, and nobody noticed because onboarding asks again and the DB column ends up populated either way.

**Proposed fix:** Cheapest correct fix: carry it through auth metadata so onboarding can prefill it. Add an optional 6th param to signupAction/signupActionImpl (`graduationYear?: number`), include `graduation_year: graduationYear ?? null` in the `options.data` block at auth.ts:346-351, pass `Number(formData.graduationYear) || undefined` from the form at line 77-83, and in (onboarding)/player/page.tsx:65-67 seed the default from `user.user_metadata?.graduation_year` before falling back to `graduationYears[3]`. No DB change needed — onboarding still writes the authoritative value.

### LOW **[CUSTOMER-FACING]** — The stats summary cards aggregate over unlimited rounds while the detailed engine on the same page caps at 100, so the two will silently disagree

`src/app/golf/actions/stats-data.ts:937`

**Breaks:** On one screen a player will see a scoring average in the summary card computed over their entire career, and a scoring average from the detailed shot engine computed over only their most recent 100 rounds. The detailed view surfaces a truncation notice; the summary card does not, and the two numbers will simply not match. Not triggered today (max ~30 completed rounds per player in production), but it arrives silently for any four-year player on the platform.

**Evidence:** queryDetailedStatsWithClient applies `query = query.limit(sqlLimit)` at stats-data.ts:937 with `const sqlLimit = presetLimit ?? DETAILED_STATS_MAX_ROUNDS` (line 936, DETAILED_STATS_MAX_ROUNDS = 100 at line 874), and correctly sets a `truncated` flag (line 978-981, surfaced in the UI at src/components/golf/stats/spine-stage/StatsSpineStage.tsx:370). getStatsSummary's query (stats-data.ts:685-712) applies no `.limit()` and no pagination at all — it relies on PostgREST's implicit 1000-row cap and computes scoringAverage over whatever comes back (lines 313-318). So for 101-1000 rounds the two disagree with no disclosure, and past 1000 the summary itself silently truncates with no `truncated` flag of its own. Current production max is ~30 completed rounds for any single player, so this is latent, not live.

**Root cause:** Two aggregate paths for the same page were bounded differently and only one grew a truncation contract.

**Proposed fix:** Give getStatsSummary the same bound and the same disclosure: apply `.limit(presetLimitCount(filter) ?? DETAILED_STATS_MAX_ROUNDS)` to the query at stats-data.ts:712, run the same exact-count query the detailed path uses (lines 946-961), and add a `truncated: boolean` field to StatsSummary so the summary cards can show the same notice StatsSpineStage.tsx:370 already renders. Alternatively route both through one shared round-window resolver so the cap can never drift apart again — that is the more durable fix given this exact class of divergence is what finding #1 is about.

### LOW **[CUSTOMER-FACING]** — 185 class calendar chips render a duplicated course code ('BIO-121: BIO-121: General Biology I')

`src/app/golf/actions/calendar-sync.ts:245`

**Breaks:** The import path stores class_name as `${course_code} - ${course_name}` (page.tsx:275-277), where the vision parser often already put the code inside course_name. On edit/re-sync, page.tsx:358-365 splits class_name on ' - ' into code='BIO-121' and name='BIO-121: General Biology I', and calendar-sync.ts:245-247 then builds the title as `${course_code}: ${course_name}` — producing 'BIO-121: BIO-121: General Biology I' on every calendar chip, agenda row, and iCal SUMMARY for that class.

**Evidence:** Production: `SELECT count(*) FROM golf_events WHERE description LIKE '%[class:%' AND title ~ '^([^:]+): \1[:.]'` -> 185 events across 5 distinct titles. Sample stored value: golf_player_classes.class_name = 'BIO-121 - BIO-121: General Biology I'; the resulting golf_events.title = 'BIO-121: BIO-121: General Biology I'.

**Root cause:** class_name is a lossy round-trip format: code and name are joined with ' - ' on write and split back on read, but the parser may already have embedded the code in course_name, so the split re-derives a code that is still present in the name, and the title builder prefixes it a second time.

**Proposed fix:** In calendar-sync.ts:245-247, suppress the prefix when it is already present:
  const name = classData.course_name || 'Class';
  const code = classData.course_code?.trim();
  const title = code && !name.toLowerCase().startsWith(code.toLowerCase()) ? `${code}: ${name}` : name;
The existing diff at line 358 (`existing.title !== desired.title`) repairs the 185 rows on the next re-sync of each class; a backfill UPDATE using the same regex fixes them immediately.

### LOW **[CUSTOMER-FACING]** — Baseball notification bell's optimistic mark-read never reverts, because the action reports failure by return value and the call site only catches throws

`src/components/baseball/NotificationBell.tsx:263`

**Breaks:** A coach taps a notification (or "Mark all as read"). The bell optimistically clears the row and decrements the badge, then calls `markNotificationRead` inside `try { } catch { refetch }`. Because the action returns `{success:false}` rather than throwing, the catch never runs and the revert never happens — the badge shows 0 unread while the rows are still unread in `baseball_notifications`. Self-heals on the next popover open (which refetches), so impact is bounded, but the coach can miss a notification in the interim.

**Evidence:** src/components/baseball/NotificationBell.tsx:261-268 — `startTransition(async () => { try { await markNotificationRead(id); } catch { void fetchNotifications(); void refreshCount(); } })`, result never bound. Same shape at lines 304-311 for `markAllNotificationsRead`. `markNotificationRead` returns `NotificationMutationResult` and returns `{ success: false, error: 'Could not mark notification as read.' }` at src/app/baseball/actions/notifications.ts:134 without throwing; `markAllNotificationsRead` likewise at notifications.ts:160.

**Root cause:** Same shape as the task-reminder finding: a `catch` guarding an action that never throws. The result is never bound so the failure is invisible.

**Proposed fix:** Bind and branch in both handlers: `const res = await markNotificationRead(id); if (!res.success) { void fetchNotifications(); void refreshCount(); }` (keep the surrounding try/catch for genuine network faults and run the same revert from it). Apply identically to `markAllNotificationsRead` at line 306.

### LOW — CoachHelm hole/round miner types declare DB-nullable columns as non-null, licensing `?? 0` coercions that would fabricate 0-stroke, 0-putt, missed-green holes

`src/lib/coachhelm/v2/mining/correlation-discovery.ts:83`

**Breaks:** If either miner ever loses its `.eq('status','completed')` prefilter — or a completed round ever lands with a NULL hole (nothing in the schema prevents it; the columns are nullable with no default), the 96-row in-progress population becomes reachable. A NULL-putt hole would then count as a 0-putt hole inside `puttsOnGir` averages and a NULL gir as a MISSED green, so CoachHelm would tell a coach their player's putts-per-GIR improved when the truth is the data is absent. The types would still typecheck and no error would surface — "no data" silently becomes "perfect data".

**Evidence:** src/lib/coachhelm/v2/mining/correlation-discovery.ts:83 `interface HoleCorrelationData` declares `strokes: number`, `putts: number`, `gir: boolean` — all non-null. Live DB says golf_holes.score, .putts, .gir are all NULLABLE. The mapper at :281-283 therefore coerces rather than filters:
    strokes: h.score ?? 0,
    putts:  h.putts ?? 0,
    gir:    h.gir ?? false,
Those values are then consumed as real data at :595-596 (`h.putts >= 3` three-putt counts), :729 and :818 (`girHoles.reduce((a,h) => a + h.putts, 0)` putts-per-GIR averages), :861. Same shape at src/lib/coachhelm/v2/mining/pattern-miner.ts:242 (`score_to_par: number`, coerced `?? 0` at :374) and :83/:88 in the same file.

I verified this is NOT currently live. Production has 96 golf_holes rows with a NULL score/putts/gir and 6 golf_rounds with NULL score_to_par/total_score — and a status join shows ALL of them belong to `status = 'in_progress'` rounds (0 in completed rounds). Both miners filter to completed rounds before loading holes (correlation-discovery.ts:204 `.eq('status','completed')` then `.in('round_id', roundIds)` at :268; pattern-miner.ts:362 same), so the nulls never reach the coercion today. Reporting it as a latent trap, not a live defect — I am stating plainly that the harm is currently unrealised.

**Root cause:** The row interfaces were hand-written to the shape the miner wanted rather than the shape the table returns, and the nullability gap was then papered over with `??` defaults at the mapping boundary instead of with a filter. Nothing enforces that these two miners keep their `status='completed'` prefilter.

**Proposed fix:** Change the declarations to match the DB (`strokes: number | null; putts: number | null; gir: boolean | null` at correlation-discovery.ts:83-89; `score_to_par: number | null` at pattern-miner.ts:242) and replace the `??` defaults at correlation-discovery.ts:281-283 and pattern-miner.ts:374 with an explicit filter that DROPS incomplete holes/rounds from the sample before analysis, so a missing value shrinks the sample size (and trips the existing minimum-sample gates) instead of manufacturing a data point. Keep the `status='completed'` prefilters and add a unit test asserting a hole with `putts: null` is excluded from `avgPuttsPerGir` rather than counted as zero.
