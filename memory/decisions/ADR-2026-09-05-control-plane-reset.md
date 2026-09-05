# ADR 2026-09-05 — Helm control-plane reset

Status: accepted and largely executed (owner authorization 2026-09-05: "I
give you full permission to redo the whole config and system … the agents
know that they have permission to do it all").

**Context.** An audit (the "Reset trace" plus eleven detail reports) found
machine-local Claude configuration, ad hoc worktrees, an unregistered
launchd repair agent, drifted branch protection, and a 90-file auto-memory
directory all acting as second authorities that could disagree with this
repo's own committed state — the exact failure class `.claude/rules/
shipping.md` §1b already names for `autoMemoryEnabled`. This ADR records
the whole reset operation, not only this file's own track (A5, memory
folding — see `memory/context/engineering-methodology.md`,
`memory/context/agent-operations.md`, `memory/context/agent-traps.md`, and
the incidents/feature-doc edits committed alongside this record).

## The operating model this built

- **One constitution** — `AGENTS.md` is current-state only; `CLAUDE.md`,
  `.cursor/rules`, `.codex` and `.devin` are pointer files into it.
- **One workspace door** — every worktree is created through
  `scripts/new-worktree.sh` / `scripts/lib/create-workspace.mjs`, a
  `WorktreeCreate` hook, and a `SessionStart` stamp for anything else;
  always under `~/worktrees/helmv3/`, budget 3, dependencies symlinked,
  never a shared build cache.
- **One owner per setting** — user scope holds machine preferences and the
  sandbox; project scope holds every repo grant, deny, hook and plugin;
  local scope holds nothing a project needs.
- **One deploy path, budgeted** — `scripts/deploy-prod.sh` is the only
  promote; it refuses a dirty tree, a non-`main` ref, and any deploy past a
  weekly policy count it reads from Vercel.
- **One repair schedule** — the GitHub Actions Repair stage is the only
  self-heal runner; the machine-local launchd agent was unloaded and its
  task definitions archived. A routine that is not registered does not
  exist.
- **Gates that can fail** — every check that previously passed on a false
  claim (see `docs/CONTROL_PLANE_ENFORCEMENT.md`) is being fixed and proved
  to fail first; no count lives in prose.
- **One memory** — `memory/` is the only memory; this track folded the 61
  still-true auto-memory notes in as incidents and feature-doc updates and
  left the rest backed up, not deleted, at
  `~/.claude/backups/reset-2026-09-05/`. Nothing machine-local shapes an
  agent again.
- **Home is main** — the canonical checkout rests on `main`, clean, with a
  workspace marker; every task is a worktree from the door; merged means
  retired.

## Defaults taken (owner said "go" to the plan's stated defaults)

| Decision | Default taken |
| --- | --- |
| Superpowers plugin in this repo | off |
| Worktree mutation budget | 3 concurrent |
| Vercel git integration | disconnected (no branch auto-deploys) |
| The two accidental Vercel projects (`helmv3-golf-reliability-release-20260825`, `helmv3-main-release-c350`) | removed — verified 2026-09-05 via `list_projects`, gone |
| The three `v0-*` scratch Vercel projects | **kept for the owner**, overriding the plan's own stated default (delete, no deploy in 260 days) — verified 2026-09-05 via `list_projects`, all three present |
| Branches with unique, never-PR'd commits | tagged `archive/<name>` before deletion; the 3 `dbobs-p3` branches kept and PR'd rather than tagged, as the only orphaned real work |
| Pre-existing feature PRs (#1836, #1835, #1833, #1832, #1831, #1759, #1834, #1837, the Dependabot set) | left untouched — only `agent/reset-a*` control-plane PRs are merged by this operation |
| Canonical checkout's return to clean `main` | deferred while another live session uses it for its own branch |
| `execute_sql` on the account-level Supabase connector | stays allowed only until O6(b)'s read-only repair role exists in production; the deny lands the day it does |

## Owner actions still open

| ID | Action |
| --- | --- |
| O1 | Rotate the Cursor Supabase personal access token in the Supabase dashboard. |
| O2 | Confirm the two old (Feb/Mar) tokens are revoked in the same screen. |
| O3 | Rotate the Sentry auth token that was pasted in chat; put the new value in `.env.local`. |
| O4 | Optional: complete the project-scoped Supabase MCP OAuth so the read-only server becomes the query path. |
| O5 | Uninstall the CodeRabbit GitHub App and the seven other idle GitHub Apps that have never posted a check. |
| O6 | Run the prepared SQL in `supabase/migrations/HELD.md` (ledger rows, the read-only repair role, disabling `pg_graphql`, the avatars-bucket policy check, the definer-view dismissal list). |
| O7 | Restore the admin role the daily drift job reports a listed `admin_allowlist` user has lost in production. |
| O8 | Set `INNGEST_SIGNING_KEY` in Vercel's production environment. |
| O9 | Confirm in the CircleCI dashboard that the weekly pipeline trigger (`run-weekly=true`) exists. |

## Where the evidence lives

- Three published artifact pages: the operation's plan ("Helm Master Plan"),
  its detail reports ("Helm Control Plane — Details"), and the original
  audit trace ("Helm Control Plane — Reset") — all three built from files
  under this session's scratchpad and republished as the work progressed.
- Per-track execution reports under the shared scratchpad's `exec/`
  directory (`wave1-B.md`, `wave1-C6-branches.log`, `wave3-A1.md` through
  `wave3-A5.md`, and `FINAL.md` once every track lands), plus the live
  handoff runbook (`exec/STATE.md`) that this record's Vercel-project facts
  and owner-action list were checked against on 2026-09-05.
- This track's own report:
  `scratchpad/exec/wave3-A5.md`.

## Note on this file's name

The operation's own internal notes call this file
`memory/decisions/2026-09-05-control-plane-reset.md`. It is filed here as
`ADR-2026-09-05-control-plane-reset.md` instead, because
`scripts/knowledge/check-ledger-integrity.mjs` (run by `npm run
knowledge:check`) validates every file in this directory except `README.md`
against `^ADR-\d{4}-\d{2}-\d{2}-[a-z0-9-]+\.md$` — the same convention the
directory's own `README.md` and all three prior decision records already
follow. The generated check outranks the informal name.
