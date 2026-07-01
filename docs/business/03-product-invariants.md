# Product Invariants (never break)

> Purpose: this is THE enforcement doc for helmv3 — the set of rules that must hold true in every PR regardless of feature, sport, or deadline. If a change violates something in this file, it is a defect even if it "works" in the demo.

This doc exists for two readers: an AI code reviewer (Greptile, configured at `.greptile/rules.md`) doing cross-file pattern enforcement, and a brand-new staff engineer who needs the non-negotiables before touching Supabase, the calendar, the scoring engine, recruiting, or CoachHelm's LLM layer. Every invariant below is phrased as an imperative a reviewer can check against a diff. See `01-*.md`/`02-*.md` for company/product framing and `docs/v3-master-plan.md`, `docs/v3-rls-template.md`, `docs/v3-research-golf-domain.md` for the underlying architecture and research this doc enforces.

---

## (a) Data isolation & tenancy invariants

Helm Sports Labs sells to programs (teams), not individuals, and the product holds minors' academic + athletic PII (see `docs/business/02-*` compliance framing). A cross-tenant leak — one coach or player seeing another team's roster, rounds, insights, or recruiting pipeline — is the single worst-case, business-ending failure mode for this product. There is a documented prior RLS incident (`docs/audits/COACH_DASHBOARD_AUDIT_REPORT.md`). Treat every rule below as load-bearing.

