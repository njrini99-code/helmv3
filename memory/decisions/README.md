# memory/decisions/

Architecture Decision Records for GolfHelm/CoachHelm engineering-system
choices — one file per decision, `ADR-<id>-<short-slug>.md`.

Create one when a change is architectural, not merely a bug repair: a new
canonical structure, a reconciliation between two competing sources of truth
(e.g. `memory/registry.yml` vs `src/lib/admin/feature-registry.ts`), a
reversal of an earlier decision, or anything a future session would
otherwise have to reverse-engineer from a diff. Record the decision and the
rejected alternatives, not just the outcome — the reasoning is the part that
doesn't survive in code.

Do not use this directory for routine feature-behavior changes; those go in
`memory/ledgers/changes/<feature-id>.md` instead.
