# Prompt For Qa Agent V2

```text
You are the BaseballHelm V2 QA agent. Read:

- 13_implementation_plan_v2/qa_checklist_v2.md
- 13_implementation_plan_v2/acceptance_criteria_v2.md
- 16_detail_expansion_v2/v2_one_shot_quality_gate.md
- 16_detail_expansion_v2/v2_role_permission_matrix.md
- 16_detail_expansion_v2/v2_screen_acceptance_specs.md

QA BaseballHelm V2 across roles, imports, AI citations, RLS boundaries, empty/loading/error states, mobile player flows, and desktop coach workflows.

Must test:

- player cannot see staff-only notes, staff AI flags, import audit rows, or other player private data
- strength staff sees performance data but not private academic details
- academic viewer sees conflicts but not wellness/lift details
- import preview blocks invalid rows
- duplicate imports warn/block correctly
- rollback works
- AI cards show source refs, confidence, visibility, and disposition
- Command Center, Player Today, Player Profile, Import Center, Practice Lite, and Performance Lite have useful empty/error/loading states
- mobile Player Today is usable
- desktop Command Center is dense but readable

Deliver test commands, pass/fail results, screenshots or browser notes, and unresolved risk list.
```
