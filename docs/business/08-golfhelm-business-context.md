# GolfHelm — Business Context

> Purpose: Give a reviewer or a new engineer the "why" behind GolfHelm's code — what it promises coaches and players, which invariants are load-bearing for that promise, and how it is positioned against Clippd and the rest of the college-golf tech stack.

GolfHelm is Helm Sports Labs' college golf team-management product, shipped with an embedded AI intelligence layer called **CoachHelm** (`CLAUDE.md:9-13`, `src/app/golf/README.md`). It is not a separate app or a separate SKU — CoachHelm is a set of tables, a scoring/prediction engine, and a narrative layer that sit on top of GolfHelm's round data. Helm Sports Labs also ships BaseballHelm (college baseball recruiting + team management) and a strength-and-conditioning module ("Lift Lab"); both are mentioned here only for product framing — see their own docs, not this one, for current implementation (both are mid-change as of this writing).

For persona and buyer-unit definitions shared across Helm Sports Labs products, see `01-personas.md` — this doc gives the golf-specific detail.

---

## 1. What GolfHelm Is

GolfHelm is full team-management software for a college golf program (`src/app/golf/README.md:8-13`):

- Players record rounds shot-by-shot (50+ stats per round), track development, RSVP to events, and complete tasks.
- Coaches manage roster, calendar, qualifying/travel selection, messaging, documents, and tasks, and consume an AI layer (CoachHelm) that mines patterns, predicts performance, and writes round reviews.
- Everything lives under `/golf/*` routes, `golf_*`-prefixed tables (74 tables in production per `src/app/golf/README.md:95`), and a dedicated auth store (`golf-auth-store.ts`) — fully independent from BaseballHelm at the code and schema level (`src/app/golf/README.md:136-145`).

### The buyer promise

GolfHelm's pitch to a college golf program is: **stop running your team on spreadsheets and disconnected apps.** Concretely:

1. **One system of record** for rounds, stats, roster, calendar, messaging, and qualifying — replacing the Google Sheets + GroupMe + email stack most programs actually run on today.
2. **Strokes-Gained analytics that are actually correct** — not GIR/FW%/putts-per-round, which have severe interaction effects (see §4) — computed against the same Broadie/ShotLink framework the PGA Tour and Clippd use, but contextualized to college baselines instead of Tour baselines.
3. **An AI layer that explains *why*, not just *what*** — round reviews, pattern detection, and (intended) outcome-causality theses that go beyond the dashboards every competitor already has.
4. **A qualifying and travel-selection workflow that doesn't exist anywhere else** — the single most painful, most frequent, most poorly-tooled workflow in college golf today is run on Google Sheets industry-wide (`docs/v3-research-competitive-landscape.md:393`).

### Business model — what is and isn't real today

There is **no billing, Stripe, subscription, or seat-pricing code anywhere in the repo**, and pricing is not documented in-repo. Do not treat any dollar figure as GolfHelm pricing — the only competitor pricing that is researched belongs to Clippd and DECADE (`docs/v3-research-competitive-landscape.md:30`, `:222`), not us.

The one enforced cost-control mechanism today is a **per-coach daily LLM spend cap**:

- `src/lib/coachhelm/v3/llm/budget.ts` checks `golf_coachhelm_llm_budget` (coach_id + date, `budget_usd`/`spent_usd`) before every `compose()` call.
- The cap itself is configured per-team via `golf_coachhelm_settings.llm_budget_usd_per_day`.
- On exhaustion, the fallback priority is `round_review > coach_chat > hero_narrative -> template` — i.e. round reviews (the flagship, highest-retention feature) keep LLM quality longest; hero narratives degrade to template first.

Demo/prospect accounts exist in the product, implying a sales-led (not self-serve) go-to-market motion, but no packaging tiers are encoded in code. If you need to discuss packaging, state it as **intended/aspirational** — "not yet implemented in-repo; the only enforced cost control today is the per-coach daily LLM budget."

---

## 2. Personas

