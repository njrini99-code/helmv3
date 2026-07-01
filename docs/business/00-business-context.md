# Helm Sports Labs — Business Context

> Purpose: give any reader — human or AI code reviewer — the business shape of this repo before they touch code: what Helm Sports Labs sells, who buys it, who uses it, what's actually shipped vs. intended, and where the money-and-trust stakes are highest.

This is the entry point for `docs/business/`. Read it first. It does not restate implementation detail already covered by `CLAUDE.md`, `docs/v3-master-plan.md`, or `memory/context/*` — it exists to connect those technical docs to the underlying business (who pays, who is protected, what "correct" means for this product).

---

## 1. What Helm Sports Labs is

**Helm Sports Labs** is a multi-sport SaaS platform for college athletic programs (`CLAUDE.md:9`). The repo is not one product — it's a shared technical spine (`Next.js`, `Supabase`, auth, tenancy, an AI layer, an iOS shell) with sport-specific product surfaces built on top of it. The thesis is that college sports team-management software has been built sport-by-sport and program-by-program, and a shared platform underneath multiple sports amortizes the expensive parts — multi-tenant auth/RLS, an AI coaching-insight engine, iOS delivery, calendar/roster/comms primitives — across products instead of re-building them per sport.

The current shipping/in-progress product set:

| Product | One-line |
|---|---|
| **GolfHelm** | College golf team management (rounds, roster, calendar, qualifiers, comms) plus an embedded AI coaching-intelligence layer — the deepest, most mature product in the repo (`src/app/golf/README.md`). |
| **CoachHelm** | Not a standalone product — the AI insight/narrative engine embedded inside GolfHelm (round reviews, patterns, predictions, coach chat), now extending into baseball (`memory/context/coachhelm-ai.md`, `src/lib/coachhelm/baseball/`). |
| **BaseballHelm** | College baseball recruiting (coach↔player) plus team management (`CLAUDE.md:10`). Actively being rebuilt at the time of writing — see `project_baseballhelm_liftlab_finish_2026_06_25` / `feedback_baseball_remediation_rules` in memory for current state; this doc intentionally does not describe its present implementation. |
| **Lift Lab** | A strength & conditioning module (check-ins, body-map, core lift tracking) attached to the baseball surface. Also mid-change; described here only as a stable product-framing concept, not by current implementation. |

For BaseballHelm and Lift Lab, treat anything beyond the one-liners above as **out of scope for this doc** — they are being actively re-architected and any current-state detail here would rot immediately. Golf is the reference implementation for "what this platform looks like when it's done."

---

## 2. The shared spine

Every product sits on the same four load-bearing layers. A reviewer should assume any change here has cross-product blast radius, even if only one sport's UI is visibly touched.

### 2.1 Auth + tenancy
- Tenancy shape: `organization → team → coach/player`, matching the structure of a real athletic program (a school/org runs multiple teams; each team has coaches and players).
- Isolation is enforced at the **database layer via Postgres Row-Level Security**, not by application-layer filtering (`docs/v3-master-plan.md` Part II; `docs/v3-rls-template.md`). This is a business-critical choice: a bug in an app-layer `WHERE` clause is a routine bug; a bug in RLS is a cross-tenant data leak (see §5).
- Canonical link tables/helpers (do not deviate without updating this doc):
  - Coach↔team: `golf_team_coach_staff` — **never** `golf_coaches.team_id` (that column does not exist) (`docs/v3-master-plan.md:184`).
  - Player↔team: `golf_team_members`.
  - RLS helper functions: `current_player_id()`, `is_team_coach(team_uuid)`, `is_team_player(team_uuid)` — all `SECURITY DEFINER` with `SET search_path` pinned, specifically to close the Postgres search-path-hijack attack class against `SECURITY DEFINER` functions (`docs/v3-rls-template.md:9`).

