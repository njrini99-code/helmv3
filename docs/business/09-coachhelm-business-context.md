# CoachHelm — Business Context

> Purpose: give a reviewer or a new engineer the "why" behind CoachHelm's code — the LLM budget/trust invariants, the citation-verification contract, and the effectiveness ledger — in one place, instead of scattered across `00-business-context.md` §2.2/§4.2, `02-jobs-to-be-done.md` §3, `03-product-invariants.md` §(e), `04-workflow-maps.md` §3, and `05-revenue-and-packaging.md` §3. This doc consolidates that content; it does not introduce new facts beyond what those docs already establish.

**CoachHelm is not a separate product.** It is the AI insight/narrative engine embedded in GolfHelm (round reviews, patterns, predictions, coach chat), now extending into baseball (`memory/context/coachhelm-ai.md`, `src/lib/coachhelm/baseball/`) (`00-business-context.md` §1, §2.2). It has no separate buyer, no separate SKU, and no separate pricing — its trust and cost properties are inherited by whatever host product (GolfHelm today) embeds it. For GolfHelm's own business framing, see `08-golfhelm-business-context.md`.

---

## 1. What CoachHelm promises

Turn raw performance data into trustworthy, cited, sport-specific coaching narrative and decision support, cheaply enough to run per-coach per-day, and degrade gracefully — never silently, never over budget — when it can't (`00-business-context.md` §4.2). Concretely, this is delivered through three composer entry points, all server-only:

- `composeRoundReview` — plain-language round review, tying specific holes/shots to specific causes, with a predicted-vs-actual comparison for unusual rounds (`02-jobs-to-be-done.md` §3.1).
- `composeCoachChat` — natural-language Q&A about a player or trend, grounded in that player's actual data (`02-jobs-to-be-done.md` §3.2).
- `composeHeroNarrative` — the lowest-priority composer in the fallback order (see §3 below).

All three share the same LLM budget/citation/fallback contract (`.greptile/rules.md:139-146`).

**Why this is a genuine differentiator, not a me-too feature:** conversational LLM round review is named directly in competitive research as the product's clearest white space — "nobody has it." Clippd's round summaries are static dashboards, not narrative explanations, and Clippd has no native AI chat / no LLM round narrative; 18Birdies has an AI Coach for swing video, not round narrative (`02-jobs-to-be-done.md` §3.1, `08-golfhelm-business-context.md` §7). Treat any regression to citation-checking or fallback behavior on this path as high severity, not a routine bug.

---

## 2. The citation-verification contract

The thing that makes CoachHelm's narrative trustworthy rather than "an LLM wrapper" is that every claim it makes is checked against real data before a coach or player ever sees it:

- **Citation-verify, regenerate once, then template fallback.** `composeRoundReview`, `composeHeroNarrative`, and `composeCoachChat` must verify citations against real underlying data, regenerate once on failure, and fall back to a deterministic template rather than surface a hallucinated narrative (`00-business-context.md` §2.2, `03-product-invariants.md` §(e), `04-workflow-maps.md` §3).
- **Every causal or comparative claim must trace back to `docs/v3-research-golf-domain.md`.** A generator asserting a causal relationship (e.g. "putting explains most of your scoring gap") without grounding in the documented Broadie variance breakdown is a fabricated claim, not an insight — this is the same invariant that governs SG correctness generally (`03-product-invariants.md` §(c), (e); `02-jobs-to-be-done.md` §3.3).
- **Never call the LLM client-side.** A `'use client'` component making a direct model call bypasses both the citation check and the budget check and is a hard block (`03-product-invariants.md` §(e)).
- **V2 scoring functions must stay pure.** Pattern-mining and composite-scoring code under `v2/insights/`, `v2/composite/` must not perform fetches or Supabase calls inside scoring logic — scoring takes data in, returns a score out, nothing else, so output stays deterministic and auditable (`03-product-invariants.md` §(e), `04-workflow-maps.md` §3).

**Why a hallucinated citation is a credibility-ending failure, not a cosmetic bug:** a coaching product's entire value proposition is a coach trusting the product's read on a specific athlete over their own judgment or a competitor's dashboard. An uncited or fabricated claim about a specific player, surfaced to that player or in front of a parent, is not a "quality" issue — it directly undermines the "trust the number behind the narrative" job (`02-jobs-to-be-done.md` §3.3) and the SG-correctness credibility this product is staking against Clippd (`03-product-invariants.md` §(c)).

---

## 3. The LLM budget invariant

CoachHelm's LLM layer is the one place in the repo with an enforced cost-control mechanism. There is no billing/Stripe/subscription code anywhere in the repo, and pricing is not documented in-repo — the daily LLM budget is the only enforced cost guard today (`00-business-context.md` §6, `03-product-invariants.md` §(e), `05-revenue-and-packaging.md` §3).