### Golf Coach (single type, administrator role)
The coach is the program's operator and GolfHelm's primary buyer/admin seat. Full team management: roster, events, calendar, tasks, documents, travel, qualifying. Views all player rounds, stats, and AI-generated insights/patterns/predictions. Controls the AI layer's behavior via **coach philosophy settings** (alert sensitivity, insight-type toggles) (`src/app/golf/README.md:18-23`, `CLAUDE.md`'s Coach-Only Features table).

### Golf Player (consumer + primary data source)
Joins a team via coach-issued invite code/link. Records rounds with shot-by-shot tracking, views personal stats and AI insights, RSVPs to events, completes tasks, uploads class schedule for scheduling-conflict detection (`src/app/golf/README.md:25-30`).

**Critical framing: many players are minors.** This is a student-athlete data product handling academic and athletic PII for people who may be under 18 (high school recruits interacting with qualifying/development flows, and college freshmen entering as minors in some jurisdictions). See §6 for the compliance implications.

### Admin
Platform operators use `/golf/admin` — a 6-tab operations center (command center, users & activity, health & issues, analytics & growth, sport operations, audit & security) covering both GolfHelm and BaseballHelm (`memory/context/golfhelm-features.md:1139-1200`). This is an internal/ops persona, not a customer-facing one.

### The tenant/buyer unit
The organizational unit the product is built around is the **program/team**: `organizations` → `golf_teams` → `golf_coaches`/`golf_players`, isolated by Postgres RLS (`docs/v3-master-plan.md:80-99`). The repo does not encode whether the actual payer is the athletic department, the head coach individually, or the institution — do not assert one.

---

## 3. Core Features and Their Business Purpose

Each feature below is described with **what it does** and **why it matters to the buyer promise** — not just its implementation. Full data-flow detail lives in `memory/context/golfhelm-features.md`; this section is the "so what."

### Rounds / Shots capture (Feature #1)
**What:** A 4-step wizard (`/golf/dashboard/rounds/new`) captures course setup, hole config, shot-by-shot tracking (club, lie, distance, result, shot type, miss direction) with 15-second auto-save, then submits to `golf_rounds` + `golf_holes` + `golf_shots` (`memory/context/golfhelm-features.md:61-89`).

**Why it matters:** This is the data foundation for everything else — stats, CoachHelm insights, qualifier leaderboards, round reviews. If shot capture is unreliable or lossy, the entire analytics and AI value proposition collapses. This is also GolfHelm's answer to Clippd/Arccos's "auto-ingest from sensors" advantage: until sensor auto-ingest ships, GolfHelm's capture UX *is* the data-quality bottleneck, and it must never lose a player's round mid-save (see §5, destructive-write ban).

### Strokes-Gained analytics, cached (Feature #2)
**What:** Aggregated player/team stats (50+ metrics) are stored in `golf_player_stats_cache` and `golf_round_stats_cache`, **not recomputed on every read** — cache is marked stale on round completion and lazily refreshed on next read via `getStatsFromCache()` → `refreshStatsCache()` (`memory/context/golfhelm-features.md:137-188`).

**Why it matters:** SG is the entire numeric credibility of the product. `docs/v3-research-golf-domain.md` is explicit: "every causal assertion in v3 generators must trace back to a finding here." SG for a shot = baseline_expected_strokes(start) − baseline_expected_strokes(end) − 1, summed across OTT/APP/ARG/PUTT to SG:Total (`docs/v3-research-golf-domain.md:16-26`). SG dominates traditional stats (GIR, FW%, putts/round) specifically because those suffer interaction effects — e.g. putts-per-round is *lower* for bad iron players because they chip close and 1-putt for bogey, which makes a naive stat misleading (`docs/v3-research-golf-domain.md:28-29`). Wrong SG math doesn't just produce a wrong number — it undermines the exact axis Clippd is strongest on ("Shot Quality / Player Quality" metrics, `docs/v3-research-competitive-landscape.md:19-26`). Note also the current gap: SG columns exist in the stats cache but are documented as **not yet populated from shot data** (`memory/context/golfhelm-features.md:132,185`) — treat SG correctness as the highest-scrutiny numeric surface in the codebase regardless of what's wired today.

