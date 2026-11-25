# v3 planning set, May 2026

Archived 2026-11-25 (repo tidy 1) from the top of `docs/`, moved with
`git mv`; the files are verbatim: the v3 testing standards. (The v3 domain
research, page and feature audits, decisions and RLS template were meant to
move too and stayed, see below.)

Stayed in `docs/`:

- `v3-master-plan.md` and `v3-wave-sequence.md`: `docs/business/` cites them by
  line.
- `v3-decisions.md`, `v3-feature-audit.md`, `v3-page-audit.md` and
  `v3-rls-template.md`: `memory/registry.yml` routes features to them, and
  `knowledge:check` forbids routing to an archived document.
- `v3-research-golf-domain.md`: also read by code.
  `scripts/coachhelm/gen-golf-reference.ts` compiles it into
  `src/lib/coachhelm/v3/chat/golf-reference.generated.ts`, and a unit test
  checks that the two agree.

To archive the rest, drop the registry routes first.
