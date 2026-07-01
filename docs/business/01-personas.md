# Personas

> Purpose: Define every human role that touches the Helm Sports Labs suite, what each role can see and do, who actually pays, and where the data each role generates is sensitive enough to require deliberate handling. This is the reference other docs in `docs/business/` (product invariants, data-sensitivity map, etc.) point back to when a decision hinges on "who is this for."

Helm Sports Labs ships a multi-sport SaaS platform (`CLAUDE.md:9`). The flagship, feature-complete product is **GolfHelm** — college golf team management with an embedded AI insight/narrative layer called **CoachHelm** (`CLAUDE.md:9-13`, `src/app/golf/README.md`). CoachHelm is not a separate product or a separate persona surface; it is analytics/AI functionality inside GolfHelm's coach and player dashboards (`memory/context/coachhelm-ai.md`). **BaseballHelm** (college baseball recruiting + team management) and **Lift Lab** (strength & conditioning) are real, shipping surfaces but are under active rebuild — this doc frames them only at the stable, high level needed to reason about personas; it does not document their current implementation (see `fairway_baseballhelm_migration_deferred` memory and `docs/fairway-baseballhelm-migration-plan.md`).

All personas below are scoped by Postgres Row-Level Security (RLS), not application-layer filtering. The tenancy chain is `organization -> team -> coach/player`, enforced by `SECURITY DEFINER` helper functions with `SET search_path = ''` to block search-path attacks: `current_player_id()`, `is_team_coach(team_uuid)`, `is_team_player(team_uuid)` (`docs/v3-rls-template.md:11-57`, `docs/v3-master-plan.md:80-99`). Coach-to-team is via the join table `golf_team_coach_staff` — **never** a `team_id` column on `golf_coaches`, which does not exist (`docs/v3-master-plan.md:96`, `CLAUDE.md`). Player-to-team is via `golf_team_members`, gated to `status = 'active'` (`docs/v3-rls-template.md:9`).

---

## 1. Buyer vs. user — read this first

The **buyer/tenant unit is the program/team**, not the individual coach and never the player. Every top-level row of program data hangs off `organizations` and `golf_coaches.organization_id` (`docs/v3-master-plan.md`, Part II schema inventory). In practice:

- The **program** (an `organizations` row — a college athletic department's golf or baseball program) is the tenant that is provisioned, onboarded, and would be billed in a production packaging model.
- The **head coach** is the primary *user* who acts as the de facto buying decision-maker and administrator of that tenant in day-to-day use, but the repo does not encode a distinct "school AD as payer" persona vs. "coach as payer" persona — this is intentionally left unmodeled in-repo.
- **Players never buy anything.** They are provisioned by the coach/program and are tenant-scoped, read/write-limited users inside the team the coach manages.
- **Admins** (`/golf/admin`) are Helm Sports Labs' own internal operators, not customer-side buyers.

**Billing reality check (do not assume otherwise when reasoning about this doc):** there is no Stripe/billing/subscription/seat-pricing code anywhere in the repo, and no in-repo pricing document for Helm's own products (only competitors' pricing is researched, in `docs/v3-research-competitive-landscape.md`). Any packaging language below (e.g., "per-team," "per-seat") describes the *intended* buyer unit implied by the data model, not an implemented billing plan. The one real, enforced cost-control mechanism today is the **per-coach daily LLM spend cap** — see `src/lib/coachhelm/v3/llm/budget.ts`, backed by `golf_coachhelm_llm_budget` (`coach_id` + `date`, `budget_usd`/`spent_usd`, checked before every `compose()` call) and the team-level `golf_coachhelm_settings.llm_budget_usd_per_day` (`.greptile/instructions.md:139-146`). Demo/prospect accounts exist to support a sales-led adoption motion (see `src/app/golf/admin/demo-sessions`), which is consistent with a program-as-tenant model even though no checkout flow exists.

---

## 2. Golf coach (single persona type)

GolfHelm models exactly one coach persona type for golf — there is no separate "assistant coach" schema entity in golf; role differentiation happens through `golf_team_coach_staff.role` and `is_primary` within the same `golf_coaches` table (`docs/v3-master-plan.md`, Part II: `golf_team_coach_staff` — `team_id, coach_id, role, is_primary`).