### CoachHelm insights / patterns (Feature #12–17)
**What:** A V2 orchestrator pipeline (`src/lib/coachhelm/v2/orchestrator.ts`) extracts features, mines patterns (conditional, compound, anomaly), runs a causal engine for root-cause discovery, predicts performance, and generates insights filtered by the coach's philosophy settings (`memory/context/golfhelm-features.md:507-536`). Output persists to `golf_coach_insights` and `golf_patterns_v2`, surfaced through Alerts (#13), Patterns Dashboard (#14), Insights Management (#15), and the Intelligence Hub (#16).

**Why it matters:** This is the "out-coach them, don't out-stat them" bet against Clippd (`docs/v3-research-competitive-landscape.md:404`). Clippd's own community describes their coaching product as "first release with more functionality coming soon," has no LLM, no outcome causality, and no goals workflow (`docs/v3-research-competitive-landscape.md:403`). The differentiated claims GolfHelm is allowed to make must trace to `docs/v3-research-golf-domain.md`'s ENGINE IMPLICATIONS section — e.g. SG:APP drives birdie conversion via proximity, penalty rate drives big-number rate, short-putt make % drives scoring variance are allowed; "mental toughness" or "clutch" labels inferred from outcome data alone are explicitly **not allowed** without further data (`docs/v3-research-golf-domain.md:346-355`).

### Qualifiers / travel selection (Feature #3)
**What:** `golf_qualifiers` / `golf_qualifier_entries` (with `golf_qualifier_selections` for travel-roster picks) manage multi-round qualifying events with live leaderboard, position/tie calculation, integrated with round submission via `golf_rounds.qualifier_id` (`memory/context/golfhelm-features.md:191-220`). `QualifierStatus` enum: `upcoming` | `in_progress` | `completed` | `cancelled`.

**Why it matters:** This is the **stated #1 differentiator with no competitor equivalent** — coaches today run 5-day qualifying → top-4-plus-coach's-pick → travel roster → tournament prep entirely in Google Sheets, and it's described as "most-painful, most-frequent, most-poorly-tooled workflow in college golf. Coaches will switch tools for this alone." (`docs/v3-research-competitive-landscape.md:393`). Selection integrity here is a trust-critical surface: a coach's roster decision has real athletic and legal consequences (playing time, scholarship-adjacent outcomes) and must never silently drop or corrupt an entry.

### Roster (`golf_team_coach_staff` + `golf_team_members`) (Feature #5)
**What:** Invite-code join flow: player requests via `golf_team_join_requests`, coach approves into `golf_team_members` (status: active/inactive/redshirt/medical/transfer). Coach-to-team relationship is a separate join table, `golf_team_coach_staff` (`memory/context/golfhelm-features.md:274-313`).

**Why it matters:** This is the tenancy backbone. **Coach↔team is via `golf_team_coach_staff`, never `golf_coaches.team_id`** (`.greptile/instructions.md:80-81`, `CLAUDE.md`). Getting this wrong doesn't just break a feature — it breaks the RLS model every other feature depends on for cross-tenant isolation (see §5).

### Calendar (Feature #4)
**What:** Full event management — RSVP, attendance, recurring events (RRULE, edit scopes this/thisAndFuture/all), availability polling, iCal feeds (RFC 5545, token auth, rate-limited), academic conflict detection against player class schedules (`memory/context/golfhelm-features.md:223-271`). 17 supporting tables.

**Why it matters:** A missed or wrongly-timed event (a qualifying round, a team flight, a practice) has real athletic and academic consequences for a student who is often also managing NCAA-mandated study time. Timezone correctness here is not cosmetic — see §5.

### Messaging (Feature #7)
**What:** Realtime team messaging with attachments, read receipts, typing indicators via Supabase Realtime (`memory/context/golfhelm-features.md:348-373`).

**Why it matters:** Table stakes for "replace GroupMe" — but also the surface most likely to carry sensitive conversations (injury status, personal issues, recruiting-adjacent talk with minors on the roster). RLS isolation matters here as much as anywhere.

### Coach-approved goals (Development Plans, Feature #25 / "My Development" #21)
**What:** Today this is implemented as `golf_player_focus_areas` — coach creates focus areas per player (8 area types: driving, iron play, short game, putting, course management, mental game, fitness, other), sets a target metric/value, tracks status (active/in_progress/completed/paused) and trend (improving/declining/stable) (`memory/context/golfhelm-features.md:1008-1050`).

