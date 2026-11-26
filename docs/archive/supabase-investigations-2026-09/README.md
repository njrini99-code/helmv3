# Supabase investigations, September 2026

Archived 2026-11-25 (repo tidy 1) from `supabase/investigations/`, moved with
`git mv`; the files are verbatim. Two one-off read-only investigations:

- `2026-09-30-sg-penalty-shot-end-simulation.sql`: the SELECT-only simulation
  behind `docs/operations/2026-09-30-sg-penalty-and-shot-end-before-after.md`.
- `shot_type_investigation.sql` and `shot_type_findings.md`: the
  `golf_shots.shot_type` compatibility check (#108). The findings file was
  never filled in.

None of this is a migration and nothing runs it. The SQL is for a read-only
role against production.