### 2.2 CoachHelm (the AI layer)
- A composition engine that generates round reviews, hero narratives, and coach-chat responses, all citation-verified against real data before being shown to a coach or player, with a template fallback when the LLM path isn't available or affordable (`.greptile/instructions.md:139-146`).
- This is the layer most exposed to real dollar cost (LLM API spend) and the layer most exposed to trust risk (a hallucinated or uncited claim about a specific athlete is a credibility-ending failure for a coaching product). See §4 and §5.

### 2.3 Capacitor iOS
- The web app ships as a native iOS shell via Capacitor, with a dedicated CircleCI `ios` workflow compiling on Apple-silicon macOS runners (`CLAUDE.md:414-416`). This means UI and data-fetching changes have a second, slower-to-verify deployment target beyond the web app — treat iOS compile as part of "does this ship," not an afterthought.

### 2.4 Stack summary
Next.js 16 App Router, TypeScript strict, Supabase (Postgres + RLS + Deno Edge Functions), Tailwind, Capacitor iOS, Vercel, Datadog, Sentry, plus Python helper scripts under `tools/` (`.greptile/instructions.md:17-19`).

---

## 3. Who the buyer is vs. who the users are

This distinction matters for every product decision, every permission model, and every "who sees this" question.

- **The buyer/tenant is the program or team**, not an individual. The tenancy root is `organizations` and team-scoped settings (`golf_coaches.organization_id`, `golf_teams`), i.e. the purchasing/administrative unit is institutional (an athletic program or team), not a consumer. The repo does not state, and this doc does not assert, whether the actual payer within that institution is an athletic director, a head coach with a discretionary budget, or the school's business office — that's a go-to-market fact not encoded in code and should not be guessed at here.
- **The end users are two distinct personas with very different needs and very different data sensitivity:**
  - **Coaches** — the primary buyer-side users. They manage rosters, run practice/qualifying decisions, and consume the AI layer's insights. In golf there is a single coach type; in baseball, coach type varies (College/High School/JUCO/Showcase) with different recruiting vs. team-management permissions (`CLAUDE.md:242-247`) — noted here as product framing only, not to be treated as golf's model.
  - **Players / student-athletes** — the data-producing end users. **Many are minors.** They generate academic and athletic PII (round/shot data, class schedules for conflict detection, performance history) that the coach and the AI layer consume. This is the single most important fact governing the compliance posture of the whole platform — see §5.
  - **Admins** — a third, thinner persona, for platform-level operations at `/golf/admin` (`CLAUDE.md:134-138`).

Design and access-control decisions should be evaluated against "does this correctly distinguish what a coach may see/do vs. what a player may see/do vs. what is shared team data" — the Feature Ownership tables in `CLAUDE.md` (Coach-Only / Player-Only / Team / Admin) are the working reference for that split in golf today.

---

## 4. Core promise per product

### 4.1 GolfHelm (deepest product — read this section closely)

GolfHelm's promise has two layers: a system-of-record layer and an intelligence layer built on top of it.

**System of record.** Full college golf team management: round and shot-by-shot tracking (50+ stats per round), roster, calendar/scheduling, qualifiers and travel selection, messaging, announcements, tasks, documents, travel logistics, class-schedule conflict detection (`src/app/golf/README.md:16-31`).

**Intelligence layer — CoachHelm.** The differentiated promise is turning that round/shot data into decision support:
- **Strokes Gained analytics** — the canonical statistical model. `SG = baseline_expected_strokes(start_lie) − baseline_expected_strokes(end_lie) − 1`, computed per shot and summed into four categories (Off-the-Tee, Approach, Around-the-Green, Putting) that roll up to `SG:Total` (`docs/v3-research-golf-domain.md`, cited in `.greptile/instructions.md:81-82`). This is the reference model every causal claim the AI layer makes must trace back to.
  - SG values are **cached, not recomputed on read**, in `golf_player_stats_cache` (`docs/v3-master-plan.md` Part II: "SG ALREADY COMPUTED — read, don't recompute"). A reviewer should treat any new code path that recomputes SG inline, or that reads a stale cache without a documented invalidation trigger, as suspect.
  - Because SG is the platform's flagship numeric claim and its most direct point of comparison against competitors (see below), **SG math correctness gets the highest scrutiny bar in the codebase** (`.greptile/instructions.md:81-82`).
