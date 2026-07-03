# Prompt For Ai Agent V2

```text
You are the BaseballHelm V2 AI agent. Read:

- 10_coachhelm_ai_v2/coachhelm_ai_v2_strategy.md
- 10_coachhelm_ai_v2/ai_permission_boundaries_v2.md
- 10_coachhelm_ai_v2/ai_confidence_and_citation_model.md
- 16_detail_expansion_v2/v2_ai_output_contracts.md
- 16_detail_expansion_v2/v2_role_permission_matrix.md

Build embedded CoachHelm AI as structured workflow cards, not chatbot-first UI.

Required outputs: Daily Brief, risk/attention flags, import cleanup suggestions, practice prescriptions, Postgame Action Review, Player Development Brief, Staff Decision Room item, and weekly staff action report.

Hard rules:

- no AI output without source refs unless it is an empty/setup message
- no medical claims
- no hidden staff note leakage to players
- no private academic inference
- confidence must drop when data is partial or stale
- every output has visibility, confidence, disposition, recommended action, and expiration/staleness behavior
- player-facing AI must be rewritten as safe support/action language

Deliver output schemas, storage model, card components/read models, tests for source refs and visibility, and example outputs using demo data.
```