- **Implementation:** `src/lib/coachhelm/v3/llm/budget.ts` — `checkBudget()` is called before every `compose()` invocation. It reads/upserts a `(coach_id, date)` row in `golf_coachhelm_llm_budget` (`budget_usd`, `spent_usd`), lazily seeding the day's budget from the team default (`golf_coachhelm_settings.llm_budget_usd_per_day`) the first time a coach spends on a given day. `recordSpend()` is the only thing that increments `spent_usd`, and is the caller's responsibility to invoke only on completed, billable calls (`00-business-context.md` §6, `05-revenue-and-packaging.md` §3a).
- **Per-team, not global.** The budget is resolved per-team via `resolveDefaultBudgetForCoach()` walking `golf_team_coach_staff` → `golf_coachhelm_settings.llm_budget_usd_per_day`. If a coach has no staff row, or the team has no settings row, the function returns `0` — a deliberately safe default. A PR that "fixes" this by defaulting to a nonzero fallback budget silently reopens the runaway-cost hole for any misconfigured team (`05-revenue-and-packaging.md` §3a).
- **Never hardcode $/token math outside `budget.ts`.** Cost calculation logic belongs in one place; a feature file computing its own token-to-dollar conversion is a drift risk the moment pricing or models change (`03-product-invariants.md` §(e)).
- **Fallback priority on exhaustion:** `round_review > coach_chat > hero_narrative -> template`. Higher-priority features keep LLM access longer as budget depletes; lower-priority ones degrade to template first. This is not an accident — round review is protected first because it's the flagship, highest-retention job (`00-business-context.md` §6, `02-jobs-to-be-done.md` §3.1, `04-workflow-maps.md` §3).
- **Two failure directions, both invisible to a casual glance:**
  - **Runaway cost** — an LLM call site that skips `checkBudget()` has no cap; nothing else in the repo enforces a spend ceiling (`05-revenue-and-packaging.md` §3a).
  - **Silent trust downgrade** — on exhaustion, `compose()` returns a template instead of erroring, so the product keeps functioning but silently serves a lower-value output the coach believes is AI-composed. `budget_zero` (team never configured a budget) and `budget_exhausted` (today's budget ran out) are distinct reasons returned by `checkBudget()`; collapsing them into one generic message removes information the product could use to tell the coach which situation they're in (`05-revenue-and-packaging.md` §3b).
  - A PR that skips straight to template on *any* transient failure (not just budget exhaustion) is an unauthorized quality downgrade, not a budget-driven one, and should be flagged as a correctness issue even though it looks like the same code path (`05-revenue-and-packaging.md` §3b).

**Net:** any change to `budget.ts`, `golf_coachhelm_llm_budget`, or `golf_coachhelm_settings.llm_budget_usd_per_day` touches both P&L and product trust simultaneously — review it as such, not as routine backend plumbing (`05-revenue-and-packaging.md` §3).

---

## 4. The effectiveness ledger

The `golf_insight_*` tables (`golf_insight_effectiveness`, `golf_insight_feedback`, `golf_prediction_model_performance`, `golf_review_events`/`golf_review_insights`) close the loop on whether an insight was acted on and whether the outcome improved — insights carry `outcome_status`: `pending | improved | no_change | worsened | inconclusive` (`04-workflow-maps.md` §3).

- **Known gap:** philosophy-weighted insight ranking and outcome tracking are documented as incomplete — "Insight ranking unused," "Effectiveness tracking not wired," "Outcome measurement missing." A PR that adds insight generation without wiring outcome tracking is only half-serving the underlying coaching job (`02-jobs-to-be-done.md` §1.2).
- **Why it matters beyond measurement:** a silent budget-driven template downgrade that isn't logged distinctly from a full LLM response corrupts this ledger's ability to explain *why* an insight underperformed — the answer might just be "it was a template because the budget ran out," an operational fact, not a model-quality fact (`05-revenue-and-packaging.md` §3b).
- **Coach philosophy weighting.** `golf_coach_philosophy` drives ranking (`weightHistorical` + `weightRecentForm` + `weightTournament` + `weightQualifying` + `weightSubjective` must sum to 100%) and alert sensitivity — a PR that changes scoring weights without preserving that invariant will silently mis-rank insights (`04-workflow-maps.md` §3).

---

## For the reviewer

- Flag any code path that calls an LLM provider directly without routing through `checkBudget()` / `recordSpend()` in `src/lib/coachhelm/v3/llm/budget.ts` — this is unbounded cost exposure with no second line of defense.
- Flag any change that defaults a coach's or team's resolved budget to a nonzero fallback instead of `0` when no staff row or settings row exists — `0` is the deliberately safe default.
- Flag any composer (`composeRoundReview`, `composeHeroNarrative`, `composeCoachChat`) that skips citation verification, skips the regenerate-once-before-template-fallback step, or is invoked from a `'use client'` component.
- Flag any change that collapses `budget_zero` and `budget_exhausted` into one generic fallback reason, or that falls back to template on a transient failure unrelated to budget exhaustion.
- Flag any causal or comparative claim in CoachHelm output that isn't traceable to `docs/v3-research-golf-domain.md`.
- Flag any new insight-generation code that doesn't write to the `golf_insight_*` effectiveness ledger, given existing generators do.
- Flag any Supabase call or network fetch added inside a `v2/insights/` or `v2/composite/` scoring function — these must stay pure.
