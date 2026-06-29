# Helm Current Docs

This folder is the current command center for how the repo works now.

Use it before older audits, generated reports, or legacy `.helm` files.

## Start Here

| Need | Read |
|---|---|
| Work routing and source-of-truth rules | `operating-system.md` |
| Product and feature map | `product-map.md` |
| Architecture map | `architecture-map.md` |
| CI and merge gates | `../operations/GATE_MATRIX.md` |
| CI triage | `../operations/CI_RUNBOOK.md` |
| Branch protection | `../operations/BRANCH_PROTECTION.md` |
| Risky files | `../operations/HOT_FILES.md` |

## Source Of Truth

- GitHub Issues: current work.
- GitHub Project: current priority.
- `memory/registry.yml`: feature routing.
- `memory/features/*.md`: current feature behavior.
- `AGENTS.md` and `CLAUDE.md`: agent rules.
- `docs/operations/`: runbooks, gates, and incident history.
- `docs/audits/`: historical audit evidence.
- `.helm/`: legacy archive and tool output only.
