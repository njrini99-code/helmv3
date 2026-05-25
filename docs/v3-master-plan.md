# CoachHelm v3 — The Final All-In-One Plan
*Schema-verified · Decision-locked · Ultra-organized · Zero hand-waving*

**Status:** Locked 2026-05-24. Source of truth for the v3 upgrade. Every wave PR description must reference its section here.

**Companion reference docs (preserved alongside this plan):**
- [`docs/v3-research-golf-domain.md`](./v3-research-golf-domain.md) — canonical golf knowledge base (SG framework, PGA + college baselines, putt make-% curves, causal chains, lie taxonomy, pressure research, coachable timeframes, full source list). Every v3 generator's causal claims must trace back here.
- [`docs/v3-research-competitive-landscape.md`](./v3-research-competitive-landscape.md) — full competitor analysis (Clippd, DECADE, Arccos, CoachNow, Whoop, 13 total). White-space wedges, what to adopt, what to avoid.

---

## TABLE OF CONTENTS

- **Part 0** — Executive Context
- **Part I** — Organizational Rules (10 rules in force for every wave)
- **Part II** — Verified Schema Inventory (prod, 2026-05-24)
- **Part III** — Locked Decisions (from 7 rounds of Q&A)
- **Part IV** — Namespace & Directory Map
- **Part V** — The Golf-Aware Engine (v3)
- **Part VI** — Goals System
- **Part VII** — Standing Bars
- **Part VIII** — Coach Intent
- **Part IX** — Composite & Causal Insights
- **Part X** — Counterfactual Framing
- **Part XI** — LLM Layer (3 surfaces)
- **Part XII** — Coach Chat
- **Part XIII** — Player Genome
- **Part XIV** — Outcome Causality (feeds existing effectiveness table)
- **Part XV** — Qualifying & Travel Workspace (extends existing schema)
- **Part XVI** — Weekly Coach Email
- **Part XVII** — Practice Rx
- **Part XVIII** — Auto-Ingest Integrations
- **Part XIX** — UX: Coach (Desktop-First)
- **Part XX** — UX: Player (Phone-First)
- **Part XXI** — Backfill Strategy
- **Part XXII** — Notifications
- **Part XXIII** — Wave Sequence Master Doc (34 waves)
- **Part XXIV** — V2 Sunset & Compatibility Shim Registry
- **Part XXV** — Success Metrics & Verification
- **Part XXVI** — Risk Register & Open Questions
- **Part XXVII** — Glossary

---

## PART 0 — EXECUTIVE CONTEXT

### What this is
The definitive, end-to-end specification for upgrading CoachHelm from its current state to a golf-aware, SG-spined, LLM-augmented analytics product for college teams. Every decision is locked. Every schema is verified against prod. Every wave has a file-ownership table.

### Foundations baked into this plan
- **Domain research** — Strokes Gained framework (Mark Broadie, validated against PGA Tour ShotLink), 2024 PGA Tour baselines, D1/D2/D3 scoring averages, putt make-% curves by handicap (Tour 99.4%→5.5% from 3ft→25ft), causal chains (penalty=70% of double bogeys; GIR↔scrambling inverse; proximity→make%; lag distance→3-putt rate), pressure-gap research (Hickman/Metz; Pope/Schweitzer), 13-lie taxonomy, course-type SG premiums, coachable timeframes.
- **Competitive landscape** — Clippd owns college (200+ programs, official NCAA scoring since 2024); DECADE strategic peer ($1,499/team); Arccos owns recreational; Whoop sets team-status coach UX bar; nobody has outcome causality, conversational LLM round review, qualifying workspace, or composite cross-stat insights.
- **Seven rounds of Q&A** — Goals (unified primitive), AI in 3 surfaces, in-round companion deferred, drill compliance dropped, cold-start = PGA + you, engine + manual goal suggestions, both audiences lockstep, coach desktop / player phone, foundation-first, weekly recap deferred, coach intent kept, coach chat Q&A + goal creation, share-with-coach default OFF, any window 1 week-1 season, team rank visible, curated stat list, coach assignment toggle, soft cap at 5, counterfactuals as secondary line, ship-as-ready pace, all features in scope, backfill day-1, coach-only chat v1, full v3 generator rewrite.
- **60+ gap critique amendments** — push/email provider locks, `golf_metrics` real FK, `engine_version` column, RLS helpers, player transfer playbook, cold-start specs, suggestion dismissal, match-play handling, equipment markers, manual coach observations.
- **Prod schema verification** — corrected `golf_coaches.team_id` (doesn't exist; use `golf_team_coach_staff`); `round_format`→`round_type`; SG columns already in `golf_player_stats_cache`; `golf_qualifiers` already exists (extend, don't create); `golf_insight_effectiveness` already tracks outcomes (feed it); `push_subscriptions` exists; `golf_coachhelm_settings` exists (extend with new columns); 8 v2 tables to NOT delete.

### Final shape (one paragraph)
A v3 engine under `v3/` namespaces, 9 SG-spined generators with shared base class auto-injecting standing/counterfactual; unified Goals primitive replacing focus areas + drill compliance; standing bars rendering PGA + team + you on every quantitative surface; coach intent (bubble/maintain/develop/breakout/rehab) modulating engine tone and gate thresholds; composite insights linking 2+ findings via 12 hand-coded rules; counterfactuals as disciplined secondary line ("75.2 → 73.4"); Claude writing prose at exactly 3 surfaces (round review, hero narrative, coach chat with goal-creation tool); player genome surface as identity artifact; outcome causality feeding existing effectiveness table; qualifying/travel workspace extending existing schemas to replace coaches' Google Sheets; Whoop-style weekly coach email; LLM-driven practice plans tied to goals; auto-ingest from Arccos/Garmin/TrackMan; per-audience UX (coach desktop, player phone); day-1 backfill so nothing looks empty. Built in 34 numbered, isolated, single-purpose waves.

---

## PART I — ORGANIZATIONAL RULES (IN FORCE FOR EVERY WAVE)

1. **Namespace isolation.** All new code under `v3/`. V2 files never edited outside explicit cutover waves (W25 + W26).
2. **One purpose per migration.** One table, OR one column, OR one constraint, OR one enum value. Never multiple.
3. **Schema verification before migration writes.** Every migration starts with a `-- VERIFIED:` comment showing the actual `SELECT pg_get_constraintdef(...)` or equivalent query that confirmed prod state.
4. **One wave = one branch = one PR = one ship.** No stacked PRs. Wave N+1 doesn't start until Wave N is merged + deployed + verified.
5. **Migration ships with the code that uses it.** Same PR, never separated.
6. **Idempotent migrations always.** `IF NOT EXISTS`, `IF EXISTS`, `DO $$ ... $$` rename guards.
7. **Enum additions in their own migration before the migration that uses them.** Postgres 55P04 rule.
8. **Test mocks change in the same PR as the code.** Framer-motion drift doesn't repeat.
9. **Environment-dependent flags get explicit guards.** Wrapped in `if (process.env.X)` or equivalent.
10. **Compatibility shims have kill dates.** Registered in `docs/v3-compatibility-shims.md` with `introduced_by`, `removed_by`, `owner`.

**Backfill rule:** Schema migration ships first, verified empty. Backfill cron ships in a separate PR, verified populated. Never combined.

**Rollback discipline:** Every migration includes a `-- ROLLBACK:` comment block with the safe undo SQL. For human-eyes during incidents.

---

## PART II — VERIFIED SCHEMA INVENTORY (PROD, 2026-05-24)

### Already exists — use as-is

| Table / Function | Key columns | Use in v3 |
|---|---|---|
| `golf_players` | `id`, `user_id` (uuid NOT NULL) | RLS helper foundation |
| `golf_coaches` | `id`, `user_id`, `organization_id` | (no team_id — use staff join) |
| `golf_team_coach_staff` | `team_id`, `coach_id`, `role`, `is_primary` | **Coach↔team link** |
| `golf_team_members` | `team_id`, `player_id`, `status` | Player↔team link |
| `golf_teams` | `id`, `name`, `season`, `timezone`, `organization_id` | Cohort + recap scheduling |
| `golf_team_settings` | `team_id`, `timezone`, etc. | (duplicate timezone — prefer `golf_teams.timezone`) |
| `golf_team_coachhelm_settings` | `team_id`, `enabled`, `disabled_*` | Team-level kill switch |
| `golf_coachhelm_settings` | `coach_id`, `team_id`, `user_id`, `enabled`, `auto_insights`, `weekly_summary`, `trend_alerts`, `insight_frequency`, `min_rounds_for_insights`, `focus_areas[]` | **Add v3 columns here** |
| `golf_coach_philosophy` | (33 cols incl. `alert_*`, `priority_*`, `email_digest_enabled`, `insight_verbosity`) | Wave 7 gate continues to use |
| `organizations` | `id`, `name`, `type`, `division`, `conference`, `location_*` | Level cohort source |
| `golf_coach_insights` | `signature`, `evidence` (jsonb), `lifecycle_state`, `outcome_status`, `outcome_metric_*`, `category` | Engine writes here; add `engine_version` in W21 |
| `golf_player_focus_areas` | `area_type`, `target_metric`, `current_value`, `target_value`, `from_insight_id`, `progress_notes` (jsonb), `priority` | **Migrated to `golf_goals` in W20** |
| `golf_rounds` | `round_type` (practice/qualifier/tournament), `status` | Filter by `round_type` |
| `golf_shots` | `lie_before`, `lie_after`, `shot_type`, `club_type`, `miss_direction`, `is_penalty`, `putt_made`, `putt_distance_feet`, `putt_break` | Lie + shot analysis |
| `golf_player_stats_cache` | **`strokes_gained_total/_tee/_approach/_around_green/_putting`** + 30+ stats | **SG ALREADY COMPUTED — read, don't recompute** |
| `golf_round_stats_cache` | Per-round aggregates | Round-level standing |
| `golf_drills` | `slug`, `title`, `category`, `tags[]`, `duration_min`, `difficulty`, `video_url` | Add `impacts_metric_id` in W38 |
| `golf_insight_drill_attachments` | (join) | Practice Rx reuses |
| `golf_insight_effectiveness` | `team_id`, period, `insights_*`, `outcomes_*`, `effectiveness_score`, `predictions_*` | **W35 outcome causality feeds this** |
| `golf_insight_generation_log` | Per-run log | Keep |
| `golf_insight_player_feedback` | Player feedback on insights | Keep |
| `golf_patterns_v2` | Active pattern table | Keep |
| `golf_predictions` | Active prediction rows | Keep |
| `golf_prediction_validations` | Outcome validation | Keep — feeds W35 |
| `golf_prediction_model_performance` | Model perf tracking | Keep |
| `golf_qualifiers` | `name`, `course_id`, `start_date`, `end_date`, `status`, `spots_available`, `rules` | **W29 extends** |
| `golf_qualifier_entries` | `qualifier_id`, `player_id`, `round_id`, `score`, `position`, `total_score`, `total_to_par`, `rounds_completed`, `is_tied` | W29 extends |
| `push_subscriptions` | `user_id`, `endpoint`, `keys`, `expiration_time`, `failed_count` | Notifications use this |
| `golf_player_notification_state` | Notification state per player | Per-category preferences land here |
| `notifications` | General | Reuse |
| `is_golf_team_primary_coach(team_uuid)` RPC | Returns boolean | `is_team_coach()` wraps for consistency |