**Why it matters — and what's *intended*:** The competitive research names "player-set, coach-approved, measurable goals that drive what the system surfaces" as a stated white-space feature: "Clippd's 'What To Work On' is data-derived weaknesses. DECADE has Combines. Nobody has [this]." and calls it a "strong moat if actually wired in" (`docs/v3-research-competitive-landscape.md:345,361`). The research is explicit that this only counts as differentiation if the goal actually changes what the AI layer surfaces daily — "if 'Goals workflow' doesn't drive what the system surfaces every day, it's a vanity feature" (`docs/v3-research-competitive-landscape.md:376`). Treat the current `golf_player_focus_areas` CRUD as the substrate; the goals-driving-insights wiring is intended, not yet a confirmed closed loop per the features doc's outcome-measurement gap (`memory/context/golfhelm-features.md:577`).

### Admin (Feature #28)
**What:** `/golf/admin` — 6-tab platform operations center (command center KPIs, users/activity, health/issues, analytics/growth, sport operations toggle Golf/Baseball, audit/security) reading from nearly every major table (`memory/context/golfhelm-features.md:1139-1200`).

**Why it matters:** This is Helm Sports Labs' own operational visibility, not a customer-facing feature — but it is a high-privilege surface (reads across all teams/orgs) and therefore a high-value target if RLS or route auth is ever misconfigured.

---

## 4. Golf Domain Grounding — Why SG Is the Spine

`docs/v3-research-golf-domain.md` is the canonical source every causal claim in the CoachHelm engine must trace back to. Key facts a reviewer should know cold:

- **Origin:** Strokes Gained was developed by Mark Broadie (Columbia Business School), validated against PGA Tour ShotLink data; PGA Tour adopted SG:Putting in 2011, full breakdown by 2014 (`docs/v3-research-golf-domain.md:11`).
- **Formula:** SG for a shot = baseline_expected_strokes(start) − baseline_expected_strokes(end) − 1. Four categories (OTT, APP, ARG, PUTT) sum to SG:Total (`docs/v3-research-golf-domain.md:16-26`).
- **Why it beats traditional stats:** interaction effects make GIR/FW%/putts-per-round misleading in isolation; SG isolates per-shot quality controlling for situation (`docs/v3-research-golf-domain.md:28-29`).
- **Tour variance finding:** long game explains ~65% of scoring difference between top and average pros; short game + putting ~35%; putting alone ~15% — this overturned "drive for show, putt for dough" (`docs/v3-research-golf-domain.md:32`).
- **College differs from Tour:** at the college level (~+2 to +4 handicap), SG:APP and short-putt make % carry disproportionate weight because driving accuracy converges among elite amateurs (`docs/v3-research-golf-domain.md:34-35`). **Baselines must be college-contextualized (~73 scoring avg, ~62% FW, ~62% GIR, 30 putts), not Tour baselines**, when comparing players (`docs/v3-research-golf-domain.md:349`).
- **Causal claims that are allowed vs. not allowed** (engine constraint, `docs/v3-research-golf-domain.md:351-352`):
  - Allowed: SG:APP drives birdie conversion via proximity; penalty rate drives big-number rate; lag-putt distance drives 3-putt rate; short-putt make % drives scoring variance.
  - Not allowed without further data: "mental toughness" scores, "clutch" labels, swing-mechanics inferences from outcome data alone.

Any PR touching `src/lib/coachhelm/v2/insights/` or `v2/composite/` scoring functions, or anything that renders an SG number or a causal sentence to a coach/player, should be checked against this file.

---

## 5. The Golf "Never Break" List

These are the invariants that, if violated, directly damage either (a) trust in the numbers GolfHelm sells against Clippd, or (b) a student-athlete's data — the two things this business cannot recover from a public failure of.

1. **SG math correctness.** SG for a shot must equal baseline_expected_strokes(start) − baseline_expected_strokes(end) − 1, using college-contextualized baselines for player-facing comparisons, not Tour baselines, unless explicitly showing the "PGA Tour" bar in a standing-bars comparison. Any PR that changes SG calculation, baseline tables, or category attribution (OTT/APP/ARG/PUTT) needs domain-doc-level scrutiny against `docs/v3-research-golf-domain.md`.

