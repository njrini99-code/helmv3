# Helm Product Context Pack

> Partner-facing product brief for the Helm Sports Labs suite. Written for two readers: a non-technical partner who needs to understand what we sell and to whom, and an AI agent / n8n automation that needs accurate pointers into the repo. Every claim here is traceable to a repo doc; anything not verifiable is labeled `unverified` or omitted. This doc contains **no** secrets, credentials, or player/customer PII — only pointers.
>
> Ground-truth sources: [docs/business/00-business-context.md](../../business/00-business-context.md), [01-personas.md](../../business/01-personas.md), [02-jobs-to-be-done.md](../../business/02-jobs-to-be-done.md), [03-product-invariants.md](../../business/03-product-invariants.md), [07-baseballhelm-context.md](../../business/07-baseballhelm-context.md), [08-golfhelm-business-context.md](../../business/08-golfhelm-business-context.md), [09-coachhelm-business-context.md](../../business/09-coachhelm-business-context.md), [memory/context/golfhelm-features.md](../../../memory/context/golfhelm-features.md), [memory/context/baseballhelm-features.md](../../../memory/context/baseballhelm-features.md), [CLAUDE.md](../../../CLAUDE.md), [docs/audits/BASEBALLHELM_LIFTLAB_GAP_MAP_2026-06-25.md](../../audits/BASEBALLHELM_LIFTLAB_GAP_MAP_2026-06-25.md).

---

## What Helm is (60-second overview)

**Helm Sports Labs is a multi-sport SaaS platform for college athletic programs.** It is not one app — it is a shared technical spine (Next.js, Supabase/Postgres, auth + tenancy, an AI layer, an iOS shell) with sport-specific products built on top. The thesis: college team-management software has been rebuilt sport-by-sport and program-by-program; a shared platform amortizes the expensive parts (multi-tenant security, an AI coaching-insight engine, iOS delivery, calendar/roster/comms) across products.

The suite as it stands today:

| Product | One-line | Maturity |
|---|---|---|
| **GolfHelm** | College golf team management + embedded AI intelligence — the deepest, reference product | Shipping / mature |
| **CoachHelm** | The AI insight/narrative layer inside GolfHelm (not a standalone product); extending into baseball | Live in golf, extending |
| **BaseballHelm** | College baseball recruiting + team management | Shipping, mid-rebuild |
| **Lift Lab** | Strength & conditioning module (programs, sessions, readiness) used by baseball and golf | Shipping, early / mid-build |
| **Helm Platform** | The shared spine: auth, RLS tenancy, iOS, stack — every product depends on it | Load-bearing |

**Business-model reality:** there is **no billing, Stripe, subscription, or seat-pricing code anywhere in the repo**, and no in-repo pricing for Helm's own products (only competitor pricing is researched). The one enforced cost control is a per-coach daily LLM spend cap. Any packaging language is *intended*, not implemented ([00-business-context.md](../../business/00-business-context.md) §6).

### Tenancy model: org → team → coach/player

Every product uses the same shape, matching a real athletic program:

```
organization (the program / school department = the BUYER/tenant)
   └── team (golf_teams / baseball_teams)
         ├── coach / staff  (linked via a join table, NOT a team_id column)
         └── player / student-athlete  (many are MINORS)
```

- **The buyer is the program/team, never an individual.** Players never buy anything; they are provisioned by the coach ([01-personas.md](../../business/01-personas.md) §1).
- **Isolation is enforced at the database layer via Postgres Row-Level Security (RLS)**, not application-layer filtering. A bug in an app `WHERE` clause is routine; a bug in RLS is a cross-tenant leak of minors' data — the single worst-case, business-ending failure ([00-business-context.md](../../business/00-business-context.md) §2.1, §5.1).
- Canonical links: coach↔team via `golf_team_coach_staff` / `baseball_team_coach_staff` (**never** `golf_coaches.team_id` — that column does not exist); player↔team via `golf_team_members` (`status = 'active'`). RLS helpers `current_player_id()`, `is_team_coach(team_uuid)`, `is_team_player(team_uuid)` are `SECURITY DEFINER` with pinned `search_path`.
- **Admin (`/golf/admin`) is a Helm-internal, cross-tenant operator role** — outside the buyer/user model, highest blast radius if leaked.

---

