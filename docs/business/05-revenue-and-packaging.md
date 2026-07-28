# Revenue & Packaging

> Purpose: state, without spin, what this repo currently does and does not implement around money — so a reviewer can tell the difference between "this PR touches something the business gets paid for" and "this PR touches something with no revenue consequence yet."

This is the one business doc where the honest answer to "what's the pricing model?" is **there isn't one in-repo**. Read this doc before approving anything that touches `src/lib/coachhelm/v3/llm/`, account deletion, or anything that looks like it's building toward billing — the gap between "intended model" and "what's actually enforced" is exactly where a reviewer needs to be precise.

---

## 1. What exists today (ground truth)

- **No billing code.** There is no Stripe integration, no subscription table, no seat-counting, no invoice/payment webhook handler, no paywall/entitlement-gating middleware anywhere in this repo. A repo-wide search for billing/subscription/Stripe surfaces only unrelated hits (calendar feed "subscriptions," push-notification "subscriptions," CRM email "resend" — none of it is payments).
- **No pricing is documented in-repo.** The only prices that exist anywhere in this codebase are *competitors'* prices, captured for competitive research in `docs/v3-research-competitive-landscape.md` (e.g., Clippd's published player/coach/team tiers). Do not treat those as our prices, targets, or anchors — they are intelligence, not packaging.
- **The one enforced cost control is the per-coach daily LLM budget.** `src/lib/coachhelm/v3/llm/budget.ts` gates every CoachHelm AI compose() call against `golf_coachhelm_llm_budget` (a `coach_id` + `date` row with `budget_usd` / `spent_usd`), seeded from the team's `golf_coachhelm_settings.llm_budget_usd_per_day`. This is not billing — it's a spend cap, and it is the only place in the product where a dollar figure has real runtime consequences.
- **Demo/prospect accounts exist for sales**, not self-serve signup. Onboarding a real program is a manual, sales-led process (see the demo account pattern noted in the operator's memory: shared demo coach/player logins on a seeded "Demo University" team). There is no in-app "start free trial" or "upgrade" flow.

If you are reviewing a PR that assumes billing, entitlements, plan tiers, or seat limits exist as enforced runtime concepts — they do not. Flag it.

---

## 2. Intended business model (label: INTENDED, not built)

The following is the buyer/product framing the team is building toward. None of it is enforced in code today except where explicitly marked.

- **Unit of sale: the program/team, not the individual.** Helm Sports Labs (`CLAUDE.md:9`) is a multi-sport SaaS platform; the product is organized `organization -> team -> coach/player` (`docs/v3-master-plan.md:80-99`), and that hierarchy is also the intended sales hierarchy — a college athletic program or team buys the product, not an individual player.
- **Payer vs. end user split:**
  - **Payer (intended): the program** — represented in schema by `organizations` and `golf_coaches.organization_id`. The repo does not state whether the actual signing party is the athletic department, the head coach's budget, or the institution — do not assert a specific buyer beyond "the program."
  - **End users, not payers: players/student-athletes.** They consume the product (rounds, stats, goals, qualifying, Lift Lab check-ins) but the repo gives no indication they are ever billed directly. Many are minors — see `03-product-invariants.md` and the compliance note below for why that constrains what a "player pays" model could even look like.
  - **Coaches** are the primary in-app actor and the person whose daily LLM spend is metered — but the *budget* is a team-level setting (`golf_coachhelm_settings.llm_budget_usd_per_day`), not an individually-purchased coach seat, even though the spend ledger (`golf_coachhelm_llm_budget`) is keyed per coach.
- **Sales motion: demo-led, not self-serve.** Prospect/demo accounts (seeded, fully populated team data) are the mechanism for showing a program what the product does before a purchase decision. There is no pricing page, checkout, or plan selector anywhere in the app routes.
- **Packaging shape (aspirational, per-program SaaS):** per-team or per-program subscription is the intended shape, echoing the "sold to the program, used by the roster" pattern common in this competitive category (see `docs/v3-research-competitive-landscape.md` — Clippd, for contrast, sells both individual player/coach subscriptions *and* a team-level tier). Do NOT infer that Helm will mirror Clippd's tier structure or price points — that document exists to describe a competitor, not to imply our roadmap.

**If a PR adds anything resembling a price, a tier name, a seat count, or a "$X/mo" string as if it were our own pricing** — that is inventing business facts the repo does not contain. Flag it. The only acceptable dollar figures in this codebase are: (a) the runtime LLM budget value in `golf_coachhelm_settings.llm_budget_usd_per_day`, and (b) competitor prices explicitly attributed to competitors in the research doc.

---

## 3. Why the LLM budget is a revenue/trust surface, not just an ops detail

The budget gate in `src/lib/coachhelm/v3/llm/budget.ts` is small (roughly a hundred lines) but it sits directly on top of two different ways this business can lose money or lose trust, and both failure modes look like "the feature still works" to a casual glance.

### 3a. Runaway cost (the business loses money)

`checkBudget()` compares `spent_usd` against `budget_usd` for `(coach_id, date)` and returns `allowed: false` once the remaining budget can't cover the estimated cost of the next call. `recordSpend()` is the only thing that increments `spent_usd`, and it is explicitly documented as being the caller's responsibility to invoke "only on completed billable calls." That means:

- **Every LLM-calling code path must call `checkBudget()` before the model call and `recordSpend()` after a successful, billable one.** A new AI feature that calls an LLM provider directly — bypassing `budget.ts` — has no cap. Nothing else in this repo enforces a spend ceiling. That is a direct, unbounded cost exposure with no second line of defense.
- **The budget is resolved per-coach, not per-team and not global**, via `resolveDefaultBudgetForCoach()` reading that coach's own `golf_coachhelm_settings.llm_budget_usd_per_day`. `golf_coachhelm_settings` is UNIQUE on `coach_id` with a nullable `team_id`, and the enforced cap is keyed `(coach_id, date)` — the team-level table, `golf_team_coachhelm_settings`, is a kill switch and has no budget column. This paragraph previously described the resolver as per-team, and the code matched: it read every settings row on the coach's team and took their maximum, which leaked one coach's budget to a teammate who had set none and made a deliberate per-coach `0` unenforceable while any teammate had a positive budget. Two rows for one team means two coaches, not duplicate data. A coach with no `golf_team_coach_staff` row, or whose settings read fails, still resolves to `0` and denies all calls; a coach who has simply never configured a budget gets `PLATFORM_DEFAULT_DAILY_BUDGET_USD` (a real per-coach ceiling, not an uncapped path) so an unconfigured program gets a working product rather than a silently dead one. A PR that removes the per-coach ceiling entirely, or lets a call site skip the gate, is what reopens the runaway-cost hole.
- **`recordSpend()`'s upsert must always send a non-null `budget_usd`**, because the column is `NOT NULL` with no default and Postgres validates the candidate INSERT tuple before `ON CONFLICT DO UPDATE` fires. The code preserves the existing row's budget or seeds the team default on a first-write. A PR that drops this and lets `budget_usd` go `undefined` on upsert will throw at write time (better than the alternative, but still an outage on every metered call for that team).

### 3b. Silent template downgrade (the business loses trust)

When the budget is exhausted, `compose()` falls back to a non-LLM template rather than erroring. The documented fallback priority is `round_review > coach_chat > hero_narrative -> template` — meaning when budget runs out mid-day, the product keeps functioning but silently serves a lower-value, non-personalized output in place of the AI narrative the coach believes they're paying for (indirectly, via the program's subscription — see section 2). This is the flip side of the cost control: it protects the business financially by degrading gracefully, but every degrade is a trust cost, because:

- The coach has no visibility into *why* today's round review reads like a template instead of a narrative, unless the UI surfaces the fallback reason (`budget_zero` vs `budget_exhausted` are distinct reasons returned by `checkBudget()` — a PR that collapses them into one generic message removes information the product could use to tell the coach "you're out of AI budget for today" vs "your team has no AI budget configured at all").
- `composeRoundReview`, `composeHeroNarrative`, and `composeCoachChat` are required to verify citations and regenerate once before falling back to template (per `.greptile/rules.md:139-146`) — a PR that skips straight to template on any transient failure (not just budget exhaustion) is doing an unauthorized quality downgrade, not a budget-driven one, and should be flagged as a correctness issue even though it looks like the same code path.
- Because `golf_insight_*` tables track an effectiveness ledger for CoachHelm's AI output, a silent downgrade that isn't logged distinctly from a full LLM response corrupts that ledger's ability to explain "why did this insight underperform" — the answer might just be "it was a template because the budget ran out," which is an operational fact, not a model-quality fact.

**Net: the budget gate is simultaneously the only cost control the business has and a live lever on the coach's perceived value of the product.** Any change to `budget.ts`, `golf_coachhelm_llm_budget`, or `golf_coachhelm_settings.llm_budget_usd_per_day` should be reviewed as touching both P&L and product trust, not treated as routine backend plumbing.

