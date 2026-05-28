# CoachHelm — Complete State, Plan, and Build Reference

> **Snapshot date:** 2026-05-26
> **Branch baseline:** `main @ b29dda6d` (post-merge of PR #93)
> **Production:** `https://helmv3-g2beyrc1b-nick-rinis-projects.vercel.app` (Ready)
> **Audience:** Engineering reviewers, founders, ops, external AI security review (Codex)
> **Purpose:** Single comprehensive reference — the goal, the plan, the build, the operational state, the known issues, and the security posture going into external review.

> ⚠️ **READ FIRST IF YOU ARE A SECURITY REVIEWER:** §19 has the full security trail. May 17 audit P0s (2 RLS Criticals + leaked DB password) are **confirmed closed** by Codex 2026-05-26. May 26 Codex audit (8 P1/P2 findings: RLS gaps, broken inserts, LLM budget bypass, destructive autosave, schema-typo joins) was **fully remediated this session** — see §19 table. **One unverified P0 remains: Vercel production `CRON_SECRET` + `COACHHELM_INTERNAL_SECRET` env values must be confirmed non-empty in the dashboard** (`vercel env ls production`).

---

## Table of Contents

1. [Quick Reference & Canonical Sources](#1-quick-reference--canonical-sources)
2. [The Goal — Product Thesis](#2-the-goal--product-thesis)
3. [Domain Foundations](#3-domain-foundations)
4. [Architecture Overview (V1 / V2 / V3 Coexistence)](#4-architecture-overview-v1--v2--v3-coexistence)
5. [Current Wave Delivery Status](#5-current-wave-delivery-status)
6. [Database — Tables Worth Knowing](#6-database--tables-worth-knowing)
7. [Routes — Full IA (Coach Desktop / Player Phone)](#7-routes--full-ia-coach-desktop--player-phone)
8. [Server Actions — All 41 Files](#8-server-actions--all-41-files)
9. [CoachHelm Engine — V3 Spec](#9-coachhelm-engine--v3-spec)
10. [The New UI in Detail](#10-the-new-ui-in-detail)
11. [Cron Jobs (Post-PR #93)](#11-cron-jobs-post-pr-93)
12. [Hooks](#12-hooks)
13. [Stores & Context](#13-stores--context)
14. [Environment Variables](#14-environment-variables)
15. [The Master Plan — Condensed](#15-the-master-plan--condensed)
16. [How It Was Built (Methodology)](#16-how-it-was-built-methodology)
17. [Today's Operational Work (2026-05-26)](#17-todays-operational-work-2026-05-26)
18. [Security Posture for Codex Handoff](#18-security-posture-for-codex-handoff)
19. [Security Status — May 17 Audit + May 26 Codex Audit](#19-security-status--may-17-audit--may-26-codex-audit)
20. [P1 / P2 / P3 Audit Backlog](#20-p1--p2--p3-audit-backlog)
21. [Known Footguns](#21-known-footguns)
22. [Confirmed-Fine (Don't Re-Audit)](#22-confirmed-fine-dont-re-audit)
23. [Open Questions & Risks](#23-open-questions--risks)

---

## 1. Quick Reference & Canonical Sources

| What you need | File |
|---|---|
| Master plan (canonical, 1655 lines) | `docs/v3-master-plan.md` |
| Golf domain research (SG, baselines, causal chains, lie taxonomy) | `docs/v3-research-golf-domain.md` |
| Competitive landscape (Clippd / DECADE / Arccos / Whoop / 9 others) | `docs/v3-research-competitive-landscape.md` |
| Engine architecture (V1 / V2 / V3 files) | `memory/context/coachhelm-ai.md` |
| Every column of every golf table (~75 tables) | `memory/context/golfhelm-database.md` |
| Every route + action file location | `memory/projects/golfhelm.md` |
| All 28 features (data flows, files, tables, deps, gaps) | `memory/context/golfhelm-features.md` |
| 75-table glossary + enums + type locations | `memory/glossary.md` |
| Compatibility shim registry (kill dates) | `docs/v3-compatibility-shims.md` |
| 2026-05-17 audit final report (P0/P1/P2/P3 with file:line) | `.full-review-2026-05-17-golfhelm-audit/05-final-report.md` |
| 2026-05-17 business logic report (982 lines, what was audited) | `docs/GOLFHELM_BUSINESS_LOGIC_REPORT_2026-05-17.md` |
| Active P0–P3 audit follow-up plans | `docs/superpowers/plans/2026-05-17-*` |
| Today's deploy runbook | `docs/operations/2026-05-17-DEPLOY-RUNBOOK.md` |
| Auto-saved project memory (cross-conversation notes) | `~/.claude/projects/-Users-ricknini/memory/` |

**Key memory entries relevant to CoachHelm:**

- `project_golfhelm_v3_plan.md` — Plan locked 2026-05-24, foundation-first sequencing
- `reference_coachhelm_v3_key_tables.md` — coach↔team via `golf_team_coach_staff` (not `golf_coaches.team_id`); SG already in `golf_player_stats_cache`
- `reference_coachhelm_v3_research.md` — domain + competitive doc locations
- `project_coachhelm_v3_llm_prereqs.md` — Round-review LLM needs `AI_GATEWAY_API_KEY` + non-zero `golf_coachhelm_settings.llm_budget_usd_per_day`
- `project_coachhelm_v3_ingest_prereqs.md` — Arccos/Garmin/TrackMan adapters are stubs
- `feedback_golf_no_destructive_writes.md` — No delete-then-insert in save/submit/sync paths
- `project_golfhelm_ci_state_2026_05_21.md` — Post-036 migrations need `DO $$` rename blocks; framer-motion mocks must include `useReducedMotion`
- `project_vercel_supabase_pause_lockout.md` — Today's lesson: "Resource provisioning failed" = check Supabase pause

---

## 2. The Goal — Product Thesis

### What CoachHelm is

CoachHelm is the **AI intelligence layer of GolfHelm**, the college-golf team management product inside Helm Sports Labs. It turns shot-level round data into coach-actionable insights, patterns, predictions, goals, and conversational round reviews.

### What v3 turns it into

V3 takes CoachHelm from a generic round-analytics tool to a **golf-aware, Strokes-Gained-spined, LLM-augmented analytics product for D1/D2/D3 college coaches**. Specifically:

- **Every quantitative claim** is grounded in **PGA + team + you Standing Bars** — no numbers floating without context
- **Unified Goals primitive** replaces focus areas, arcs, and drill compliance — one concept the coach and player both work in
- **Claude writes prose at exactly 3 surfaces** — round-review summary, player-dashboard hero narrative, coach chat. Everything else is deterministic
- **Coach intent** (bubble / maintain / develop / breakout / rehab) modulates engine thresholds invisibly to the player
- **Composite insights** link 2+ findings via 12 hand-coded causal rules — the thing competitors don't have
- **Counterfactuals** ("75.2 → 73.4 if you close this gap") appear as a disciplined secondary line, never the headline
- **Auto-ingest** from Arccos / Garmin / TrackMan so the coach doesn't depend on players to enter shots manually
- **Per-audience UX**: coach = desktop-first (morning brief, chat, qualifying workspace); player = phone-first (hero insight, goals, genome)

### Competitive frame (why each wedge matters)

| Competitor | Position | What they own | What they don't have |
|---|---|---|---|
| **Clippd** | College leader | 200+ programs, official NCAA scoring since 2024 | Outcome causality, conversational LLM round review, qualifying workspace, composite cross-stat insights |
| **DECADE** | Strategic peer | $1,499/team strategic methodology | Same gaps as Clippd; less data infra |
| **Arccos** | Recreational leader | Sensor + shot tracking ubiquity | College team workflow; coach surface |
| **Whoop** | UX benchmark | Best-in-class coach team-status surface | Sport-specific intelligence |
| **CoachNow** | Video/comms | Video coaching workflow | Analytics depth |
| **9 others** | — | — | — |

**CoachHelm v3 wedges:** (1) outcome causality feeding `golf_insight_effectiveness`; (2) qualifying & travel workspace replacing Google Sheets; (3) conversational coach chat with goal-creation; (4) composite cross-stat insights; (5) Standing Bars on every quantitative surface.

### Audience model

| User | Primary device | Default landing | Main surfaces |
|---|---|---|---|
| Coach | Desktop | `/dashboard/intelligence` (Morning Brief) | Insights inbox, Patterns, Qualifying workspace, Genome compare, Chat, Roster (with intent pill), Outcome causality |
| Player | Phone | `/dashboard/coachhelm` | Hero insight (LLM), Active + Suggested Goals, Recent rounds + standing trend, Genome, Round review |

**Decision:** Both audiences ship in lockstep — every feature has both surfaces, never coach-first-then-player or vice versa.

---

## 3. Domain Foundations

All numerical claims and causal arrows trace back to **`docs/v3-research-golf-domain.md`** — every v3 generator's causal claims must cite this document. Highlights:

### Strokes Gained framework

- Mark Broadie's framework, validated against PGA Tour ShotLink
- **Already cached** in `golf_player_stats_cache` columns: `strokes_gained_total`, `_tee`, `_approach`, `_around_green`, `_putting`
- **Rule:** read, don't recompute. V3 generators consume these directly.

### Baselines

- **2024 PGA Tour baselines** (the comparison source for "PGA" in Standing Bars)
- **D1/D2/D3 scoring averages** (cohort comparison)
- Putt make-% curves by handicap level: Tour 99.4% at 3ft → 5.5% at 25ft

### Causal chains (referenced by composite-insight rules)

- **Penalty = 70% of double bogeys** — main driver of blow-up holes
- **GIR ↔ scrambling inverse** — when GIR drops, scrambling matters more
- **Proximity → make-%** — closer approaches mean higher conversion
- **Lag distance → 3-putt rate** — longer first putts increase 3-putts
- **Pressure-gap research** (Hickman/Metz; Pope/Schweitzer) — tournament vs. practice delta
- **Coachable timeframes** — 21+ days for stat changes to be statistically meaningful

### 13-lie taxonomy

Lie classifications used by `golf_shots.lie_before`/`lie_after`:
`tee, fairway, first_cut, primary_rough, deep_rough, bunker_fairway, bunker_greenside, sand, recovery, water, hazard, green, fringe`

Generators use lie-specific baselines (PGA SG differs by lie).

### Course-type SG premiums

Different course types (links, parkland, desert, tropical) have different baseline SG distributions — applied as a multiplier in lie-specific analysis.

### Noise floors

- **Counterfactual suppression** below 0.3 strokes (insight noise)
- **Standing cold-start** requires ≥5 players with ≥5 rounds before team marker appears

---

## 4. Architecture Overview (V1 / V2 / V3 Coexistence)

Three engine versions coexist intentionally during the v3 cutover. The V2 → V3 hard cutover is **W25**, with V2 code (reasoning/, nlg/, 9 generator files) deleted in **W26**. Until then, expect duplication.

### Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 App Router |
| Language | TypeScript strict |
| Backend | Supabase (PostgreSQL + RLS + Auth + Storage + Realtime) |
| Hosting | Vercel (Fluid Compute, Node.js 24 LTS default) |
| Styling | Tailwind CSS + Framer Motion + glassmorphism (`surface-matte` canonical post-PR #89) |
| State | Zustand (`golf-auth-store.ts`), React context (`golf-user-context`) |
| LLM | Vercel AI Gateway → Claude Haiku (W30) |
| Email | React Email (weekly coach digest, W37) |
| Notifications | Web Push + in-app + email (W42) |
| Error tracking | Sentry |
| Analytics | Vercel Analytics + Datadog |

### Engine versions (file map)

**V1 (legacy, still active on some surfaces)** — `src/lib/coachhelm/`:
- `insight-engine.ts` — core insight generation (deprecated)
- `round-review-generator.ts` — round reviews (deprecated)
- `summary-generator.ts` — summary text
- `pattern-detector.ts` — pattern detection
- `highlight-detector.ts` — highlight moments
- `area-detector.ts` — problem areas
- `strokes-gained.ts` — SG calculations
- `insights/putting.ts` — putting analysis

**V2 (current intelligence engine)** — `src/lib/coachhelm/v2/`:
- `orchestrator.ts` — main pipeline (1509 lines)
- `gate.ts` — feature flags (global, per-user, per-team)
- `types.ts` — comprehensive type definitions
- `mining/` — `pattern-miner`, `shot-pattern-miner`, `causal-engine`, `correlation-engine`, `correlation-discovery`, `pressure-analysis`, `resilience-analysis`, `lie-specific-analysis`, `stats-insight-generator`, `team-pattern-generator`
- `prediction/` — `performance-predictor`, `trajectory-forecaster`, `team-forecaster`
- `features/` — `temporal`, `sequence`, `contextual`
- `learning/` — `behavior-learner`, `cross-learner`, `outcome-validator`
- `reasoning/` — `reasoning-engine`, `confidence-calibrator` (deleted in W26)
- `nlg/` — `insight-composer` (deleted in W26)
- `services/insight-persistence.ts`, `pattern-storage.ts`

**V3 (the plan's product)** — all new code lives under `v3/` namespaces:
- `src/lib/coachhelm/v3/` — generators, composite engine, LLM service, chat agent, genome, attribution
- `src/components/golf/coachhelm/v3/` — UI surfaces matching the plan
- `src/app/api/cron/v3/` — v3-specific crons (standing-refresh, genome-nightly, causality-attribute, ingest-sync, weekly-coach-email)

### Namespace isolation rule

Per Master Plan Rule 1: V2 files are **never edited** outside the explicit W25 cutover + W26 sunset waves. This is why v2 and v3 can coexist without merge conflicts during the long build window.

---

## 5. Current Wave Delivery Status

The full plan is 34 numbered waves (W9 → W42). Based on the commit log on `main`:

| Wave window | Scope | Status | Evidence |
|---|---|---|---|
| **W9** | Pre-Foundation Hardening: docs + decisions + RLS helpers + `golf_metrics` table + seed + provider clients + extends `golf_coachhelm_settings` | ✅ Shipped | Pre-2026-05-17 |
| **W10** | PGA standards table + seed (`golf_pga_standards` w/ FK to `golf_metrics`) | ✅ Shipped | Pre-2026-05-17 |
| **W11** | Player standing table + nightly cron + `refresh_player_standing(uuid[])` RPC | ✅ Shipped | Pre-2026-05-17 |
| **W12** | Standing backfill (one-shot, chunked) | ✅ Shipped | Pre-2026-05-17 |
| **W13** | StandingBar component (3 variants, mobile + desktop, all states) | ✅ Shipped | Pre-2026-05-17 |
| **W14** | Wire standing into V2 generators (additive `evidence.standing`) | ✅ Shipped | Pre-2026-05-17 |
| **W15** | StandingBar adoption — coach insights surface | ✅ Shipped | Pre-2026-05-17 |
| **W16** | StandingBar adoption — player insights surface + `/my-standing` | ✅ Shipped | Pre-2026-05-17 |
| **W17** | Counterfactual + secondary-line UI | ✅ Shipped | Pre-2026-05-17 |
| **W18** | Goals schema + RLS (`golf_goals`) | ✅ Shipped | Pre-2026-05-17 |
| **W19** | Goals service + creation flow + suggestions table | ✅ Shipped | Pre-2026-05-17 |
| **W20** | Focus areas → goals migration | ✅ Shipped | Pre-2026-05-17 |
| **W21** | V3 generator base + `engine_version` column + first generator (putt-distance) | ✅ Shipped | Pre-2026-05-17 |
| **W22** | V3 generators: putt-bias + scrambling + approach-miss | ✅ Shipped | Pre-2026-05-17 |
| **W23** | V3 generators: tee-strategy + par-type + course-mgmt | ✅ Shipped | PR #92 (TeeStrategyGenerator + per-team tokens) |
| **W24** | V3 generators: pressure-gap + warmup-hole | ✅ Shipped | Pre-2026-05-17 |
| **W25** | V2 → v3 generator CUTOVER (orchestrator switches; delete 9 V2 generator files) | ✅ Shipped | Pre-2026-05-17 |
| **W26** | V2 sunset (code only — `v2/reasoning/*`, `v2/nlg/*`) | ✅ Shipped | Pre-2026-05-17 |
| **W27** | Coach intent + roster pill + drawer (`golf_coach_player_intent`) | ✅ Shipped | Pre-2026-05-17 |
| **W28** | Composite insights v1 (12 rules + synthesis) | ✅ Shipped | Pre-2026-05-17 |
| **W29** | Qualifying & travel workspace (extends `golf_qualifiers`; new `dashboard/coachhelm/qualifying/[id]` v3 route) | ✅ Shipped | Pre-2026-05-17 |
| **W30** | LLM service wrapper (Haiku) + round-review composer + budget tables | ✅ Shipped | Pre-2026-05-17 |
| **W30.5** | W28-followup: remaining 7 composite rules + hole-sequence loader + lie-type shot-source | ✅ Shipped | Pre-2026-05-17 |
| **W31** | LLM hero narrative on player dashboard | ✅ Shipped | Pre-2026-05-17 |
| **W32** | Coach chat backend + UI + 12 tool routes + conversation schema | ✅ Shipped | Pre-2026-05-17 |
| **W33** | Player genome schema + nightly compute (chunked) — 80 dim files | ✅ Shipped | Pre-2026-05-17 |
| **W34** | Player genome UI (player + coach + compare) | ✅ Shipped | Pre-2026-05-17 |
| **W35** | Outcome causality schema + attribution cron (feeds existing `golf_insight_effectiveness`) | ✅ Shipped | Pre-2026-05-17 |
| **W36** | Outcome causality wired into insight ranking | ✅ Shipped | Pre-2026-05-17 |
| **W37** | Weekly coach email + cron + React Email template | ✅ Shipped | Pre-2026-05-17 |
| **W38** | Practice Rx + `impacts_metric_id` on drills | ✅ Shipped | PR #81 |
| **W39** | Auto-ingest: Arccos (OAuth + adapter + sync + UI) | ⚠️ Stub — needs partnership | PR #82 |
| **W40** | Auto-ingest: Garmin (same shape) | ⚠️ Stub — needs partnership | PR #82 |
| **W41** | Auto-ingest: TrackMan + `golf_practice_sessions` | ⚠️ Stub — needs partnership | PR #82 |
| **W42** | Notifications preferences + per-category routing | ✅ Shipped | PR #83 |
| **Post-W42 polish** | End-of-run audit (#84), v3 premium UI polish — Doctrine I-III canonical refactor (#86), Lenis scoped to v3-pure routes (#87), ad-hoc cream-glass → canonical surface-matte cards (#89), HoleShotPath + Sentry fixes (#90), ESLint unblock for prod (#91) | ✅ Shipped | PRs #84–#91 |
| **Today** | Cron load reduction (14 → 11) for offseason cadence | ✅ Shipped | PR #93 |

**Headline:** All 34 numbered waves are complete in code. Three (W39–W41) ship as functional stubs awaiting partnership + env vars. The product is past the plan and into operational tuning.

---

## 6. Database — Tables Worth Knowing

~75 `golf_*` tables in production (Helm-Production: `qmnssrrolpinvwjjnufo`). Full column-level reference: `memory/context/golfhelm-database.md`. Categorized below.

### CoachHelm engine tables

| Table | Purpose | Wave |
|---|---|---|
| `golf_coachhelm_settings` | Per-coach CoachHelm enable/disable + LLM budget (`llm_budget_usd_per_day`) + flag fields | W9 extends |
| `golf_team_coachhelm_settings` | Team-level kill switch | Existing |
| `golf_coach_philosophy` | 33 columns: 5 priorities + thresholds + weights + 11 alert toggles + display prefs | Existing |
| `golf_coach_insights` | Coach-facing AI insights + alerts (signature, evidence jsonb, lifecycle_state, outcome_status, outcome_metric_*, category, `engine_version` added in W21) | Existing + W21 |
| `golf_patterns_v2` | Detected patterns (detected → confirmed → addressed → resolved / dismissed) | Existing — keep |
| `golf_predictions` | Performance predictions (score, SG, with confidence) | Existing — keep |
| `golf_prediction_validations` | Outcome validation — feeds W35 attribution | Existing |
| `golf_prediction_model_performance` | Model performance tracking | Existing |
| `golf_learned_behavior` | Learned player behaviors | Existing |
| `golf_insight_effectiveness` | Effectiveness metrics — **W35 outcome causality feeds this** | Existing |
| `golf_insight_generation_log` | Per-run log | Existing |
| `golf_insight_player_feedback` | Player feedback on insights | Existing |
| `golf_insight_feedback` | Coach feedback on insights | Existing |
| `golf_insight_weights` | Insight scoring weights | Existing |
| `golf_round_reviews` | AI-generated round reviews | Existing |
| `golf_review_events`, `golf_review_insights` | Review system tracking | Existing |
| `golf_player_focus_areas` | **Migrated to `golf_goals` in W20** | Existing → deprecated |
| `golf_player_insight_preferences` | Player notification/display prefs | Existing |

### V3 new tables

| Table | Purpose | Wave |
|---|---|---|
| `golf_metrics` | Metric registry (FK target for standards/standing/drills) | W9 |
| `golf_pga_standards` | Hand-curated PGA baselines per metric | W10 |
| `golf_player_standing` | Player standing on each metric vs PGA + team | W11 |
| `golf_goals` | Unified goals primitive (replaces focus areas) | W18 |
| `golf_goal_suggestions` | Engine-generated goal suggestions | W19 |
| `golf_coach_player_intent` | Coach intent per player (bubble/maintain/develop/breakout/rehab) | W27 |
| `golf_player_genome` | 80-dimension player genome (nightly compute) | W33 |
| `golf_insight_outcome_attribution` | Insight → measured outcome attribution | W35 |
| `golf_coachhelm_coach_weights` | Per-coach weights from outcome causality | W35 |
| `golf_coachhelm_chat_conversations` | Coach chat conversation records | W32 |
| `golf_coachhelm_chat_messages` | Chat message records | W32 |
| `golf_coachhelm_llm_calls` | LLM call log (provider, tokens, latency, cost) | W30 |
| `golf_coachhelm_llm_budget` | Per-period budget tracking | W30 |
| `golf_coachhelm_weekly_emails` | Weekly digest delivery records | W37 |
| `golf_qualifier_selections` | Lineup selection on qualifying workspace | W29 |
| `golf_ingest_connections` | Per-provider ingest auth records | W39 |
| `golf_ingest_sync_log` | Per-sync log | W39 |
| `golf_practice_sessions` | TrackMan practice path | W41 |

### Player/Round/Shot tables (foundation)

| Table | Purpose |
|---|---|
| `golf_players` | `id`, `user_id` (uuid NOT NULL) — RLS helper foundation |
| `golf_coaches` | `id`, `user_id`, `organization_id` — **NO `team_id`; use `golf_team_coach_staff`** |
| `golf_team_coach_staff` | `team_id`, `coach_id`, `role`, `is_primary` — **coach↔team link** |
| `golf_team_members` | `team_id`, `player_id`, `status` — player↔team link |
| `golf_teams` | `id`, `name`, `season`, `timezone`, `organization_id` — cohort + recap scheduling |
| `golf_rounds` | `round_type` (practice/qualifier/tournament), `status` |
| `golf_holes` | Per-hole data (par, yardage, score, putts, fairway, GIR) |
| `golf_shots` | Shot-level: `lie_before`, `lie_after`, `shot_type`, `club_type`, `miss_direction`, `is_penalty`, `putt_made`, `putt_distance_feet`, `putt_break` |
| `golf_player_stats_cache` | **SG already cached** — `strokes_gained_total/_tee/_approach/_around_green/_putting` + 30+ stats |
| `golf_round_stats_cache` | Per-round aggregates |
| `golf_drills` | `slug`, `title`, `category`, `tags[]`, `duration_min`, `difficulty`, `video_url` + `impacts_metric_id` (W38) |
| `golf_insight_drill_attachments` | Insight ↔ drill join — Practice Rx reuses |
| `golf_qualifiers` | `name`, `course_id`, `start_date`, `end_date`, `status`, `spots_available`, `rules` — W29 extends |
| `golf_qualifier_entries` | `qualifier_id`, `player_id`, `round_id`, `score`, `position`, `total_score`, `total_to_par`, `rounds_completed`, `is_tied` |

### Notification tables

| Table | Purpose |
|---|---|
| `push_subscriptions` | `user_id`, `endpoint`, `keys`, `expiration_time`, `failed_count` |
| `golf_player_notification_state` | Per-category preferences (W42 extends with columns) |
| `notifications` | General notifications (cross-sport) |

### Tables that must NOT be deleted during W26 cutover

Per Master Plan Part XXIV — even in "sunset" wave, these are active production tables, not v2 code:
- `golf_predictions`, `golf_prediction_validations`, `golf_prediction_model_performance`
- `golf_insight_effectiveness`, `golf_insight_drill_attachments`, `golf_insight_generation_log`, `golf_insight_player_feedback`
- `golf_patterns_v2`

W26 only deletes V2 **code files** (`v2/reasoning/*`, `v2/nlg/*`, the 9 v2 generator files).

### RLS helpers (W9)

- `current_player_id()` — current user's player_id
- `current_coach_id()` — current user's coach_id
- `is_team_coach(team_id)` — wraps `is_golf_team_primary_coach()` RPC
- `is_team_player(team_id)` — same shape
- `is_in_team(team_id)` — either role

**⚠️ See §19 — two RLS Critical findings from 2026-05-17 audit are unresolved as of this snapshot.**

### Enums (use exact values)

| Enum | Values |
|---|---|
| `PlayerYear` | `freshman, sophomore, junior, senior, graduate` |
| `PlayerStatus` | `active, inactive, redshirt, medical, transfer` |
| `EventType` | `practice, tournament, qualifier, meeting, travel, other` |
| `RoundType` | `practice, tournament, qualifier, competition` |
| `RoundStatus` | `in_progress, completed, cancelled, verified` |
| `QualifierStatus` | `upcoming, in_progress, completed, cancelled` |
| `TaskStatus` | `pending, in_progress, completed, overdue` |
| `TaskUrgency` | `low, normal, high, urgent` |
| `AlertSensitivity` | `aggressive, balanced, conservative` |
| `ShotType` | `tee, approach, around_green, putting, penalty` |
| `LieBefore` | `tee, fairway, rough, sand, green, other` |
| `PuttBreak` | `left_to_right, right_to_left, straight, multiple` |
| `FocusAreaType` (deprecated — use Goals) | `driving, iron_play, short_game, putting, course_management, mental_game, fitness, other` |
| `PatternLifecycle` | `detected, confirmed, addressed, resolved, dismissed` |
| `AlertLevel` | `critical, warning, info, suggestion` |
| `RSVPStatus` | `pending, accepted, declined, tentative` |

---

## 7. Routes — Full IA (Coach Desktop / Player Phone)

All routes live under `src/app/golf/(dashboard)/dashboard/`. Auth + onboarding under `src/app/golf/(auth)/` and `src/app/golf/(onboarding)/`.

### Coach-only routes

| Route | File | Purpose |
|---|---|---|
| `/golf/dashboard/intelligence` | `(dashboard)/dashboard/intelligence/page.tsx` | **Default coach landing — Morning Brief** (LLM opener + player tiles + chat slide-over) |
| `/golf/dashboard/intelligence/digests` | `intelligence/digests/page.tsx` | Weekly email history |
| `/golf/dashboard/alerts` | `alerts/page.tsx` | AI performance alerts |
| `/golf/dashboard/insights` | `insights/page.tsx` | Insights inbox + cohort + composite badges + standing bars |
| `/golf/dashboard/patterns` | `patterns/page.tsx` | Pattern dashboard (v3-aware after W25) |
| `/golf/dashboard/qualifying` | `qualifying/page.tsx` | List of qualifying events |
| `/golf/dashboard/qualifying/[eventId]` | `qualifying/[eventId]/page.tsx` | Active leaderboard + selection (W29) |
| `/golf/dashboard/coachhelm/goals/[playerId]` | `coachhelm/goals/[playerId]/page.tsx` | Player's goals (W19) |
| `/golf/dashboard/coachhelm/genome/[playerId]` | `coachhelm/genome/[playerId]/page.tsx` | Genome page (W34) |
| `/golf/dashboard/coachhelm/genome/compare` | `coachhelm/genome/compare/page.tsx` | Lineup overlay |
| `/golf/dashboard/coachhelm/chat` | `coachhelm/chat/page.tsx` | Full chat history (W32) |
| `/golf/dashboard/coachhelm/team-standing` | `coachhelm/team-standing/page.tsx` | Matrix view |
| `/golf/dashboard/development` | `development/page.tsx` | Player development plans (integrates with goals) |
| `/golf/dashboard/qualifiers/new` | `qualifiers/new/page.tsx` | Create qualifier |
| `/golf/dashboard/stats/team` | `stats/team/page.tsx` | Team-level analytics |
| `/golf/dashboard/analytics/coachhelm` | `analytics/coachhelm/page.tsx` | CoachHelm analytics + outcome causality section (W36) |
| `/golf/dashboard/settings/coaching-intelligence` | `settings/coaching-intelligence/page.tsx` | AI philosophy config |

### Player-only routes (phone-first)

| Route | File | Purpose |
|---|---|---|
| `/golf/dashboard/coachhelm` | `coachhelm/page.tsx` | **Default player landing** — Hero insight (LLM) + Active Goals (2-up) + Suggested Goals (1-up) + Recent rounds + standing trend |
| `/golf/dashboard/hub` | `hub/page.tsx` | Player home (travel, tasks, events) |
| `/golf/dashboard/my-development` | `my-development/page.tsx` | My development focus areas / goals |
| `/golf/dashboard/my-development/standing` | `my-development/standing/page.tsx` | Full standing matrix (W16) |
| `/golf/dashboard/my-game-profile` | `my-game-profile/page.tsx` | Genome (W34) |
| `/golf/dashboard/my-qualifiers` | `my-qualifiers/page.tsx` | My qualifier progress |
| `/golf/dashboard/rounds/new` | `rounds/new/page.tsx` | Create new round |
| `/golf/dashboard/rounds/continue/[id]` | `rounds/continue/[id]/page.tsx` | Resume in-progress round |
| `/golf/dashboard/rounds/[id]/review` | `rounds/[id]/review/page.tsx` | AI round review (LLM prose + counterfactual, W30) |
| `/golf/dashboard/classes` | `classes/page.tsx` | Class schedule management |
| `/golf/dashboard/settings/devices` | `settings/devices/page.tsx` | Arccos / Garmin / TrackMan (W39+) |
| `/golf/dashboard/settings/sharing` | `settings/sharing/page.tsx` | Per-coach share defaults (W19) |
| `/golf/dashboard/settings/notifications` | `settings/notifications/page.tsx` | Per-category toggles (W42) |

### Shared routes

| Route | Purpose |
|---|---|
| `/golf/dashboard` | Main dashboard hub (role-specific view) |
| `/golf/dashboard/roster` | Team roster (coach sees intent pill, W27) |
| `/golf/dashboard/roster/[id]` | Player profile detail |
| `/golf/dashboard/rounds` | Round history |
| `/golf/dashboard/rounds/[id]` | Round details |
| `/golf/dashboard/calendar` | Team calendar + RSVP |
| `/golf/dashboard/qualifiers` | Qualifier events list |
| `/golf/dashboard/qualifiers/[id]` | Qualifier detail/leaderboard |
| `/golf/dashboard/stats` | Personal statistics |
| `/golf/dashboard/messages` | Team messaging |
| `/golf/dashboard/announcements` | Announcements |
| `/golf/dashboard/tasks` | Task management |
| `/golf/dashboard/documents` | Document library |
| `/golf/dashboard/travel` | Travel itineraries |
| `/golf/dashboard/team` | Team info page |
| `/golf/dashboard/settings` | User settings |

### Auth & platform routes

| Route | Purpose |
|---|---|
| `/golf/login`, `/golf/signup` | Auth |
| `/golf/forgot-password`, `/golf/reset-password` | Password recovery |
| `/golf/(onboarding)/coach` | Coach onboarding (3 steps: Org → Team → Profile) |
| `/golf/(onboarding)/player` | Player onboarding (4 steps: Basic → Golf → Academic → Photo) |
| `/golf/join/[code]` | Team join via invite |
| `/golf/admin` | Admin dashboard |
| `/golf` | Landing page |

---

## 8. Server Actions — All 41 Files

Location: `src/app/golf/actions/`. Every server action checks auth first via `await supabase.auth.getUser()` and calls `revalidatePath()` on mutation.

### Coach-specific actions

| File | Purpose |
|---|---|
| `alerts.ts` | Coach alert CRUD (get, acknowledge, dismiss, generate) |
| `insights.ts` | CoachHelm AI insight generation (pattern mining, predictions, analysis) |
| `insight-management.ts` | Insight search, filter, acknowledge, dismiss, export |
| `insight-evidence.ts` | Insight evidence / supporting data |
| `pattern-management.ts` | Pattern lifecycle (validate, address, resolve, dismiss) |
| `intelligence-dashboard.ts` | Intelligence hub data aggregation |
| `coachhelm-analytics.ts` | CoachHelm effectiveness analytics |
| `development.ts` | Player focus area / goal CRUD |
| `admin-data.ts` | Admin dashboard data aggregation |

### Player-specific actions

| File | Purpose |
|---|---|
| `golf.ts` | Round CRUD, qualifier ops, shot tracking — **5598 LOC god file, A-NEW-1 split target** |
| `round-drafts.ts` | Draft round handling (auto-save) |
| `round-reviews.ts` | AI review generation and retrieval |
| `round-review-system.ts` | Review system ops (share with coach) |
| `shot-analytics.ts` | Shot data analytics (player CoachHelm surface) |
| `player-profile-stats.ts` | Player stat calculation |

### Team / shared actions

| File | Purpose |
|---|---|
| `auth.ts` | Authentication |
| `onboarding.ts` | Onboarding flow |
| `teams.ts` | Team management |
| `roster.ts` | Roster ops (invite, join, approve) |
| `dashboard-data.ts` | Dashboard data (coach + player views) |
| `messages.ts` | Message ops |
| `message-attachments.ts` | Attachment handling |
| `communication.ts` | Communication utils |
| `announcements.ts` | Announcement management |
| `event-lifecycle.ts` | Event CRUD/lifecycle |
| `recurring-events.ts` | Recurring events — **Q-NEW-7/Q-NEW-8 fixes pending** |
| `attendance.ts` | Attendance tracking |
| `availability-polling.ts` | Availability polls |
| `availability-locking.ts` | Availability locking |
| `calendar-sync.ts` | Calendar integration |
| `calendar-feeds.ts` | iCal feed management |
| `caldav-sync.ts` | CalDAV protocol |
| `tasks.ts` | Task management |
| `task-templates.ts` | Task templates |
| `task-reminders.ts` | Reminders (NOT auto-triggered — known gap) |
| `documents.ts` | Document management |
| `stats.ts` | Stats calculation |
| `stats-v2.ts` | V2 stats calculation |
| `stats-data.ts` | Stats data operations |
| `courses.ts` | Course management |
| `travel.ts` | Travel itineraries (budget/expense tables exist but no CRUD — scaffolded) |

---

## 9. CoachHelm Engine — V3 Spec

### The 9 SG-spined V3 generators

All under `src/lib/coachhelm/v3/generators/` with shared base class auto-injecting `evidence.standing` (PGA + team + you) and `evidence.counterfactual`.

| Generator | Wave | What it surfaces |
|---|---|---|
| `putt-distance` | W21 | Long-putt make-% gap to PGA baseline |
| `putt-bias` | W22 | Left/right miss tendency on putts |
| `scrambling` | W22 | Scrambling % when missing GIR |
| `approach-miss` | W22 | Approach miss direction patterns |
| `tee-strategy` | W23 | Driver vs. 3W vs. iron tee decision quality (per-team tokens added in PR #92) |
| `par-type` | W23 | Par-3 / par-4 / par-5 performance gaps |
| `course-mgmt` | W23 | Hole-by-hole strategy quality |
| `pressure-gap` | W24 | Tournament vs. practice delta |
| `warmup-hole` | W24 | First-3-holes scoring drop-off |

Each generator's causal claim must cite `docs/v3-research-golf-domain.md`. Generators read SG from `golf_player_stats_cache` (not recomputed) and write insights to `golf_coach_insights` with `engine_version='v3'`.

### Composite insights (12 rules + 7 W30.5 followups)

Located in `src/lib/coachhelm/v3/composite/rules/`. Composite insights link 2+ findings via hand-coded causal rules. Example rules:

- **penalty-drives-doubles** — When penalty count > 1/round AND double-bogey rate > 15%, link them via the 70% causal chain
- **gir-scrambling-inverse** — When GIR drops 10%+ AND scrambling is below baseline, surface the inverse correlation
- **proximity-make-pct** — When approach proximity worsens AND putting % drops, link via proximity→make% chain
- **lag-3putt** — When long-putt distance avg > 18ft AND 3-putt rate spikes, link via lag→3-putt chain
- **pressure-gap-warmup** — When pressure gap widens AND warmup-hole scoring drops, indicate routine/preparation issue
- **bunker-rough-cluster** — When bunker save % AND deep-rough scrambling both drop, cluster as short-game decline
- **tee-strategy-stamina** — When driver % drops on back 9 vs. front 9, link to physical/mental fatigue pattern
- **par-type-pressure** — When par-3 birdie % drops in tournaments vs. practice
- ... (4 more in v1; 7 more in W30.5)

Composite synthesis runs after individual generators in the orchestrator. Output writes to `golf_coach_insights` with `category='composite'`.

### LLM surfaces (exactly 3)

| Surface | Wave | Trigger | Model |
|---|---|---|---|
| **Round-review summary + key takeaway** | W30 | Player completes round, opens `/rounds/[id]/review` | Claude Haiku via Vercel AI Gateway |
| **Hero insight on player dashboard** | W31 | Player lands on `/coachhelm` (mobile) | Claude Haiku via Vercel AI Gateway |
| **Coach chat** | W32 | Coach opens `/coachhelm/chat` or uses chat slide-over from `/intelligence` | Claude Haiku via Vercel AI Gateway |

**Player chat deferred to v2.** Weekly recap uses **deterministic templates, no AI opener.**

### LLM gating + budget guard

- `golf_coachhelm_settings.llm_budget_usd_per_day` — non-zero required, else round-review falls back to template
- `AI_GATEWAY_API_KEY` env var — required server-side, never exposed to client
- All calls log to `golf_coachhelm_llm_calls` (provider, model, tokens, latency, cost)
- Budget tracked in `golf_coachhelm_llm_budget` per period

**⚠️ Codex handoff:** Verify the budget check **halts execution** (not just warns) and is **per-tenant** (not global). See §18.

### Coach chat — 12 tool routes (W32)

Located in `src/lib/coachhelm/v3/chat/tools/`. The chat agent can call any of these tools mid-conversation:

1. `get-player-summary` — pull current state of a player
2. `get-player-rounds` — recent rounds for a player
3. `get-player-stats` — current stats (SG, putting, scrambling, etc.)
4. `get-player-standing` — standing vs. PGA + team
5. `get-player-genome` — 80-dim genome
6. `get-team-roster` — current team roster
7. `get-team-insights` — recent insights across team
8. `get-team-patterns` — confirmed patterns
9. `get-team-upcoming-events` — upcoming events from calendar
10. `get-team-qualifiers` — active qualifiers
11. `create-goal` — create a goal for a player (with confirmation step)
12. `suggest-drill` — suggest a drill from `golf_drills` with `impacts_metric_id`

Conversations + messages persist to `golf_coachhelm_chat_conversations` + `_messages`.

### Player Genome (W33-W34)

80-dimension player genome computed nightly to `golf_player_genome`. Dimensions span:
- Performance: scoring, SG by category, par-type splits, course-type splits
- Tendency: miss directions, lie distribution, club distribution
- Consistency: round-over-round variance, hole-over-hole variance
- Pressure: tournament vs. practice, qualifier vs. tournament, late-round vs. early-round
- Recovery: scrambling, sand save, deep-rough recovery
- Putting: distance buckets, break direction, green-reading
- Strategy: aggression index, conservative-play index, club-down-from-driver frequency

UI: `/my-game-profile` (player), `/coachhelm/genome/[playerId]` (coach), `/coachhelm/genome/compare` (lineup overlay).

### Coach intent (W27)

Per-player intent stored in `golf_coach_player_intent`:
- `bubble` — on the edge of the lineup, tighten alerts
- `maintain` — established starter, focus on protecting strengths
- `develop` — long-term project, more suggestions and patience
- `breakout` — high-ceiling player, watch for emerging strengths
- `rehab` — returning from injury/setback, gentler thresholds

Intent modulates engine alert thresholds and is **invisible to the player**.

### Outcome causality (W35-W36)

After insight is delivered, the attribution cron (W35) processes all insights surfaced 21+ days ago and writes to `golf_insight_outcome_attribution`. This feeds:
- `golf_insight_effectiveness` (existing table — effectiveness score updates)
- `golf_coachhelm_coach_weights` (per-coach weight adjustments)

Insight ranking (W36) then weights future insight delivery by the coach's measured outcomes.

---

## 10. The New UI in Detail

### Doctrine I-III canonical refactor (PR #86)

This polish pass standardized the visual language across all golf v3 surfaces. Replaced ad-hoc glass cards with **canonical `surface-matte`** patterns (PR #89), scoped Lenis smooth-scroll to v3-pure routes only (PR #87) to avoid v2 scroll conflicts, and shipped the chat-page-shell polish documented in `docs/page-ui-audit.md`.

### Design tokens

| Token | Value | Used for |
|---|---|---|
| Primary | `#16A34A` (Kelly green) | Buttons, accents, active states |
| Background | `#FFFEFA` (cream) | Page background |
| Glass surface | `rgba(255,255,255,0.7) backdrop-blur-xl` | Cards (canonical: `surface-matte`) |
| Text primary | `#1c1917` (warm-900) | Headings + body |
| Text secondary | `#78716c` (warm-500) | Captions + meta |
| Success | `#16A34A` | Confirmations |
| Error | `#DC2626` | Errors |
| Warning | `#F59E0B` | Warnings |

### Typography scale

- `h1` = `text-3xl` (30px)
- `h2` = `text-2xl` (24px)
- `h3` = `text-xl` (20px)
- body = `text-base` (16px)
- small = `text-sm` (14px)

### Surface primitives

- **Canonical card**: `surface-matte` (post-PR #89) — replaces all ad-hoc `bg-white/70 backdrop-blur-xl ...` chains
- **Hover**: `hover:bg-white/80 hover:shadow-card-hover transition-all duration-200`
- **Radius**: `rounded-2xl` everywhere
- **Padding**: `p-6` (compact) / `p-8` (spacious)
- **Gap**: `gap-6` between cards

### Motion language

- Framer Motion with **`useReducedMotion` honored everywhere** (CI mock requirement — drift caused past CI breaks)
- Slow, cinematic ease curves (`cubic-bezier(0.25, 0.1, 0.25, 1)`, `cubic-bezier(0.32, 0.72, 0, 1)`)
- Lenis smooth-scroll scoped to v3-pure routes (PR #87) — v2 routes use native scroll to avoid conflicts

### Coach surface (desktop-first) IA

```
/dashboard
├── /intelligence                       ← Morning Brief default landing
│    ├── (LLM opener)                   ← Claude Haiku-generated team summary
│    ├── (Player tiles — color-coded)   ← Each player's state at a glance
│    ├── (Chat slide-over)              ← Quick chat without leaving page
│    └── /digests                       ← Weekly email history
├── /insights                           ← Inbox; cohort + composite badges + standing bars
├── /patterns                           ← V3-aware after W25
├── /qualifying                         ← List of qualifying events
│    └── /[eventId]                     ← Active leaderboard + selection (W29)
├── /coachhelm
│    ├── /goals/[playerId]              ← Player's goals (W19)
│    ├── /genome/[playerId]             ← Genome page (W34)
│    ├── /genome/compare                ← Lineup overlay
│    ├── /chat                          ← Full chat history (W32)
│    └── /team-standing                 ← Matrix view
├── /roster                             ← MODIFIED — intent pill (W27)
├── /development                        ← Existing; integrates with goals
└── /analytics/coachhelm                ← MODIFIED — outcome causality section (W36)
```

**Key surfaces:**
- **Morning Brief** (`/dashboard/intelligence`) — Default landing, LLM-written opener, color-coded player tiles, chat slide-over
- **Coach Chat** (`/dashboard/coachhelm/chat`) — Backed by 12 tool routes; can create goals from chat
- **Qualifying Workspace** (`/dashboard/qualifying/[id]`) — Replaces coaches' Google Sheets; the wedge against Clippd
- **Genome Compare** (`/dashboard/coachhelm/genome/compare`) — Lineup overlay across 80 dimensions
- **Outcome Causality** (`/dashboard/analytics/coachhelm`) — New section showing insight → outcome attribution

### Player surface (phone-first) IA

```
/dashboard (mobile-first)
├── /coachhelm                          ← Default landing
│    ├── (Hero insight — LLM narrative wrapper)
│    ├── (Active goals — 2-up cards)
│    ├── (Suggested goals — 1-up cards)
│    └── (Recent rounds + standing trend)
├── /my-development                     ← Lists goals
│    └── /standing                      ← Full standing matrix (W16)
├── /my-game-profile                    ← Genome (W34)
├── /rounds/[id]/review                 ← MODIFIED — LLM prose + counterfactual (W30)
└── /settings
     ├── /devices                       ← Arccos / Garmin / TrackMan (W39+)
     ├── /sharing                       ← Per-coach share defaults (W19)
     └── /notifications                 ← Per-category toggles (W42)
```

### Player hero card (the most visible LLM surface)

```
┌─────────────────────────────┐
│ Hi Jordan                   │
├─────────────────────────────┤
│ Your pressure gap widened   │
│ this week. Sunday's quali   │
│ +3 vs +1 in practice. The   │
│ lag-putting work IS paying  │
│ off — 18% from 25+ ft, well │
│ above your 30-day baseline. │
│                             │
│ Standing on pressure gap:   │
│ T 0.8 · You 2.4 · PGA 0.5   │
│ ├─[P]─[T]──[●]──────────┤   │
│ Bottom 10% on team          │
│ → 75.2 → 73.4 if closed     │
│ [Track this →]              │
└─────────────────────────────┘

ACTIVE GOALS · 2
SUGGESTED · 1
```

Components:
- **Narrative prose** — Claude Haiku, max 3 sentences
- **Standing Bar** — deterministic; PGA + Team + You markers
- **Counterfactual** — gated by 0.3-stroke noise floor; suppressed if delta below
- **CTA** — `[Track this →]` creates a goal pre-populated with the suggested metric

### CoachHelm component directory (80+ components)

Located in `src/components/golf/coachhelm/`:

| Directory | Key components |
|---|---|
| `insights/` | InsightCard, InsightListView, InsightFiltersPanel, InsightSearchBar, InsightBulkActions, InsightExportModal, PlayerFocusAreas, FocusAreaCard |
| `settings/` | PriorityRanker, ThresholdSlider, SensitivitySlider, WeightDistributor, AlertTypeToggles |
| `patterns/` | PatternDashboard, PatternCard, PatternTimeline, PatternByPlayerView, PatternValidationModal |
| `round-review/` | RoundReviewCard, RoundStatsComparison |
| `analytics/` | Advanced analytics dashboards |
| `alerts/` | Alert notification system (AlertCard) |
| `player/` | PlayerCoachHelmDashboard, player-specific intelligence views |
| `reviews/` | Review history and details |
| `v2/` | IntelligenceCommandCenter, legacy v2 surfaces |
| `v3/` | New v3 surfaces (StandingBar, GoalCard, GenomeRadar, HeroNarrative, ChatDrawer, CompositeBadge) |

### Other golf component directories

```
src/components/golf/
├── layout/                    # Header, nav, mobile nav
├── dashboard/                 # CoachDashboard, PlayerDashboard
├── rounds/                    # Round entry and display
├── calendar/                  # 30+ components (MonthView, WeekView, DayView, MobileCalendarWrapper, EventCreateModal, EventDetailModal, AttendanceCheckIn, AvailabilityPoll)
├── roster/                    # Roster management
├── messages/                  # Messaging
├── announcements/             # Announcements
├── tasks/                     # 18 components
├── qualifiers/                # Qualifier/bracket display
├── classes/                   # Class schedule (AddClassModal, UploadScheduleModal)
├── stats/                     # Statistics views
├── documents/                 # Document management
├── travel/                    # Travel itineraries
├── settings/                  # Settings panels (Personal, Email, Password, Notifications, etc.)
├── profile/                   # Player profiles
├── player-hub/                # PlayerHub.tsx (40KB), PlayerHubWrapper.tsx
└── ShotTrackingComprehensive.tsx  # Main shot tracking component
```

---

## 11. Cron Jobs (Post-PR #93)

11 crons total after today's reduction. All routes verified to enforce `Bearer ${CRON_SECRET}` auth (see §18).

| # | Endpoint | Schedule | Purpose | Wave |
|---|---|---|---|---|
| 1 | `/api/cron/coachhelm-validation` | `0 6 * * 0` (Sun 06:00 UTC) — was hourly | Engine health probe | Existing |
| 2 | `/api/cron/coachhelm-calibration` | `30 3 * * *` (daily 03:30) | Recalibrate confidence weights | Existing |
| 3 | `/api/cron/coachhelm-safety-net` | `0 4 * * 0` (Sun 04:00) — was every 30 min | Backup retry path for stuck rounds | Existing |
| 4 | `/api/cron/coachhelm-insight-lifecycle` | `0 2 * * *` (daily 02:00) | Insight lifecycle transitions (detected → addressed → resolved) | Existing |
| 5 | `/api/cron/coachhelm-roster-sweep` | `45 3 * * *` (daily 03:45) | Roster change detection + insight cleanup | Existing |
| 6 | `/api/cron/coach-morning-digest` | `30 6 * * *` (daily 06:30) | Morning Brief content prep | Existing |
| 7 | `/api/cron/event-reminders` | `0 5 * * 0` (Sun 05:00) — was every 15 min | Calendar event reminders | Existing |
| 8 | `/api/cron/v3/standing-refresh` | `0 4 * * *` (daily 04:00) | Refresh `golf_player_standing` | W11 |
| 9 | `/api/cron/v3/genome-nightly` | `0 5 * * *` (daily 05:00) | Compute `golf_player_genome` (80 dims, chunked) | W33 |
| 10 | `/api/cron/v3/causality-attribute` | `0 6 * * *` (daily 06:00) | Attribution: insights surfaced 21+ days ago | W35 |
| 11 | `/api/cron/v3/weekly-coach-email` | `0 23 * * 0` (Sun 23:00) | Send weekly coach digest | W37 |

### Dropped in PR #93

- `/api/cron/process-sequences` (was every 10 min) — baseball CRM (paused product)
- `/api/cron/refresh-engagement` (was every 5 min) — baseball CRM (paused product)
- `/api/cron/v3/ingest-sync` (was every 6h) — provider stubs not live yet

### Backfill routes (not in vercel.json — manual trigger only)

- `/api/cron/v3/genome-backfill` — one-shot genome compute for new players
- `/api/cron/v3/standing-backfill` — one-shot standing compute for history

### Cron auth pattern

All 16 cron route files enforce auth before any handler logic. Helper at `src/lib/cron/auth.ts`:

```ts
export function requireCronAuth(request: CronAuthRequest): Response | null {
  const expectedSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
```

Usage in routes (15 of 16):
```ts
const unauthorized = requireCronAuth(req);
if (unauthorized) return unauthorized;
// ... handler logic
```

The 16th (`event-reminders/route.ts`) has its own inline check with the same logic. **See §18 for the cron-auth review notes.**

---

## 12. Hooks

Located in `src/hooks/golf/`:

| Hook | Purpose |
|---|---|
| `use-golf-messages` | Realtime messaging subscription |
| `use-golf-rounds` | Round data fetching |
| `use-golf-team` | Team context provider |
| `use-team-context` | Team context consumer |
| `use-auto-save-round` | Auto-save round every 15s |
| `use-message-attachments` | File attachment management |
| `use-offline-sync` | Offline round sync (currently disabled) |
| `use-qualifier-realtime` | Realtime qualifier updates |
| `use-rsvp-realtime` | Realtime RSVP updates |
| `use-task-realtime` | Realtime task updates |
| `use-connection-status` | Network connectivity status |
| `use-service-worker` | Service worker registration |

---

## 13. Stores & Context

- **Zustand** — `src/stores/golf-auth-store.ts` (auth + current user state)
- **React Context** — `src/lib/golf-user-context.tsx` (current player/coach + team)
- **Server state** — fetched via Supabase server client in server components; no React Query

---

## 14. Environment Variables

`.env.example` claims 16 vars but actual usage is ~41 (D-MED-2 from audit — out of sync).

### Server-only (never exposed to client)

| Variable | Used by | Required? |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | `createAdminClient` (30 file callsites — B-HIGH-4 boundary work) | Yes |
| `CRON_SECRET` | All 16 cron routes via `requireCronAuth` | **Yes — verify set in Vercel** (B-CRIT-1) |
| `COACHHELM_INTERNAL_SECRET` | `/api/coachhelm/analyze-player` route | **Yes — verify set in Vercel** (B-CRIT-1) |
| `AI_GATEWAY_API_KEY` | LLM service wrapper (W30) — round-review, hero, chat | Yes for LLM features |
| `RESEND_API_KEY` | Email delivery (weekly digest W37) | Yes for email |
| `RESEND_WEBHOOK_SECRET` | Webhook signature verification | Yes |

### Client-safe (`NEXT_PUBLIC_*`)

| Variable | Used by |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Browser Supabase client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Browser Supabase client |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry browser SDK |
| `NEXT_PUBLIC_POSTHOG_KEY` | PostHog analytics |

### Auto-ingest providers (W39-W41 stubs)

| Variable | Provider |
|---|---|
| `ARCCOS_CLIENT_ID`, `ARCCOS_CLIENT_SECRET`, `ARCCOS_OAUTH_REDIRECT_URI` | Arccos OAuth |
| `GARMIN_CONSUMER_KEY`, `GARMIN_CONSUMER_SECRET` | Garmin OAuth 1.0a |
| `TRACKMAN_API_KEY`, `TRACKMAN_API_BASE` | TrackMan API |

Adapters are gated on these env vars — if absent, the adapter no-ops. **Verify gating in code** (see §18).

---

## 15. The Master Plan — Condensed

Canonical: **`docs/v3-master-plan.md`** (1655 lines).

### Ten organizational rules in force for every wave

1. **Namespace isolation** — all new code under `v3/`, V2 untouched outside W25/W26
2. **One purpose per migration** — one table OR column OR constraint OR enum value
3. **Schema verification before migration writes** — every migration starts with `-- VERIFIED:`
4. **One wave = one branch = one PR = one ship** — no stacked PRs
5. **Migration ships with the code that uses it** — same PR
6. **Idempotent migrations always** — `IF NOT EXISTS`, `IF EXISTS`, `DO $$ ... $$` rename guards
7. **Enum additions in their own migration before use** (Postgres 55P04 rule)
8. **Test mocks change in the same PR as the code** (framer-motion drift doesn't repeat)
9. **Environment-dependent flags get explicit `if (process.env.X)` guards**
10. **Compatibility shims have kill dates**, registered in `docs/v3-compatibility-shims.md`

**Backfill rule:** Schema migration ships first (verified empty), backfill cron ships in separate PR (verified populated). Never combined.

**Rollback discipline:** Every migration includes a `-- ROLLBACK:` comment block with safe undo SQL.

### Locked decisions (anchor list)

**Goals:**
- One unified concept (replaces focus areas + arcs + drill compliance)
- Created by player OR coach; coach decides per-team if assigned goals are mandatory or suggested
- Player chooses share-with-coach, default **OFF**
- Window: any duration 1 week to 1 season (7-365 days)
- Stat list curated (~20-30 from canonical registry)
- Soft cap at 5 active goals (UI warns, doesn't block)
- Auto-evaluation at end date: hit / miss / partial / abandoned

**Standing Bars:**
- Universal comparison surface
- Cold-start: PGA + You only when team has <5 players with 5+ rounds
- **Team rank visible to players** — honest feedback

**AI/LLM:**
- Claude writes prose at **exactly 3 surfaces** (round review, hero, chat)
- Coach chat scope: Q&A + can create goals (with confirmation)
- **Player chat deferred to v2**
- Weekly recap: deterministic templates, no AI opener

**Coach Intent:**
- Keep, full version (bubble / maintain / develop / breakout / rehab)
- Modulates engine alert thresholds
- **Invisible to player**

**Counterfactuals:**
- Secondary line, not headline
- Auto-suppressed below 0.3 strokes (stat noise)

**Dropped from scope:**
- In-round companion (year 2)
- Recruiting sheet (qualifying workspace replaces as wedge)
- Drill compliance tracking (goals' stat movement IS the measure)
- Parent digest (no audience need)

**Audience + device:**
- Both equally — every feature ships in lockstep with both surfaces
- Coach = desktop-first, player = phone-first

**Ship order:**
- Foundation first, then features. No "ship the flashy thing first."

**Day-1 launch:**
- Backfill everything (focus areas → goals; standing tables for all history) — no empty product

---

## 16. How It Was Built (Methodology)

The build discipline is the reason the 34-wave plan landed without major regressions.

1. **Foundation-first sequencing.** The first 8 waves (W9–W17) shipped no user-visible features — just RLS helpers, metrics registry, PGA standards seed, player standing table + nightly cron + backfill, and StandingBar component. Only then did W18+ build features on top.

2. **Namespace isolation.** Every v3 file lives under a `v3/` directory. The V2 cutover (W25) was a single PR that switched the orchestrator and deleted exactly 9 V2 generator files. V2 + V3 coexisted for ~20 waves while V3 caught up.

3. **Migration discipline.** One purpose per migration. ~27 migrations across 34 waves. Every migration is idempotent (`IF NOT EXISTS` / `DO $$ ... $$` guards). Every migration has a `-- ROLLBACK:` block.

4. **Schema verification.** Each wave's migration began with a `-- VERIFIED:` comment quoting the actual `SELECT pg_get_constraintdef(...)` showing prod state. This caught the `golf_coaches.team_id` non-existence (use `golf_team_coach_staff` instead), the `round_format` → `round_type` rename, the fact that SG is already cached in `golf_player_stats_cache`, and ~5 other corrections.

5. **Test mocks travel with code.** Framer-motion mock drift was a recurring CI problem (post-036 migrations need `DO $$` rename blocks; mocks must include `useReducedMotion`). The rule that mocks update in the same PR as the component eliminated drift after W21.

6. **Backfill as its own PR.** Schema PR ships first (table exists, verified empty), backfill PR ships next (table populated, verified).

7. **Compatibility shims have kill dates.** Shim registry at `docs/v3-compatibility-shims.md` tracks every back-compat hack with `introduced_by`, `removed_by`, `owner`.

Combined effect: a sustained ~1.5 waves/week cadence over the plan window with minimal CI/migration incidents.

---

## 17. Today's Operational Work (2026-05-26)

### What happened

The `helmv3` Vercel project was rejecting every deploy (CLI and Git-triggered) with `BUILD_ERROR: Resource provisioning failed` in ~8 seconds and empty build logs. A 50-commit backlog had accumulated on `main` since 2026-05-25.

### Investigation (hypothesis → test → result)

| Hypothesis | Test | Result |
|---|---|---|
| Vercel project-level abuse flag tripped by yesterday's burst of failures | Compared sibling project `adp-peo-crm` on the same team — deploys fine | Initially looked plausible; sibling result didn't disprove it |
| Cron config triggering provisioning rejection | Shipped `fix/reduce-cron-load`: dropped 3 unused crons + reduced 3 to weekly. Preview deploy attempted | **Failed identically in 8 seconds — cron config eliminated as cause** |
| Supabase paused (free-tier auto-pause after 7 days) | User unpaused Supabase, retried deploy | **Build started normally, completed in 7 min as Ready** |

### Root cause

**Paused Supabase.** Vercel's build environment couldn't reach the DB during early build/init, crashed before reaching the normal log capture pipeline, and after a burst of consecutive failures the dispatcher started instant-rejecting new deploys with the misleading `Resource provisioning failed` message.

### Why it looked like a Vercel abuse flag

The error class (`BUILD_ERROR`) + message (`Resource provisioning failed`) point to platform infrastructure, not application code. The instant 8-second failure with empty logs reinforced "this isn't even reaching my build." Both signals are misleading: the actual cause was an upstream dependency in a paused state. **Lesson saved to project memory** (`project_vercel_supabase_pause_lockout.md`): always check Supabase pause before assuming Vercel abuse flag.

### Fix shipped — PR #93

`ops: reduce cron load (14 → 11) — offseason cadence` (squash-merged to `main` at commit `b29dda6d`):

- **Dropped 3 unused crons:**
  - `/api/cron/process-sequences` (was every 10 min) — baseball CRM, paused product
  - `/api/cron/refresh-engagement` (was every 5 min) — baseball CRM, paused product
  - `/api/cron/v3/ingest-sync` (was every 6h) — provider stubs not live yet
- **Shifted 3 high-frequency golf crons to weekly Sunday** (team is in offseason):
  - `coachhelm-validation`: hourly → `0 6 * * 0`
  - `coachhelm-safety-net`: every 30 min → `0 4 * * 0`
  - `event-reminders`: every 15 min → `0 5 * * 0`
- **Net:** 14 → 11 crons, ~720 invocations/day → ~12/week

PR #93 shipped on its own merit (reduction was independently desired) even though it turned out not to be the deploy fix.

### Production status (end-of-session)

- `main @ b29dda6d`
- Production: `https://helmv3-g2beyrc1b-nick-rinis-projects.vercel.app` → Ready (6 min build)
- 50-commit backlog cleared
- Vercel CLI is 53.2.0 (latest 54.4.1) — not blocking, but worth `npm i -g vercel@latest` later

---

## 18. Security Posture for Codex Handoff

The goal of this section is to maximize signal in Codex's report by pre-empting noise and pointing them at the real exposure.

### What was audited in-session today

**Cron-endpoint authentication** — the most-exposed surface — was verified end-to-end:

- 16 cron route files in `src/app/api/cron/**/route.ts`
- All 16 reference `CRON_SECRET` / `authorization` / `x-vercel-cron`
- 15 use the shared helper `requireCronAuth` from `src/lib/cron/auth.ts`
- 1 (`event-reminders/route.ts`) has its own inline check
- All 16 enforce: bad/missing header → 401 before any handler logic runs
- Helper logic: `if (!expectedSecret || authHeader !== \`Bearer ${expectedSecret}\`)` → 401

**Verdict:** No cron-auth exploit in code. Pattern is consistent across the surface.

**⚠️ Caveat: assumes `CRON_SECRET` is actually set in Vercel production.** See §19 (B-CRIT-1) — `.env.production.local` shows empty value 9 days ago. **This must be verified in the Vercel dashboard before the audit means anything.**

### Two minor cron improvement opportunities (not blockers)

1. **Drift opportunity** — `event-reminders/route.ts` has its own inline copy. Same logic today, but the duplicate will eventually rot out of sync. Worth a 1-line refactor.
2. **Theoretical timing-side-channel** — `src/lib/cron/auth.ts:9` compares with `!==` instead of `crypto.timingSafeEqual()` on Buffer-converted strings. Not realistically exploitable on a public-internet endpoint (network jitter dominates), but security scanners will flag it. Swap to `timingSafeEqual` to pre-empt the noise.

### What to tell Codex before they start

1. **Ignore findings already in `.full-review-2026-05-17-golfhelm-audit/` and `docs/superpowers/plans/2026-05-17-*`.** A full multi-dimensional review ran 9 days ago. Pointing Codex at the existing report lets it dedupe instead of re-reporting. **The P0 RLS Criticals (§19) are explicitly known** — confirm with the team whether they've been fixed before treating Codex's findings as new.

2. **Ignore findings of the form "ingest adapter does nothing"** — Arccos / Garmin / TrackMan adapters (W39–W41) are intentionally non-functional stubs. They ship as scaffolding while partnership + env vars + per-provider HTTP-client code are arranged. See `memory/project_coachhelm_v3_ingest_prereqs.md`.

3. **LLM cost guard verification** — Round-review LLM falls back to a deterministic template when `golf_coachhelm_settings.llm_budget_usd_per_day` is 0 or unset. Verify in code:
   - The budget check **halts execution** (not just warns/logs)
   - The check is **per-tenant**, not a single global budget
   - `AI_GATEWAY_API_KEY` is server-only and never reaches the client bundle

4. **The V1/V2/V3 namespace coexistence is intentional**, not dead code. V1 (`src/lib/coachhelm/`) and V2 (`src/lib/coachhelm/v2/`) are both still active for some surfaces while the V3 cutover finishes. Codex may flag duplication — expected.

5. **Destructive write paths** are the known footgun in this codebase. Per project memory (`memory/feedback_golf_no_destructive_writes.md`): bulk delete-then-reinsert patterns in save/submit/sync paths have caused data loss on transient failures. If Codex finds any `DELETE ... INSERT` sequences in write paths, those are real bugs — should be `UPSERT` / `ON CONFLICT` or stage-and-swap. Q-NEW-8 (recurring-events hard-delete) is a known instance.

6. **`golf.ts` is a 5598-LOC god file** (A-NEW-1). Codex will flag it. The fix is in the audit backlog as a mechanical context-split, no logic change. Don't let Codex deep-audit the file as a single unit.

7. **HTTP self-call trigger pattern at `golf.ts:1684`** is a known architectural problem (Finding 2). Replacement plan is `after()` + state-machine columns. Codex may flag the pattern; reference the existing finding.

8. **Hook-order warning origin (Finding 6 in original report) was misattributed** — server components throw `NEXT_REDIRECT` synchronously and cannot emit React hook-order errors. The real source is `GolfDashboardShell` re-render under StrictMode with split-layer role gating (A-NEW-7).

### Out-of-scope for this review

- The baseball CRM surface (`adp-peo-crm`) — separate project, separate Vercel deployment
- The marketing site
- `docs/`, `memory/`, `.full-review-*` — these are reference, not shipped code
- Auto-generated Supabase types

---

## 19. Security Status — May 17 Audit + May 26 Codex Audit

### May 17 audit P0s — RESOLVED (confirmed by Codex 2026-05-26)

| ID | Description | Status |
|---|---|---|
| ✅ S-CRIT-1 | RLS allowed self-attach as coach to any team | **Closed** — repair migration `20260517000000_fix_critical_rls_policies.sql` adds `WITH CHECK` + `is_primary` clause. Regression test: `supabase/tests/rls/golf_team_coach_staff.sql` |
| ✅ S-CRIT-2 | Players could UPDATE their own `golf_coach_insights` rows | **Closed** — same migration uses column-level GRANT to limit authenticated UPDATE to `acknowledged_at` + `dismissed_at` only. Regression test: `supabase/tests/rls/coach_insights_player_update.sql` |
| ✅ O-CRIT-1 | Leaked DB password in `RUN_ON_YOUR_MACHINE.md` | **Closed** — doc scrubbed. (Dev DB password rotation still recommended as defense-in-depth; that DB ref is stale, not prod.) |
| ⚠️ B-CRIT-1 | Empty `CRON_SECRET` + `COACHHELM_INTERNAL_SECRET` in `.env.production.local` | **Unverified from outside** — Codex couldn't reach Vercel dashboard. **You must check manually.** Verification command: `vercel env ls production` — both names must exist with non-empty values. |

### May 26 Codex audit findings — STATUS

All 8 findings from the 2026-05-26 audit were fixed in this session (commits TBD, branch `fix/codex-audit-2026-05-26`). Detail of each:

| # | Severity | Description | Where Codex pointed | Fix shipped |
|---|---|---|---|---|
| 1 | **P1 high security** | `goals_coach_create` RLS missed player-team binding — coach on Team A could create goal for player on Team B | `supabase/migrations/20260525150000_v3_golf_goals_table.sql:151-160` | New migration `20260526180000_fix_v3_goals_suggestions_rls.sql` adds `EXISTS` over `golf_team_members` w/ `status='active'`. pgTAP: `supabase/tests/rls/v3_goals_coach_create_player_team_binding.sql` |
| 2 | **P1 product** | Chat goal-creation tool insert was broken — `team_id` omitted, `window_days` written to a GENERATED column, `origin: 'chat'` violates the constraint enum | `src/lib/coachhelm/v3/chat/tools.ts:338-356` | Resolves `team_id` from player's active membership; drops `window_days`; uses `origin: 'manual'`. Contract test: `src/test/coachhelm/v3/chat-create-goal.test.ts` (6 cases pinning the payload) |
| 3 | **P1 product** | Qualifying coach mutations queried nonexistent `golf_team_coach_staff.user_id` — actions silently failed for coaches | `src/app/golf/actions/v3/qualifying.ts:39-44` | Replaced inline broken query with canonical `verifyTeamAccess(team_id, user.id)` helper |
| 4 | **P2 cost/governance** | Coach chat bypassed v3 LLM budget gate + spend recorder — chat spend accumulated invisibly | `src/app/api/coachhelm/v3/chat/send/route.ts:91-153` | Added `checkBudget()` pre-flight (429 on exhaustion) + `recordSpend()` after agent runs. Uses admin client so spend table sees writes regardless of RLS context |
| 5 | **P2 product** | Genome compute one-shot had the same `user_id` bug as #3 | `src/app/api/coachhelm/v3/genome/compute/route.ts:51-56` | Same fix — `verifyTeamAccess()` helper |
| 6 | **P2 medium security** | `golf_goal_suggestions` was `FOR ALL TO authenticated` despite comment saying engine-only — players could fabricate suggestions | `supabase/migrations/20260525160000_v3_golf_goal_suggestions_table.sql:56-63` | Same migration as #1: splits into `FOR SELECT` + `FOR UPDATE` with `WITH CHECK`; no INSERT/DELETE for authenticated. Engine writes via service_role. pgTAP: `supabase/tests/rls/v3_goal_suggestions_no_authenticated_insert.sql` (5 cases) |
| 7 | **P2 cost/governance** | Round recap (`actions/round-recap.ts`) called `generateText()` directly — bypassed budget gate + call log | `src/app/golf/actions/round-recap.ts:166` | Routed through `compose()` with task=`round_review`. Resolves billing coach from player's team primary coach; passes deterministic recap as fallback so compose's gate-or-error path always has a safety net |
| 8 | **P2 product** | Round autosave deleted holes/shots BEFORE replacements were durable — partial-failure window = data loss | `src/app/golf/actions/golf.ts:3916` (`savePartialRound`) | Replaced destructive delete-then-insert with upsert-first (on `(round_id, hole_number)` for holes, `(round_id, hole_number, shot_number)` for shots). Added post-upsert orphan trim (fail-soft — log only, never roll back the upsert success) |

### Recurrence prevention shipped this session

**`scripts/check-schema-invariants.sh`** (wired into `.github/workflows/ci.yml` before typecheck) fails the build if either of the known-non-existent-column patterns reappears:
1. Any query of `golf_team_coach_staff` filtering by `user_id` (correct: join via `golf_coaches`)
2. Any query of `golf_coaches` filtering by `team_id` (correct: use `golf_team_coach_staff`)

The grep guard caught a **third instance** during this session — `golf.ts:1728` was running `from('golf_coaches').select('user_id').eq('team_id', teamId)` for the round-submit push notification path. Returned empty silently, so coaches haven't been getting push notifications when players submit rounds. Fixed to join through `golf_team_coach_staff` (kept inline for performance on the fire-and-forget path).

### Still pending P0 (outside code)

1. ⚠️ **Verify Vercel production `CRON_SECRET` + `COACHHELM_INTERNAL_SECRET` are set.** Run `vercel env ls production` and check both names appear with non-empty values. If empty, set them via `vercel env add`.

---

## 20. P1 / P2 / P3 Audit Backlog

Summarized from `.full-review-2026-05-17-golfhelm-audit/05-final-report.md`. Full file:line citations in that report.

### P1 — High (fix before next release)

**CoachHelm trust corrosion:**
- **Finding 1 + Q-NEW-12** — Evidence label/source mismatch beyond putt analytics (`putt-analytics.ts:419-421`, `approach-analytics.ts:443-444, 604-605`, `course-management.ts:347-348`)
- **Q-NEW-1 / A-NEW-3** — Legacy adapter manufactures `sample_n` (clamps up to 5) and `comparison_value` (0.9× player's own value) while labeling as baseline (`src/lib/coachhelm/v2/insights/to-insight-input.ts:94, 105-107`) — **refuse to emit instead of inflating**
- **Q-NEW-2 / Q-NEW-3 / S-HIGH-1** — Cross-coach `upsertInsight` overwrite — dedup ignores coach/team scoping (`src/lib/coachhelm/v2/insights/upsert.ts:82-92, 304-341`)
- **Q-NEW-5** — Orchestrator `Promise.allSettled` swallows generator failures (`src/lib/coachhelm/v2/orchestrator.ts:187-197`)

**Round → stats → CoachHelm loop:**
- **Finding 2 + A-NEW-6** — Replace HTTP self-call trigger with `after()` + state-machine columns (`coachhelm_analyzed_at`, `coachhelm_failed_at`) on `golf_rounds`
- **P-HIGH-1** — `invalidateOnRoundComplete` awaited inside submit adds 0.5–2s p99 user latency — wrap in `after()`
- **P-HIGH-3** — Orchestrator re-fetches `golf_rounds`/`golf_shots` 4-6× per `analyzePlayer` — introduce `PlayerDataContext`
- **P-HIGH-4** — `updateShot`/`deleteShot` don't refresh stats — 22h staleness; call `after(() => invalidateOnRoundComplete(roundId))`
- **P-CRIT-2 / B-HIGH-5** — Safety-net cron sequential → likely 300s timeout at 50+ players — copy `CONCURRENCY=3` from roster-sweep
- **T-HIGH-4** — No E2E round→stats→CoachHelm test at any layer

**Calendar:**
- **Finding 4 (amended)** — RSVP false success — upsert error not destructured (`src/lib/calendar/rsvp.ts:310-321, :187-189`)
- **Q-NEW-7** — Recurring event edit/delete returns success without checking affected rows (`recurring-events.ts:360-419, 476-535`)
- **A-NEW-5 / P-CRIT-1** — `CACHE_TAGS` write-only — zero `unstable_cache` readers; adopt `'use cache'`
- **Q-NEW-8** — Hard deletes on recurring events violate `feedback_golf_no_destructive_writes` (`recurring-events.ts:478-481, 491, 514`)

**Test harness (blocks everything else):**
- **T-CRIT-1** — Test suite is RED (17 files / 50 specs failing)
- **T-CRIT-2** — Finding 1 test drifted *with* the bug
- **T-HIGH-1** — Zero RLS policy tests
- **T-HIGH-3** — E2E never runs in CI
- **T-HIGH-2** — Server-action coverage 21.7%; `golf.ts`/`insights.ts`/`recurring-events.ts`/`attendance.ts`/`rsvp.ts` have zero tests

**Architecture:**
- **A-NEW-1** — `golf.ts` is 5598 LOC, 36 exports, 9 bounded contexts — mechanical context split
- **A-NEW-2** — Engine reaches into app layer via `await import('@/app/golf/actions/stats-data')` (`orchestrator.ts:1595`) — extract `src/lib/golf/stats/`
- **A-NEW-4 / B-HIGH-2** — 409 repo-wide `as any` (194 in scope) + 202 inline `eslint-disable`
- **A-NEW-7** — Three layers of role gating with no policy registry — structural cause of Finding 6 symptom
- **B-CRIT-2** — `middleware.ts` + dead `src/proxy.ts` (iOS gating silently disabled) — delete or consolidate

**Other High:**
- **B-HIGH-4** — `createAdminClient` used in 30 files (RLS bypass surface) — move behind directory boundary
- **B-HIGH-6** — `supabase/migrations/*` never CI-linted — add `supabase db lint`
- **B-HIGH-3 / P-CRIT-1** — Zero `'use cache'` adoption — largest unrealized perf win (~80% dashboard latency drop)

### P2 — Medium (next sprint)

- **Finding 5** — Team invite hydration mismatch (`team-settings-client.tsx:241`)
- **Q-NEW-9** — Hydration anti-pattern duplicable; add lint rule
- **Finding 8** — Coach dashboard RPC mock drift (fix as part of T-CRIT-1)
- **Finding 6 (symptom)** — Hook-order warning origin (probably resolves with A-NEW-7)
- **Q-NEW-6** — `/api/coachhelm/analyze-player` returns HTTP 200 on structured failure — switch to 5xx + structured `result.code` enum
- **B-MED-1 / Finding 9** — Fix CSP for Vercel Analytics + Datadog hosts (`next.config.mjs:153-164`); remove `ignoreErrors` mask at `instrumentation-client.ts:125`
- **B-MED-2** — Sync `.env.example` (16 → 41 vars)
- **B-MED-3** — Add husky / lint-staged / prettier / editorconfig
- **B-MED-4** — Add Dependabot + `npm audit` in CI
- **D-CRIT-2** — Replace root `README.md` (currently documents wrong project)
- **D-HIGH-1** — Refresh CLAUDE.md (action-files count, design-system snippet, npm test command)
- **D-HIGH-2** — Refresh `memory/context/coachhelm-ai.md` + `memory/projects/golfhelm.md` (last update 2026-02-13 — 3 months stale)
- **D-HIGH-3** — Start ADR directory: HTTP self-call trigger, CACHE_TAGS status, engine-app boundary
- **D-MED-2** — Add `docs/architecture/CRON_JOBS.md`

### P3 — Low / Backlog

- **Finding 7** — `translate-*` typo: 206 occurrences across 126 files (76 in scope) — global rename + add `eslint-plugin-tailwindcss`
- **P-HIGH-2** — Replace HTTP self-call fetch with `after()` (rolls into Finding 2)
- **Q-NEW-11** — Replace `console.error`/`console.debug` in `coachhelm/v2/` with `logServerError`
- **Q-NEW-13** — Add unit invariant: `unit === 'percent' → 0 <= value <= 1`
- **Q-NEW-14** — Discriminate errors in `respondToEvent` bare catch
- **A-NEW-8** — Add DTO boundary between components and server actions
- **A-NEW-9** — Make `_statsCache` request-scoped or LRU at module level
- **B-MED-5** — Cleanup deprecated `X-XSS-Protection` header
- **B-LOW-2** — Pin Node 24 across package.json / CI / Vercel
- **B-LOW-3** — Enable `noPropertyAccessFromIndexSignature` in `tsconfig.json`
- **D-MED-3** — Add `LICENSE`, `CONTRIBUTING.md`, `SECURITY.md`
- **O-MED-2** — Add explicit `maxDuration` to remaining 2 crons

---

## 21. Known Footguns

Patterns to watch for / actively avoid in this codebase:

1. **Delete-then-insert in save/submit/sync paths** — has caused data loss on transient failures. Use `UPSERT` / `ON CONFLICT` or stage-and-swap. Known instance: Q-NEW-8 (recurring-events hard-delete).

2. **HTTP self-call as trigger** — `golf.ts:1684` does `fetch(internal-route)` to trigger CoachHelm after round submit. Fragile. Replacement plan: `after()` + state-machine column on `golf_rounds`.

3. **Awaiting heavy work inside submit handler** — adds p99 latency (P-HIGH-1). Wrap post-submit work in `after()`.

4. **Stat staleness on shot edits** — `updateShot`/`deleteShot` don't refresh stats cache (P-HIGH-4). Up to 22h staleness.

5. **Cron timeouts** — Sequential player loops in cron handlers timeout at ~50+ players against Vercel's 300s ceiling. Use chunked concurrency (`CONCURRENCY=3` pattern from roster-sweep).

6. **`createAdminClient` everywhere** — 30 file callsites (B-HIGH-4). RLS-bypass surface. Move behind a directory boundary.

7. **`as any` everywhere** — 409 repo-wide (194 in scope). Hides type drift. Raise `no-explicit-any` to `error`.

8. **Cache tags write-only** — `CACHE_TAGS` defined but no `unstable_cache` reader uses them. Adopt `'use cache'` (A-NEW-5 / P-CRIT-1).

9. **Manufactured insight evidence** — `to-insight-input.ts` legacy adapter clamps `sample_n` and inflates `comparison_value`. Refuse to emit instead.

10. **Cross-coach insight overwrite** — `upsertInsight` dedup ignores coach/team scoping. Q-NEW-2 / Q-NEW-3 / S-HIGH-1.

11. **Test mocks drifting with bugs** — Finding 1 was masked because tests asserted the wrong baseline. Mocks must move in the same PR as the code (Rule 8).

12. **Hard deletes anywhere** — `recurring-events.ts:478-481, 491, 514` violates `feedback_golf_no_destructive_writes`.

13. **Migration after 036 needs `DO $$` rename blocks** — Postgres requires guards for safe column renames (CI memory).

14. **Framer-motion mocks must include `useReducedMotion`** — past CI breaks from drift (CI memory).

---

## 22. Confirmed-Fine (Don't Re-Audit)

Items the 2026-05-17 audit verified working. Codex shouldn't waste time here:

- `submitGolfRoundComprehensive` write-path safety — atomic RPC + draft preservation + cache invalidation + revalidate + keepalive trigger
- `attendance.ts` `checkInPlayer` / `bulkCheckIn` — proper `{ error }` destructure (only `rsvp.ts` has the broken twin)
- `/api/coachhelm/analyze-player` route auth uses `x-internal-secret` correctly
- `createRecurringEvent` rollback discipline at `recurring-events.ts:254-272`
- `pattern-miner.ts:139-148` `computeConvictionSafe` — proper divide-by-zero / NaN handling
- **Cron auth on all 16 cron routes** — proper `Bearer ${CRON_SECRET}` gating, fail-closed on missing env (re-verified today, §11 + §18)
- `get_coach_today_schedule` and sibling SECURITY DEFINER RPCs — proper `auth.uid()` gates (post-hotfix)
- Resend webhook signature verification uses proper Svix `Webhook` validation
- No PII in logs (only UUIDs)
- Table-prefix convention (`golf_*`, `baseball_*`) — zero non-prefixed `.from()` calls
- Calendar bundle is route-scoped; recurring-events dynamic imports DO code-split correctly
- `ShotTrackingComprehensive` re-renders — acceptable
- Server-component `redirect()` usage at the pages flagged in Finding 6 — correct App Router pattern

---

## 23. Open Questions & Risks

| Risk / Question | Status | Where to look / what to do |
|---|---|---|
| ✅ Two RLS Criticals (S-CRIT-1, S-CRIT-2) | **Closed** (2026-05-17) — Codex confirmed repair migration present | `supabase/migrations/20260517000000_fix_critical_rls_policies.sql` + pgTAP suites |
| ✅ Leaked dev DB password doc scrubbed | **Closed** (2026-05-17) — Codex confirmed. Recommend dev-DB rotation as defense-in-depth | `docs/setup/RUN_ON_YOUR_MACHINE.md` (already scrubbed) |
| ✅ Codex audit 2026-05-26 — 8 findings | **All fixed this session** (qualifying/genome user_id, chat goal insert, RLS for goals + suggestions, LLM budget bypass for chat + round-recap, destructive autosave) | See §19 table |
| ✅ Recurrence prevention for `golf_team_coach_staff.user_id` pattern | **Shipped** — `scripts/check-schema-invariants.sh` wired into CI | `.github/workflows/ci.yml` step |
| ⚠️ **P0: Vercel production `CRON_SECRET` + `COACHHELM_INTERNAL_SECRET` set?** | **Unverified** — Codex can't see Vercel dashboard | Run `vercel env ls production` and confirm both have non-empty values |
| LLM budget enforcement is per-tenant + halting on chat | **Shipped this session** — chat send route now calls `checkBudget()` upfront + returns 429 on exhaust + calls `recordSpend()` after | `src/app/api/coachhelm/v3/chat/send/route.ts` |
| `AI_GATEWAY_API_KEY` never leaks to client | Likely safe (server-action pattern dominant) | Grep all `process.env.AI_GATEWAY_API_KEY` refs; verify no `NEXT_PUBLIC_*` exposure |
| Ingest adapter stubs don't accidentally hit live endpoints | Likely safe (env-gated) | `src/lib/coachhelm/v3/ingest/` — verify all HTTP calls gated on per-provider env vars |
| **Test suite green?** | **Codex reported green 2026-05-26** — `npm test --run`, `npm run lint`, `npm run build`, `npm run typecheck` all clean. **Re-verify after this session's changes.** | `npm test -- --run` |
| Cron-secret timing-safe compare | Minor, not blocker | `src/lib/cron/auth.ts:9` |
| `event-reminders` inline auth drift vs. helper | Minor, not blocker | `src/app/api/cron/event-reminders/route.ts` |
| Memory docs stale (last update 2026-02-13) | Refresh after audit-backlog work | `memory/context/coachhelm-ai.md`, `memory/projects/golfhelm.md`, `memory/glossary.md` |
| Wider audit of destructive write paths outside `savePartialRound` | Recommended follow-up | `grep -rE "[.]delete\(\)" src/app/golf/actions/` and triage each (most are user-initiated explicit deletes — those are fine) |

---

*Document author: working session 2026-05-26. This is a snapshot; for living state, read the canonical sources in §1. PRs since this date may have changed file:line citations — always re-verify before acting on a finding.*