## GolfHelm

**One-line:** Full college golf team management (rounds, roster, calendar, qualifiers, messaging) with an embedded AI intelligence layer — the deepest, most mature product and the reference implementation for the platform.

### Buyer vs users
| | |
|---|---|
| **Buyer / tenant** | The golf program (an `organizations` row); sales-led motion (demo/prospect accounts exist, no self-serve checkout) |
| **Primary user** | Golf coach — one persona type; role/authority differ via `golf_team_coach_staff.role` + `is_primary`, not a second schema type |
| **End users** | Players / student-athletes — the data-producing users; **many are minors**, generating academic + athletic PII (FERPA/COPPA-adjacent) |
| **Admin** | Helm-internal operators at `/golf/admin` (cross-tenant ops) |

### Top jobs-to-be-done ([02-jobs-to-be-done.md](../../business/02-jobs-to-be-done.md) §1–2)
1. **Pick who travels** — a single qualifying/travel-selection workspace replacing spreadsheets (the stated #1 differentiator; "most-painful, most-poorly-tooled workflow in college golf").
2. **Know who is improving and why** — Strokes Gained (SG), split OTT/APP/ARG/PUTT, plus AI-detected patterns, not raw scoring average.
3. **Run practice and the team calendar** — one surface for practice, tournaments, qualifiers, travel, and class-conflict detection.
4. **Message the team** — realtime messaging + acknowledgement-tracked announcements (replace GroupMe/email).
5. **Set and approve player goals** — coach-endorsed, measurable development goals as a first-class object.

### Key surfaces / routes (all under `/golf/*`; see [CLAUDE.md](../../../CLAUDE.md) Feature Ownership tables)
| Area | Route | Primary table |
|---|---|---|
| Round entry (4-step wizard, 15s auto-save) | `/golf/dashboard/rounds/new` | `golf_rounds` / `golf_holes` / `golf_shots` |
| Qualifiers / travel selection | `/golf/dashboard/qualifiers` | `golf_qualifiers`, `golf_qualifier_selections` |
| Stats & analytics (SG, cached) | `/golf/dashboard/stats` | `golf_player_stats_cache` |
| CoachHelm alerts/patterns/insights | `/golf/dashboard/{alerts,patterns,insights,intelligence}` | `golf_coach_insights`, `golf_patterns_v2` |
| Calendar & events | `/golf/dashboard/calendar` | `golf_events` |
| Roster | `/golf/dashboard/roster` | `golf_team_members` + `golf_team_coach_staff` |
| Round Review (AI) | `/golf/dashboard/rounds/[id]/review` | `golf_round_reviews` |
| Admin (platform ops) | `/golf/admin` | multiple |

### Must-never-break invariants (cite [03-product-invariants.md](../../business/03-product-invariants.md))
- **SG math correctness** (§c) — `SG = baseline_expected(start) − baseline_expected(end) − 1`, four fixed categories, cached in `golf_player_stats_cache` (never recomputed on read), every causal claim traceable to [docs/v3-research-golf-domain.md](../../v3-research-golf-domain.md). Highest numeric-correctness bar in the codebase.
- **RLS-first tenancy** (§a) — coach↔team via `golf_team_coach_staff`, never `golf_coaches.team_id`; RLS enabled in the same migration as every new table.
- **No destructive DELETE-then-INSERT** (§f) — highest-risk surfaces: roster, qualifier selections, round-save (documented prior data-loss incident).
- **Calendar timezone correctness** (§b) — store UTC, render in team timezone; test recurrence across DST.
- **LLM budget integrity** (§e) — see CoachHelm below.

### Current maturity / state
Mature and shipping; 28 tracked features, most complete ([memory/context/golfhelm-features.md](../../../memory/context/golfhelm-features.md)). ~74 `golf_*` tables in production. **Known honest gap:** SG columns exist in the stats cache but are documented as **not yet populated from shot data**, and offline shot-sync via IndexedDB is disabled — treat "fix stats" PRs skeptically. Positioned against **Clippd** (NCAA's official scoring/rankings vendor since 2023, 200+ D1 programs): strategy is "don't out-stat them, out-coach them" — win on conversational LLM round review, the qualifying workspace, and goals-driven insights ([08-golfhelm-business-context.md](../../business/08-golfhelm-business-context.md) §7).

### Deep docs
[08-golfhelm-business-context.md](../../business/08-golfhelm-business-context.md) · [memory/context/golfhelm-features.md](../../../memory/context/golfhelm-features.md) · [memory/context/golfhelm-database.md](../../../memory/context/golfhelm-database.md) · [src/app/golf/README.md](../../../src/app/golf/README.md) · [docs/v3-research-golf-domain.md](../../v3-research-golf-domain.md)

---

## CoachHelm (the AI layer)

**One-line:** Not a standalone product — the AI insight/narrative engine embedded inside GolfHelm (round reviews, patterns, predictions, coach chat), now extending into baseball. It turns raw performance data into trustworthy, cited, cheap-to-run coaching narrative.

### Buyer vs users
No separate buyer, SKU, or pricing — its trust and cost properties are inherited by the host product (GolfHelm today). Users are the same golf coaches and players; coach chat is coach-only in v1 ([09-coachhelm-business-context.md](../../business/09-coachhelm-business-context.md)).

### Top jobs-to-be-done ([02-jobs-to-be-done.md](../../business/02-jobs-to-be-done.md) §3)
1. **Get a plain-language round review** — narrative that ties specific holes/shots to causes (`composeRoundReview`); the named category white-space vs. Clippd ("nobody has it").
2. **Talk to a coaching assistant** — natural-language Q&A grounded in a player's real data (`composeCoachChat`).
3. **Trust the number behind the narrative** — every causal/comparative claim traces back to [docs/v3-research-golf-domain.md](../../v3-research-golf-domain.md), not an LLM guess.

### Key surfaces / internals
- Three server-only composers: `composeRoundReview`, `composeCoachChat`, `composeHeroNarrative`.
- Budget gate: [src/lib/coachhelm/v3/llm/budget.ts](../../../src/lib/coachhelm/v3/llm/budget.ts) — `checkBudget()` before every `compose()`; reads/upserts `golf_coachhelm_llm_budget` (`coach_id` + `date`), seeded from `golf_coachhelm_settings.llm_budget_usd_per_day`.
- V2 engine (mining/scoring/NLG): [memory/context/coachhelm-ai.md](../../../memory/context/coachhelm-ai.md).
- Effectiveness ledger: `golf_insight_*` tables (`outcome_status`: pending/improved/no_change/worsened/inconclusive).

### Must-never-break invariants ([03-product-invariants.md](../../business/03-product-invariants.md) §e)
- **Per-coach daily spend cap before every LLM call** — the only enforced cost control in the repo; skipping it is a runaway-cost incident. Default budget resolves to **0** (safe) when no staff/settings row exists — never "fix" that to a nonzero fallback.
- **Never hardcode $/token math outside `budget.ts`.**
- **Citation-verify → regenerate once → template fallback**; never surface an ungrounded claim.
- **Never call the LLM client-side**; V2 scoring functions (`v2/insights/`, `v2/composite/`) must stay pure (no fetches/Supabase inside scoring).
- **On exhaustion, fall back to template — never silently, never over budget.** Priority order: `round_review > coach_chat > hero_narrative → template`. Keep `budget_zero` and `budget_exhausted` distinct.

### Current maturity / state
Live in GolfHelm; extending into baseball ([src/lib/coachhelm/baseball/](../../../src/lib/coachhelm/baseball/)). **Known gaps:** philosophy-weighted insight ranking and outcome/effectiveness tracking are documented as incomplete ("Insight ranking unused," "Effectiveness tracking not wired").

### Deep docs
[09-coachhelm-business-context.md](../../business/09-coachhelm-business-context.md) · [memory/context/coachhelm-ai.md](../../../memory/context/coachhelm-ai.md)

---

## BaseballHelm

**One-line:** A college baseball recruiting + team-management operating system — recruiting pipeline, roster, player info, stats, and team ops in one premium place instead of spreadsheets.

> **Under active rework.** Trust DB enums/RLS as ground truth; treat route/behavior detail as current-state, not a frozen contract ([07-baseballhelm-context.md](../../business/07-baseballhelm-context.md)).

### Buyer vs users
| | |
|---|---|
| **Buyer / tenant** | The baseball program/coach |
| **Coach personas** | Head coach; assistant/recruiting coordinator (capability flags on `baseball_team_coach_staff`, e.g. `can_manage_roster`, `can_manage_stats`); S&C coach (Lift Lab). **Coach market types:** College, JUCO, High School, Showcase — only **College and JUCO recruit** |
| **End users** | Player / recruit — **often a minor**; owns their profile and recruiting opt-in; mobile-first |

### Top jobs-to-be-done ([07-baseballhelm-context.md](../../business/07-baseballhelm-context.md) §4, [02-jobs-to-be-done.md](../../business/02-jobs-to-be-done.md) §4)
1. **Find and track recruits** — move a player through the recruiting pipeline (Discover → watchlist → stages).
2. **Manage roster and staff** — non-destructive membership ops, capability-scoped staff.
3. **Keep stats honest and in one place** — canonical box-score → season rollup; idempotent imports.
4. **Run day-to-day team ops** — calendar, announcements, tasks, travel, practice — fast enough between innings, on mobile.
5. **Player activates recruiting (opt-in)** — anonymized vs. identified interest.

### Key surfaces / routes (under `/baseball/*`; see [memory/context/baseballhelm-features.md](../../../memory/context/baseballhelm-features.md))
| Area | Route |
|---|---|
| Coach cockpit | `/baseball/dashboard/command-center` |
| Recruiting pipeline (Kanban) | `/baseball/dashboard/pipeline` |
| Prospect search | `/baseball/dashboard/discover` |
| Watchlist | `/baseball/dashboard/watchlist` |
| Stats Lab / box score | `/baseball/dashboard/stats-center`, `/baseball/dashboard/stats/games` |
| Player home (mobile-first) | `/baseball/player/today` |
| Recruiting opt-in | `/baseball/dashboard/activate` (blocks college players) |
| Lift Lab entry (S&C) | `/baseball/dashboard/performance` |

### Must-never-break invariants ([03-product-invariants.md](../../business/03-product-invariants.md) §d; [07-baseballhelm-context.md](../../business/07-baseballhelm-context.md) §3)
- **Recruiting is opt-in**; a player must explicitly set `recruiting_activated`; **college players can never activate**.
- **Recruitability gate** — recruit-off / private / college / own-roster players must never surface as recruitable.
- **Pipeline stages are exactly 5**: `watchlist`, `high_priority`, `offer_extended`, `committed`, `uninterested` (the `baseball_pipeline_stage` enum). Any other value is a bug. *(Known drift: the pipeline UI renders 7 columns while the DB enum has 5; the two extra values are cast client-side and rejected by Postgres on write.)*
- **Team data isolation** — tenancy resolved server-side; never trust a client-supplied team/coach/player id; no cross-team reads/writes.
- **Stat honesty** — atomic box-score saves; starved metrics render "no data," never a fabricated `.000`. Idempotent imports (re-import merges, never duplicates).
- **Additive DB safety** — BaseballHelm shares the **live GolfHelm Supabase project**; all migrations additive, `baseball_*` / `helm_lifting_*` only, RLS on every new table, REVOKE anon after.

### Current maturity / state
Shipping but **mid-rebuild and not production-blessed**. Readiness matrix (2026-06-30): **0 features fully ready; 18 partial, 2 route-only, 1 hidden, 1 needs-decision.** The 2026-06-25 gap map ([BASEBALLHELM_LIFTLAB_GAP_MAP_2026-06-25.md](../../audits/BASEBALLHELM_LIFTLAB_GAP_MAP_2026-06-25.md)) tracked 22 P0 items including unapplied migrations, anon-callable RPCs, and a broken new-signup golden path. Do not cite baseball route/schema detail as stable.

### Deep docs
[07-baseballhelm-context.md](../../business/07-baseballhelm-context.md) · [memory/context/baseballhelm-features.md](../../../memory/context/baseballhelm-features.md) · [memory/context/baseballhelm-database.md](../../../memory/context/baseballhelm-database.md) · [memory/context/baseballhelm-workflows.md](../../../memory/context/baseballhelm-workflows.md)

---

## Lift Lab

**One-line:** A strength & conditioning module — lift programs, weight-room sessions, readiness check-ins, body-map — for S&C staff and athletes, living in the same account and team context as the rest of an athlete's record.

> Mid-change; framed here as a stable product concept plus honest current state, not a frozen implementation.

### Buyer vs users
| | |
|---|---|
| **Buyer / tenant** | The program (attached to a baseball or golf org); enabled per-program, S&C coach invited by the head coach |
| **Users** | Strength & conditioning coach (capability flags `can_manage_lifting` / `can_view_readiness`); athletes — student-athletes, **often minors**, adding physical/health-adjacent PII (body-map, lift logs, readiness) to the sensitivity surface ([01-personas.md](../../business/01-personas.md) §6) |

### Top jobs-to-be-done ([02-jobs-to-be-done.md](../../business/02-jobs-to-be-done.md) §4)
1. **Build and assign lift programs** — weeks → days → sections → prescriptions, per athlete or group.
2. **Run the weight room live** — coach sees sets as athletes log them on their phones.
3. **Track readiness / soreness** — athlete check-ins feed a readiness view.
4. **Keep S&C in the same record as sport performance** — so training load and on-field/on-course performance can eventually be reasoned about together, not in two disconnected tools.

### Key surfaces / routes
- Standalone app: `/lifting/*` (coach dashboard, programs, live weight room, athletes, exercises, settings).
- Embedded (baseball): `/baseball/dashboard/performance`; player lift execution at `/baseball/dashboard/lift` and readiness at `/baseball/dashboard/readiness`.
- Tables: `helm_lifting_*` (shared Supabase project).

### Must-never-break invariants
Lift Lab has **no dedicated invariants doc yet** (`10-liftlab-business-context.md` intentionally not written — [00-business-context.md](../../business/00-business-context.md) sibling-docs note). Until it lands, it inherits the platform invariants in [03-product-invariants.md](../../business/03-product-invariants.md): RLS on every new `helm_lifting_*` table (§a), additive-only migrations against the live shared DB, REVOKE anon after, no destructive DELETE-then-INSERT in session/program saves (§f), and treat athlete health data as minor-adjacent PII (§g). Verify current schema in code, not against assumptions.

### Current maturity / state
Early / mid-build. The 2026-06-25 gap map flagged (as a point-in-time snapshot) unapplied `helm_lifting_*` migrations that fail the Lab portal at runtime until applied, a read-only program editor, missing exercise-library CRUD, no realtime updates in the live weight room, and missing player session routes. Some of those surfaces have since been scaffolded — `/lifting/dashboard/exercises`, `/lifting/dashboard/lift`, and `/lifting/dashboard/lift/[sessionId]` pages now exist — so verify each item against current code rather than assuming the snapshot still holds. Treat as scaffolded-with-gaps, not shipped-complete.

### Deep docs
[BASEBALLHELM_LIFTLAB_GAP_MAP_2026-06-25.md](../../audits/BASEBALLHELM_LIFTLAB_GAP_MAP_2026-06-25.md) (Waves W7–W8 cover Lift Lab) · [07-baseballhelm-context.md](../../business/07-baseballhelm-context.md) §2 (S&C persona)

---

## Helm Platform (shared spine)

**One-line:** The load-bearing shared layer under every product — auth + RLS tenancy, the AI layer, the Capacitor iOS shell, and the stack — where any change has cross-product blast radius even if only one sport's UI is touched.

### Buyer vs users
Not sold on its own. Its "users" are the other products and the engineers/agents who build on it. Its correctness protects **every** program's data at once, so a platform-layer defect (especially in RLS or admin) is the highest-leverage failure in the whole system ([00-business-context.md](../../business/00-business-context.md) §2, [01-personas.md](../../business/01-personas.md) §5).

### What it provides
| Layer | Detail |
|---|---|
| **Auth + tenancy** | org → team → coach/player; Postgres RLS is the only enforcement boundary; canonical join tables + `SECURITY DEFINER` helpers |
| **AI layer** | CoachHelm composition engine (see above) |
| **Capacitor iOS** | Web app ships as a native iOS shell; dedicated CircleCI `ios` workflow on Apple-silicon runners — iOS compile is part of "does this ship" |
| **Stack** | Next.js 16 App Router, TypeScript strict, Supabase (Postgres + RLS + Deno Edge Functions), Tailwind, Vercel, Datadog, Sentry, Python helpers under `tools/` |
| **Cost control** | Per-coach daily LLM budget — the only enforced unit-economics lever in the repo |
| **Review/CI gates** | CodeRabbit + Greptile AI review + a local Review Gate mirror hard-block RLS-missing, service-role-in-client, auth-less server actions, sport-prefix violations, and destructive DELETE-then-INSERT |

### Must-never-break invariants (all of [03-product-invariants.md](../../business/03-product-invariants.md))
- **(a) Data isolation** — RLS enabled + at least one policy in the same migration as every new table; never app-layer filtering; service-role key allowed only in `src/lib/supabase/admin*` and `src/app/api/**/admin/**`; tables are sport-prefixed (`golf_*` / `baseball_*` / `helm_lifting_*`).
- **(g) Permissions/roles** — the tenant/access unit is the team, not the individual; coach ≠ admin; role decisions resolved server-side; account-deletion cascade treated as incomplete until verified (minors' PII).
- **(b) calendar**, **(c) SG scoring**, **(d) recruiting**, **(e) LLM budget**, **(f) no destructive writes** — as detailed per product above.

### Current maturity / state
Live and load-bearing. Note: there is a **documented prior RLS incident** ([docs/audits/COACH_DASHBOARD_AUDIT_REPORT.md](../../audits/COACH_DASHBOARD_AUDIT_REPORT.md)) — treat every RLS-touching change as requiring explicit verification, not assumed correctness. Compliance surface (FERPA/COPPA-adjacent minors' PII; TCPA/DNC for outreach) is framed as *stakes*, not a claim of current violation; account deletion exists but full cascade is not confirmed complete, and there is no cookie/consent banner today.

### Deep docs
[00-business-context.md](../../business/00-business-context.md) · [CLAUDE.md](../../../CLAUDE.md) · [docs/v3-master-plan.md](../../v3-master-plan.md) · [docs/v3-rls-template.md](../../v3-rls-template.md) · [.greptile/rules.md](../../../.greptile/rules.md)

---

## For Mission Control

How the three automation/knowledge systems should use this doc.

| System | Use this doc to… | Rules |
|---|---|---|
| **n8n** (automation/orchestration) | Route product-scoped work: map an incoming ticket/lead/alert to the right product brief, resolve the correct route prefix (`/golf/*`, `/baseball/*`, `/lifting/*`) and table prefix (`golf_*`, `baseball_*`, `helm_lifting_*`), and gate flows on maturity (do **not** trigger automations that assume BaseballHelm/Lift Lab detail is stable — both are mid-rebuild). | Never write player/coach PII into workflow logs or external calls. Never bypass the org→team→coach/player tenancy. Any LLM-calling automation must respect the per-coach daily budget model — never add a call site that skips it. Treat this doc as the index; pull live specifics from the linked deep docs, not from memory. |
| **Huly** (project/issue tracking) | Structure epics/issues by product (BaseballHelm, GolfHelm, CoachHelm, Lift Lab, Platform) and tag by the invariant a change touches (RLS §a, SG §c, LLM budget §e, destructive-write §f). Use the "Current maturity / state" sections to set severity — regressions on GolfHelm SG, qualifier integrity, or any RLS boundary are top-severity. | Link every issue back to a section here and to the relevant deep doc. Flag BaseballHelm/Lift Lab issues as "verify against current code" since route/schema detail is not frozen. |
| **Greptile** (AI code review) | Use these product boundaries and invariant citations as the "why" behind cross-file review. Enforce the same hard rules ([03-product-invariants.md](../../business/03-product-invariants.md), [.greptile/rules.md](../../../.greptile/rules.md)): RLS-on-new-tables, coach↔team via join table (never `golf_coaches.team_id`), SG traceability to [docs/v3-research-golf-domain.md](../../v3-research-golf-domain.md), LLM budget routing, 5-value baseball pipeline enum, no DELETE-then-INSERT. | Flag any PR that conflates GolfHelm's mature behavior with BaseballHelm/Lift Lab's mid-rebuild state, invents pricing/tiers, or adds a PII-holding table without RLS + deletion-cascade consideration. Prefer the deep docs over this index for line-level truth. |

> Maintenance: this is an index/brief, not a spec. When a product's maturity changes (e.g. BaseballHelm exits rebuild, Lift Lab gets a `10-liftlab-business-context.md`), update the maturity rows here and keep the deep-doc pointers in sync.