---

## 4. Sales motion: demo/prospect accounts

- The product's go-to-market lever visible in this codebase is **seeded demo/prospect accounts** — fully populated coach + player logins on a demo organization/team, used to show a real program what the product looks like with real-shaped data before any purchase conversation.
- This is consistent with a demo-led, sales-assisted motion for a per-program SaaS sale (section 2), not a self-serve PLG motion. There is no in-app trial-expiry logic, no usage-based upsell prompt, and no plan-comparison UI in the app routes.
- A PR that adds a "pricing" or "upgrade" surface to the actual product (not the demo/marketing site) should be treated as a net-new business decision, not a routine feature — confirm it's intentional and not scope creep from a feature ticket.

---

## 5. Compliance stakes as a revenue risk (framed as stakes, not a violation claim)

This section states risk surface, not a claim that the product currently violates any law. See `03-product-invariants.md` for the RLS/tenancy invariants that are the primary technical defense here.

- The product stores **minors' academic and athletic PII** (student-athlete rosters, performance data, messaging). That places it on FERPA/COPPA-adjacent ground even though the buyer is the program, not the minor.
- **A cross-tenant data leak — missing or misconfigured Postgres RLS — is the worst-case, business-ending failure mode for a student-athlete data product sold to institutions.** There is a documented prior RLS incident (`docs/audits/COACH_DASHBOARD_AUDIT_REPORT.md`). A per-program SaaS model depends entirely on programs trusting that Team A's roster, stats, and messages are never visible to Team B — that trust is the product, commercially speaking, as much as any feature is.
- Coach-outreach/CRM code paths touch TCPA/do-not-call surface for prospecting into new programs — a compliance failure there is a sales-motion risk (see section 4), not just a legal one.
- Account deletion exists (`src/app/api/account/delete/route.ts`) but cascade cleanup is incomplete — an incomplete deletion of a minor's data on request is a retention-policy gap with the same "trust is the product" stakes as the RLS point above, even though it's a narrower blast radius.
- None of this is billing-adjacent in the sense of section 1-3, but a program's willingness to keep paying (renewal) is directly downstream of whether they trust the platform with rosters of minors. Treat compliance regressions as revenue-adjacent, not purely legal/ops concerns.

---

## For the reviewer

When a PR touches anything discussed above, ask: **does this change help the paid buyer (the coach/program), or does it just add noise or cost?**

Concretely:
- Does a new AI feature route through `checkBudget()` / `recordSpend()`, or does it call an LLM provider off to the side where nothing meters it?
- Does a new AI-facing surface make the coach's *paid* experience better (a differentiated feature like round narrative, goals, or qualifying/travel selection — see section 7), or is it a novelty that burns LLM budget without moving the coach's job-to-be-done?
- If a fallback/degrade path changes, does the coach still get a usable, distinguishable signal that they're seeing a template instead of a narrative — or does the downgrade become invisible (a trust cost with no corresponding cost saving communicated back to the buyer)?
- Does the change assume billing, entitlements, or plan tiers exist as enforced runtime concepts? They do not — flag any PR that builds on that assumption without first adding the missing billing layer explicitly.
- Does the change touch RLS, tenancy boundaries, or account-deletion cascade logic? Treat these as revenue-adjacent (renewal-risk), not merely "security nits" — see section 5.
- Is a dollar figure, tier name, or seat count being added anywhere as if it were Helm's own pricing? The only legitimate dollar figure in this repo is the LLM budget setting; everything else pricing-shaped belongs to competitors and must stay clearly attributed as such in `docs/v3-research-competitive-landscape.md`.

---

## 7. Related docs

- `docs/v3-research-competitive-landscape.md` — competitor pricing (Clippd, DECADE, Arccos, Whoop) and where Helm differentiates (conversational LLM round review, coach-approved player-set Goals, the qualifying/travel-selection workspace). None of this is our pricing.
- `03-product-invariants.md` — tenancy/RLS invariants, destructive-write ban, SG correctness — the technical guarantees the "trust is the product" argument in section 5 depends on.
- `memory/context/coachhelm-ai.md` — CoachHelm AI compose/fallback architecture in more detail.
