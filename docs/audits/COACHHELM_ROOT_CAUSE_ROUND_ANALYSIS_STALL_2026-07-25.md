# CoachHelm root cause: 69% of rounds are never analysed

**Date:** 2026-07-25
**Question asked:** "The insights need to be triple investigated and root caused — don't think the accurate ones reach the UI."
**Status:** Root cause proven. One prod write required to remediate, awaiting owner approval.

---

## The answer in one paragraph

The insight engine is not broken and the data is not wrong. **Insights are stale
because most rounds were never analysed at all.** `postRoundTrigger` runs through
Next's `after()`, which is fire-and-forget and not durable, so when a serverless
instance ends before the callback runs the round is silently left unprocessed —
no error, no failure flag. A safety-net cron exists to catch exactly that, but it
only looks at rounds created in the last 30 days. Rounds that stayed unprocessed
past that window aged out of its reach permanently. There are now **200 completed
rounds stranded outside the window**, the cron correctly finds nothing to do, and
it has reported success 332 times in 30 days while doing no work. Display caps in
the UI then truncate the stale remainder further, which is a real but secondary
problem.

---

## The chain, with evidence

| # | Step | Evidence |
|---|---|---|
| 1 | Players are active — this is not the off-season | 290 rounds; newest played 2026-07-23 (2.2 days before this audit); 50 rounds in the last 30 days |
| 2 | Most rounds carry no terminal state | `coachhelm_analyzed_at` set on **82/290**; `coachhelm_failed_at` on **2**; **206** have both NULL |
| 3 | The trigger is not durable | `postRoundTrigger` is invoked via `after()` on round submit — `src/lib/coachhelm/v2/post-round-trigger.ts`. `after()` is fire-and-forget; if the instance terminates first it never runs and neither column is written |
| 4 | The safety net has a lookback window | `src/app/api/cron/coachhelm-safety-net/route.ts`: `LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000`, `BATCH_LIMIT = 200`, `CONCURRENCY = 5`; predicate is `status='completed' AND coachhelm_analyzed_at IS NULL AND coachhelm_failed_at IS NULL AND created_at >= now() - 30d` |
| 5 | Its own predicate, run against prod, accounts for every missing round | eligible right now: **0**; completed + both NULL + `created_at` older than 30d: **200**; not completed (correctly skipped): **6**. 200 + 6 = 206 exactly |
| 6 | So the cron is green and idle | 332 runs in 30 days, **0 failures**, last run the day of this audit — it correctly finds nothing, because the backlog left its window |
| 7 | This has happened before | `route.ts:32`: *"Widened from 24h → 30d on 2026-05-23 to drain the 112 pre-existing"*. The backlog regrew from 112 to 200 — widening drained the symptom, the cause was never fixed |

### The downstream effect on what a user sees

Only ~82 rounds ever produced insights, so:

- Of 252 UI-visible insights, **242 (96%) are 31–60 days old**. Only 2 are under a week old.
- One of those 2 fresh rows is orphaned (`team_id` and `coach_id` both NULL, player has no `golf_team_members` row), so RLS makes it reachable only by the player. For a coach, **the freshest visible insight is 6 days old**.
- The player's own CoachHelm page caps at 6 (`coachhelm/page.tsx:214`), so 130 of 252 (52%) never reach the player, with no "view more" path.
- The coach's per-player deep-dive fetches 4 (`FairwayPlayerInsight.tsx:460`) and displays 2 (`:612`) — 207 of 252 (82%) absent from that view. That file notes the development plan still receives the full list, so those are not gone from every surface.
- That same route's SSR insight query (`.limit(20)`) is dead: the prop is commented `legacy; client re-fetches evidence rows` (`:175`). Twenty rows fetched and discarded per page load.

---

## Hypotheses tested and rejected

Recorded because each looked correct and would have produced a wrong fix.

