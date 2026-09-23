<!-- markdownlint-disable MD013 -->
# Helm agent instructions

## Authority and execution

The user's current task authorizes the work needed to complete it. Do the
implementation, relevant verification, and requested Git operations without
asking the user to repeat permission. Ask only for missing information or an
irreversible action outside that authorization. A task involving production
must identify the intended target and change before execution.

Owner decisions are asked, not assumed or parked in a status report: product
behavior, cost or billing, production migrations, deploys, enabling feature
flags, and merging or closing someone else's PR. Ask with AskUserQuestion,
put a recommended option first with its trade-off, batch related questions,
and keep working on anything that does not depend on the answer. When unsure
about intent, scope, or which of two reasonable designs to build, ask before
building.

This file is the single operating policy. CLAUDE.md is a technical adapter;
path-scoped rules cover code conventions. Historical incidents, old plans,
agent templates, and cached tool inventories do not override current user
instructions or live code. Do not add a new rule to fix a configuration bug.

## Workspace and Git

Canonical repo: `/Users/ricknini/Downloads/helmv3`. Check the current branch
and dirty files before editing. One session may work directly in canonical;
concurrent writers use separate worktrees or explicitly disjoint files.
Never overwrite another session's work or switch its branch underneath it.

Use `helm` or `h` to launch Claude with current canonical tools and agents
while staying in the selected Helm worktree. This prevents historical branch
settings from restoring retired restrictions. Direct `claude` launches still
use the branch's settings.

Prefer `scripts/new-worktree.sh <task>` for an isolated task. It creates an
`agent/<task>` branch without tracking origin/main. A workspace-count warning
is capacity advice, not proof of active processes. Disk limits still apply;
when storage is short, use the existing checkout for disjoint files instead
of creating another copy. Run `node scripts/ensure-worktree-deps.mjs <dir>`
only when dependencies differ or are unavailable — or pass `--install` to
`scripts/new-worktree.sh` at creation time to run that same install upfront
instead of the default node_modules symlink. Worktrees share canonical
environment files, Claude local permissions, tool credentials, and Vercel
project identity. Branch isolation separates source changes, not tool access.
Runtime files remain ignored and linked; never print credential values.

Stage explicit paths. Before pushing, inspect the upstream and push an
explicit branch: `git push -u origin <branch>`, then `gh pr create --draft`
and `gh pr ready` once preflight is green (CI runs once, on ready). Do not
force-push main or discard uncommitted work. Use `npm run pr:land -- <n>`
for the normal merge-and-sync workflow; an explicitly authorized GitHub merge is also valid
once required checks pass. Do not bypass required checks with `--admin`.

Use `npm run worktrees{,:park,:retire}` to retire work safely.
STANDING OWNER AUTHORIZATION covers only tool-verdicted PARKABLE checkouts
and DELETE_MERGED_EXACT branches. The landing script runs `--retire`. The lifecycle
checks preserve dirty, unpushed, or active work and archive proven-merged
branches. Main is the resting branch after a completed task. Do not delete
unrelated folders or branches to satisfy a workspace count.

## Context and verification

Use `memory/registry.yml` and `npm run knowledge:map -- --files <paths...>`
to find the relevant feature doc before changing feature behavior. Read the
doc the registry actually names; not every feature lives under
`memory/features/`. Update that doc when its contract changes. If a file is
unmapped, report or repair the gap. Use the code graph when available; fall
back to `rg` when it is unavailable or incomplete.

Run checks appropriate to the changed behavior once, preserving their exit
codes. A new change or a failure justifies repeating affected checks. Do not
run the whole suite for prose or config-only edits. A changed server-action
surface needs a build; migrations need database/RLS verification. Report
unavailable checks honestly. There is no mandatory Stop gate.

Before any push or PR: `npm run preflight` (add `--full` for migrations,
`use server`, or broad changes). Open PRs as drafts; mark ready when
preflight passes. Its exit code is the answer. It mirrors the required CI
checks from the workflow files; fix everything it reports in one batch, and
push once. The pre-push hook and a Claude hook enforce it. A failure that is
pre-existing on main or infrastructure noise is reported, not pushed around.

## Tools and environments

Discover the tools present in the current session. A missing tool or expired
login is a connection problem, not a permanent policy ban. Use a working
connector or the repo-local CLI; never claim a service is unavailable based
only on an old namespace or a missing environment token.

The project Supabase MCP is scoped to Helm and supports reads and writes.
Use it or the authenticated repo-local CLI for task-authorized database work.
Review migration SQL and target first, then verify the resulting schema. Local
Supabase reset/migration work is allowed. Production is shared by Golf,
Baseball and Lift Lab; preserve RLS, sport boundaries, and customer data.
Keep secrets out of output and commits.

Vercel reads, logs, and previews are normal development work. Production
deploys are manual and happen only when the owner says to deploy.
`vercel.json` disables Vercel Git deployments, so pushing or merging to
`main` never deploys; merged work waits in `npm run release:status` until a
release. The release path is `scripts/deploy-prod.sh`, run by the owner from a
clean, current `main` checkout (`! scripts/deploy-prod.sh` in a Claude
session): it checks the linked project, the tree and the weekly budget
(`config/release-policy.yml`), stamps the Sentry release, deploys, and
verifies the served commit. Agents are denied the script and `vercel --prod`;
they prepare the release and verify it afterwards. Report a release live only
after `npm run release:status` shows the released SHA. Rollback and promote of
an existing deployment also require explicit owner authorization. Use
repo-local Supabase/Vercel binaries.

## Product conventions

Mobile authority: `src/styles/design-tokens.css` →
`src/components/fairway/**` → `.claude/rules/design-system.md`.
Reuse the shared app shell, safe areas, navigation, buttons, cards, and empty
states. Keep one primary action per screen. For overlay/layout defects use
`ui-stability-debugger-v2`. Golf reliability context lives in
`memory/system/golfhelm-engineering-os.md`; it does not grant production
mutation authority. Review Gate and CodeQL are the required review tools;
`.claude/rules/code-review-tooling.md` describes them.
