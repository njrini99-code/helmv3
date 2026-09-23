<!-- markdownlint-disable MD013 -->
# Helm agent instructions

This is the operating policy for every agent in this repo (Claude Code, Codex,
Devin, Cursor, CI). Any other file that states policy is subordinate: where it
disagrees with this file, follow this file and fix the other one in the same
change. `CLAUDE.md` adds Claude Code specifics; `.claude/rules/` holds
path-scoped code conventions. Incidents, ADRs, audits and plans explain the
past; they do not override this file, the user's current instructions, or live
code. Fix a configuration bug in the configuration, not by adding a rule here.

## Authority

The user's current task authorizes the work needed to complete it:
implementation, verification, configuration repairs, and the Git operations
the task implies. Don't ask the user to repeat permission. Ask only for missing
information, or before an irreversible action the task did not cover. For
anything touching production, state the exact target and change before running
it.

## Done means

1. The change works: the checks that fit it ran once, with real exit codes;
   any check you could not run is named.
2. The mapped feature doc is updated if its contract changed.
3. The work is committed on a task branch, pushed
   (`git push -u origin <branch>`), and a PR is open — unless the user asked
   for something else (local only, no PR, or merge).
4. Merge only when the user asks (`npm run pr:land -- <n>`). Production only
   per "Production" below.
5. The final report says what changed, where it is, what was verified, and
   what was left untouched or unverified.

## Workspace and Git

Canonical repo: `/Users/ricknini/Downloads/helmv3`; `main` is its resting
branch. Start every task with `git status` and the current branch.

- **Solo session:** if canonical is clean on `main` and no other session is
  writing, you may branch in canonical for a quick fix. Otherwise use
  `scripts/new-worktree.sh <task>` (an `agent/<task>` branch under
  `~/worktrees/helmv3/`).
- **Parallel sessions:** each writer gets its own worktree or explicitly
  disjoint files. Treat dirty files you did not create as someone else's work:
  never overwrite, stage, stash, discard, or switch the branch under them.
  `npm run worktrees` shows what exists; a count warning is advice, not proof
  of activity. Disk limits are real: when space is short, share a checkout on
  disjoint files instead of creating another.
- Launch Claude with `h` (or `helm`) from any checkout. It opens Claude in
  that checkout and warns when the branch carries a stale copy of the agent
  config; merge `origin/main` when it does.
- Worktrees share canonical env files, local permissions, tool credentials and
  the Vercel project: isolation covers source, not access. Never print
  credential values. Run `node scripts/ensure-worktree-deps.mjs <dir>` only
  when dependencies differ or are missing.
- Stage explicit paths. Push an explicit branch. Never force-push `main`;
  after a rebase use `--force-with-lease` on your own task branch only. Never
  bypass required checks with `--admin`.
- Cleanup: `npm run worktrees:park` / `worktrees:retire`; `npm run pr:land --
  <n>` runs `--retire` itself. STANDING OWNER AUTHORIZATION covers only
  checkouts the tool verdicts PARKABLE and branches it verdicts
  DELETE_MERGED_EXACT. Never delete unrelated folders or branches to satisfy a
  count.

## Context

Before changing feature behavior, map the files:
`npm run knowledge:map -- --files <paths...>`, then read the doc the registry
names (`memory/registry.yml`; not every doc lives under `memory/features/`).
Update that doc when its contract changes; report or fix an unmapped file.
Trust order: live state, then generated files (`src/lib/types/database.ts`,
`AUTOGEN` blocks), then code, then feature docs, then everything else.

## Verification

Run the checks that fit the change (`/gates` picks them) once, preserving exit
codes. Rerun only after a new change or a failure. A changed `'use server'`
surface needs `npm run build`; a migration or policy needs database/RLS
verification (`npm run test:rls`); prose or config-only edits need the affected
tooling tests, not the suite. The pre-push hook checks pushed changes; GitHub
Actions owns the required merge checks. No hook blocks you from finishing a
turn. Never weaken, skip, or delete a test, or raise a baseline, to get green.
Reviewer agents are optional and risk-based, never a required ceremony.

## Tools

Use the tools present in this session. A missing tool or expired login is a
connection problem, not a policy ban: use a working connector or the repo-local
CLI (`./node_modules/.bin/{supabase,vercel}`). Never conclude a service is
unreachable from an old namespace table or a missing env token.

## Database

One production Supabase project (`qmnssrrolpinvwjjnufo`) serves Golf
(`golf_*`), Baseball (`baseball_*`) and Lift Lab (`helm_lifting_*`), with no
staging copy. Preserve RLS, sport boundaries, and customer data; keep secrets
out of output and commits. Local reset and migration work is fine. For
production: write a forward-only migration, get it reviewed and merged, then
apply it with `npm run db:apply -- <file>` or the project Supabase MCP after
confirming the target and SQL (`docs/operations/APPLY_PATH.md`), and verify the
resulting schema. Changing a row's status in `supabase/migrations/HELD.md` is
the owner's decision. Supabase access (MCP, CLI, SQL) is fully permitted for
Claude and Codex; the judgment above is the safeguard, not a permission rule.

## Production

`vercel.json` disables Vercel Git deployments: pushing or merging to `main`
does not deploy. Release only when the user asks for one. The release path is
`scripts/deploy-prod.sh` from a clean, current `main` checkout: it checks the
linked project, the clean tree and the weekly budget
(`config/release-policy.yml`), stamps the Sentry release, deploys, and verifies
the served commit. Prefer it over a bare `vercel deploy --prod`, which skips those
checks. Vercel access (CLI and MCP: deploy, promote, rollback, alias, env) is
fully permitted; use it when the task calls for it and state the target first.
Report a release as live only after `npm run release:status` shows the
approved SHA.

## Product conventions

Mobile/UI authority: `src/styles/design-tokens.css`, then
`src/components/fairway/**`, then `.claude/rules/design-system.md`. Reuse the
shared shell, safe areas, navigation, buttons, cards, and empty states; keep
one primary action per screen. Golf reliability context:
`memory/system/golfhelm-engineering-os.md` (it grants no production
authority). Required review automation: Review Gate and CodeQL
(`.claude/rules/code-review-tooling.md`).

## Guards

No permission rule denies or asks for Bash, Supabase, or Vercel. The one
guard hook, `guard-git`, blocks a few Git shapes that destroy other sessions'
work (force-push to `main`, bulk staging, raw worktree removal, `branch -D`);
it is a text matcher, not a security boundary. The generated
`docs/CONTROL_PLANE_ENFORCEMENT.md` lists what is actually wired.