- **Every table must enable RLS in the same migration that creates it.** `CREATE TABLE` without `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and at least one `CREATE POLICY` in the same migration file must be blocked (`.greptile/rules.md` hard rule 6).
- **RLS is the only enforcement boundary — never trust app-layer filtering.** Server actions and route handlers must not "help" RLS by adding a `.eq('team_id', ...)` filter as a substitute for a policy; that is a client-trust bug waiting for the one caller who forgets it (`docs/v3-rls-template.md`, "Common Mistakes").
- **Coach↔team relationship must go through `golf_team_coach_staff`.** `golf_coaches.team_id` does not exist in the schema. Any `.from()` query, RLS policy, or join that assumes a direct `team_id` column on `golf_coaches` is a bug (`.greptile/rules.md` hard rule 10, `docs/v3-rls-template.md`).
- **Player↔team relationship must go through `golf_team_members`**, filtered to `status = 'active'::team_member_status` where "currently on the team" is the intent. A player who transferred teams must lose access to the old team's data (the "transfer test" in `docs/v3-rls-template.md`).
- **Use the canonical RLS helper functions — do not inline equivalent joins.** `current_player_id()`, `is_team_coach(team_uuid)`, `is_team_player(team_uuid)`, and the sibling `current_coach_id()` / `is_in_team()` helpers are the only sanctioned access primitives, shipped in `supabase/migrations/20260524190000_v3_rls_helpers.sql`. A policy that writes `EXISTS (SELECT 1 FROM golf_team_coach_staff s JOIN golf_coaches c ...)` inline instead of calling `is_team_coach()` must be flagged — a future schema correction has to patch every policy individually instead of the helper once.
- **All RLS helper functions must be `SECURITY DEFINER` with `SET search_path = ''`** (or explicitly `SET search_path TO 'public'` per the existing convention) to block search-path attacks. A new `SECURITY DEFINER` function missing this clause is a hard block (`.greptile/rules.md` hard rule 6).
- **`SUPABASE_SERVICE_ROLE_KEY` bypasses RLS and is allowed only in `src/lib/supabase/admin*` and `src/app/api/**/admin/**`.** Any other file importing or using the service-role client is a security incident, not a style nit (`.greptile/rules.md` hard rule 4).
- **Engine-written tables (`golf_coach_insights`, `golf_player_standing`, `golf_player_genome`, etc.) must never carry an `authenticated`-role write policy.** Writes to these tables happen only via `createAdminClient()` server-side; RLS on them exists solely to gate reads (`docs/v3-rls-template.md`, Pattern 4).
- **Server actions must authenticate before any DB call.** Every exported async function under `src/app/**/actions/**` must call `await supabase.auth.getUser()` and throw before the first `.from()`/`.rpc()` call — never after (`.greptile/rules.md` hard rule 5).
- **Every new RLS policy ships with tests**: a positive test (user X can access rows they should), a negative test (user X cannot access rows they shouldn't), a cross-team test (coach on team A cannot read team B), and — where applicable — a transfer test (`docs/v3-rls-template.md`, "Testing Standards"; `docs/v3-testing-standards.md`).
- **Table names are sport-prefixed.** All Supabase tables are `golf_*` or `baseball_*`; only `users`, `organizations`, `memberships`, `audit_log`, and `feature_flags` are exempt. `.from("coaches")`, `.from("players")`, `.from("teams")`, `.from("rounds")`, `.from("events")` are always wrong table references (`.greptile/rules.md` hard rule 1) — treat this as a tenancy-adjacent rule because a mis-named table often means the RLS policy on the *intended* table was never checked either.
- **Client/server Supabase client separation must not be crossed.** Server code uses `await createClient()` from `@/lib/supabase/server`; client components (`'use client'`) use `createClient()` from `@/lib/supabase/client`. Importing the server client into a client component is a build-breaking error, and — more relevant here — importing the wrong client is how service-role capability accidentally leaks into a browser bundle.

## (b) Calendar/Scheduling invariants

Calendar correctness is a trust surface: a player who shows up to the wrong time, or misses a mandatory event because the UI didn't make "required" obvious, is a direct coach-trust failure independent of any code bug elsewhere.

- **Store every timestamp in UTC in the database.** No column should store a "local" wall-clock time without a timezone reference; the source of truth for "when" is always UTC.
- **Display must convert UTC to the team's (or user's) configured timezone at render time** — never assume the server's timezone is the team's timezone. A Vercel serverless function's local clock is not authoritative for "is this event today for this team."
- **Never assume a fixed timezone for "today."** Any code path that computes "events today," "this week," or "next practice" must resolve the day boundary using the team/user's timezone, not `new Date()`'s implicit local zone or a hardcoded offset.
- **Date-range/day-boundary filters must be timezone-aware.** A query for "today's events" built from a naive UTC midnight-to-midnight window will silently show yesterday's or tomorrow's events for teams outside the server's zone — this must be caught in review whenever a new calendar query is added.
- **Recurring events must be tested across a DST transition.** Any recurrence-generation code (weekly practice, repeating team meetings) must have a test case that spans a spring-forward or fall-back boundary; "recurs every Tuesday at 3pm" must not silently shift by an hour twice a year.
- **Every event must make required-vs-optional and team-wide-vs-individual status immediately legible to a player**, not buried in a detail view. A player scanning their calendar must be able to tell at a glance whether an event is mandatory. This is a UX invariant, not just a data-modeling one — the underlying field must exist AND the surfaced UI must not hide it behind a tap.
- **Coaches must have attendance/acknowledgement visibility for events that require it.** If an event is marked required or requires RSVP/acknowledgement, the coach-facing view must show who has and hasn't acknowledged — a required event with no visibility into compliance is functionally optional.

## (c) Golf scoring correctness (Strokes Gained)

This is the highest numeric-correctness bar in the codebase. Getting SG math wrong directly undermines the core differentiator against Clippd (the NCAA's official scoring/rankings vendor since 2023) — SG is the product's credibility, not a cosmetic stat.

- **SG for a shot must equal `baseline_expected_strokes(start) − baseline_expected_strokes(end) − 1`**, per Mark Broadie's canonical formula (`docs/v3-research-golf-domain.md`, §1). Any generator or migration that reimplements this arithmetic must match this exact form — no shortcuts, no "close enough" approximations.
- **There are exactly four SG categories and they must not be redefined ad hoc**: OTT (tee shots, par-4/5 only — par-3 tees count as approach), APP (approach shots beyond ~30 yards, plus par-3 tee shots), ARG (within ~30 yards, non-putts), PUTT (all on-green shots). They sum to SG:Total. A shot miscategorized against this taxonomy corrupts both the individual category and the total.
- **SG values are cached, not recomputed on read**, in `golf_player_stats_cache`. Any code path that reads player SG for display must read the cache, not recompute from raw shots inline — recomputation-on-read is both a performance regression and a correctness risk (two code paths can drift). Cache invalidation/recompute must happen at write time (round save) via the sanctioned recompute path, not scattered across read call sites.
- **Every causal or comparative claim the product makes (in insights, narratives, or UI copy) must trace back to a finding in `docs/v3-research-golf-domain.md`.** That file is the explicit source of truth: "every causal assertion in v3 generators must trace back to a finding here." A generator asserting "putting explains most of your scoring gap" without grounding in the documented Broadie variance breakdown (long game ~65%, short game + putting ~35%, putting alone ~15%) is a fabricated claim, not an insight.
- **PGA Tour baseline numbers shown in standing bars or comparisons must come from the cited tables in `docs/v3-research-golf-domain.md`** (e.g. the putt make % by distance table that seeds `golf_pga_standards`), not hardcoded or eyeballed values.
- **College-level nuance must not be flattened to Tour-level assumptions.** The research doc explicitly notes college players' SG:APP and short-putt make % carry disproportionate weight versus Tour because driving accuracy converges among elite amateurs — a generator that applies pure Tour-level weighting to a college dataset misrepresents the domain.

## (d) Recruiting pipeline invariants (stable, high-level)

Recruiting logic is actively changing (BaseballHelm's current implementation is mid-rework — do not treat any current recruiting UI/schema detail as settled). These invariants are intentionally high-level and apply regardless of implementation churn.

- **Pipeline stage values must exactly match the DB enum: `watchlist`, `high_priority`, `offer_extended`, `committed`, `uninterested`.** Any other stage string is a bug, not a feature — this is a hard rule enforced independent of which UI currently drives it (`.greptile/rules.md` hard rule 9).
- **Recruiting/CRM outreach is opt-in, not default-on.** A coach's recruiting workflow (contacting prospects, adding to a pipeline) must be an explicit action the coach takes, not something the platform does on a program's behalf without confirmation — this matters both for product trust and for TCPA/DNC-adjacent outreach compliance.
- **Recruiting data is team-isolated like every other tenant surface.** A pipeline entry, prospect note, or outreach record belongs to one team/program and must follow the same RLS-first isolation rules in section (a) — there is no "shared recruiting pool" across programs.

## (e) LLM budget invariants (CoachHelm)

CoachHelm's LLM layer is the one place in the repo with an enforced cost-control mechanism. There is no billing/Stripe/subscription code anywhere in the repo, and pricing is not documented in-repo — the daily LLM budget in `src/lib/coachhelm/v3/llm/budget.ts` is the only enforced cost guard today. Treat it as such: a bypass here is a runaway-cost incident, and a silent-fallback bug is a paid-feature downgrade the coach never notices.

- **Enforce a per-coach daily spend cap before every LLM call.** `src/lib/coachhelm/v3/llm/budget.ts` reads/upserts `golf_coachhelm_llm_budget` (keyed by `coach_id` + date, `budget_usd`/`spent_usd`), falling back to the team's `golf_coachhelm_settings.llm_budget_usd_per_day` when no per-coach row exists yet. Any new LLM-calling code path that skips this check must be blocked.
- **Never hardcode $/token math anywhere outside the budget module.** Cost calculation logic belongs in `src/lib/coachhelm/v3/llm/budget.ts`; a new feature file computing its own token-to-dollar conversion is a drift risk the moment pricing or models change.
- **On budget exhaustion, fall back to template — never fail silently and never fail the request outright** for a feature that has a template equivalent. The documented fallback priority is `round_review > coach_chat > hero_narrative -> template`: higher-priority features keep LLM access longer as budget depletes; lower-priority ones degrade to template first.
- **Never call the LLM client-side.** `composeRoundReview`, `composeHeroNarrative`, and `composeCoachChat` are server-only; a `'use client'` component making a direct model call bypasses the budget check entirely and is a hard block (`.greptile/rules.md`, CoachHelm-specific guidance).
- **LLM features must verify citations and regenerate once before falling back to template.** A narrative that can't be grounded in the underlying data (see section (c) — every causal claim must trace to real findings) must trigger one regeneration attempt, then fall back rather than ship an ungrounded claim.
- **V2 engine scoring functions must remain pure.** Code under `v2/insights/` and `v2/composite/` must not perform fetches or Supabase calls inside scoring logic — scoring takes data in, returns a score out, nothing else. A PR that adds a Supabase call inside a scoring function breaks testability and is a hard cross-file violation Greptile should catch even though it's invisible in a single-file diff.
- **The effectiveness ledger (`golf_insight_*` tables) is how insight quality is measured over time** — new insight-generating code should not bypass writing to it if the existing generators do.

## (f) No destructive DELETE-then-INSERT

This is a documented prior incident, not a hypothetical: a transient failure between a DELETE and the following INSERT permanently lost user data. It is a hard rule across the entire repo, and roster, qualifier selections, and round-save are the highest-risk surfaces because they are the most frequently re-saved.

- **Never DELETE-then-INSERT in any save/submit/sync path**, in any language (TypeScript server actions, SQL migrations, Python tools/ scripts). This is `.greptile/rules.md` hard rule 7, verbatim.
- **Use `upsert`/`ON CONFLICT` for idempotent single-row or keyed-batch writes.** If a row already exists, update it in place; do not clear and reinsert.
- **Use stage-and-swap for full-set replacements** (e.g., "replace this qualifier's entire selection list"): write the new set to a staging location or under a new key, verify the write succeeded, then atomically swap — never delete the old set before the new set is confirmed durable.
- **Roster edits, qualifier selection saves, and round saves get the highest review scrutiny for this pattern** — these are explicitly named as the highest-risk surfaces given save frequency and the cost of data loss to a coach mid-season.
- **A reviewer should treat any `DELETE FROM ... WHERE` immediately followed by an `INSERT INTO` (same table, same logical entity, same request/transaction) as a hard block, not a style comment**, regardless of whether it's wrapped in a DB transaction — a transaction protects against partial application but does not excuse the pattern; prefer upsert/stage-and-swap outright.

## (g) Permissions/role invariants

- **The tenant/access unit is the team**, not the individual, and every permission check must resolve through team membership (coach staff or active player), never through a bare `user_id` equality check that skips the team relationship.
- **Coach and player are the two golf personas**; the coach role is not further subdivided in the golf schema. Admin (`/golf/admin`) is a separate, higher-privilege surface — code must not conflate "is a coach" with "is an admin."
- **Players are frequently minors** (academic + athletic PII). Any new feature exposing player data — to other players, to third-party integrations, to analytics/logging — must be evaluated against the tenancy rules in section (a) with extra scrutiny; "the coach can see it" does not imply "a teammate can see it," and vice versa.
- **Coach-created content that is coach-only (e.g., Coach Intent) must never be readable by a player policy**, even accidentally via a broader team-read policy. When adding a coach-only table, verify there is no player SELECT policy at all — not even a narrowly scoped one — unless the design explicitly calls for shared visibility (`docs/v3-rls-template.md`, Pattern 2).
- **Shared-visibility data (e.g., Goals) must gate coach access on an explicit sharing flag or assignment, not on team membership alone.** A coach seeing all of a player's private goals just because they're on the same team violates the intended player-ownership model (`docs/v3-rls-template.md`, Pattern 1).
- **Role/permission changes must not be inferred client-side.** Whether a user "is a coach" or "is a team's coach" for a given team must be resolved server-side via the RLS helpers (or an equivalent server-side check for non-DB authorization decisions) — never trust a client-supplied role claim.
- **Account deletion must be treated as incomplete cascade risk until verified otherwise.** `src/app/api/account/delete/route.ts` exists, but any PR touching account deletion, data retention, or export must verify all tenant-scoped tables the deleted user owned or was referenced from are actually cleaned up — a partial cascade leaves orphaned minors' PII, which is a compliance-relevant defect even without a confirmed current violation.

---

## For the reviewer

Flag a PR when:

- A new or modified table lacks `ENABLE ROW LEVEL SECURITY` + at least one `CREATE POLICY` in the same migration, or a policy inlines a join instead of calling `current_player_id()` / `is_team_coach()` / `is_team_player()`.
- Any query or policy assumes `golf_coaches.team_id` exists, or joins player↔team without going through `golf_team_members` + `status = 'active'`.
- A calendar feature computes "today" or a recurrence without an explicit team/user timezone conversion, or a required/optional event distinction isn't visible in the player-facing UI.
- SG math is reimplemented outside the sanctioned formula, a generator makes a causal claim not traceable to `docs/v3-research-golf-domain.md`, or SG is recomputed on read instead of served from `golf_player_stats_cache`.
- A recruiting pipeline write uses a stage value outside `watchlist`/`high_priority`/`offer_extended`/`committed`/`uninterested`, or outreach is triggered without an explicit coach opt-in action.
- Any code path calls an LLM client-side, skips the `golf_coachhelm_llm_budget` check, hardcodes a $/token constant outside `budget.ts`, or a scoring function under `v2/insights/`/`v2/composite/` performs a fetch or Supabase call.
- A save/submit/sync path does DELETE-then-INSERT on roster, qualifier selections, round data, or anywhere else — regardless of transaction wrapping; require upsert/`ON CONFLICT` or stage-and-swap instead.
- A coach-only table gains an unintended player SELECT policy, or shared-visibility data (Goals) grants coach access without checking an explicit share/assignment flag.
