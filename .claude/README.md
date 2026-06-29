# Claude Agent Workspace

This folder contains Claude-facing agents, commands, and older audit material.

## Current Agents

Use `.claude/agents/` for focused review and handoff work:

- `triage-captain.md`: turns broad requests into scoped, issue-ready work.
- `ci-doctor.md`: investigates failing checks and local verification gaps.
- `db-rls-auditor.md`: reviews Supabase migrations, policies, and RLS tests.
- `test-writer.md`: adds focused unit, integration, or smoke coverage.
- `docs-keeper.md`: keeps current docs and memory routing synchronized.
- `pr-reviewer.md`: reviews changes for regressions and missing verification.
- `ui-polish-reviewer.md`: reviews UI polish and visual consistency.

## Current Rules

Read these before treating older generated prompts as current:

- `../AGENTS.md`
- `../CLAUDE.md`
- `../docs/current/README.md`
- `../docs/operations/GATE_MATRIX.md`
- `../docs/operations/CI_RUNBOOK.md`

## Legacy Material

Older files in this folder may describe prompt-generation systems or one-off audit runs. Keep them as historical evidence, not as the primary workflow.

For new work, prefer:

1. GitHub Issues for the task.
2. `memory/registry.yml` for feature routing.
3. The relevant current docs under `docs/current/` and `docs/operations/`.
4. The smallest useful verification command before declaring completion.