### Goals
- Run a team's day-to-day operations: roster, calendar, messaging, announcements, documents, travel (`CLAUDE.md` role/feature ownership table; `memory/context/golfhelm-features.md` features #4–#10).
- Track player performance objectively via Strokes Gained (SG) rather than raw scoring average, and get AI-generated, citation-backed narrative on rounds and trends (`docs/v3-research-golf-domain.md`; `.greptile/instructions.md:139-146`).
- Solve the qualifying/travel-roster selection workflow, explicitly called out in the competitive research as "the most-painful, most-frequent, most-poorly-tooled workflow in college golf" and a stated GolfHelm differentiator (`docs/v3-research-competitive-landscape.md:393`).
- Set and approve player development Goals as a coach-endorsed, first-class object (v3 Goals system, `docs/v3-master-plan.md` Part VI) — a stated point of differentiation from competitors.
- Get an AI assistant (CoachHelm) that behaves like an analyst, not a black box: every LLM-composed insight must cite underlying data and regenerate once before silently falling back to a template (`.greptile/instructions.md:139-146`).

### What they can do
- Full CRUD on their own team's roster, calendar, tasks, messaging, announcements, documents, travel, qualifiers (`golf_qualifiers`, `golf_qualifier_entries`, `golf_qualifier_selections`) and qualifier statuses (`upcoming/in_progress/completed/cancelled`).
- View and configure coach-only analytics surfaces: Alerts (`golf_coach_insights`), Patterns (`golf_patterns_v2`), Insights, Intelligence Hub, CoachHelm Analytics (`golf_insight_effectiveness`) — see the Coach-Only Features table in `CLAUDE.md`.
- Set coaching philosophy / alert thresholds / insight verbosity (`golf_coach_philosophy`) and per-team CoachHelm toggles (`golf_coachhelm_settings`, `golf_team_coachhelm_settings` — a team-level kill switch).
- Chat with CoachHelm (coach-only in v1) with a goal-creation tool exposed to the LLM (`docs/v3-master-plan.md` Part XII).
- Approve or set player Goals; the player-set-Goals path requires coach approval to become "coach-approved" per the stated Goals design.
- Invite/manage other coaches on staff via `golf_team_coach_staff` (role + primary-coach flag).

### Permission scope
- Scoped to the team(s) they are linked to via `golf_team_coach_staff`; RLS enforces this through `is_team_coach(team_uuid)`, never a direct `team_id` FK (`docs/v3-rls-template.md`).
- Cannot see other teams/programs (cross-tenant isolation is an RLS invariant, not an app-layer check — see `03-product-invariants.md` for enforcement rules).
- Primary-coach flag (`is_primary`) implies elevated in-team authority (e.g., final say on qualifier selections, settings) versus assistant/staff coaches on the same team — this is a `role`/`is_primary` distinction within one persona type, not a second coach persona.

### Data sensitivities
- Coaches are the primary consumers of players' academic + athletic performance data (SG stats, round-by-round shot data, qualifying results) and of any development/behavioral notes captured about players — this is the core FERPA/COPPA-adjacent surface (see Section 5 and `docs/business/` compliance-oriented docs).
- Coach philosophy/settings and CoachHelm chat transcripts are coach-private but pertain to real players; a leak here is effectively a player-data leak by another name.
- CRM/coach-outreach code (recruiting/outreach flows) touches TCPA/DNC-adjacent obligations when contacting prospects — a stakes note, not an assertion of current violation.

---

## 3. Assistant coach

Not a distinct schema entity — see Section 2. Framed here separately only because product/business conversations refer to "head coach" and "assistant coach" as if they were different personas, and this doc should make explicit that GolfHelm does not currently model that distinction beyond `golf_team_coach_staff.role` / `is_primary`. Any UI or authorization work that assumes a second `Coach` type, or a different table, is wrong and should be flagged (see `memory/context/golfhelm-database.md` for the actual coach schema before building against an assumed one).

For baseball, coach *typing* is richer at the program level (College/HS/JUCO/Showcase — see Section 6), but that is a program/classification concept, not evidence of a distinct assistant-coach data model either.

---

## 4. Player / student-athlete

### Goals
- See their own performance (SG breakdown by category — Off-the-Tee, Approach, Around-the-Green, Putting — plus round history) contextualized against PGA Tour and team baselines (`docs/v3-research-golf-domain.md`; SG cached in `golf_player_stats_cache`).
- Get an AI round review that is conversational and specific to their round rather than generic ("nobody has it" per competitive research, `docs/v3-research-competitive-landscape.md`).
- Set personal development Goals, optionally sharing them with their coach (default share-with-coach is OFF per the locked v3 decision log — `docs/v3-master-plan.md` Part 0 Q&A summary).
- See qualifying/travel status and their own qualifier entries/selections.
- Use team calendar, messaging, announcements, documents, tasks as a team member — not an administrator of them.

