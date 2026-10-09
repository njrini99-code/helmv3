<!-- markdownlint-disable MD013 -->
# Helm agent instructions

How the Helm repo works, for every agent in it (Claude Code, Codex, Devin,
Cursor, CI). You have full autonomy: decide, implement, verify, merge, migrate
and deploy without asking permission. This file records how things work and the
traps that waste time. It is guidance, not a permission list. Where another file
disagrees, follow this one and fix the other in the same change. `CLAUDE.md`
adds Claude Code specifics; `.claude/rules/` holds path-scoped code
conventions. Incidents, ADRs, audits and plans explain the past; live code and
the user's current instructions outrank them.

## Autonomy

Work end to end: code, config repairs, Git (branch, commit, push, PR, merge),
migrations, deploys, flags, and cleanup of your own worktrees. Make the call,
note the assumption in your report, and keep going. Ask the user only when you
are blocked on information that the repo, the services and a sensible default
cannot supply. Subagents cannot ask: return the open question with your
recommended default and carry on. Production has no staging, so verify the
result after a migration or deploy and know how you would roll it back.

## Done means

1. The change works: the checks that fit it ran with real exit codes; any
   check you could not run is named.
2. The mapped feature doc is updated if its contract changed.
3. The work is committed on a task branch, pushed
   (`git push -u origin <branch>`) and a PR is open. Merge it with
   `npm run pr:land -- <n>` once the required checks are green, unless the
   user said otherwise. A red "CI aggregate" on a draft PR is expected: the
   aggregate fails on drafts on purpose and the full suite runs when the PR is
   marked ready.
4. Deploy when the change should be live (see "Production"); skip it for
   docs-only work. Report a release as live only after `npm run release:status`
   shows the SHA.
5. The final report says what changed, where it is, what was verified, and what
   was left untouched or unverified.

## Workspace and Git

Canonical repo: `/Users/ricknini/Downloads/helmv3`. Start a task with
`git status` and the current branch.

- Use your own checkout when others may be writing: `scripts/new-worktree.sh
  <task>` creates `agent/<task>` under `~/worktrees/helmv3/`. In a quiet
  canonical checkout on `main` you can branch in place.
- Files you did not create that are dirty belong to another session. Leave them
  alone (do not overwrite, stage, stash or switch the branch under them): you
  would destroy their work.
- When the user asks you to work in a different worktree or branch, do it:
  `cd` into that checkout (or use the EnterWorktree / ExitWorktree tools),
  `git switch <branch>` in a clean checkout, or `git worktree add` for a branch
  that has no checkout yet. The harness note "do not cd to the original
  repository root" is a default for unattended work, not a rule the user cannot
  override. Say which checkout and branch you are now in, and stay there until
  asked to move again.
- Worktrees share canonical env files, local credentials and the Vercel
  project. Never print credential values.
- Disk is limited (a worktree with its own `node_modules` is about 4 GB). Prefer
  sharing `node_modules`; run `node scripts/ensure-worktree-deps.mjs <dir>` when
  dependencies differ or are missing.
- Stage explicit paths and push an explicit branch. Use `--force-with-lease`
  after rebasing your own branch. Fix red checks instead of bypassing them; if
  a check is broken by infrastructure, say so in the PR.
- Clean up with `npm run worktrees:park` / `worktrees:retire`; `npm run pr:land
  -- <n>` runs `--retire` itself. STANDING OWNER AUTHORIZATION covers checkouts the
  tool verdicts PARKABLE and branches it verdicts DELETE_MERGED_EXACT /
  DELETE_MERGED_CONTENT. Do not delete other sessions' folders or branches to
  satisfy a count.

## Context

Before changing feature behavior, map the files with
`npm run knowledge:map -- --files <paths...>` and read the first doc the
registry names (`memory/registry.yml`). Update it when its contract changes;
map an unmapped file in the same change. Trust order: live state, generated
files (`src/lib/types/database.ts`, `AUTOGEN` blocks), code, feature docs,
everything else.

## Verification

