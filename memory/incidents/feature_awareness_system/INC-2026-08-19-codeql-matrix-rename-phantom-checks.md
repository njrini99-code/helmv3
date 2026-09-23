# INC-2026-08-19 — a CodeQL matrix rename created two phantom required checks

- Feature: `feature_awareness_system`

## What happened

Three of the five required checks on `main` render from the CodeQL matrix
job (`Analyze (actions)`, `Analyze (javascript-typescript)`, `Analyze
(python)`). A matrix job's status-check name is its rendered `name:`, so
changing the matrix definition silently renamed the required check GitHub
was waiting on. The old required-check names then matched nothing any
workflow run could ever post, and every PR was unsatisfiable until the
branch-protection required-checks list was updated to match.

## Fix / where it lives now

`.claude/rules/quality-gates.md` names this trap explicitly: renaming any
job (including a matrix job) means updating the required-checks list on
GitHub in the same change — there is no error for a required check that
nothing posts, the PR just never goes green.
