---
paths:
  - "src/app/golf/**"
  - "src/components/golf/**"
  - "src/lib/golf/**"
  - "src/app/api/golf/**"
  - "src/lib/coachhelm/**"
  - "src/app/api/coachhelm/**"
  - "supabase/migrations/**"
  - "memory/features/**"
  - "memory/registry.yml"
---

# GolfHelm Engineering OS

Golf reliability contract: `memory/system/golfhelm-engineering-os.md`. The
feature-doc rule (map with `npm run knowledge:map`, read the first doc the
registry names, update it when its contract changes) is in AGENTS.md "Context".
Record an incident (`memory/incidents/<feature_id>/INC-*.md`) or a decision
(`memory/decisions/ADR-*.md`) when a change is incident- or
architecture-driven.