### Does not exist — safe to create

- `golf_metrics` (W9), `golf_pga_standards` (W10), `golf_player_standing` (W11)
- `golf_goals` (W18), `golf_goal_suggestions` (W19)
- `golf_coach_player_intent` (W27)
- `golf_player_genome` (W33)
- `golf_insight_outcome_attribution` (W35), `golf_coachhelm_coach_weights` (W35)
- `golf_coachhelm_chat_conversations` + `_messages` (W32)
- `golf_coachhelm_llm_calls` + `_llm_budget` (W30)
- `golf_coachhelm_weekly_emails` (W37)
- `golf_player_milestones` (W43+), `golf_coach_notes` (W44+)
- `golf_ingest_connections` + `_sync_log` (W39)
- `golf_practice_sessions` (W41)
- `golf_qualifier_selections` (W29)
- RLS helpers: `current_player_id()`, `current_coach_id()`, `is_team_coach()`, `is_team_player()`, `is_in_team()` (W9)
- `engine_version` column on `golf_coach_insights` (W21)
- `impacts_metric_id` column on `golf_drills` (W38)

### Must NOT delete during cutover

Even in W26 "sunset" — active production tables, not v2 code:
- `golf_predictions`, `golf_prediction_validations`, `golf_prediction_model_performance`
- `golf_insight_effectiveness`, `golf_insight_drill_attachments`, `golf_insight_generation_log`, `golf_insight_player_feedback`
- `golf_patterns_v2`

W26 only deletes v2 **code files** (`v2/reasoning/*`, `v2/nlg/*`, the 9 v2 generator files).

---

## PART III — LOCKED DECISIONS

### Goals
- **One unified concept** named "Goals" replacing focus areas + arcs + drill compliance.
- Created by **player OR coach**. Coach decides per-team whether assigned goals are mandatory or suggested.
- **Player chooses share-with-coach, default OFF.**
- **Window: any duration 1 week to 1 season** (7-365 days).
- **Stat list curated** (~20-30 from canonical registry).
- **Soft cap at 5 active goals** — UI warns, doesn't block.
- **Auto-evaluation at end date**: hit / miss / partial / abandoned. System computes; manual decision on what next.
- **Engine suggests goals** from insights + trends. User can also DIY from a stat picker.

### Standing Bars (PGA + Team + You)
- Universal comparison surface.
- **Cold-start**: PGA + You only when team has <5 players with 5+ rounds. Team marker appears as data fills.
- **Team rank visible to players** — honest feedback.

### AI / LLM
- Claude writes prose at **exactly 3 surfaces**: round-review summary + key takeaway, hero insight on player dashboard, coach chat.
- **Coach chat scope**: Q&A + can create goals from chat (with confirmation).
- **Player chat deferred to v2.**
- Weekly recap: **deterministic templates, no AI opener.**

### Coach Intent
- **Keep, full version** — bubble / maintain / develop / breakout / rehabilitate per player.
- Modulates engine alert thresholds.
- Invisible to player.

### Counterfactuals
- **Secondary line, not headline.** Auto-suppressed below 0.3 strokes (stat noise).

