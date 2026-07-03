# AI Depth Scorecard

## Original score: 6/10

Guardrails existed, but AI needed source refs, confidence, permissions, and workflow placement.

## Why it was not a 9/10

- Too much was written as broad intent rather than executable acceptance criteria.
- Several sections could be interpreted multiple ways by a coding agent.
- Repo constraints were not sufficiently binding.
- Role permissions and data privacy boundaries were not tested deeply enough.
- Critical edge cases were present in concept but not implementation-grade.

## V2 score target: 9/10

V2 fixes this by adding:

- clear keep/cut/defer/import/attach decisions
- table-by-table schema requirements
- route/component reuse direction
- row-level import lifecycle
- source-cited AI model
- role-based navigation
- UI state requirements
- phase cutline and QA checklist

## Remaining risk

The live Supabase schema must be inspected before migrations. No documentation package can replace that verification.
