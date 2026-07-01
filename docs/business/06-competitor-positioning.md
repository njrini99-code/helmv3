# Competitor Positioning

> Purpose: Give reviewers (human and Greptile) a fast way to answer "does this change strengthen or dull our competitive edge?" for every PR that touches GolfHelm's analytics, coaching, or workflow surfaces.

This doc maps the golf competitive landscape, states where Helm is deliberately differentiated, and gives the reviewer lens for catching PRs that quietly erode a differentiator or copy a competitor weakness we have explicitly criticized. Baseball competitors are named separately, for interop only — GolfHelm is the product with a researched, named competitive set; BaseballHelm is not (see grounding note at the end).

Primary source of truth for everything in this doc is `docs/v3-research-competitive-landscape.md`, which itself states: "Every 'this is white space' or 'this is table stakes' claim in the master plan traces back here." Read that file before making a strategic claim not covered below. See also `03-product-invariants.md` for the engineering-level rules that back these positioning claims (SG correctness, LLM citation/regeneration, budget enforcement).

This doc is the competitor-positioning-specific reference — the canonical place for the Clippd/DECADE/Arccos/Whoop landscape, per-competitor criticism, and the reviewer lens. `08-golfhelm-business-context.md` §7 ("Competitive Angle vs. Clippd") and §8 ("Intended Differentiation Not Yet Built") summarize and derive from this doc, expanding the same differentiators into GolfHelm's full business context (personas, features, domain grounding, compliance). If the two ever disagree, this doc wins; update `08-golfhelm-business-context.md` §7-8 to match.

---

## 1. The Golf Competitive Map

### 1.1 Clippd — PRIMARY THREAT

