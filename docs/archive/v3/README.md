# v3 planning set, May 2026

Archived 2026-11-25 (repo tidy 1) from the top of `docs/`, moved with
`git mv`; the files are verbatim. The v3 planning docs: decisions, page and
feature audits, the golf domain research, the RLS template and the testing
standards.

`docs/v3-master-plan.md` and `docs/v3-wave-sequence.md` stay in `docs/`:
`docs/business/` cites them by line.

`v3-research-golf-domain.md` is still read by code:
`scripts/coachhelm/gen-golf-reference.ts` compiles it into
`src/lib/coachhelm/v3/chat/golf-reference.generated.ts`, and a unit test
checks that the two agree. Do not edit it without running
`npm run coachhelm:golf-reference`.
