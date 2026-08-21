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
verified: 2026-08-21  # paths audited against memory/registry.yml's actual code.* globs (see memory/system/golfhelm-engineering-os.md) + confirmed on disk this date
---

# GolfHelm Engineering OS — path-scoped rule

Full contract: `memory/system/golfhelm-engineering-os.md`. This file exists so
the contract loads automatically on the paths it governs; edit the contract,
not this pointer.

Before meaningful mutation of a file under the paths above:

1. Map it through `memory/registry.yml` (`npm run knowledge:map -- --files
   <paths>`) to a `feature_id`.
2. Read `memory/features/<feature_id>.md` — the canonical current-state doc —
   before changing behavior, not after.
3. Verify names/columns/paths against generated or live truth, not against
   memory prose alone.

After meaningful behavioral mutation:

- Update `memory/features/<feature_id>.md` if current truth changed.
- Append to `memory/ledgers/changes/<feature_id>.md` (what/why/sha) and
  `memory/ledgers/tests/<feature_id>.md` when test guarantees changed.
- Record an incident (`memory/incidents/<feature_id>/INC-*.md`) or a decision
  (`memory/decisions/ADR-*.md`) when the change is incident- or
  architecture-driven.
- A non-behavioral change records a structured reason instead of a bare
  "not needed" — see the contract's valid-reason list.

Daily reliability operations on these paths never deploy, promote, roll back,
or mutate production — see `config/release-policy.yml`. Schema changes under
`supabase/migrations/**` additionally require `db-migration-reviewer` review
before landing.