Clippd is not just an analytics vendor, it is infrastructure. The NCAA gave Clippd the official scoring/rankings contract in October 2023 (after Golfstat's 30-year run ended and replacement Spikemark crashed on launch), and Clippd layered "Scoreboard powered by Clippd" on top in 2024. That makes Clippd simultaneously the **official NCAA scoring authority** and the **leading performance-analytics platform** for college golf — 200+ programs as of 2025-2026, including Stanford, Wake Forest women, Georgia Tech, Florida State men. (`docs/v3-research-competitive-landscape.md:10-23`)

**What they do well:**
- Two proprietary 0-200 metrics: **Shot Quality** (per-shot value normalized for conditions/course/lie/weather/altitude) and **Player Quality** (CASE-algorithm skill estimator, 100 ≈ PGA Tour).
- "What To Work On" — personalized, data-driven practice priority list per player (Golf Monthly calls it Clippd's most powerful feature).
- Official Scoreboard / ScoreboardLive — the de facto NCAA college golf homepage now.

**What Clippd's own users criticize** (this is the leverage list — do not let a GolfHelm PR quietly recreate any of these):
- Manual data entry pain if you don't own Arccos/Garmin hardware.
- Strokes Gained metrics described as "hard to interpret" inside the platform.
- Advanced Analytics (team-v-team, player-v-player) locked behind a Pro tier.
- No Smart Scheduler / tee-sheet generation on Scoreboard Standard (coaches asked; Clippd said "phase 2").
- Coach Portal explicitly labeled "first release with more functionality coming soon."

**Where Clippd is structurally vulnerable** (this is where Helm plays):
- No conversational/LLM layer — round summaries are static dashboards, not narrative explanations.
- "What To Work On" is data-driven but **not coach-curated or goals-aware** — it surfaces weaknesses without tying them to a player-set objective.
- No outcome causality: "why did your score change" is a chart, not a thesis.
- Coach-player interaction is comment-thread on posts, not a workflow surface.
- Running official NCAA scoring infrastructure is a distraction from deepening the coaching product.

(`docs/v3-research-competitive-landscape.md:44-57`)

### 1.2 DECADE (Scott Fawcett) — peer, not incumbent

DECADE is the "unexpected strategic peer": a course-management methodology (Distance, Expectation, Correct Target, Analyze, Discipline, Execute) used by 1,000+ college players and 50+ Tour pros, delivered via video, yardage books, an app, and **Combines** (skill tests). DECADE for Colleges is priced at $1,499/team/year — materially cheaper than Clippd's ~$2,440/team/year college pricing. Their **PRACTICE Rx** add-on ($199) auto-generates practice plans per player, which is the closest existing analog to a Helm goals-and-practice loop, but it is drill-library-driven, not goals/cadence/outcome-causality-driven. (`docs/v3-research-competitive-landscape.md:209-233`)

DECADE matters to a code reviewer for one reason: many of the coaches on Helm's roster already teach the DECADE mental model to their players (start lines, expected zones, OB %, doubles avoidance). Any narrative/insight copy that ignores that vocabulary reads as theoretically inferior to people already fluent in DECADE. This is a copy/UX concern, not a data concern, but it recurs in `composeRoundReview` / `composeHeroNarrative` prompt and copy review.

### 1.3 Arccos Caddie — recreational sensor hardware, not a coaching competitor

Arccos sells club-grip sensors that auto-detect shots and compute strokes gained + AI Caddie club recommendations, and gives away a free **Coaches Dashboard** to instructors and several college programs (USC, Alabama, Oklahoma State, FAMU, Howard). It matters to Helm in two ways, not as a head-to-head competitor:

1. It is a **data source**, not a workflow competitor — auto-ingest from Arccos (and Garmin, TrackMan, Full Swing KIT) is table stakes the research calls "non-negotiable... manual data entry is #1 Clippd complaint." (`docs/v3-research-competitive-landscape.md:326`)
2. Its own users complain about ~90% shot-detection accuracy, sensors falling off mid-round, and a confusing SG format redesign. (`docs/v3-research-competitive-landscape.md:143-148`)

Arccos data is shot-only — no practice, no fitness, no strategy, no goals — and its "AI" Caddie is a club recommender, not a coach. That gap is exactly the space Helm's conversational layer and Goals object are meant to occupy.

### 1.4 Whoop — coach-UX bar, explicitly not a golf competitor

Whoop is called out in the research as "**STEAL FROM THIS**," not as competition (`docs/v3-research-competitive-landscape.md:283-298`). It sells recovery/HRV/sleep/strain tracking with a team-coach dashboard (Vector Connect) used in college athletics generally, including a Miami football case study. Three UX patterns are named as things Helm should adopt:

- The **one-glance team-status view** — every player rendered as a color tile.
- The **weekly Monday summary email** — who trended up, who flagged, who needs a conversation.
- Tying **recovery → training prescription → outcome**, the closest existing model in any sport to outcome-causality reasoning.

Reviewers should treat Whoop as a UX/cadence bar for the coach roster dashboard and any weekly-digest feature, never as a golf feature-parity target — Whoop has no golf-domain product.

### 1.5 Second-tier / context players (not head-to-head)

Named for completeness, none of these change Helm's roadmap directly:

- **Golfstat** — legacy scoring engine, lost the NCAA contract in 2023, no strokes gained or shot-level data. Already losing.
- **Golf Genius / CoachNow Academy** — tournament-management infrastructure + video/communication layer (CoachNow "Spaces"). Distribution-channel risk (they could bundle a "good enough" analytics tile), not an analytics threat.
- **Shot Scope, TheGrint, 18Birdies, AimPoint, TrackMan Performance Studio, Hudl** — recreational, hardware-bound, or non-college-team products. 18Birdies' AI Coach (swing-video feedback) is the closest existing thing to a "coach chat" UX that college players see for free, worth knowing about but not worth building against directly. TrackMan's "Tracy" AI is a single drill recommender, not a conversational round-review layer.

Full detail on all twelve profiled companies lives in `docs/v3-research-competitive-landscape.md` — do not duplicate that research here; link to it.

---

## 2. Where Helm Is Deliberately Differentiated

The research is explicit: **do not try to out-stat Clippd, out-coach them.** Clippd's shot-level analytics are excellent; their coaching layer is admittedly v1. GolfHelm's stated wedge is three surfaces, none of which any competitor has shipped:

### 2.1 Conversational LLM round review

Nobody in the competitive set has this. Clippd renders static dashboards. 18Birdies does single-video swing feedback. TrackMan's Tracy gives a single drill suggestion. None of them "sit down with the player and narrate what happened in your round, why, and what to do tomorrow" — and there is direct evidence of unmet demand: GolfWRX has threads of players manually pasting their own stats into ChatGPT to get exactly this. (`docs/v3-research-competitive-landscape.md:333`)

Implemented as `composeRoundReview` / `composeHeroNarrative` / `composeCoachChat` in the CoachHelm AI layer. Per `.greptile/rules.md:139-146`, these MUST verify citations against real data and regenerate once before falling back to template — a review-critical invariant precisely because this is the differentiator. **A round review that is `summarize(stats)` with no causal claim is not a differentiator — it is a parlor trick a static dashboard already does better** (research's own words, `docs/v3-research-competitive-landscape.md:340`).

### 2.2 Coach-approved player Goals as a first-class object

Clippd's "What To Work On" surfaces data-derived weaknesses. DECADE has Combines (skill tests). Neither is player-set, coach-approved, or wired to what the system actually surfaces day to day. The research names this a "strong moat if actually wired in" and, in the same breath, the risk: **"If the Goals workflow doesn't drive what the system surfaces every day, it's a vanity feature"** (`docs/v3-research-competitive-landscape.md:342`). A reviewer's job on any Goals-adjacent PR is to check that a goal object actually changes ranked insights, practice suggestions, or dashboard surfacing — not just that it is stored and displayed on a profile page.

### 2.3 The qualifier / travel-selection workspace

Named directly in the research as "the most-painful, most-frequent, most-poorly-tooled workflow in college golf" — coaches are still running this in Google Sheets: ingest scores → top-4 + coach's-pick reasoning → travel roster → tournament prep packet. Nobody has built a first-class object for it. (`docs/v3-research-competitive-landscape.md:393`)

GolfHelm implements this as `golf_qualifiers` / `golf_qualifier_entries` / `golf_qualifier_selections`, with `QualifierStatus` = `upcoming` / `in_progress` / `completed` / `cancelled`. This is the highest-stakes surface in the doc from an engineering-safety perspective, because it is both a stated differentiator AND on the destructive-write ban's named high-risk list (roster, qualifier selections, round-save) — see `.greptile/rules.md:69-72`. A bug here does not just cost a feature, it costs the workflow coaches are supposed to switch tools for.

### 2.4 Supporting/secondary differentiators named in the research

Not the top three, but referenced by name and worth knowing when reviewing insight/analytics PRs:

- **Standing bars: PGA + team + you in one render.** Cheap to build, "surprisingly differentiating" — but the research warns Clippd could copy this in a sprint once they see it, so it should be the frame every metric is shown through, not a single widget.
- **Composite insights across data sources** — synthesizing across range data, on-course data, and season schedule into one causal statement, not independently reported metrics.
- **Player genome** — a multi-dimensional player identity page, contrasted against Clippd's single Player Quality number.
- **Outcome causality** — called "the single biggest unmet need in the entire space" and the hardest to fake, because it requires shot-level data AND season context AND an LLM AND a feedback loop together.

---

## 3. Where Helm Risks Being Me-Too (named competitor weaknesses we must not recreate)

Each of these is a criticism leveled at a named competitor in the research. If a PR reintroduces the same failure mode inside GolfHelm, it is not a neutral regression — it is copying a weakness we have publicly diagnosed as a reason coaches complain.

| Competitor weakness (source) | Do not recreate this in Helm |
|---|---|
| Clippd: manual entry required without Arccos/Garmin | Any workflow that requires a coach or player to hand-type round data when auto-ingest exists or is planned |
| Clippd: "SG metrics are hard to interpret" | SG surfaced without explanation of what OTT/APP/ARG/PUTT mean or how the number was derived; SG math errors are the single highest numeric-correctness risk in this codebase (`.greptile/rules.md:81-82`) |
| Clippd: Advanced Analytics locked behind Pro tier with no visible reasoning | Silently downgrading a paid/premium AI feature to template output on budget exhaustion without surfacing that to the coach — see `src/lib/coachhelm/v3/llm/budget.ts` fallback priority (`round_review > coach_chat > hero_narrative > template`) |
| Clippd: Coach Portal "first release, more coming" — coach-player interaction is comment-thread only | Coach chat that is a generic message thread with no data context is strictly worse than what CoachNow/Clippd already ship; it must reference the player's actual stats |
| Clippd/DECADE: "What To Work On" / Combines are data-derived but not goals-aware | Insight ranking or practice suggestions that ignore an active coach-approved Goal |
| Golfstat: stats limited to scoring/FIR/GIR/putts ("the three stats that matter most" — an outdated 1990s view) | Any regression of the SG breakdown back down to raw score/FIR/GIR/putts-only reporting |
| Arccos: ~90% shot-detection accuracy, silent misattribution errors | Ingest pipelines that accept obviously-wrong sensor data (e.g., impossible distances) without a sanity check or flag |
| Industry-wide: qualifying still tracked in spreadsheets | Any qualifier/travel-selection change that makes the workflow less trustworthy than a spreadsheet a coach already knows how to audit (e.g., losing selection history, unclear coach's-pick reasoning) |

---

## 4. Baseball and cross-sport naming — interop only, not competitive positioning

BaseballHelm is a separate, actively-changing product (`memory/context/baseballhelm-features.md` is its source of truth; do not treat this doc as covering its current implementation). The only competitor-adjacent names that appear in a baseball context in this repo are **stats/roster import interop targets**, not head-to-head competitors Helm is positioned against:

- **GameChanger** — stats/scorekeeping data source, named for import compatibility.
- **StatCrew** — collegiate stats system, named for import compatibility.
- **PrestoSports** — team-site/stats platform, named for import compatibility.
- **SIDEARM / NCAA XML** — the NCAA's official stats-exchange XML format, named for import compatibility.

Treat any mention of these four names in code or config as a data-format/interop concern (parsing, schema mapping, ID reconciliation), never as a "does this beat GameChanger" positioning question — that framing does not exist for baseball in this repo the way it does for golf vs. Clippd/DECADE/Arccos/Whoop. If a future baseball competitive-landscape doc is written, it belongs in its own file and should not be merged into this one.

---

## 5. How the competitive map maps to enforced code

This section exists so a reviewer can trace a positioning claim back to something checkable in the diff.

| Positioning claim | Enforced by |
|---|---|
| "Round review must be causal, not a summary" | `composeRoundReview` citation-verification + regenerate-once-before-template rule, `.greptile/rules.md:139-146` |
| "SG correctness is the core value prop vs Clippd" | `docs/v3-research-golf-domain.md` as canonical SG reference; SG is cached (not recomputed) in `golf_player_stats_cache`; `.greptile/rules.md:81-82`, `docs/v3-master-plan.md:98` |
| "Qualifier workspace must be more trustworthy than a spreadsheet" | `golf_qualifiers` / `golf_qualifier_entries` / `golf_qualifier_selections`; destructive DELETE-then-INSERT banned on qualifier selections, `.greptile/rules.md:69-72` |
| "Never silently downgrade a paid AI feature" | Per-coach daily LLM budget in `src/lib/coachhelm/v3/llm/budget.ts`, backed by `golf_coachhelm_llm_budget` and `golf_coachhelm_settings.llm_budget_usd_per_day`; fallback priority `round_review > coach_chat > hero_narrative > template` |
| "Goals must actually change what surfaces, not just be stored" | No single enforced check exists today — this is a product-review, not lint-review, obligation; flag in PR review, see `## For the reviewer` below |

Pricing note: Helm's own packaging/pricing is **not yet implemented in-repo** — there is no billing/Stripe/subscription code anywhere in the codebase. Only competitors' pricing (Clippd $2,200–$3,960/yr per team, DECADE $1,499/team/yr, Arccos free coach dashboard) is researched, and it is cited above only to explain competitive positioning, not to imply Helm has settled pricing. The only enforced cost control today is the per-coach daily LLM budget described above.

---

## For the reviewer

Flag a PR when:

- A change to `composeRoundReview`, `composeHeroNarrative`, or `composeCoachChat` reduces the output to a plain stat summary with no causal claim, no citation, or no connection to a Goal — this dulls the single most defensible differentiator in the category (`docs/v3-research-competitive-landscape.md:333-340`).
- A change to the Goals object (schema, API, or UI) does not also change what gets surfaced elsewhere (insight ranking, practice suggestions, coach dashboard) — a goal that only stores and displays is the "vanity feature" failure mode the research names explicitly.
- A change to `golf_qualifiers` / `golf_qualifier_entries` / `golf_qualifier_selections` uses DELETE-then-INSERT anywhere in a save/submit/sync path, or makes selection history/coach's-pick reasoning harder to audit than the Google Sheet it is meant to replace.
- A change to SG computation, display, or caching (`golf_player_stats_cache`) is not traceable to `docs/v3-research-golf-domain.md`, or reintroduces a raw-score/FIR/GIR/putts-only view as the primary stat surface (the Golfstat-era failure mode).
- A change to LLM budget/fallback logic (`src/lib/coachhelm/v3/llm/budget.ts`, `golf_coachhelm_llm_budget`) causes a silent downgrade to template output without any coach-visible signal, or hardcodes a $/token value instead of reading `golf_coachhelm_settings.llm_budget_usd_per_day`.
- A change to ingest (Arccos/Garmin/TrackMan or manual entry) reintroduces the "manual-entry-required" or "silently-accepts-bad-sensor-data" failure modes named as the top user complaints against Clippd and Arccos respectively.
- Any new pricing, tier, seat-count, or dollar figure is added for Helm's own product without corresponding billing code — flag as speculative/undocumented until billing exists.