### What they can do
- View and log their own rounds/shots; view their own cached stats and standing.
- Player Hub, Player CoachHelm surfaces, "My Development," "My Qualifiers," "My Round Review" (`CLAUDE.md` — Player dashboard feature list, features #19–#23).
- Create/edit Goals for themselves; visibility to the coach is opt-in, not default.
- Participate in team calendar/messaging/tasks/announcements as a recipient/participant, not as an owner of team-wide configuration.

### Permission scope
- Tenant-scoped to their own team only, via `golf_team_members` and enforced by `is_team_player(team_uuid)`, which additionally requires `status = 'active'` — a `pending`, `inactive`, or `removed` team-member row does not grant access (`docs/v3-rls-template.md`).
- Can see only their own individual performance data and Goals by default; cannot see teammates' Goals, coach-only insights/alerts/patterns, or coach philosophy settings (these are explicitly Coach-Only Features per `CLAUDE.md`).
- Cannot see or act on other teams/programs.

### Data sensitivities — MANY PLAYERS ARE MINORS
- This is the single highest-stakes persona in the system. College rosters include recruits and enrolled athletes who may be minors, and the data captured is **both academic and athletic PII**: performance history, development goals, potentially recruiting/eligibility-adjacent information, and (via CoachHelm chat/round-review) natural-language content about them.
- This sits on **FERPA / COPPA-adjacent ground**. Framed as stakes, not as an assertion of current non-compliance: the product must be built and reviewed as if minors' educational + athletic records are in scope, because for many rosters they are.
- **Account deletion exists** (`src/app/api/account/delete/route.ts`) but cascade cleanup across related tables is documented as incomplete — a retention gap that specifically matters for a minor's PII (see `03-product-invariants.md` for the deletion/retention invariant this implies).
- **No cookie/consent banner** exists in-repo — relevant if/when COPPA-style parental-consent flows become required.
- A cross-tenant RLS leak exposing one team's players to another team, or a broken player/coach RLS boundary exposing player data to the wrong coach, is the worst-case, business-ending failure mode for a student-athlete data product. There is a documented prior RLS incident (`docs/audits/COACH_DASHBOARD_AUDIT_REPORT.md`) — every new table touching player data must ship RLS per `docs/v3-rls-template.md`, and reviewers must treat missing/misconfigured RLS as the top-severity class of bug (see `03-product-invariants.md`).
- Destructive-write risk is elevated on player-adjacent surfaces: roster, qualifier selections, and round-save are explicitly called out as the highest-risk surfaces for the DELETE-then-INSERT anti-pattern ban (`.greptile/instructions.md:69-72`) — a transient failure mid-sequence has previously caused permanent data loss.

---

## 5. Admin (`/golf/admin`)

### Goals
- Operate the platform on Helm Sports Labs' behalf: manage demo/prospect sessions for the sales-led motion, oversee CRM-adjacent tooling, and administer cross-tenant platform concerns that no single coach or team should have access to.
- Support onboarding of new programs and troubleshoot issues that span tenants (which coaches/players cannot do, since they are RLS-scoped to one team).

### What they can do
- Access `/golf/admin` and its subtrees, which in the repo include at minimum: `crm/`, `demo-sessions/`, and general admin dashboard functionality referenced as feature #28 ("Admin Dashboard") in `CLAUDE.md`'s role-context table.
- Create and manage demo/prospect accounts and sessions (`src/app/golf/admin/demo-sessions`) — the operational backbone of a sales-led, pre-billing adoption motion.
- Operate CRM-adjacent outreach tooling (`src/app/golf/admin/crm`) used for prospecting new programs/coaches.

### Permission scope
- This is a **cross-tenant, platform-operator persona**, structurally different from coach/player: it is not scoped to a single `organization`/`team` by the same `is_team_coach`/`is_team_player` RLS helpers. Any admin-surface code or RLS policy must be reviewed with the assumption that admin access, if broadened or leaked, breaks tenant isolation for every program at once — the blast radius is the entire customer base, not one team.
- Admin is a Helm-internal / operator role, not a customer-purchased seat; it sits outside the buyer-vs-user framing in Section 1 entirely (Helm operates it, no program "buys" admin access).

### Data sensitivities
- Because admin is cross-tenant by design, it is the highest-leverage attack surface for a cross-program data leak. Any admin route or admin-scoped query must be held to at least the same RLS/authorization scrutiny as coach/player surfaces, and arguably higher, since a bug here can expose *every* team's players' data rather than one team's.
- Admin-facing CRM/outreach data (prospect coach/program contact info) is business-sensitive but not minor-PII in the same way player data is — still subject to TCPA/DNC stakes noted in Section 2.

---

## 6. Baseball personas (stable high-level framing only)

BaseballHelm covers college baseball recruiting + team management, structurally paralleling GolfHelm's coach/player split but is under active rebuild (`fairway_baseballhelm_migration_deferred` memory; see `docs/fairway-baseballhelm-migration-plan.md` and `docs/audits/BASEBALLHELM_LIFTLAB_GAP_MAP_2026-06-25.md`). This doc intentionally does **not** describe current BaseballHelm table shapes, routes, or RLS specifics — treat any such detail as subject to change and verify against `memory/registry.yml` / the codebase at implementation time, not against this doc.

At a stable, product-framing level:

- **Baseball coach types** are a program-classification concept, not necessarily a distinct data-permission model: **College, High School (HS), JUCO, and Showcase** programs are the recognized coach/program contexts BaseballHelm is built to serve. This distinction matters for recruiting logic (a College coach evaluates; an HS/JUCO/Showcase coach is often the one being recruited *from* or hosting an evaluation event) more than for RLS shape.
- **Recruit persona**: baseball's recruiting workflow implies a "recruit" — a prospective player not yet on a roster, distinct from an enrolled player/student-athlete. A recruit is lower-trust and lower-access by nature (they are the subject of outreach, not yet a tenant-scoped team member), and any recruit contact data inherits the same TCPA/DNC-adjacent outreach stakes noted for coach-side CRM in Section 2. As with all of BaseballHelm, do not assume any specific recruit schema/table without checking current code.
- Lift Lab (strength & conditioning: check-ins, body-map, core lifts) is a module used by baseball (and increasingly golf) team members and coaching staff; mention it here only to note that it adds **physical/health-adjacent data** (body-map, lift logs) to the sensitivity surface for whichever persona uses it — treat that as another category of sensitive minor-adjacent PII when it applies to student-athletes, without asserting current implementation details.

---

## 7. Persona summary table

| Persona | Buyer? | Tenant scope | Primary RLS mechanism | Top data sensitivity |
|---|---|---|---|---|
| Program / organization (tenant) | Yes (intended unit; no billing code exists) | Itself | `organizations` + `organization_id` FKs | Aggregate of all below |
| Head/assistant coach (golf: one type) | De facto decision-maker, not a modeled payer | One or more teams via `golf_team_coach_staff` | `is_team_coach(team_uuid)` | Sees all rostered players' academic+athletic PII |
| Player / student-athlete | No | One team via `golf_team_members` (`status='active'`) | `is_team_player(team_uuid)` | MANY ARE MINORS — FERPA/COPPA-adjacent academic+athletic PII; own data only by default |
| Admin (`/golf/admin`) | No (Helm-internal operator) | Cross-tenant by design | Not the coach/player RLS helpers — requires its own scrutiny | Highest blast radius if leaked/misused |
| Baseball coach (College/HS/JUCO/Showcase) | Same framing as golf coach, program-classified | Program/team (rebuild in progress — do not assume current shape) | Not documented here — verify in code | Recruiting outreach TCPA/DNC stakes |
| Recruit (baseball, high-level) | No — not yet a tenant member | Pre-roster; outreach target | N/A at this framing level | Outreach/contact data stakes |

---

## For the reviewer

- Flag a PR when any new player-facing table or query is missing an RLS policy, or uses app-layer filtering (`WHERE team_id = ...` in application code) instead of `is_team_coach()`/`is_team_player()`/`current_player_id()` as the enforcement boundary — see `docs/v3-rls-template.md`.
- Flag a PR that introduces or assumes a second `Coach` schema type (e.g., a separate `assistant_coaches` table or a hardcoded role check outside `golf_team_coach_staff.role`) — golf coaches are one persona type differentiated only by staff-join role/`is_primary`.
- Flag a PR that grants a player visibility into another player's Goals, another team's data, or coach-only surfaces (Alerts/Patterns/Insights/Intelligence Hub/CoachHelm Analytics per `CLAUDE.md`'s Coach-Only Features table) without an explicit, reviewed sharing mechanism.
- Flag a PR touching `/golf/admin` or any admin route that does not explicitly justify its cross-tenant reach — admin code is the highest-blast-radius surface in the persona model and deserves the most scrutiny, not the least.
- Flag a PR that adds or expands account-deletion, export, or data-retention logic touching player rows without confirming cascade completeness — the existing gap (`src/app/api/account/delete/route.ts`) is a known incomplete-cascade issue for a minors'-PII product, and new code should not add to it.
- Flag a PR that documents or hardcodes BaseballHelm/Lift Lab implementation details as if stable — both are under active rebuild; point authors to `memory/registry.yml` and the current codebase, not to assumptions carried over from golf.
- Flag a PR that invents pricing, seat counts, or billing logic — there is no billing code in this repo today; the only enforced cost control is the per-coach daily LLM budget in `src/lib/coachhelm/v3/llm/budget.ts` / `golf_coachhelm_llm_budget`.