- **Insights, patterns, predictions, round reviews** — the CoachHelm engine turns SG and shot-level data into natural-language coaching narrative, always citation-checked against underlying data before display, with a template fallback if the LLM path fails or is over budget.
- **Qualifying / travel-roster selection** — a first-class workflow (`golf_qualifiers`, `golf_qualifier_entries`, `golf_qualifier_selections`) explicitly built because this is described in competitive research as "the most-painful, most-frequent, most-poorly-tooled workflow in college golf" (`docs/v3-research-competitive-landscape.md:393`) and is treated internally as a stated differentiator.
- **Coach-approved player-set Goals** as a first-class object (superseding the older `golf_player_focus_areas` model per `docs/v3-master-plan.md` Part II) — framed competitively as something no rival product treats as first-class.

**Competitive frame** (for context on why the above bars are set where they are, from `docs/v3-research-competitive-landscape.md` — competitor pricing/positioning research exists; GolfHelm's own pricing does not, see §6):
- **Clippd** — the primary threat. The NCAA's official scoring/rankings vendor since 2023, live in 200+ D1 programs, with proprietary Shot Quality / Player Quality metrics. This is the incumbent GolfHelm's SG and insight quality is implicitly benchmarked against.
- **DECADE** — a peer competitor (Combines, Practice Rx-style features).
- **Arccos** — recreational sensor hardware, a different category but adjacent.
- **Whoop** — not a golf competitor, but cited as the UX bar for team-status/coach-facing dashboards.
- Stated differentiation: conversational LLM round review ("nobody has it" per internal research), first-class coach-approved player Goals, and the qualifying/travel-selection workspace.

### 4.2 CoachHelm (as a layer, not a product)
Its promise is: turn raw performance data into trustworthy, cited, sport-specific coaching narrative and decision support, cheaply enough to run per-coach per-day, and degrade gracefully (never silently, never over budget) when it can't. See `memory/context/coachhelm-ai.md` for engine internals; see §5 for the two invariants (citation-verification, budget) that make this promise trustworthy rather than just "an LLM wrapper."

### 4.3 BaseballHelm (high-level only)
Promise, at the framing level only: connect college baseball recruiting (coach↔player, opt-in player activation, pipeline stages) with team management, mirroring the tenancy and AI-layer patterns proven in golf. Do not treat any specific table, route, or workflow as current truth here — the implementation is actively changing; consult `memory/` and the relevant BaseballHelm project docs for current state before making claims.

### 4.4 Lift Lab (high-level only)
Promise, at the framing level only: give strength & conditioning staff and athletes a shared record of training load and readiness (check-ins, body-map, core lifts) integrated with the team roster rather than a separate disconnected tool. Implementation is mid-change; not documented here beyond this framing.

---

## 5. Invariants that protect the business (stakes, not violations)

These are not claims that the product currently violates any law or has a live incident. They describe **why** certain engineering rules exist, framed as stakes to be managed, so a reviewer understands what's actually at risk in a given PR.

### 5.1 Cross-tenant data isolation
The worst-case, business-ending failure mode for a student-athlete data product is a cross-tenant leak — one team, or one program, seeing another's roster, PII, or performance data. Isolation is enforced via Postgres RLS, not app-layer filtering, precisely because RLS fails closed at the database boundary regardless of application bugs (§2.1). There is a documented prior RLS-related incident referenced in `docs/audits/COACH_DASHBOARD_AUDIT_REPORT.md` — treat any new table, any new query pattern, or any change to the RLS helper functions as requiring explicit RLS verification, not assumed correctness.

### 5.2 Minors' PII and the compliance surface
A meaningful share of end users (student-athlete players) are minors, and the data involved spans both **academic** PII (class schedules, used for conflict detection) and **athletic** PII (performance history, development notes, coach observations). This puts the product on **FERPA / COPPA-adjacent ground**. Additionally, any CRM or coach-outreach code (recruiting contact, cold outreach flows) touches **TCPA/DNC** territory. Concretely, as of this doc:
- Account deletion exists (`src/app/api/account/delete/route.ts`), but cascade cleanup across all tables holding a deleted user's data is not confirmed complete — treat any new table holding user-linked PII as needing an entry in the deletion cascade, not assume it's covered.
- There is no cookie/consent banner in the product today.
- None of the above is asserted as a current legal violation — it is the compliance surface a reviewer should weigh before adding new PII-holding surfaces (new tables, new fields, new third-party integrations that receive player data).

### 5.3 Destructive-write ban
DELETE-then-INSERT in **any** save/submit/sync code path is forbidden platform-wide. This is not a style preference — there is a documented prior incident where a transient failure between the DELETE and the INSERT permanently lost user data (`.greptile/instructions.md:69-72`). Use `upsert`/`ON CONFLICT` or stage-and-swap instead. The highest-risk surfaces for this pattern are roster edits, qualifier selections, and round-save — exactly the workflows where a coach or player is mid-task and a lost write is both invisible until too late and impossible to explain. This rule is enforced as a blocking CodeRabbit check platform-wide (`CLAUDE.md:430-435`).

### 5.4 SG / scoring correctness
Because Strokes Gained analytics is GolfHelm's flagship quantitative claim and its most direct comparison point against Clippd, an incorrect SG calculation is not a cosmetic bug — it directly undermines the core value proposition to a coach deciding whether to trust the product's numbers over a competitor's. Every causal or comparative claim CoachHelm's narrative layer makes about a player's performance must trace back to `docs/v3-research-golf-domain.md`.

### 5.5 LLM budget integrity
See §6 — this is both a cost-control and a trust invariant. A budget bypass is bad in two directions: unbounded LLM spend (cost risk), or a coach silently getting template-quality output while believing they're getting AI-composed analysis (trust risk, since the fallback is not visibly distinguished from a genuine outage without checking).

### 5.6 Calendar/scheduling timezone correctness
Calendar and event-scheduling bugs (wrong timezone, wrong RSVP window) are a concrete "high severity for this business" category because a program's practice/qualifier/travel schedule is time-critical, cross-team, and directly tied to competition eligibility windows — not merely a UI inconvenience.

---

## 6. Current build stage

**Products are shipping.** GolfHelm is the mature, deep product; BaseballHelm and Lift Lab are actively shipping features but mid-rebuild (do not treat their current code as stable reference — see §1). CoachHelm (the AI layer) is live in GolfHelm and extending into baseball.

**Billing is not yet implemented.** There is no Stripe integration, no subscription model, no seat-based pricing, and no pricing table anywhere in this repo. Do not invent dollar figures, tier names, or seat counts when discussing packaging — none exist in code. If packaging needs to be discussed in planning docs, it must be explicitly labeled **intended/aspirational**, not documented as shipped fact.

**The only enforced cost control today is the per-coach daily LLM spend cap.** This is a real, code-backed mechanism, not aspirational:
- Implementation: `src/lib/coachhelm/v3/llm/budget.ts` — `checkBudget()` is called before every `compose()` invocation; it reads/upserts a `(coach_id, date)` row in `golf_coachhelm_llm_budget` (`budget_usd`, `spent_usd`), lazily seeding the day's budget from the team default (`golf_coachhelm_settings.llm_budget_usd_per_day`) the first time a coach spends on a given day.
- On exhaustion, the fallback priority is `round_review > coach_chat > hero_narrative → template` — i.e. when budget runs out, the system degrades in that priority order down to a non-LLM template rather than either silently failing or overspending.
- This is currently the platform's one and only enforced unit-economics lever. There is no other cost gate (no per-org budget, no billing-tied throttle) in the repo — treat any new LLM call site that does not route through this budget check as a gap, not an acceptable exception.

**Sales motion:** demo/prospect accounts exist in the product, consistent with a sales-led (not self-serve/PLG) motion — consistent with the buyer being an institutional program rather than an individual consumer (§3). Only *competitors'* pricing has been researched (`docs/v3-research-competitive-landscape.md`); GolfHelm's own pricing is not documented anywhere in-repo.

---

## Sibling business docs

This doc is the index entry point for `docs/business/`. Other docs in this directory (link by relative filename as they're added):

- `01-personas.md` — every human role that touches the platform (coach, player, admin, and buyer-vs-user framing), what each can see/do, and where their data is sensitive enough to need deliberate handling.
- `02-jobs-to-be-done.md` — the concrete jobs a coach, player, and (high-level) baseball/Lift Lab user hire this product to do, so feature work and review can be checked against real jobs rather than a feature-list checklist.
- `03-product-invariants.md` — the enforceable "must/never" rules per product surface (destructive-write ban, RLS patterns, SG correctness, LLM budget integrity), expanded from §5 above.
- `04-workflow-maps.md` — route -> server action -> table -> result traces for every core GolfHelm workflow, with cross-cutting invariants flagged inline.
- `05-revenue-and-packaging.md` — an honest statement of what this repo does and does not implement around money (no billing/pricing in-repo today; see §6 above).
- `06-competitor-positioning.md` — the golf competitive landscape (Clippd, DECADE, Arccos, Whoop) and where Helm is deliberately differentiated, for reviewers judging whether a PR strengthens or dulls the competitive edge.
- `08-golfhelm-business-context.md` — GolfHelm-specific business context (buyer promise, features' business purpose, competitive angle vs. Clippd).
- `09-coachhelm-business-context.md` — the canonical CoachHelm-as-a-layer reference (LLM budget/trust invariants, citation-verification contract, effectiveness ledger), consolidating what's introduced in §2.2/§4.2 above.
- `07-baseballhelm-business-context.md` and `10-liftlab-business-context.md` are intentionally not yet written: BaseballHelm is under active structural change and Lift Lab has no dedicated business doc yet. Their `memory/context/*` brains are also in progress. Until they land, treat baseball recruiting rules as the stable invariants in `03-product-invariants.md` §(d). Keep this index in sync with the actual contents of `docs/business/` as those docs are added.

For technical (not business) context, the equivalent index is `CLAUDE.md` §"GolfHelm Deep Reference (memory/)" and `src/app/golf/README.md` §"Documentation".

---

## For the reviewer

Flag a PR when:

- A new table, column, or query holding player/coach data is added **without** a corresponding RLS policy using the canonical helpers (`current_player_id()`, `is_team_coach()`, `is_team_player()`) — see §2.1 and §5.1.
- A save/submit/sync path performs DELETE-then-INSERT instead of `upsert`/`ON CONFLICT` or stage-and-swap, especially in roster, qualifier-selection, or round-save code — see §5.3.
- SG or any other scoring/stats calculation is recomputed inline instead of reading the cached value in `golf_player_stats_cache`, or is changed without a trace back to `docs/v3-research-golf-domain.md` — see §4.1, §5.4.
- A new LLM call site in CoachHelm does not route through `checkBudget()` / the compose() budget gate, or hardcodes a $/token figure instead of reading `golf_coachhelm_settings.llm_budget_usd_per_day` — see §5.5, §6.
- A new PII-holding table or field for player/coach data is added without considering account-deletion cascade coverage — see §5.2.
- Copy, docs, or code comments state or imply a live pricing plan, tier, or seat price — none exists in-repo; must be labeled intended/aspirational if discussed at all — see §6.
- A change conflates GolfHelm's mature, documented behavior with BaseballHelm/Lift Lab's current (unstable, mid-rebuild) implementation, or cites this doc's BaseballHelm/Lift Lab one-liners as if they were implementation detail — see §1, §4.3, §4.4.
