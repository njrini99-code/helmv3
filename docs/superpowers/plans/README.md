# `docs/superpowers/plans/` — historical design records

**Nothing in this directory is current authority.** These are the plans that
were written before work happened. Some were executed exactly, some were
executed differently, some were never started, and reading one cannot tell you
which — that is the nature of a plan.

`memory/registry.yml` routes to none of them, and
`npm run knowledge:check` fails if that changes: a document marked retired
cannot be reachable as current authority.

## Where current truth lives instead

| You want | Read |
| --- | --- |
| how a feature behaves now | `memory/registry.yml` → the mapped feature doc |
| what was decided, and what was rejected | `memory/decisions/ADR-*.md` |
| what changed and when | `memory/ledgers/changes/**` |
| what is still broken | `memory/incidents/**` |
| the whole map | `docs/HELM_OS.md` |

## Per-file classification

`docs/generated/DOCUMENT_AUTHORITY_INVENTORY.md` carries every file in this
directory with its category and lifecycle, regenerated from the tracked tree.
It is not restated here: a hand-maintained index of 60-odd plans is a second
copy that would drift from the directory it describes within a month.

A plan whose header carries an explicit `STATUS:` line is honoured by the
tooling — that is how a superseded plan announces its replacement, and it is
worth adding one when you retire a plan you wrote.
