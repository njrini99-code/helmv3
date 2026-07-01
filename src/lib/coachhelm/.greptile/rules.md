# CoachHelm review rules (cascades onto the root `.greptile/rules.md`)

CoachHelm is the AI insight/narrative engine embedded in GolfHelm (extending to
baseball). It touches **both P&L and product trust** — an LLM change is never
routine backend plumbing. Business context:
`docs/business/09-coachhelm-business-context.md`, engine internals:
`memory/context/coachhelm-ai.md`.

## Always check
- **Budget enforcement is server-side and mandatory.** Every LLM call routes
  through `checkBudget()` / `recordSpend()` in `src/lib/coachhelm/v3/llm/budget.ts`
  before `compose()`. Never hardcode $/token math outside that module. The
  resolved default budget for a coach/team with no settings row is `0` (safe) —
  do not "fix" it to a nonzero fallback.
- **Citation-verify → regenerate once → template fallback.** `composeRoundReview`,
  `composeHeroNarrative`, `composeCoachChat` must verify citations against real
  data, regenerate once on failure, then fall back to a deterministic template.
  Never surface an ungrounded/hallucinated narrative.
- **Every causal or comparative claim traces to `docs/v3-research-golf-domain.md`.**
- **Never call the LLM client-side** — composers are server-only; a `'use client'`
  component making a model call bypasses budget + citation checks.
- **Scoring functions stay pure.** Code under `v2/insights/`, `v2/composite/`
  takes data in and returns a score out — no fetches, no Supabase calls inside
  scoring (keeps it deterministic and testable).
- **Effectiveness ledger.** New insight-generating code should write to the
  `golf_insight_*` tables the way existing generators do; keep
  `budget_zero` vs `budget_exhausted` distinct so the ledger can explain a
  template downgrade.

## Block if
- an LLM provider is called without the budget check, or from a client component;
- a composer skips citation verification / regenerate-once / template fallback,
  or falls back to template on a transient (non-budget) failure;
- a scoring function under `v2/insights/` or `v2/composite/` performs a fetch or
  Supabase call;
- a causal claim in output isn't traceable to the research doc.

## Suggest (non-blocking) enhancements
- Wiring outcome tracking / insight ranking that's documented as incomplete
  ("Insight ranking unused," "Effectiveness tracking not wired").
- Telemetry that distinguishes a budget-driven template downgrade from a genuine
  model result, so the effectiveness ledger stays honest.
- Cheap moves toward the "conversational round review nobody else has"
  differentiator (`docs/business/06-competitor-positioning.md`).
