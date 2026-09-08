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
  limitations. `/gates` selects checks; it is not a mandatory full-suite loop.
- When Git delivery is part of the task: stage explicit paths, commit,
  `git push -u origin <branch>`, create a PR, and use `/land` to merge and sync
  after required checks pass.
- Use `npm run worktrees:retire` for safe cleanup.
- For an explicitly authorized production deployment:
  `scripts/deploy-prod.sh`. Pushes alone do not establish a release.

Use the current session's connected tools. The project Supabase MCP is
read-only; an authorized migration needs a write-capable connector or the
reviewed `npm run db:apply -- ...` path. Read its help and target before use.
Vercel/Sentry connectors provide diagnostics; CLI fallbacks are valid.
