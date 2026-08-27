# AGENTS.md

## Repo map

- `docs/REPO_MAP.md` is the structural map of this repo for agents: the
  resolved route atlas for BaseballHelm/GolfHelm/Lift Lab/Admin (route
  groups resolved, per-role rails), the canonical idioms table (action
  wrappers, toast, data access, design tokens per product, nav
  registries, error-boundary pattern — each with a file:line anchor),
  the known traps list, and a before-you-write-code checklist.
- Read it before adding a new route, a new action wrapper/toast/data-access
  call, or a new design-token consumer — it exists so you don't have to
  re-derive these conventions by grepping from scratch.
- It maps *shape and convention*, not feature behavior — for feature
  behavior, use the Feature awareness routing below.

## Feature awareness

- Treat `memory/registry.yml` as the feature routing table for AI work.
- Before changing or reviewing mapped feature code, identify impacted files, map them through `memory/registry.yml`, and read the mapped `memory/features/*.md` current-state docs first.
- Use `npm run knowledge:map -- --files <paths...>` to find impacted features.
- Use `npm run knowledge:context -- --files <paths...> --task "<task>"` to build `/tmp/helmv3-context-pack.md` for larger changes or PR reviews.
- If a feature is missing from `memory/registry.yml`, say so and either add the mapping or explicitly mark the feature-awareness gap.
- Do not silently change business behavior without updating the relevant `memory/features/*` current-state doc or explaining why no doc update is needed.

## GolfHelm Engineering Operating System

All agents working on GolfHelm or GolfHelm-facing CoachHelm code must operate
through `memory/system/golfhelm-engineering-os.md`.

`memory/registry.yml` is the semantic router.
`memory/features/*` is the canonical current-state feature corpus.
Generated/live/code truth outranks prose.

Production monitoring and production deployment are separate workflows.
A daily reliability run MUST NOT deploy production.

## Mobile and UI

**Canonical sources, in authority order:** `src/styles/design-tokens.css` (the
`--fw-*` tokens) → the shipped `src/components/fairway/**` components →
`.claude/rules/design-system.md`, which is the binding invariant and loads
automatically on any `.tsx`/`.css`. Tokens beat prose.

The shell, header patterns, bottom-nav-vs-drawer split, spacing scale and
empty-state rules that used to be listed here now live in that rule, where they
load only when you touch UI rather than on every session.

Two skill notes that are not in the rule and are easy to get wrong:

- `modern-saas-ui` is **craft guidance only** — hierarchy, density, motion,
  empty-state judgement. It does not encode this repo's tokens: zero references
  to the canonical sources, and ~31 uses of the glass / `bg-white` / `gray-*`
  vocabulary that `design-system.md` declares RETIRED. Take *feel* from it and
  *classes* from the tokens.
- For layout defects — overlays, jitter, breakpoints, z-index — use
  `ui-stability-debugger-v2`. It targets bugs, not aesthetics.

## Review and CI

**There are no AI reviewers on PRs.** The external bots were dropped 2026-07-20
by founder decision — their quota was the slowest step in shipping and the
Review Gate plus CodeQL cover the same hard rules deterministically. Do not wait
for a review comment that is never coming, and do not read its absence as a
check still pending.

- `.coderabbit.yaml` is a **disable stub**, not live config.
- The rule packs under `.coderabbit/ast-grep/` and `.coderabbit/semgrep/`
  **remain load-bearing** — `review-gate.yml` consumes them directly. Treat the
  directory name as historical; they are CI assets now.
- `.gitleaks.toml` carries this project's own secret patterns.

**Two platforms.** GitHub Actions owns the per-PR fast path (`ci.yml`,
`review-gate.yml`): typecheck, lint, vitest, build, RLS, static analysers.
CircleCI (`.circleci/config.yml`) owns the weekly heavy jobs — Knip, Stryker,
sqlfluff, npm audit, Squawk — and the iOS Capacitor compile on M-series runners.

**Blocking hard rules** (must be `error`-clean to merge): service-role key in a
client bundle · new table without RLS + policy in the same migration · server
action without `supabase.auth.getUser()` before any DB call · bare table name
without a sport prefix · DELETE-then-INSERT in a save/submit/sync path.

**A red or stuck check:** `docs/CI_RUNBOOK.md` classifies every check as
hard-gate vs advisory, with rerun commands. Read it before treating a red as a
merge blocker — several are advisory.

**Required-check names are a trap, and the failure mode is silence.** The
canonical account is `.github/branch-protection.md` — read it there. In short: a
required context is matched by NAME, the aggregate jobs were renamed, and the
CodeQL matrix *renders* its three `Analyze (...)` names, so a stale required list
makes every PR permanently unsatisfiable with no error saying why. That fact was
duplicated in four files as of 2026-08-27; it now lives in one, and everything
else points here.

## Cursor Cloud

Setup for that environment — Docker, the local Supabase stack, and the Caddy TLS
proxy the CSP requires — is in `docs/setup/CURSOR_CLOUD.md`. It moved out of this
file on 2026-08-27 because it loaded into every session in every environment.

## Helm agent canonicality

The canonical working repository is `/Users/ricknini/Downloads/helmv3`.

- **Git resting-state policy:** `main` is home — the normal clean resting
  branch. Task branches are temporary active work. Never silently switch away
  from a dirty task branch or from work not yet represented on `main`. Once a
  task is merged and verified, retire its branch/worktree and return the
  canonical checkout to clean `main`. Never assume `main` is what is currently
  checked out.
- **Concurrent sessions: one checkout cannot serialize them.** The
  resting-state policy governs the canonical checkout; it cannot stop two
  live sessions from moving one HEAD under each other. When more than one
  agent session works in this repo at once, each session doing task work
  takes its own worktree OUTSIDE the repo (`/private/tmp/helmv3-<task>` or
  `~/worktrees/`) and leaves the canonical checkout alone. Deploys promote
  from a worktree pinned at the exact merged `main` SHA, never from a
  checkout another session may be mutating. Remove the worktree when the
  task is merged and verified. (Added 2026-08-26 after three concurrent
  sessions — iOS, bridge, hotfix — contended over one HEAD; the hotfix
  session's worktree dodge is now the rule.)
- A single active session may work in the canonical checkout directly; do
  not create a worktree without a reason (concurrency above, or an explicit
  user request), and remove any temporary worktree when its task completes.
- `archive/**` and `docs/archive/**` were deleted from the working tree on
  2026-08-27 (1,265 files). They live in git history and nowhere else, which is
  the point: they were historical evidence that no rule could stop an agent
  from reading as current. Recover a specific file with
  `git log --diff-filter=D --name-only -- <path>` then `git show <sha>^:<path>`.
  Do not restore the directories.
- Current source code, current migrations, current tests, `AGENTS.md`, `CLAUDE.md`, and active documentation outrank anything recovered from history.
- Use repo-local platform CLIs: `./node_modules/.bin/supabase` and `./node_modules/.bin/vercel`. Do not assume global Supabase or Vercel binaries.
- Production Supabase MCP access must remain project-scoped and read-only. Schema changes belong in the local development stack and reviewed migrations.
- Never treat an agent memory store, code index, or cache as more authoritative than the current repository and current database evidence.
- Never deploy/promote/rollback Vercel production unless the user explicitly requests that production action.
<!-- HELM_AGENT_CANONICALITY_END -->
