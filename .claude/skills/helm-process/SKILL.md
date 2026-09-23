---
name: helm-process
description: Find Helm task, verification, workspace, and delivery commands.
---

# Helm task workflow

AGENTS.md is the operating policy; this skill is a command index and adds
no authorization restrictions.

- Check branch and dirty files before editing.
- For isolation: `scripts/new-worktree.sh <task>`.
- For feature context: `npm run knowledge:map -- --files <paths>` and
  `npm run knowledge:context -- --files <paths> --task "<task>"`.
- Implement the authorized work; use `helm-reader` for read-only diagnosis
  and `helm-worker` for bounded implementation.
- Run checks appropriate to the change, preserve exit codes, and report
  limitations. Before any push or PR: `npm run preflight` (`--full` for
  migrations, `use server`, or broad changes); its exit code is the answer.
- When Git delivery is part of the task: stage explicit paths, commit,
  `git push -u origin <branch>`, `gh pr create --draft`, `gh pr ready` once
  preflight is green, and use `/land` to merge and sync after required checks
  pass.
- Use `npm run worktrees:retire` for safe cleanup.
- Production deploys only when the owner says to; the owner runs
  `scripts/deploy-prod.sh` (agents are denied it). Pushes and merges never
  deploy.

Use the current session's connected tools. The project Supabase MCP supports
reads and task-authorized migrations; an authenticated CLI is also valid.
Review the SQL and target before applying a migration.
Vercel/Sentry connectors provide diagnostics; CLI fallbacks are valid.