2. **Qualifier-selection integrity.** A coach's qualifier entry, leaderboard position, or travel-roster selection must never be silently dropped, duplicated, or reordered. This workflow is the stated #1 no-competitor-has-it differentiator (`docs/v3-research-competitive-landscape.md:393`) — a bug here isn't just a UX bug, it's the exact workflow coaches were promised would replace their spreadsheet.

3. **Roster / data isolation.** Coach↔team relationship is `golf_team_coach_staff`, never `golf_coaches.team_id` (`.greptile/instructions.md:80-81`). All tenancy isolation flows through Postgres RLS, not app-layer filtering (`docs/v3-master-plan.md:80-99`). Canonical RLS helper functions — `current_player_id()`, `is_team_coach(team_uuid)`, `is_team_player(team_uuid)` — are `SECURITY DEFINER` with `SET search_path = ''` specifically to block search-path attacks (`docs/v3-rls-template.md:11-57`). A cross-tenant data leak (missing or misconfigured RLS) is the worst-case, business-ending failure mode for a student-athlete data product, and there is a **documented prior RLS incident** (`docs/audits/COACH_DASHBOARD_AUDIT_REPORT.md`) — this is not a hypothetical risk.

4. **Round-save: no destructive writes.** DELETE-then-INSERT in any save/submit/sync path is forbidden — use upsert/`ON CONFLICT` or stage-and-swap (`.greptile/instructions.md` hard rule 7). This is a documented prior incident: a transient failure between the two statements permanently lost user data. Highest-risk surfaces named explicitly: **roster, qualifier selections, round-save.** A player's shot-by-shot round data represents real, non-reconstructable effort (a live round of golf); losing it mid-save is not a recoverable bug, it's a broken promise.

5. **Calendar timezone correctness.** Event times, RSVP deadlines, and iCal feed output must resolve correctly across timezones — a qualifying round, team flight, or academic-conflict check that's off by an hour has real athletic and NCAA-compliance consequences for a minor or student-athlete managing mandated study time.

6. **Cached-stats freshness / invalidation.** `golf_player_stats_cache` and `golf_round_stats_cache` are lazy-refresh, not recompute-on-write — round completion marks the cache stale (via Redis invalidation) and the next read triggers `refreshStatsCache()` (`memory/context/golfhelm-features.md:144-148,187`). A stat shown to a coach or player must never silently serve pre-round-completion data as if it reflects the latest round; invalidation must actually fire on every path that changes underlying round/shot data (including edits, deletes, and qualifier-triggered recalculation), not just the primary submit path.

---

## 6. Compliance Surface — Stakes, Not Verdicts

GolfHelm's product surface handles **minors' academic and athletic PII** (many student-athletes and recruits are under 18), which puts it on FERPA / COPPA-adjacent ground. This section frames the *stakes* the invariants above exist to protect against — it does not assert the product currently violates any law.

- **Roster, development plans, messaging, and qualifying data** together constitute a rich academic + athletic profile per player. The RLS/tenancy invariant in §5.3 is the primary control here.
- **CRM / coach-outreach code paths** (where they exist) touch TCPA/DNC-adjacent concerns for anyone doing recruiting-style outreach.
- **Account deletion exists** (`src/app/api/account/delete/route.ts`), but cascade cleanup across the 74-table golf schema is documented as incomplete — treat any PR touching deletion as needing to verify it actually removes (or properly anonymizes) data in every table that references the deleted player/coach, not just the primary record.
- **No cookie/consent banner** is present in-repo today.
- The **worst-case failure mode for this business is a cross-tenant data leak** exposing one team's minors' data to another team, a competitor, or the public — see the documented prior RLS incident in `docs/audits/COACH_DASHBOARD_AUDIT_REPORT.md`. Every RLS-touching PR should be reviewed with that incident in mind, not as a hypothetical.

---

## 7. Competitive Angle vs. Clippd