### Dropped from scope
- In-round companion (year 2)
- Recruiting sheet (qualifying workspace replaces as wedge)
- Drill compliance tracking (goals' stat movement IS the measure)
- Parent digest (no audience need)

### Extras in v1
- ✅ Composite insights
- ✅ Player genome
- ✅ Outcome causality (rewired to feed existing `golf_insight_effectiveness`)

### Audience + device
- **Both equally** — every feature ships in lockstep with both surfaces.
- **Coach = desktop-first, player = phone-first.**

### Ship order
- **Foundation first**, then features. No "ship the flashy thing first."

### Day-1 launch
- **Backfill everything.** Focus areas → goals. Standing tables computed for all history. No empty product.

### Notifications
- **Everything ON by default.** User opts out per-category.

### Infrastructure providers
- **Email: Resend** (React Email templates)
- **Push: web-push** (Web Push / VAPID) — verify existing client first (`push_subscriptions` table exists)
- **Feature flags: GrowthBook** (per-coach granularity)

### Architecture
- **`engine_version`** column on `golf_coach_insights` (added W21) → 'v2' default, 'v3' for new generators.
- **`v3:` signature prefix** on all v3-generated insights.
- **`golf_metrics`** real DB table with FK enforcement from goals/standing/genome.
- **Suggestion engine** is its own service, not tied to one cron.

### Engine rewrite
- **Full v3 generator rewrite** with shared base class — shared standing injection, philosophy gate, lie awareness.

---

## PART IV — NAMESPACE & DIRECTORY MAP

```
src/lib/coachhelm/
├── v2/                                ← FROZEN (no edits outside W25 + W26 cutovers)
│   ├── mining/                        ← 9 v2 generators (DELETED in W25)
│   ├── insights/                      ← KEPT (upsert.ts, gate-context.ts)
│   ├── reasoning/                     ← DELETED in W26
│   ├── nlg/                           ← DELETED in W26
│   ├── prediction/                    ← KEPT (wrapped by v3/prediction)
│   ├── learning/                      ← KEPT (outcome-validator remains active)
│   └── orchestrator.ts                ← MODIFIED ONLY in W25 (call v3 generators)
│
├── v3/                                ← All new code
│   ├── metrics/                       (W9)
│   │   ├── registry.ts                ← canonical metric IDs (TS-side)
│   │   ├── types.ts
│   │   └── load.ts                    ← runtime validator
│   ├── standing/
│   │   ├── pga-standards.ts           ← reads from golf_pga_standards
│   │   ├── loader.ts                  ← loadStandingForMetric(playerId, metricId)
│   │   └── types.ts
│   ├── engine/
│   │   ├── generator-base.ts          ← BaseGenerator class
│   │   ├── lie-taxonomy.ts            ← LIE_TYPES canonical enum
│   │   ├── context.ts                 ← PlayerContextPacket
│   │   └── sg-source.ts               ← read SG from golf_player_stats_cache
│   ├── generators/
│   │   ├── putt-distance.ts           (W21)
│   │   ├── putt-bias.ts               (W22)
│   │   ├── approach-miss.ts           (W22)
│   │   ├── scrambling.ts              (W22)
│   │   ├── tee-strategy.ts            (W23)
│   │   ├── par-type.ts                (W23)
│   │   ├── course-mgmt.ts             (W23)
│   │   ├── pressure-gap.ts            (W24)
│   │   └── warmup-hole.ts             (W24)
│   ├── goals/                         (W19)
│   ├── intent/                        (W27)
│   ├── composite/                     (W28 — synthesis + 12 rule files)
│   ├── counterfactual/                (W17)
│   ├── llm/                           (W30+)
│   │   ├── compose.ts
│   │   ├── round-review.ts
│   │   ├── hero-narrative.ts
│   │   ├── coach-chat-agent.ts
│   │   ├── citation-check.ts
│   │   ├── budget.ts
│   │   └── prompts/                   ← versioned templates
│   ├── chat/                          (W32)
│   ├── genome/                        (W33 — 80 dim files + compute)
│   ├── causality/                     (W35 — feeds golf_insight_effectiveness)
│   ├── qualifying/                    (W29 — extends existing tables)
│   ├── recap/                         (W37)
│   ├── practice-rx/                   (W38)
│   ├── ingest/
│   │   ├── arccos/                    (W39)
│   │   ├── garmin/                    (W40)
│   │   └── trackman/                  (W41)
│   ├── events/                        ← event timeline writer
│   ├── notifications/                 (W42)
│   └── foundation/                    (W9)
│       ├── providers.ts
│       ├── email.ts                   ← Resend client
│       ├── push.ts                    ← Web Push (verify existing first)
│       └── flags.ts                   ← GrowthBook client

src/components/golf/coachhelm/
├── (existing components)              ← FROZEN
└── v3/
    ├── StandingBar/                   (W13)
    ├── GoalCard/                      (W19)
    ├── GoalCreationModal/             (W19)
    ├── IntentPill/                    (W27)
    ├── IntentDrawer/                  (W27)
    ├── CompositeBadge/                (W28)
    ├── ChatDrawer/                    (W32)
    ├── GenomeRadar/                   (W34)
    ├── QualifyingBoard/               (W29)
    ├── WeeklyDigestCard/              (W37)
    └── PracticeRxCard/                (W38)

src/app/api/cron/v3/
├── standing-refresh/                  (W11)
├── standing-backfill/                 (W12 — one-shot)
├── goal-evaluator/                    (W19)
├── weekly-recap/                      (W37 — hourly, timezone-filtered)
├── genome-refresh/                    (W33)
└── causality-attribute/               (W35)

src/app/golf/actions/
├── (existing actions)                 ← FROZEN
└── v3/
    ├── goals.ts                       (W19)
    ├── qualifying.ts                  (W29)
    ├── chat.ts                        (W32)
    ├── intent.ts                      (W27)
    └── practice-rx.ts                 (W38)

src/app/api/coachhelm/v3/agent-tools/  (W32 — coach chat tool routes)

supabase/migrations/
└── 2026MMDDHHMMSS_v3_<purpose>.sql   ← one purpose per file

docs/
├── v3-master-plan.md                  (this file)
├── v3-wave-sequence.md                (W9)
├── v3-compatibility-shims.md          (W9)
├── v3-rls-template.md                 (W9)
├── v3-testing-standards.md            (W9)
├── v3-decisions.md                    (W9)
└── v3-player-transfer-playbook.md     (W9)
```

---

## PART V — THE GOLF-AWARE ENGINE (V3)

### V.1 Spine: Strokes Gained

Every v3 generator computes or reads SG. PGA Tour ShotLink-validated framework (Mark Broadie, Columbia).

**SG categories:**
- **SG: OTT** (off the tee — par 4/5 tee shots only)
- **SG: APP** (approach — 30+ yards, includes par-3 tee shots)
- **SG: ARG** (around the green — within 30 yards, not putts)
- **SG: PUTT** (all on-green shots)

**Critical:** SG is already computed and stored in `golf_player_stats_cache` (`strokes_gained_total/_tee/_approach/_around_green/_putting`). **v3 reads from this cache.** No shot-level recomputation needed.

**Cohort baselines for standing:**
- D1 men's: ~73 scoring avg, ~62% FW, ~60% GIR, ~5-7% 3-putt rate
- D2 men's: ~75
- D3 men's: ~76-78
- PGA Tour: ~70.9 scoring avg

**Putt make-% baseline curve (Tour, 2024 — seeds golf_pga_standards):**

| Distance | Make % |
|---|---|
| 3 ft | 99.4% |
| 4 ft | 91.4% |
| 5 ft | 80.7% |
| 6 ft | 70.2% |
| 7 ft | 60.6% |
| 8 ft | 52.9% |
| 10 ft | 41.3% |
| 11-15 ft | 30.1% |
| 15-20 ft | 18.3% |
| 20-25 ft | 12.5% |
| 25+ ft | 5.5% |

### V.1.5 Club granularity — 3-bucket model (amended 2026-05-25)

The shot-tracking module persists `golf_shots.club_type` as one of:
**`driver` · `non_driver` · `putter`**. There is NO per-iron, per-wedge,
or per-hybrid distinction at the data layer. This is intentional — the
mobile shot-entry UX prioritizes fast tap-input over taxonomy fidelity.

Implication for v3 generators + composites:
- "Driver vs lay-up" decisions ARE detectable (driver vs non_driver on tee).
- "Approach proximity by distance" IS detectable (`distance_to_hole_before` buckets).
- "Long-iron vs wedge" distinctions are NOT detectable — use approach
  distance buckets instead.
- "Flyer-lie under-clubbing" can become "flyer-lie over-the-green
  consequence" (lie + result), but not a club-choice prescription.

This constraint is reflected in Part IX.2 (composite rules reworked) and
Part XXVI (risk register addition).

### V.2 Lie taxonomy

```ts
// src/lib/coachhelm/v3/engine/lie-taxonomy.ts
export const LIE_TYPES = [
  'tee', 'fairway', 'first_cut', 'light_rough', 'heavy_rough',
  'flyer_lie',           // grass between face/ball — flagged separately
  'buried_lie',          // ball below grass plane
  'fairway_bunker', 'greenside_bunker', 'plugged_bunker',
  'pine_straw', 'waste_area', 'hardpan', 'divot',
  'mud_ball', 'wet_lie', 'recovery', 'green',
] as const;
```

**Flyer-lie detector** in `approach-miss.ts`: triggers on `lie ∈ {first_cut, light_rough}` AND dry; pattern is consistent long-of-pin from flyer inputs; surfaces as composite insight.

### V.3 Context model

```ts
// src/lib/coachhelm/v3/engine/context.ts
export interface ShotContext {
  // Hole-level
  hole_number: number;
  par: 3 | 4 | 5;
  hole_length_yards: number;
  hole_length_tier: 'short' | 'mid' | 'long';
  dogleg: 'none' | 'left' | 'right';
  hazards_in_landing_zone: HazardType[];
  // Course-level
  course_type: 'links' | 'parkland' | 'desert' | 'mountain' | 'tropical' | 'mixed';
  green_speed_stimp: number;
  firmness: 'soft' | 'medium' | 'firm';
  // Round-level
  round_type: 'practice' | 'qualifier' | 'tournament';
  round_hole_position: number;
  weather?: { wind_mph: number; temp_f: number; precip: boolean };
}
```

### V.4 Generator base class

```ts
// src/lib/coachhelm/v3/engine/generator-base.ts
export abstract class BaseGenerator {
  abstract readonly name: string;
  abstract readonly metricId: MetricId;
  abstract readonly insightType: string;
  abstract readonly category: InsightCategory;
  abstract readonly minSampleN: number;

  constructor(protected readonly playerId: string) {}

  abstract aggregate(): Promise<GeneratorAggregate | null>;
  abstract composeContent(agg: GeneratorAggregate, standing: Standing): {
    title: string;
    content: string;
    evidence: InsightEvidence;
    signature: string;
  };

  async run(): Promise<RunResult> {
    const agg = await this.aggregate();
    if (!agg || agg.sampleN < this.minSampleN) return { id: null, gated: false };

    const standing = await loadStandingForMetric(this.playerId, this.metricId);
    if (!standing) return { id: null, gated: false };

    const composed = this.composeContent(agg, standing);
    const counterfactual = await computeCounterfactual(
      this.playerId, this.metricId, agg.playerValue, standing.pgaValue
    );

    const evidence = {
      ...composed.evidence,
      standing,
      counterfactual,
    };

    return upsertInsight(createAdminClient(), {
      player_id: this.playerId,
      category: this.category,
      insight_type: this.insightType,
      signature: `v3:${composed.signature}`,
      title: composed.title,
      content: composed.content,
      evidence,
    }, { engine_version: 'v3' });
  }
}
```

The base class does four things automatically:
1. Injects standing into `evidence.standing`
2. Computes counterfactual into `evidence.counterfactual`
3. Honors Wave 7 philosophy gate via `upsertInsight` reading `getActiveGate()`
4. Stamps `engine_version: 'v3'` and prefixes signature with `v3:`

### V.5 The 9 v3 generators

| Generator | Metric ID | Causal Claim |
|---|---|---|
| `PuttDistanceGenerator` | `putts_made_<X>_<Y>ft_pct` (5 buckets) | Make % vs PGA curve per distance |
| `PuttBiasGenerator` | `putt_miss_bias_<dir>_pct` | Miss direction (high/low/left/right) |
| `ApproachMissGenerator` | `approach_proximity_<bucket>ft` | Proximity by distance/lie; flyer-lie detector |
| `ScramblingGenerator` | `scrambling_pct_<lie>` | Up-and-down by lie type vs PGA |
| `TeeStrategyGenerator` | `tee_strategy_score` | Driver vs 3W on penalty-prone holes |
| `ParTypeGenerator` | `scoring_par_<n>` | Per-par scoring + length tier |
| `CourseMgmtGenerator` | `penalty_rate_per_round`, `big_number_rate` | Penalty / double bogey avoidance |
| `PressureGapGenerator` | `practice_tournament_delta` | Tournament/qualifier vs practice |
| `WarmupHoleGenerator` | `opening_hole_delta` | Hole 1 vs round avg |

### V.6 What dies in v2

| Component | Wave |
|---|---|
| 9 v2 Tier-1 generator files | W25 |
| `v2/reasoning/` (code) | W26 |
| `v2/nlg/` (code) | W26 |

What stays from v2:
- `v2/insights/upsert.ts` — signature dedup, lifecycle, Wave 7 gate
- `v2/insights/gate-context.ts` — AsyncLocalStorage gate
- `v2/orchestrator.ts` — modified ONCE in W25 to call v3 generators
- `v2/prediction/`, `v2/learning/` — kept; wrapped by v3 services

---

## PART VI — GOALS SYSTEM

### VI.1 Schema (W18)

```sql
CREATE TABLE public.golf_goals (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id         uuid NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  team_id           uuid REFERENCES golf_teams(id) ON DELETE SET NULL,

  created_by_user_id   uuid NOT NULL REFERENCES users(id),
  creator_role         text NOT NULL CHECK (creator_role IN ('player','coach')),
  coach_id_if_assigned uuid REFERENCES golf_coaches(id),

  metric_id         text NOT NULL REFERENCES golf_metrics(metric_id),
  title             text NOT NULL,
  category          text NOT NULL,

  started_at        timestamptz NOT NULL DEFAULT now(),
  ends_at           timestamptz NOT NULL,
  window_days       int GENERATED ALWAYS AS (
                      EXTRACT(DAY FROM (ends_at - started_at))::int
                    ) STORED,

  baseline_value    numeric,                  -- nullable for pending_baseline state
  current_value     numeric,
  target_value      numeric,
  target_source     text CHECK (target_source IN ('manual','team_avg','pga_value','midpoint')),

  state             text NOT NULL DEFAULT 'active'
                    CHECK (state IN ('active','paused','achieved','missed','partial','abandoned','pending_baseline')),
  outcome_evaluated_at timestamptz,

  shared_with_coach   boolean NOT NULL DEFAULT false,
  shared_at           timestamptz,

  coach_assignment_mode text CHECK (coach_assignment_mode IN ('mandatory','suggested')),
  player_accepted_at  timestamptz,
  player_declined_at  timestamptz,
  player_decline_reason text,
  transfer_reason     text,

  origin            text NOT NULL DEFAULT 'manual'
                    CHECK (origin IN ('manual','engine_suggested','from_insight')),
  origin_insight_id uuid REFERENCES golf_coach_insights(id),

  snapshots         jsonb NOT NULL DEFAULT '[]',

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CHECK (ends_at > started_at),
  CHECK (window_days BETWEEN 7 AND 365)
);

CREATE INDEX idx_goals_player_active ON golf_goals(player_id, state) WHERE state = 'active';
CREATE INDEX idx_goals_team_active ON golf_goals(team_id, state) WHERE state = 'active';
CREATE INDEX idx_goals_due_evaluation ON golf_goals(ends_at) WHERE state = 'active';

ALTER TABLE golf_goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY goals_player_own ON golf_goals FOR ALL TO authenticated
  USING (player_id = current_player_id());

CREATE POLICY goals_coach_view ON golf_goals FOR SELECT TO authenticated
  USING (
    is_team_coach(team_id) AND (
      creator_role = 'coach' OR shared_with_coach = true
    )
  );

CREATE POLICY goals_coach_create ON golf_goals FOR INSERT TO authenticated
  WITH CHECK (
    is_team_coach(team_id) AND creator_role = 'coach' AND coach_id_if_assigned = current_coach_id()
  );
```

### VI.2 Suggestions table (W19)

```sql
CREATE TABLE public.golf_goal_suggestions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id       uuid NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  metric_id       text NOT NULL REFERENCES golf_metrics(metric_id),
  suggested_at    timestamptz NOT NULL DEFAULT now(),
  suggested_target_value numeric,
  suggested_window_days  int NOT NULL DEFAULT 30,
  origin_insight_id uuid REFERENCES golf_coach_insights(id),

  state           text NOT NULL DEFAULT 'pending'
                  CHECK (state IN ('pending','accepted','dismissed','snoozed','expired')),
  acted_at        timestamptz,
  snooze_until    timestamptz,

  expires_at      timestamptz NOT NULL DEFAULT (now() + INTERVAL '14 days')
);
```

### VI.3 Lifecycle

```
create
├── player, shared=OFF → state=active
├── player, shared=ON → state=active, shared=true
├── coach, mandatory → state=active, player_accepted_at=NOW (forced)
└── coach, suggested → state=active, player_accepted_at=NULL
                       ├── player accepts → player_accepted_at=NOW
                       └── player declines → state=abandoned

during active
  weekly cron computes current_value, appends snapshots[]

at ends_at (auto-evaluator)
  if hit target → state=achieved
  if improved from baseline → state=partial
  if no movement → state=missed

manual transitions
  user can pause / abandon anytime
```

### VI.4 Creation flow (player phone)

```
┌─────────────────────────────┐
│ New Goal                    │
├─────────────────────────────┤
│ What stat?                  │
│ [Putting → Lag 25+ ft ▾]    │
│ How long? [30 days ▾]       │
│ Current: 11%                │
│ Team avg: 13%               │
│ PGA target: 22%             │
│ Target: [18%]               │
│ Share with coach? ○ Off     │
│ [Cancel]    [Start Goal]    │
└─────────────────────────────┘
```

### VI.5 Engine suggestions

`v3/goals/suggestions.ts` runs after each round and weekly:
- Pick player's top 3 weakest standing-bar gaps (`team_pct < 30`, ≥5 weeks data)
- Pre-fill metric, window=30d, target=midpoint(team_avg, pga_value)
- Insert into `golf_goal_suggestions` (state='pending')
- Player sees as "Suggested" cards on dashboard

### VI.6 Migration from focus areas (W20)

```sql
INSERT INTO golf_goals (
  player_id, team_id, created_by_user_id, creator_role, coach_id_if_assigned,
  metric_id, title, category,
  started_at, ends_at, baseline_value, current_value, target_value,
  state, shared_with_coach, origin, origin_insight_id, snapshots
)
SELECT
  fa.player_id, fa.team_id, fa.coach_id, 'coach', fa.coach_id,
  COALESCE(map_target_metric_to_metric_id(fa.target_metric), 'unknown_metric'),
  fa.title, fa.area_type,
  COALESCE(fa.started_at, fa.created_at),
  COALESCE(fa.completed_at, fa.started_at + INTERVAL '30 days'),
  fa.current_value, fa.current_value, fa.target_value,
  CASE fa.status WHEN 'completed' THEN 'achieved' WHEN 'active' THEN 'active' ELSE 'abandoned' END,
  true,
  'manual',
  fa.from_insight_id,
  COALESCE(fa.progress_notes, '[]'::jsonb)
FROM golf_player_focus_areas fa
WHERE fa.status != 'archived';

ALTER TABLE golf_player_focus_areas RENAME TO _deprecated_golf_player_focus_areas;
-- Drop 90 days later
```

---

## PART VII — STANDING BARS

### VII.1 PGA standards (W10)

```sql
CREATE TABLE public.golf_pga_standards (
  metric_id          text NOT NULL REFERENCES golf_metrics(metric_id),
  display_label      text NOT NULL,
  season             text NOT NULL,

  pga_tour_value     numeric,
  korn_ferry_value   numeric,
  div1_avg_value     numeric,
  div2_avg_value     numeric,
  div3_avg_value     numeric,
  hs_avg_value       numeric,

  pga_p25            numeric,
  pga_p50            numeric,
  pga_p75            numeric,

  source             text,
  updated_at         timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (metric_id, season)
);
```

Seeded with 28+ canonical metrics from registry. Sources: PGA Tour stats page, Shot Scope amateur curves, Arccos data, Broadie's published baselines.

### VII.2 Player standing (W11)

```sql
CREATE TABLE public.golf_player_standing (
  player_id    uuid NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  metric_id    text NOT NULL REFERENCES golf_metrics(metric_id),
  player_value numeric NOT NULL,

  team_avg     numeric,
  team_n       int NOT NULL DEFAULT 0,
  team_pct     numeric,

  level_avg    numeric,                    -- avg across player's division
  level_n      int NOT NULL DEFAULT 0,
  level_pct    numeric,

  pga_value    numeric NOT NULL,
  pga_delta    numeric,

  computed_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, metric_id)
);

CREATE INDEX idx_standing_team_metric ON golf_player_standing(metric_id, team_pct) INCLUDE (player_id);
```

Nightly cron `/api/cron/v3/standing-refresh` (chunked 50 teams per invocation):
- For each team's active players (≥5 rounds), pull SG + traditional stats from `golf_player_stats_cache`
- Compute team percentile via SQL `PERCENT_RANK()`
- Join PGA standards
- Upsert

### VII.3 StandingBar component (W13)

```ts
interface StandingBarProps {
  metric_id: string;
  metric_label: string;
  player_value: number;
  team_avg: number | null;       // null when n<5 → marker omitted
  pga_value: number;
  team_pct?: number | null;
  level_pct?: number | null;
  direction: 'higher_better' | 'lower_better';
  unit: 'percent' | 'strokes' | 'yards' | 'count';
  scale: { min: number; max: number };
  size: 'inline' | 'card' | 'hero';
  show_delta?: boolean;
  show_cohort_text?: boolean;
  ariaLabel?: string;
}
```

**Desktop (card):**
```
┌────────────────────────────────────────────────────────┐
│ 6-15 ft Putting                              ↓ vs team │
│       Team 41%      You 38%        PGA 49%             │
│  ├──────[T]─────────[●]────────────[P]─────────────┤   │
│  0%                                              60%   │
│  Bottom 18% on your team                               │
└────────────────────────────────────────────────────────┘
```

**Mobile (inline):**
```
┌─────────────────────────────┐
│ 6-15 ft Putting   ↓ vs team │
│ T 41% · You 38% · PGA 49%   │
│ ├─[T]─[●]──[P]──────────┤   │
│ Bottom 18% team             │
└─────────────────────────────┘
```

**States per variant:** happy / cold-start (no team marker) / loading / error / empty.

**Accessibility:** auto-derived `ariaLabel`.

### VII.4 Where it appears

Every insight card · every goal card · player dashboard hero · `/dashboard/my-standing` · coach intelligence per-player tile · round review key stats · composite insight cards · genome page.

---

## PART VIII — COACH INTENT (W27)

```sql
CREATE TABLE public.golf_coach_player_intent (
  coach_id  uuid NOT NULL REFERENCES golf_coaches(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,

  narrative_goal text NOT NULL DEFAULT 'develop'
    CHECK (narrative_goal IN ('breakout','maintain','bubble','develop','rehabilitate')),
  alert_posture text NOT NULL DEFAULT 'balanced'
    CHECK (alert_posture IN ('aggressive','balanced','conservative','silent')),
  highlight_categories text[] NOT NULL DEFAULT '{}',
  notes text,

  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_id, player_id)
);
```

**UX:** Roster row pill (color-coded): 🔴 Bubble / 🟢 Maintain / 🟡 Develop / ⭐ Breakout / 🔵 Rehab. Kebab menu → "Set intent" drawer + notes field. Bulk-set across selected players.

**Engine integration:**
- `alert_posture` multiplies Wave 7 confidence threshold (aggressive=0.85×, balanced=1.0×, conservative=1.15×, silent=∞)
- LLM prompt context includes intent string
- **Invisible to player**

---

## PART IX — COMPOSITE & CAUSAL INSIGHTS (W28)

### IX.1 Architecture

```ts
export interface CompositeRule {
  id: string;
  name: string;
  detect: (insights: EvidenceInsight[]) => CompositeMatch | null;
  compose: (match: CompositeMatch) => CompositeContent;
  priority: 'high' | 'urgent';
}
```

Synthesis pass runs after 9 v3 generators. Composites write new `golf_coach_insights` rows with `metadata.composite_rule_id` + `metadata.source_insight_ids`.

### IX.1.5 Data-model constraint (amended 2026-05-25)

The original 12-rule list assumed per-iron / per-wedge club granularity. The
shot-tracking module actually persists a **3-bucket club model**:

  - `driver` (tee shots with driver)
  - `non_driver` (everything else off the tee + every approach + chips)
  - `putter`

Players don't enter "7-iron" vs "PW" — they enter the bucket. This is by
design (lower friction for coach-marked rounds, faster mobile entry).

Implication: any composite rule that hinges on a specific club inside the
non_driver bucket cannot fire from real data. Rules below are reworked
or deferred to match.

### IX.2 The 12 rules (v1 library — reworked for the 3-bucket club model)

| # | Rule | Status | Notes |
|---|------|--------|-------|
| 1 | Short-side scrambling chain | ✅ | lie_before + distance_to_hole_before |
| 2 | Long-approach → 3-putt cascade | ✅ (renamed from "Long-iron → 3-putt cascade") | Uses approach distance bucket 175+ instead of "long iron" |
| 3 | Tee-club mismatch | ✅ | driver vs non_driver on tee + hole-level outcome |
| 4 | Short-approach proximity gap | ✅ (renamed from "Wedge proximity gap") | Uses 50-125 yd approach bucket instead of "wedge" |
| 5 | Pressure decel chain | ✅ | putt distance + putt_made + tournament/practice flag |
| 6 | Closing-hole fatigue | ✅ | hole_number 13-18 vs round avg |
| 7 | Bunker miss-side amplifier | ✅ | lie_before = bunker + miss_direction |
| 8 | Lag-distance → 3-putt | ✅ | putt_distance_feet buckets |
| 9 | ~~Flyer-lie under-clubbing~~ → "Flyer-lie over-the-green" | ✅ reworked | Detects when light_rough lie + dry led to long miss; can't say "wrong club" without club granularity |
| 10 | Doubles after bogey | ✅ | sequential hole scores |
| 11 | Front-9 starter | ✅ | hole 1-3 vs round avg |
| 12 | ~~Cold-weather distance miscalibration~~ | ⏭ deferred | No weather/temperature tracking in shot data |

**11 of 12 implementable** (one renamed for clarity, one reworked, one deferred). The deferred rule waits for a future weather-context wave (not on the v3 roadmap).

### IX.3 Conflict resolution

Rules in priority order. If rule B's source_insight_ids ⊆ rule A's source_insight_ids and A fires, B suppressed.

### IX.4 UI

🔗 "Linked finding" badge. Expanding shows source insights + causal arrow.

---

## PART X — COUNTERFACTUAL FRAMING (W17)

```ts
export async function computeCounterfactual(
  playerId: string,
  metricId: MetricId,
  playerValue: number,
  pgaValue: number,
): Promise<CounterfactualProjection> {
  const baseline = await getPlayer30DayScoringAvg(playerId);
  const strokesSaved = lookupStrokeImpact(metricId, playerValue, pgaValue);
  const timeframe = lookupCoachableTimeframe(metricId);
  return {
    current_baseline_score: baseline,
    projected_score_if_closed: baseline - strokesSaved,
    strokes_saved_per_round: strokesSaved,
    weeks_to_typical_close: timeframe,
  };
}
```

**Discipline:**
- Always footer in lighter weight, never headline
- Auto-suppressed when `strokes_saved_per_round < 0.3`
- Format: *"Closing this gap → 75.2 → 74.5 avg (≈4 wks)"*

**Where shown:** insight cards, goal cards, round review (aggregated top-3 gaps).

---

## PART XI — LLM LAYER (W30+)

### XI.1 Three surfaces only

1. `round_review` → `composeRoundReview()` (W30)
2. `hero_narrative` → `composeHeroNarrative()` (W31)
3. `coach_chat` → `composeCoachChat()` (W32)

### XI.2 compose() wrapper

```ts
export type ComposeTask = 'round_review' | 'hero_narrative' | 'coach_chat';

export interface ComposeRequest {
  task: ComposeTask;
  packet: PlayerContextPacket;
  evidence: Record<string, unknown>;
  audience: 'player' | 'coach';
  tone_hint?: 'urgent' | 'encouraging' | 'neutral' | 'celebratory' | 'cautionary';
  conversation?: ChatMessage[];  // coach_chat only
}

export async function compose(req: ComposeRequest): Promise<ComposeResult>;
```

### XI.3 Citation enforcement per task

| Task | Method | Why |
|---|---|---|
| `round_review` | Tool-grounded — model must call `cite(field, value)` | Highest stakes |
| `hero_narrative` | Regex post-check | High frequency |
| `coach_chat` | Tool-grounded with optional suppression | Multi-turn |

Verification failure: regenerate once. Second failure: fallback to template.

### XI.4 Cost partitioning

```sql
CREATE TABLE public.golf_coachhelm_llm_budget (
  coach_id          uuid NOT NULL REFERENCES golf_coaches(id),
  date              date NOT NULL,
  spent_usd         numeric NOT NULL DEFAULT 0,
  budget_usd        numeric NOT NULL,
  task_class_usage  jsonb NOT NULL DEFAULT '{}',
  PRIMARY KEY (coach_id, date)
);

CREATE TABLE public.golf_coachhelm_llm_calls (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task              text NOT NULL,
  coach_id          uuid REFERENCES golf_coaches(id),
  player_id         uuid REFERENCES golf_players(id),
  prompt_hash       text NOT NULL,
  model_id          text NOT NULL,
  prompt_tokens     int NOT NULL,
  completion_tokens int NOT NULL,
  cost_usd          numeric NOT NULL,
  citations         jsonb,
  verified          boolean NOT NULL,
  fallback_to_template boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now()
);
```

Priority on budget exhaustion: `round_review` > `coach_chat` > `hero_narrative` (fallback to template).

### XI.5 Models (via Vercel AI Gateway)

> **Amended 2026-05-25 (W30 scoping)** — Haiku-only for round_review +
> hero_narrative; Sonnet only retained for coach_chat's multi-step
> tool-call reasoning. Cost reduction: ~$106/team/yr → ~$33/team/yr.

- `round_review` → `anthropic/claude-haiku-4-5` (was Sonnet)
- `hero_narrative` → `anthropic/claude-haiku-4-5`
- `coach_chat` → `anthropic/claude-sonnet-4-6` (multi-step tool calls)

### XI.6 Admin cost dashboard — **DEFERRED past W30**

> **Amended 2026-05-25** — dropped from W30 scope. The two cost tables
> (`golf_coachhelm_llm_calls` + `golf_coachhelm_llm_budget`) still ship
> in W30 because they're load-bearing for budget enforcement and call
> attribution. The admin UI at `/admin/coachhelm/llm-spend` (one page
> rendering total + per-coach + per-task daily/weekly) is the deferred
> piece — until it ships, query the tables directly via Supabase Studio.

### XI.7 Stale-cache decision

**Locked:** existing round reviews NOT auto-rewritten. Original prose preserved unless explicit "✨ Refresh with AI" button.

---

## PART XII — COACH CHAT (W32)

### XII.1 Tool surface

```ts
const COACH_CHAT_TOOLS = [
  'get_player_context',
  'get_player_insights',
  'get_player_standing',
  'get_player_recent_rounds',
  'compare_players',
  'get_team_overview',
  'get_team_patterns',
  'list_player_goals',
  'get_goal_details',
  'create_goal_for_player',  // ★ the one action tool
];
```

Each tool exposed at `/api/coachhelm/v3/agent-tools/<name>` (admin-authenticated).

### XII.2 Goal creation from chat

Coach asks: *"Why is Jordan worse this month?"*
Assistant explains. Then offers:
> *"I can create a goal: 'Lag putting (25+ ft) — 30 days, target 18%, mandatory'. Confirm? [Yes] [Edit] [Cancel]"*

### XII.3 Schema

```sql
CREATE TABLE public.golf_coachhelm_chat_conversations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id    uuid NOT NULL REFERENCES golf_coaches(id),
  title       text,
  pinned      boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.golf_coachhelm_chat_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES golf_coachhelm_chat_conversations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user','assistant','tool')),
  content         text,
  tool_calls      jsonb,
  tool_results    jsonb,
  cost_usd        numeric,
  created_at      timestamptz NOT NULL DEFAULT now()
);
```

### XII.4 UX

Persistent chat icon bottom-right of every coach page → slide-over drawer (desktop) or full-screen modal (mobile). Quick-prompt chips. `/dashboard/coachhelm/chat` full history page.

### XII.5 Player chat — DEFERRED to v2

---

## PART XIII — PLAYER GENOME (W33-W34)

### XIII.1 The 80-dim vector

Stored per-player in `golf_player_genome.vector` (jsonb). Computed nightly via per-dimension functions in `src/lib/coachhelm/v3/genome/dimensions/<name>.ts`.

Eight categories × 10 dimensions: Miss Tendencies, Pressure Response, Recovery Patterns, Course-Type Affinity, Weather Sensitivity, Stamina, Learning Velocity, Strategic Profile.

Each dimension requires ≥ 8 rounds. Below that → `null`. Genome page shows progress.

### XIII.2 Schema

```sql
CREATE TABLE public.golf_player_genome (
  player_id     uuid PRIMARY KEY REFERENCES golf_players(id) ON DELETE CASCADE,
  vector        jsonb NOT NULL,
  computed_at   timestamptz NOT NULL DEFAULT now(),
  rounds_basis  int NOT NULL
);
```

### XIII.3 Display

**Player phone — `/my-game-profile`:** radar chart + strengths / watchouts / course profile.

**Coach desktop — `/dashboard/coachhelm/genome/[playerId]`:** same radar + `/compare?p1=…&p2=…` overlay for lineup decisions.

---

## PART XIV — OUTCOME CAUSALITY (W35-W36)

**Refactored to leverage existing `golf_insight_effectiveness` table.**

### XIV.1 New feeder table

```sql
CREATE TABLE public.golf_insight_outcome_attribution (
  insight_id        uuid NOT NULL REFERENCES golf_coach_insights(id) ON DELETE CASCADE,
  surfaced_at       timestamptz NOT NULL,
  target_metric_id  text NOT NULL REFERENCES golf_metrics(metric_id),
  baseline_value    numeric NOT NULL,
  post_value        numeric NOT NULL,
  delta             numeric NOT NULL,
  n_rounds_before   int NOT NULL,
  n_rounds_after    int NOT NULL,
  lift              numeric,
  attributed_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (insight_id)
);
```

### XIV.2 Coach learned weights

```sql
CREATE TABLE public.golf_coachhelm_coach_weights (
  coach_id      uuid NOT NULL REFERENCES golf_coaches(id),
  insight_type  text NOT NULL,
  intent        text NOT NULL,
  weight        numeric NOT NULL DEFAULT 1.0,
  sample_n      int NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (coach_id, insight_type, intent)
);
```

### XIV.3 Cron

`/api/cron/v3/causality-attribute` nightly (chunked):
1. Select insights surfaced 21+ days ago without attribution
2. Compute metric delta (14d-before vs 21d-after)
3. Write attribution row
4. Update existing `golf_insight_effectiveness` aggregates
5. Bayesian update of `coach_weights`

### XIV.4 Use in ranking (W36)

`rank_score = |strokes_impact| × confidence × coach_weight`. Default weight=1.0 until sample_n≥10.

---

## PART XV — QUALIFYING & TRAVEL WORKSPACE (W29)

**Extends existing `golf_qualifiers` + `golf_qualifier_entries`.**

### XV.0 Routing (resolved 2026-05-24 — Task A finding)

The existing qualifier UI (coach create + list + shared detail + real-time leaderboard + coach round-breakdown + player "Play Qualifier Round" CTA) lives under `src/app/golf/(dashboard)/dashboard/qualifiers/` and `/my-qualifiers/`. It is fully functional for the create/score/view flow.

**W29 does NOT modify those files except for a single link insertion.** Instead:

- The new **selection workspace** lives at a fresh v3 route: `src/app/golf/(dashboard)/dashboard/coachhelm/qualifying/[id]/` — coach-only, gated by `is_team_coach()`. This is where `selection_slots_*`, the "Top 4 LOCKED" UI, the coach-pick reasoning capture, and the travel-brief trigger render.
- The existing `dashboard/qualifiers/[id]/page.tsx` gets a single new element added: a "Manage selections →" link (coach-only) routing to the new v3 page. That is the lone `M:1` file in the W29 ownership table.
- The existing real-time leaderboard component (`QualifierLeaderboardRealtime`) is reused as a child component inside the v3 selection page; not duplicated.

This preserves Rule 1 (namespace isolation) — all new logic lives under v3 paths — while honoring "extend, don't replace" for the existing scoring UI.

### XV.1 Schema additions

```sql
ALTER TABLE golf_qualifiers
  ADD COLUMN selection_slots_total int DEFAULT 5,
  ADD COLUMN selection_slots_coach_pick int DEFAULT 1,
  ADD COLUMN target_tournament_id uuid,
  ADD COLUMN selection_state text DEFAULT 'open'
    CHECK (selection_state IN ('open','scoring','closed','selected'));

CREATE TABLE public.golf_qualifier_selections (
  qualifier_id        uuid NOT NULL REFERENCES golf_qualifiers(id) ON DELETE CASCADE,
  player_id           uuid NOT NULL REFERENCES golf_players(id),
  selection_type      text NOT NULL CHECK (selection_type IN ('top_score','coach_pick')),
  coach_reasoning     text,
  selected_at         timestamptz NOT NULL DEFAULT now(),
  selected_by_user_id uuid NOT NULL REFERENCES users(id),
  PRIMARY KEY (qualifier_id, player_id)
);
```

### XV.2 Coach UX

```
Spring State Qualifier         5 rounds · top 4 + coach's pick · ends Fri
──────────────────────────────────────────────────────────────────────────
                R1     R2     R3     R4    R5    TOTAL    AVG
Maya Chen      +1     +2     E      +1    --    +4       +1.0    🟢 #1
Sam Park       +2     +3     +1     +4    --    +10      +2.5    🟢 #2
Jordan Chen    +5     +4     +2     +3    --    +14      +3.5    🟢 #3
Alex Rivera    +6     +5     +4     +6    --    +21      +5.25   🟢 #4
Tyler Lin      +8     +6     +5     +5    --    +24      +6.0    ⚪ #5

After R4: Top 4 LOCKED. Coach's pick: [Pick ▾]
Reasoning: [_______________________]                [Confirm Selection]
```

### XV.3 Auto travel brief

On `selection_state='selected'`, engine pushes chat message with per-player pre-tournament briefs.

---

## PART XVI — WEEKLY COACH EMAIL (W37)

**Whoop-style. Sunday 18:00 local team time. Hourly cron with timezone filter on `golf_teams.timezone`.**

```sql
CREATE TABLE public.golf_coachhelm_weekly_emails (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id     uuid NOT NULL REFERENCES golf_coaches(id),
  week_start   date NOT NULL,
  payload      jsonb NOT NULL,
  llm_opener   text,
  sent_at      timestamptz,
  opened_at    timestamptz,
  UNIQUE (coach_id, week_start)
);
```

**Content (deterministic + one LLM paragraph):**
```
Your team this week — Mar 14

[LLM-composed paragraph: 4 sentences max, names 2-3 players]

PLAYER MOVEMENTS · ACTIVE GOALS · ATTENTION NEEDED · UPCOMING WEEK
```

Player version of recap: **deferred per locked decision.**

---

## PART XVII — PRACTICE RX (W38)

LLM-driven 7-day practice plans tied to active goals.

```ts
export async function generatePracticeRx(goalId: string): Promise<PracticePlan>;
```

LLM composes plan from goal metric + recent SG profile + drill library. Drills filtered to `golf_drills.impacts_metric_id = goal.metric_id`.

**Drill library content creation** (~50 drills) is parallel content work before W38 ships.

**No compliance tracking** per locked decision — goal's stat movement IS the measure.

---

## PART XVIII — AUTO-INGEST INTEGRATIONS (W39-W41)

```sql
CREATE TABLE public.golf_ingest_connections (
  player_id   uuid NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  provider    text NOT NULL CHECK (provider IN ('arccos','garmin','trackman')),
  access_token_encrypted   text NOT NULL,
  refresh_token_encrypted  text,
  expires_at  timestamptz,
  last_synced_at timestamptz,
  state       text NOT NULL DEFAULT 'active'
              CHECK (state IN ('active','expired','revoked','error')),
  PRIMARY KEY (player_id, provider)
);

CREATE TABLE public.golf_ingest_sync_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   uuid NOT NULL,
  provider    text NOT NULL,
  shots_inserted   int NOT NULL DEFAULT 0,
  rounds_inserted  int NOT NULL DEFAULT 0,
  errors_count     int NOT NULL DEFAULT 0,
  error_detail     text,
  ran_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.golf_practice_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   uuid NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  source      text NOT NULL,
  session_date date NOT NULL,
  shots_data  jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
```

**Priority:** W39 Arccos · W40 Garmin · W41 TrackMan. Scoreboard (Clippd) deferred — partnership discussion first.

---

## PART XIX — UX: COACH (DESKTOP-FIRST)

```
/dashboard
├── /intelligence                       ← Morning Brief default landing
│    ├── (LLM opener)
│    ├── (Player tiles — color-coded)
│    ├── (Chat slide-over)
│    └── /digests                       ← weekly email history
├── /insights                           ← inbox; cohort + composite badges + standing bars
├── /patterns                           ← existing; v3-aware after W25
├── /qualifying                         ← list of qualifying events
│    └── /[eventId]                     ← active leaderboard + selection (W29)
├── /coachhelm
│    ├── /goals/[playerId]              ← player's goals (W19)
│    ├── /genome/[playerId]             ← genome page (W34)
│    ├── /genome/compare                ← lineup overlay
│    ├── /chat                          ← full chat history (W32)
│    └── /team-standing                 ← matrix view
├── /roster                             ← MODIFIED — intent pill (W27)
├── /development                        ← existing; integrates with goals
└── /analytics/coachhelm                ← MODIFIED — outcome causality section (W36)
```

---

## PART XX — UX: PLAYER (PHONE-FIRST)

```
/dashboard (mobile-first)
├── /coachhelm                          ← default landing
│    ├── (Hero insight — LLM narrative wrapper)
│    ├── (Active goals — 2-up cards)
│    ├── (Suggested goals — 1-up cards)
│    └── (Recent rounds + standing trend)
├── /my-development                     ← existing; lists goals
│    └── /standing                      ← full standing matrix (W16)
├── /my-game-profile                    ← genome (W34)
├── /rounds/[id]/review                 ← MODIFIED — LLM prose + counterfactual (W30)
└── /settings
     ├── /devices                       ← Arccos / Garmin / TrackMan (W39+)
     ├── /sharing                       ← per-coach share defaults (W19)
     └── /notifications                 ← per-category toggles (W42)
```

**Hero screen (mobile):**
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

---

## PART XXI — BACKFILL STRATEGY

| Table | Source | Wave |
|---|---|---|
| `golf_pga_standards` | Hand-curated seed in W10 migration | W10 |
| `golf_player_standing` | Compute from existing `golf_player_stats_cache` | W12 (separate PR) |
| `golf_goals` | Migrate from `golf_player_focus_areas` | W20 |
| `golf_coach_player_intent` | Default `narrative_goal='develop'` for every active (coach, player) pair | W27 |
| `golf_player_genome` | First nightly cron run after W33 ships | W33 |
| `golf_insight_outcome_attribution` | Process all insights surfaced 21+ days ago | W35 |

Per Rule 2: each backfill is its own PR, separate from schema migration.

---

## PART XXII — NOTIFICATIONS (W42)

**Per-category preferences land on `golf_player_notification_state` (extend with columns).**

| Category | Default | Channels |
|---|---|---|
| Round review ready | ON | push + in-app |
| Coach assigned you a goal | ON | push + in-app |
| Goal achieved | ON | push + in-app |
| Goal missed | ON | in-app only |
| New insight landed | ON | in-app only |
| Composite insight detected | ON | push + in-app |
| Weekly digest available (coach) | ON | email |
| Coach commented | ON | push + in-app |
| Engine suggested a goal | ON | in-app only |
| Standing percentile changed | OFF | in-app only |

"Quiet mode" toggle overrides everything except round-review-ready + coach-assigned.

---

## PART XXIII — WAVE SEQUENCE MASTER DOC (34 WAVES)

| # | Wave | Scope Summary | Files: C/M/D | Migrations | Depends On |
|---|---|---|---|---|---|
| **W9** | Pre-Foundation Hardening | Docs + decisions + RLS helpers + `golf_metrics` table + seed + provider clients + extends `golf_coachhelm_settings` | C:18, M:2 | 6 (pt2 split per Rule 2 — see Part XXVIII) | — |
| W10 | PGA standards table + seed | `golf_pga_standards` with FK to `golf_metrics` | C:3, M:0 | 2 (table + seed split per Rule 2 + backfill rule) | W9 |
| W11 | Player standing table + nightly cron | `golf_player_standing` + standing-refresh cron + `refresh_player_standing(uuid[])` RPC (covers 15 of 28 metrics direct-from-cache; remaining 13 populated by W21+ generators) | C:5, M:0 | 2 (table + RPC split per Rule 2) | W10 |
| W12 | Standing backfill (one-shot, chunked) | Backfill cron | C:1, M:0 | 0 | W11 |
| W13 | StandingBar component (3 variants, mobile + desktop, all states) | New components | C:8, M:0 | 0 | W9 |
| W14 | Wire standing into V2 generators (additive `evidence.standing`) | V2 generators get standing injection | C:0, M:9 | 0 | W11, W13 |
| W15 | StandingBar adoption — coach insights surface | Render in coach surfaces | C:0, M:2 | 0 | W14 |
| W16 | StandingBar adoption — player insights surface + `/my-standing` | Render in player surfaces | C:2, M:2 | 0 | W14 |
| W17 | Counterfactual + secondary-line UI | `v3/counterfactual` + insight/goal card additions | C:4, M:4 | 0 | W14 |
| W18 | Goals schema + RLS | `golf_goals` table | C:1, M:0 | 1 | W9 |
| W19 | Goals service + creation flow + suggestions table | `v3/goals/` + UI + `golf_goal_suggestions` table | C:14, M:1 | 2 | W18 |
| W20 | Focus areas → goals migration | One-shot SQL + rename old table | C:1, M:0 | 1 | W19 |
| W21 | v3 generator base + `engine_version` + first generator (putt-distance) | Base class + ALTER TABLE | C:5, M:0 | 1 | W10, W13 |
| W22 | v3 generators: putt-bias + scrambling + approach-miss | 3 generators | C:6, M:0 | 0 | W21 |
| W23 | v3 generators: tee-strategy + par-type + course-mgmt | 3 generators | C:6, M:0 | 0 | W22 |
| W24 | v3 generators: pressure-gap + warmup-hole | 2 generators | C:4, M:0 | 0 | W23 |
| W25 | V2 → v3 generator CUTOVER | Orchestrator switches; delete 9 V2 generator files | C:0, M:1, D:9 | 0 | W24 |
| W26 | V2 sunset (code only — NO table drops) | Delete `v2/reasoning/*`, `v2/nlg/*` | C:0, M:0, D:~15 | 0 | W25 |
| W27 | Coach intent + roster pill + drawer | `golf_coach_player_intent` table + UI | C:5, M:1 | 1 | W18 |
| W28 | Composite insights v1 (12 rules + synthesis) | `v3/composite/` + 12 rules + orchestrator hook | C:14, M:1 | 0 | W25 |
| W29 | Qualifying & travel workspace (new v3 route for selection; existing scoring UI untouched) | Schema extension + `golf_qualifier_selections` + new `dashboard/coachhelm/qualifying/[id]` v3 route + "Manage selections" link added to existing `qualifiers/[id]/page.tsx` | C:14, M:1 | 2 | W18 |
| W30 | LLM service wrapper (Haiku) + round-review composer + budget tables (admin dashboard deferred) | `v3/llm/` + 2 budget/call-log tables | C:9, M:1 | 2 | W9 |
| W30.5 | **W28-followup** — remaining 7 composite rules + hole-sequence loader + lie-type shot-source | `v3/composite/rules/*` (7 new) + `v3/composite/hole-sequence-loader.ts` + `v3/engine/shot-source.ts` extension | C:10, M:0 | 0 | W28, W30 |
| W31 | LLM hero narrative on player dashboard | Hero card wrapper | C:2, M:1 | 0 | W30, W30.5 |
| W32 | Coach chat backend + UI + 12 tool routes + conversation schema | Chat agent + drawer + page | C:24, M:0 | 2 | W30 |
| W33 | Player genome schema + nightly compute (chunked) | `golf_player_genome` + 80 dim files + cron | C:14, M:0 | 1 | W11 |
| W34 | Player genome UI (player + coach + compare) | Pages + radar component | C:8, M:0 | 0 | W33 |
| W35 | Outcome causality schema + attribution cron (feeds existing effectiveness) | `golf_insight_outcome_attribution` + `golf_coachhelm_coach_weights` | C:6, M:0 | 2 | W11 |
| W36 | Outcome causality wired into ranking | Insight delivery uses weights | C:0, M:1 | 0 | W35 |
| W37 | Weekly coach email + cron + template | React Email + hourly cron + `golf_coachhelm_weekly_emails` | C:8, M:0 | 1 | W30, W14 |
| W38 | Practice Rx + `impacts_metric_id` on drills | LLM-driven plans + new column | C:8, M:1 | 1 | W19, W30 |
| W39 | Auto-ingest: Arccos | OAuth + adapter + sync + UI | C:10, M:0 | 1 | W18 |
| W40 | Auto-ingest: Garmin | Same shape | C:8, M:0 | 1 | W39 |
| W41 | Auto-ingest: TrackMan + `golf_practice_sessions` | Practice path | C:10, M:0 | 1 | W39 |
| W42 | Notifications preferences + per-category routing | Settings UI + delivery routing | C:6, M:1 | 1 | W19 |

**Total: 34 waves. ~27 migrations total. No two waves modify the same file.**

---

## PART XXIV — V2 SUNSET & COMPATIBILITY SHIM REGISTRY

### XXIV.1 V2 deletion schedule

| Component | Type | Wave |
|---|---|---|
| 9 v2 Tier-1 generator code files | code | W25 |
| `v2/reasoning/` (code) | code | W26 |
| `v2/nlg/` (code) | code | W26 |
| `golf_player_focus_areas` (renamed) | table rename | W20 |
| `_deprecated_golf_player_focus_areas` (drop) | table drop | W20 + 90 days |

### XXIV.2 NEVER deleted (active prod tables)

- `golf_predictions`, `golf_prediction_validations`, `golf_prediction_model_performance`
- `golf_insight_effectiveness`, `golf_insight_drill_attachments`
- `golf_insight_generation_log`, `golf_insight_player_feedback`
- `golf_patterns_v2`

### XXIV.3 Shim registry (in `docs/v3-compatibility-shims.md`)

| Shim | Introduced | Removed | Owner | Notes |
|---|---|---|---|---|
| focus_areas dual-write | W19 | W20 | engine | Both tables written until W20 cutover |
| v2 generators running alongside v3 | W21 | W25 | engine | Different signature space |
| v2 reasoning/nlg referenced by orchestrator | — | W25 | engine | W25 removes references; W26 deletes files |

Every shim has a removal wave or the PR is rejected.

---

## PART XXV — SUCCESS METRICS & VERIFICATION

### XXV.1 Per-wave PR verification checklist (mandatory)

- [ ] Typecheck passes
- [ ] All tests pass
- [ ] Migration verified idempotent (re-run on local twice)
- [ ] Migration's `-- VERIFIED:` block accurate to current prod state
- [ ] `-- ROLLBACK:` comment block present
- [ ] File ownership table at top of PR description accurate
- [ ] No V2 files modified (or, if cutover wave, list deletes explicitly)
- [ ] Backfill (if applicable) shipping in separate PR
- [ ] Compatibility shim registry updated (if applicable)
- [ ] RLS policies on any new table (from `docs/v3-rls-template.md`)
- [ ] Cold-start, loading, error, empty states specified for any new UI
- [ ] Test mocks updated for any new component/hook

### XXV.2 90-day post-launch product metrics

| Metric | Target | Source |
|---|---|---|
| Daily active player rate | ≥ 60% | analytics |
| Goal completion rate | ≥ 35% | `golf_goals` state distribution |
| Goal creation rate per player | ≥ 1.5/month | inserts |
| Coach weekly email open rate | ≥ 70% | `golf_coachhelm_weekly_emails.opened_at` |
| Coach chat sessions per week | ≥ 10/coach | conversations |
| Standing bar rendered everywhere | every insight, every goal | code review |
| LLM cost per coach per day | ≤ budget cap | `golf_coachhelm_llm_budget` |
| Auto-ingest connection rate | ≥ 50% players | `golf_ingest_connections` |
| Composite insight acknowledge rate | ≥ 2× singletons | acknowledged_at |
| Player genome page visit rate | ≥ 30% of players/month | analytics |

---

## PART XXVI — RISK REGISTER & OPEN QUESTIONS

| Risk | Severity | Mitigation |
|---|---|---|
| W29 qualifying UI may already exist; need to extend not replace | HIGH | Task #29 follow-up before W29 starts |
| `web-push` may already be installed | LOW | Task #30 follow-up before W9 starts |
| Practice Rx drill library content not engineered | MEDIUM | ~2 weeks content creation before W38 |
| Vercel cron 300s timeout on W12/W33/W35 backfills | HIGH | Chunked execution per wave |
| LLM cost overruns | MEDIUM | Per-coach budget + admin dashboard W30 |
| Player transfers mid-season | MEDIUM | Documented in `docs/v3-player-transfer-playbook.md` |
| Match play / scramble breaks stats | LOW | v3 filters `round_type IN (practice, qualifier, tournament)` |
| Round-review prose stale-cache after W30 | LOW | Locked: original preserved unless explicit refresh |
| Schema drift between TS metric registry and DB | HIGH | `golf_metrics` real FK; CI check on diff |
| Per-iron/wedge causal claims (Research doc) don't map to data (3-bucket club model) | MEDIUM | Documented constraint in Part V.1.5 + Part IX.1.5. Composite rules + Tier-1 generators rewritten in terms of approach distance + driver/non_driver. Per-club granularity requires shot-entry UX redesign — not on v3 roadmap. |
| Coach turnover (data handoff) | MEDIUM | Per coach: weights archived, chat preserved, intent records preserved |

---

## PART XXVII — GLOSSARY

| Term | Definition |
|---|---|
| **PCP** | Player Context Packet — canonical object every LLM call receives |
| **Standing** | The 3-way visual: PGA + team avg + you, with optional cohort % |
| **Goal** | Time-windowed tracking commitment — replaces focus areas + arcs + drill compliance |
| **Intent** | Coach's narrative posture per player (bubble/maintain/develop/breakout/rehab) |
| **Composite insight** | Multi-source synthesis linking 2+ source insights via a known causal rule |
| **Counterfactual** | Projected score impact if a gap closes — secondary line only |
| **Genome** | 80-dim player identity vector across 8 categories |
| **Causality** | Per-coach learning that grades which insights moved real stats — feeds existing `golf_insight_effectiveness` |
| **Cutover wave** | The only kind of wave that may modify V2 files (W25, W26) |
| **Compatibility shim** | Temporary bridge between V2 and v3 with a registered kill date |
| **SG** | Strokes Gained — Mark Broadie's framework; read from existing `golf_player_stats_cache` |
| **Tier-1 generator** | Insight generator reading raw shot/round data; in v3 inherits from `BaseGenerator` |
| **PGA standard** | The PGA Tour baseline value for a metric, stored in `golf_pga_standards`, anchored to season |
| **Cohort tier** | Division-level grouping (D1/D2/D3/JUCO/NAIA/HS) from `organizations.division` |

---

---

## PART XXVIII — NEXT SESSION KICKOFF

This section exists so the next session can resume execution without re-deriving anything. Read this first when starting work.

### What's done as of 2026-05-24
- All 7 rounds of Q&A locked into Part III
- Golf research baked into Parts V, VII
- Competitive landscape baked into Parts 0, IX, XV
- Prod schema verified against this plan (Part II)
- 60+ gap critique amendments applied
- 34-wave sequence locked (Part XXIII)
- This plan persisted to `docs/v3-master-plan.md`

### Two pre-W9 verification tasks — RESOLVED 2026-05-24

**Task A — Verify W29 qualifying UI scope — RESOLVED**
- Finding: substantial existing UI under `dashboard/qualifiers/` (coach create + list + shared detail with real-time leaderboard + coach round-breakdown) and `dashboard/my-qualifiers/` (player list). Backed by `golf_qualifiers` + `golf_qualifier_entries`. Action validation in `golf.ts` lines 1047-1091.
- Decision: W29 builds the **selection workspace** as a new v3 route at `dashboard/coachhelm/qualifying/[id]` (coach-only). The existing `qualifiers/[id]/page.tsx` is modified only to add a "Manage selections →" link (the single M:1 in W29's ownership table). The real-time leaderboard component is reused inside the v3 page.
- Plan updated: Part XV new section XV.0; Part XXIII W29 row revised to `C:14, M:1` with the new route called out.

**Task B — Verify web-push client already installed — RESOLVED**
- Finding: `web-push@^3.6.7` ✅ installed; `resend@^6.7.0` ✅ also already installed (plan previously assumed Resend needed install); `@growthbook/growthbook` ❌ still needs install in W9-pt3.
- Existing scaffold: `public/sw.js` service worker present, `public/manifest.json` present, `src/components/golf/PushPermissionSoftAsk.tsx` client-side ask present, VAPID env vars wired into `src/app/golf/actions/task-reminders.ts` which uses a defensive `await import('web-push').catch(...)` pattern (legacy from when the package wasn't installed).
- Gap to verify in W9-pt3: confirm a subscription persistence endpoint exists (the `push_subscriptions` table is in Part II but the API write path wasn't located in grep — may be a real gap).
- W9-pt3 revised scope:
  - ✗ Don't reinstall web-push or resend
  - ✓ Install `@growthbook/growthbook`
  - ✓ Build `src/lib/coachhelm/v3/foundation/{push,email,flags}.ts` canonical wrappers
  - ✓ Replace the defensive dynamic-import in `task-reminders.ts` with a normal static import via the new wrapper
  - ✓ Confirm or build the subscription persistence endpoint (otherwise push won't actually deliver)

### Wave 9 sub-batch breakdown

W9 ships as ONE branch (`wave9-foundation`) with three sequential PRs:

**W9-pt1: Docs + decisions** (~2 hours, zero code, zero migrations)
- `docs/v3-wave-sequence.md` — references this plan; tracks per-wave status as they ship
- `docs/v3-compatibility-shims.md` — shim registry (table header + 3 initial rows from Part XXIV.3)
- `docs/v3-rls-template.md` — canonical RLS patterns coach/player/admin can copy
- `docs/v3-testing-standards.md` — required test types per feature category (generators, composites, LLM, RLS, lifecycle)
- `docs/v3-decisions.md` — locked decisions (Part III content + provider names)
- `docs/v3-player-transfer-playbook.md` — edge cases: transfer, multi-team, graduation, new player

**W9-pt2: RLS helpers + `golf_metrics` table + seed + extend `golf_coachhelm_settings`** (~1 day, 6 migrations — split per Rule 2 + backfill rule)

The plan originally specified 3 migrations; in practice Rule 2 ("one purpose per migration") and the backfill rule ("Schema migration ships first, verified empty. Backfill ships in a separate PR/migration, verified populated. Never combined.") force a split. The 5 RLS helpers stay bundled (one logical access-primitive layer introduced together); everything else is one migration per DDL change. Resolved 2026-05-24.

- Migration M1: `current_player_id()`, `current_coach_id()`, `is_team_player()`, `is_team_coach()`, `is_in_team()` (one file — bundled primitive layer; `plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'` matching existing `is_golf_team_primary_coach` convention; `is_team_player` filters `status='active'::team_member_status`)
- Migration M2: `CREATE TABLE golf_metrics` only (schema; no seed)
- Migration M3: seed 28 canonical metrics with `ON CONFLICT (metric_id) DO NOTHING`
- Migration M4: `ALTER TABLE golf_coachhelm_settings ADD COLUMN goal_assignment_default text DEFAULT 'suggested' NOT NULL` + CHECK constraint
- Migration M5: `ALTER TABLE golf_coachhelm_settings ADD COLUMN llm_narrative_enabled boolean DEFAULT false NOT NULL`
- Migration M6: `ALTER TABLE golf_coachhelm_settings ADD COLUMN llm_budget_usd_per_day numeric` + non-negative CHECK constraint
- TS: `src/lib/coachhelm/v3/metrics/registry.ts` (canonical IDs as const + `MetricId` literal-union), `src/lib/coachhelm/v3/metrics/types.ts` (`Metric` + unit/direction/category literal unions matching SQL CHECK), `src/lib/coachhelm/v3/metrics/load.ts` (`loadMetrics`, `loadMetric`, `validateMetricRegistry` CI parity check)

**W9-pt3: Provider clients + local seed scaffolding** (~1-2 days)
- (Only after Task B resolved) Verify or install `web-push`; `src/lib/coachhelm/v3/foundation/push.ts`
- Install `resend`; `src/lib/coachhelm/v3/foundation/email.ts`
- Install `@growthbook/growthbook`; `src/lib/coachhelm/v3/foundation/flags.ts`
- Re-export from `src/lib/coachhelm/v3/foundation/providers.ts`
- `.env.example` additions: `RESEND_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `GROWTHBOOK_API_HOST`, `GROWTHBOOK_CLIENT_KEY`
- `supabase/seed/v3-seed.sql` — fixture data for local dev (one team, 5 players, 10 rounds each, populated standing)

### Exact opening prompt for the next session

Copy-paste this into a new Claude Code conversation in the `~/Downloads/helmv3` repo:

```
Read docs/v3-master-plan.md, then start Wave 9 part 1.

W9-pt1 is the docs subset only — 6 markdown files under docs/.
Do NOT write any code or migrations in this PR. That's pt2 and pt3.

Specifically:
1. Read Part XXVIII for the W9-pt1 file list and brief
2. Create the 6 docs files (content sketches in Part XXVIII; pull from Parts I-XXIV)
3. Open a branch `wave9-foundation`, commit, push, open PR
4. Don't merge — just open the PR for review

Two open tasks to resolve before W9-pt2 starts (also in Part XXVIII):
- Task A: verify W29 qualifying UI exists or not
- Task B: verify web-push package is installed

The plan IS the spec. Don't re-derive decisions. If something seems
unclear, the answer is in Part III (locked decisions) or Part II
(verified schema).
```

### Operational reminders

- Revoke PAT `sbp_05e6...3eec` at https://supabase.com/dashboard/account/tokens after build completes
- Rotate Context7 key + Supabase DB password leaked in prior git history (separate from this plan)
- Project ID: `qmnssrrolpinvwjjnufo` (prod Supabase)
- Vercel project: `prj_qPgC4eErTUsaSmv40EiQMNuTpuEV` (team `team_WYEGBoW9Hpg2tB1QClWuVxc5`)

---

**End of master plan. Source of truth for v3 upgrade. Every wave PR description must reference back to this document.**