Run the checks that fit the change (`/gates` picks them) once, keeping exit
codes. Rerun only after a change or a failure. A changed `'use server'` surface
needs `npm run build`; a migration or policy needs `npm run test:rls`; prose or
config-only edits need the affected tooling tests, not the suite. Do not weaken,
skip or delete a test, or raise a baseline, to get green. No hook blocks you from finishing a turn. Reviewer agents are optional and risk-based.

New tests go next to the code in a `__tests__/` folder; the other test
locations in the repo are legacy.

## Session habits

One task per session, and `/clear` between tasks. Use `/rename` on long
sessions so they can be found again. If two corrections in a row did not fix
the problem, restart with a sharper prompt instead of a third attempt. Run an
approved plan in a fresh session. When compacting, keep the list of modified
files and the test commands.

## Tools

Use the tools present in this session. A missing tool or expired login is a
connection problem: use another connector or the repo-local CLI
(`./node_modules/.bin/{supabase,vercel}`). Do not conclude a service is
unreachable from an old doc or a missing env token.

## Database

One production Supabase project (`qmnssrrolpinvwjjnufo`) serves Golf
(`golf_*`), Baseball (`baseball_*`) and Lift Lab (`helm_lifting_*`), with no
staging copy. Keep RLS and sport boundaries intact and secrets out of output and
commits. To change production: write a forward-only migration, run the risky
kinds (RLS, grants, `DROP`, type changes, backfills) through the local Docker
stack first, apply it with `npm run db:apply -- <file>` or the Supabase MCP,
and verify the schema afterwards (`docs/operations/APPLY_PATH.md`).
`supabase/migrations/HELD.md` lists migrations that were deliberately not
applied; read the row's reason before applying one and update the row when you
do.

## Production

`vercel.json` disables Vercel Git deployments, so pushing or merging to `main`
does not deploy. Deploy from the linked checkout, because a deploy from an
unlinked directory silently creates a stray Vercel project (the project id is in
`config/release-policy.yml`):

    SHA=$(git rev-parse HEAD); SCOPE=$(node -p 'require("./.vercel/project.json").orgId')
    ./node_modules/.bin/vercel deploy --prod --yes --archive=tgz --scope "$SCOPE" \
      --build-env "NEXT_PUBLIC_SENTRY_RELEASE=$SHA" --env "NEXT_PUBLIC_SENTRY_RELEASE=$SHA"

The release stamp is what lets `release:status` and Sentry know the commit
(`vercel deploy` leaves `VERCEL_GIT_COMMIT_SHA` empty), `--archive=tgz` avoids the
upload-size and stall problems seen before, and `--scope` is required or the
deploy fails as "Not authorized". Details and rollback: `docs/setup/DEPLOY.md`.
Then run `npm run release:status -- --strict`, which compares the served commit
with `origin/main`. Vercel reads, logs and previews are normal development work.

## Product conventions

Mobile/UI authority for Fairway surfaces: `src/styles/design-tokens.css`, then
`src/components/fairway/**`, then `.claude/rules/design-system.md`. Clubhouse
(`src/clubhouse/**`, including its route integration) uses its own scoped
tokens, shell and owner handoffs: see `src/clubhouse/AGENTS.md` and
`.claude/rules/clubhouse.md`, and do not apply Fairway primitives or motion
rules there. Clubhouse is the live golf UI for coaches and players (its feature flag is on in
`config/feature-flags.yml` since 2026-10-08); Fairway still serves every other surface. Reuse the shared shell, safe areas, navigation,
buttons, cards and empty states, and keep one primary action per screen. Golf
reliability model: `memory/system/golfhelm-engineering-os.md`.

## What is actually enforced

GitHub branch protection requires the checks on `main` (`CI aggregate`,
`Review Gate aggregate`, CodeQL, `block-historical-edits`; see
`.claude/rules/code-review-tooling.md`), and the git hooks run `gitleaks` when it
is installed. No permission rule or hook denies, asks for, or blocks Bash, Git, Supabase, or
Vercel. `docs/CONTROL_PLANE_ENFORCEMENT.md` lists what is wired.