See `06-competitor-positioning.md` for the dedicated competitor-positioning reference across Helm Sports Labs products; this section summarizes and applies that positioning to the golf context specifically.

Clippd is the **primary threat**, not a peer: it is the NCAA's official scoring/rankings vendor since October 2023 ("Scoreboard powered by Clippd"), used by 200+ D1 programs, with proprietary Shot Quality / Player Quality metrics (`docs/v3-research-competitive-landscape.md:13-26`). "Clippd is no longer just an analytics vendor — they are infrastructure. Any competitor that wants college coaches has to play around (or under) Clippd." (`docs/v3-research-competitive-landscape.md:15`)

**Where Clippd is strong (do not try to out-stat this):**
- Best-in-class metrics (Shot Quality / Player Quality), auto-ingest from Arccos/Garmin/TrackMan/Full Swing KIT, official tournament scoring/rankings, 200+ programs of distribution advantage (`docs/v3-research-competitive-landscape.md:19-42`).

**Where Clippd is admittedly weak — this is GolfHelm's lane:**
- **No native AI chat / no LLM round narrative.** Clippd's "AI" branding is the CASE algorithm + a practice-priority recommender, not conversational (`docs/v3-research-competitive-landscape.md:49`). GolfHelm's `composeRoundReview` / `composeHeroNarrative` / `composeCoachChat` LLM features are the direct answer to this gap.
- **"What To Work On" is data-driven but not coach-curated or goals-aware** — it surfaces weaknesses but doesn't tie them to a player-set objective or season arc (`docs/v3-research-competitive-landscape.md:54`). GolfHelm's coach-approved-goals workflow (§3, Development Plans) targets this directly.
- **Scoreboard Standard lacks Smart Scheduler** — coaches asked for tee-sheet/qualifying-and-travel tooling; Clippd said "coming in phase 2" (`docs/v3-research-competitive-landscape.md:48`). GolfHelm's qualifier/travel-selection workspace (§3) is a live answer to a gap Clippd has publicly acknowledged and not shipped.
- **Their own coaching product is "first release with more functionality coming soon"** — no LLM, no outcome causality, no goals workflow, and SG interpretation is described by Golf Monthly as "hard to follow" (`docs/v3-research-competitive-landscape.md:403`).

**The stated strategy:** *"Don't try to out-stat Clippd; out-coach them. Their stats are excellent. Their coaching layer is shallow. Win at the layer above."* (`docs/v3-research-competitive-landscape.md:404`) Concretely this means: match Clippd's raw shot-level analytics quality (or GolfHelm loses the elite tier that already pays for Clippd and won't downgrade — `docs/v3-research-competitive-landscape.md:378`), and differentiate on (1) conversational LLM round review, (2) the qualifying/travel-selection workspace, (3) goals-that-actually-drive-the-dashboard, and (4) standing bars that render PGA Tour + team average + you in one chart — "psychologically devastating in the right way for elite-aspiring players" and something "Clippd will add in a sprint" once they see it, so it needs to be the *frame*, not a widget (`docs/v3-research-competitive-landscape.md:352,377`).

