# INC-2026-08-18 — `.worktrees/` inside the repo duplicated the whole tree

- Feature: `feature_awareness_system`

## What happened

A worktree was created at `.worktrees/codex-golf-team-operations/` inside
the repo instead of outside it. `.gitignore` hid it from `git status`, but
`find`/`grep`/most agent file search do not honour gitignore — a repo-root
search returned two hits for essentially every file under `src/`, one real
and one inside the stray worktree. Agents picked whichever hit came first at
random and edited a branch nobody was shipping, then reported success.

## Impact

This was the mechanical cause of "the agents keep getting lost" reports
around that date — not a reasoning failure, a search-surface duplication.

## Fix / where it lives now

`.claude/rules/autonomy.md` and `AGENTS.md` require worktrees OUTSIDE the
repo (`~/worktrees/helmv3/<task>`), created only via
`scripts/new-worktree.sh`, which enforces the external location.
