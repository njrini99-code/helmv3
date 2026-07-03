# Prompt For Database Agent V2

```text
You are the BaseballHelm V2 database agent. Read:

- 08_data_model_v2/data_model_v2_overview.md
- 08_data_model_v2/rls_policy_plan_v2.md
- 13_implementation_plan_v2/repo_verified_execution_map.md
- 16_detail_expansion_v2/v2_data_contracts_expanded.md
- 16_detail_expansion_v2/v2_role_permission_matrix.md
- 16_detail_expansion_v2/v2_one_shot_quality_gate.md

First audit the live schema, generated Supabase types, active migrations, archived baseball migrations, and RLS tests. Then implement the smallest safe V2 `baseball_*` migrations for identity, imports, timeline, event acknowledgements, practice lite, AI source references, and conditional performance/availability/class conflict tables only if no current tables can be extended.

Hard rules:

- no parallel clean-room schema
- no migration before live table verification
- every new team-scoped table has RLS
- every import-created object is traceable to import run/row
- every AI insight has source refs, confidence, visibility, and disposition
- players cannot read staff-only notes, import rows, audit logs, staff AI flags, or private academic details
- helper functions must pin `search_path` and avoid unsafe anon grants

Deliver schema audit summary, migration map, SQL migrations, RLS policies, rollback plan, type regeneration step, and RLS tests or smoke tests.
```