Secondary competitors, for context: **DECADE** (methodology-first peer, $1,499/team/year vs. Clippd's $2,440 — pricing is competitor-sourced, not ours; strong on course-management vocabulary that college coaches already teach, weak on app layer — `docs/v3-research-competitive-landscape.md:209-231`); **Arccos** (recreational sensor hardware, ~90% shot-detection accuracy, no coaching layer — `docs/v3-research-competitive-landscape.md:128-150`); **Whoop** (sets the team-status coach-UX bar with its "one tile per athlete + Monday email" pattern, but is not a golf competitor — `docs/v3-research-competitive-landscape.md:283-298,386`).

---

## 8. Intended Differentiation Not Yet Built

The competitive-landscape research names several concrete features as white space GolfHelm should own, with wave numbers assigned in the v3 plan (`docs/v3-master-plan.md`). These are **intended**, not current-state — do not describe them as shipped:

| Feature | What it is | Wave | Why it matters competitively |
|---|---|---|---|
| Qualifying & Travel Workspace | Ingest scores from any source, render leaderboard, store coach's-pick reasoning, generate a tournament-prep packet with each selected player's last-30-days data + LLM per-player focus notes | W29 | "Nobody has it. Coaches will switch tools for this alone." (`docs/v3-research-competitive-landscape.md:393`) |
| Outcome Causality ("The Why Engine") | Any metric on any chart is clickable → LLM generates an evidence-backed thesis for *why* it changed; player/coach can mark the thesis right/wrong as a feedback loop | W35-W36 | "Single most defensible feature on this list because it requires shot-level data AND season-context AND LLM AND feedback loop." (`docs/v3-research-competitive-landscape.md:344`) |
| Player Genome | One-page season-start identity artifact synthesizing scoring distribution, course-type fit, weakest hole-type, best practice ROI | W33-W34 | "The one thing Clippd cannot ship without rebuilding their data model." (`docs/v3-research-competitive-landscape.md:397`) |
| Weekly Coach Email | One tile per athlete + Monday digest, color-coded readiness/form, "who to talk to" — adapted from Whoop's most-loved coach UX pattern | W37 | Steal-from-adjacent-category pattern, not a golf-native idea today (`docs/v3-research-competitive-landscape.md:386`) |
| Practice Rx | LLM-generated 7-day practice plan from a player's recent SG profile + season schedule + identified weaknesses, tied to the Goals workflow | W38 | Answers DECADE's $199 rules-engine add-on with an LLM generator instead (`docs/v3-research-competitive-landscape.md:385`) |
| Sensor Auto-Ingest (Arccos / Garmin / TrackMan / Full Swing KIT) | Pull shot data directly from hardware players already own instead of manual entry | W39-W41 | "Non-negotiable... manual data entry is #1 Clippd complaint and has to be solved at launch." (`docs/v3-research-competitive-landscape.md:379,386`) |
| Standing bars: PGA + team + you | Render PGA Tour average, team average, and the individual player in one chart, as the default frame for every metric — not a single widget | Not wave-assigned in sources reviewed | "Cheap to build, surprisingly differentiating... Clippd will add it in a sprint once they see it." (`docs/v3-research-competitive-landscape.md:352,377`) |

None of these should be described as "in the codebase" without checking current status against `memory/context/golfhelm-features.md`'s Known Gaps sections and `docs/v3-wave-sequence.md` for actual wave completion — this table reflects the *intent* documented in the competitive-landscape research, not a build-status audit.

---

## For the reviewer

- **Flag any change to SG calculation, baseline tables, or SG category attribution** (OTT/APP/ARG/PUTT) that isn't traceable to `docs/v3-research-golf-domain.md`. Wrong SG math is the single most business-damaging correctness bug GolfHelm can ship.
- **Flag any query or migration that reads/writes `golf_coaches.team_id`** for tenancy purposes instead of `golf_team_coach_staff` — this is a hard rule, not a style preference.
- **Flag any DELETE-then-INSERT pattern in a save/submit/sync path**, especially in round-save, roster, or qualifier-selection code — there is a documented prior data-loss incident from exactly this pattern.
- **Flag any new or modified RLS policy, or any query that bypasses RLS via `SUPABASE_SERVICE_ROLE_KEY`** outside `src/lib/supabase/admin*` or `src/app/api/**/admin/**` — cross-tenant leaks of minors' data are the worst-case failure mode for this business, and there is a documented prior incident (`docs/audits/COACH_DASHBOARD_AUDIT_REPORT.md`).
- **Flag any LLM feature (`composeRoundReview`, `composeHeroNarrative`, `composeCoachChat`) that skips citation verification, skips the regenerate-once-before-template-fallback step, hardcodes $/token math, or is invoked client-side** — the LLM budget cap in `src/lib/coachhelm/v3/llm/budget.ts` and `golf_coachhelm_settings.llm_budget_usd_per_day` is the only enforced cost control this business has today.
- **Flag account-deletion or data-retention PRs that don't verify full cascade cleanup** across the 74-table golf schema, given minors' PII is at stake and prior cascade-cleanup gaps are documented.
- **Flag calendar/scheduling code that assumes a single timezone** or doesn't account for iCal/RRULE edge cases — event-time errors have real athletic and academic-compliance consequences for student-athletes.