**"The terminal-state write is failing or RLS-blocked."** `writeTerminalState`
(`post-round-trigger.ts:117-137`) swallows both an error and a 0-row update,
logging in each case and returning without writing. That is genuinely fragile and
looks exactly like a silent infinite retry: the safety net would re-select the
round every 30 minutes forever while the cron reported success.
**Rejected** — `error_logs` contains **zero** `[postRoundTrigger] terminal-state
write` entries. The only two matching rows are engine failures ("No active team
membership for player", 2026-07-12 and 07-23), which correctly stamped
`coachhelm_failed_at` and match the 2 failed rounds exactly. The write path works.

**"It is late July, so no new rounds is correct behaviour."**
**Rejected** — 50 rounds in the last 30 days, newest 2.2 days old.

**"The coach queue's missing `evidence IS NOT NULL` filter hides insights."** The
asymmetry is real: `signal-groups.ts:130-139` omits the filter that the whole
player-facing delivery layer requires. **Rejected as a current cause** — zero rows
have `evidence` NULL or `{}`. It is a latent trap, not today's problem.

---

## Remediation

### Fix the cause (no prod write)

Move post-round analysis off `after()` onto a durable queue. **Inngest is already
wired** for this class of work — client at `src/lib/inngest/client.ts`, functions
at `src/lib/inngest/functions.ts`, handler at `src/app/api/inngest/route.ts`
(see `CLAUDE.md`). An Inngest function gets retries and durability, which removes
the need for a lookback-window safety net at all. Requires `INNGEST_EVENT_KEY`
and `INNGEST_SIGNING_KEY` in prod.

Until that lands, the safety net's window is load-bearing and its 30-day bound is
the thing that strands rounds. Any window is a bound; durability is the fix.

### Drain the existing backlog (REQUIRES OWNER APPROVAL — prod write)

200 completed rounds need analysis. Options:

1. A one-off run with a widened lookback. Simple, uses the existing tested path.
   Note `BATCH_LIMIT = 200` and `CONCURRENCY = 5` against a 300s function budget —
   200 rounds is at the limit and may need more than one pass.
2. A scoped backfill script over the 200 known round IDs.

Both call the same `postRoundTrigger`. Neither should run without sign-off. Expect
some to fail legitimately (2 already did, for players with no active team
membership) — those correctly get `coachhelm_failed_at` and stop being retried.

### Also worth fixing while here

- **Raise the display caps or add pagination.** A coach seeing 2 of ~10 insights
  per player is a product decision, but there is no path to the rest.
- **Delete the dead SSR query** at `players/[playerId]/game/page.tsx` — it fetches
  20 insights per page load and throws them away.
- **Add an alarm for "ran successfully, did nothing."** The deepest problem here is
  not the window; it is that a cron reported success 332 times while a 200-round
  backlog sat untouched. A job that finds zero eligible rows while a backlog exists
  outside its own filter should say so. This exact shape — green, silent, no
  effect — is the recurring failure mode across CoachHelm (see the calibration and
  `sample_n` findings in the remediation plan).

---

## Verified working

Stated explicitly, because a defect list reads as if nothing works.

- Every cron runs on schedule with zero failures (23 nightly runs / 30 days).
- No `GRANT ... TO anon` anywhere in the insight read path; the coach/player read
  path is direct PostgREST + RLS with no RPC gate. Only
  `get_admin_analytics_rollup` (SECURITY DEFINER, no anon execute) touches
  `golf_coach_insights`.
- The terminal-state write path works correctly, including its failure branch.
- `lag_distance_3putt` and `short_side_scrambling_chain` compute `sample_n`
  honestly (varied values in prod: 15/30/31).
- `DiagnosisPanel` — built to fix "322 V3 rows with this structure and ZERO
  components rendering it" — **is wired and live** via
  `EvidencePanel:25 → :451`, reached from `InsightCard`.

---

## Open questions

| Question | What would settle it |
|---|---|
| Why did `after()` fail for these specific rounds — cold-start eviction, deploy mid-request, or an unhandled throw upstream? | Correlate the 200 rounds' `created_at` against deploy timestamps and function logs for that window |
| ~~Are the 5 orphaned insight rows a data-integrity bug or intentional?~~ **ANSWERED — see below** | — |
| Do the 200 rounds have enough shot data to produce useful insights, or will analysis produce thin results? | Sample `golf_shots` coverage for those round IDs before backfilling |

### Answered: the orphaned insights are an onboarding gap, not a data bug

The 5 insights with `team_id` and `coach_id` both NULL belong to **two players**,
and **neither has any `golf_team_members` row at all** — not even an inactive or
removed one. So this is not roster removal (that would leave a membership row
behind); these are players who created an account, logged rounds, and were never
added to a team.

| player | orphaned insights | newest | rounds logged | membership rows |
|---|---|---|---|---|
| `d75439ba-…` | 1 | 1.5 days (the freshest insight in the whole table) | 1 | 0 |
| `654d35a1-…` | 4 | 48 days | **12** | 0 |

The insight rows themselves are correctly scoped — RLS is doing the right thing.
The gap is upstream: **a player can fully use the product and remain invisible to
every coach.** Twelve logged rounds is an engaged user, not a test account.

Worth deciding, as product questions rather than bugs:

- Should round entry require, or at least prompt for, a team join?
- Should a coach see unrostered players who have logged rounds, so they can be
  claimed onto a team?
- Should the join flow be surfaced to a player who has logged rounds but has no
  membership?

No action taken. Archiving or reassigning these rows would be a prod write and is
not proposed — the rows are correct; the onboarding path is what needs the fix.
