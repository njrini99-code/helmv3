# HelmV3 Repo Freshness Baseline - 2026-07-03

## 1. Scope And Safety Rules

This baseline follows the attached "Full Repo Freshness, Git Cleanup, Dead Code Removal, DB Hygiene, Issue Cleanup, and Clean State Runbook" first-task scope.

No production database mutation was performed. No GitHub issues or PRs were closed. No branches were deleted. No source files were intentionally changed besides this audit document.

## 2. Executive Verdict

The repo is buildable and testable on `main` after the Helm Bridge merge, but the local checkout is not a clean maintenance baseline yet.

Primary blockers before cleanup automation:

- The working tree already has two generated-file diffs: `next-env.d.ts` and `public/sw.js`.
- `git fsck --full` exits nonzero because local commit-graph metadata references missing objects.
- There are 24 stashes, including several old `main` and feature-branch WIP entries.
- There are 6 local non-main branches that are merged into `main` and now track deleted upstreams.
- Ignored local artifacts are very large and broad: `git clean -Xdn` reports 791 removable ignored paths.
- Full dependency audit reports 39 vulnerabilities, including 4 high-severity transitive `ws` findings.
- Linked Supabase lint fails on two real public-function errors plus warnings.
- Knip reports dead-code/dependency/export findings that need a dedicated triage PR before any deletion.

## 3. Current Git State

Commands run:

- `git status --short --branch`
- `git branch --show-current`
- `git rev-parse --short HEAD`
- `git remote -v`
- `git worktree list`
- `git stash list`
- `git fetch --all --prune --tags`

Current state:

- Branch: `main`
- HEAD: `8b9986e1a`
- Tracking: `main...origin/main`
- Latest commit: `fix(admin): wire bridge incident hygiene and visibility`
- Remote: `origin https://github.com/njrini99-code/helmv3.git`
- Worktree list: `/Users/ricknini/Downloads/helmv3 8b9986e1a [main]`
- Dirty files:
  - `next-env.d.ts`
  - `public/sw.js`

Dirty diff summary:

- `next-env.d.ts` imports `./.next/types/routes.d.ts` instead of `./.next/dev/types/routes.d.ts`.
- `public/sw.js` has a generated cache version bump from `golfhelm-v48d739cec` to `golfhelm-v8b9986e1a`.
- `npm run build` confirmed `public/sw.js` is stamped by `scripts/stamp-sw.mjs` during `prebuild`.

## 4. Remote Prune Result

`git fetch --all --prune --tags` pruned many stale remote-tracking refs, including old cleanup, telemetry, hotfix, Dependabot, docs, and fix branches.

After fetch, `git remote prune origin --dry-run` had no remaining output.

## 5. Local Branch Inventory

`git branch --merged main` shows all local non-main branches are merged into `main`.

Safe local branch deletion candidates after explicit cleanup approval:

- `chore/clean-slate-20260704`
- `feat/liftlab-helm-unification`
- `fix/admin-consolidated-20260703`
- `hotfix/green-main-ci-env`
- `hotfix/semgrep-comment-fp`
- `hotfix/visx-subpackages`

All 6 are marked `[gone]` in `git branch -vv` after fetch/prune.

`git branch --no-merged main` returned no local branches.

## 6. Remaining Remote Branches

Remote branches still present after prune include:

- Active project branches: `chore/fairway-ui-review`, `chore/qodo-free-issue-wiring`, `cleanup/comprehensive-code-audit`, `docs/helm-mission-control-phase-1`
- Bridge/admin branches: `feat/bridge-*`, `feat/helm-bridge-command-center`, `fix/bridge-*`
- Baseball and QA branches: `fix/baseball-504-auto`, `fix/coachhelm-p0`, `fix/qa-*`
- Test-hardening branches: `test-hardening/free-production-readiness-stack`, `test-hardening/golf-stats-coachhelm-contracts`
- Dependabot branches for open dependency PRs

Do not delete remote branches in an automated pass. Next step should map each remote branch to an open PR, merged PR, or orphaned branch before proposing deletion.

## 7. Stash Inventory

`git stash list` reports 24 stashes.

High-risk buckets:

- Recent bridge/admin WIP: `stash@{0}` on `feat/helm-bridge-instr-b9`
- Vercel auto-deploy/PR stack work: `stash@{1}` through `stash@{6}`
- Multiple old `main` WIP stashes: `stash@{7}`, `stash@{8}`, `stash@{9}`, `stash@{11}`, `stash@{19}`, `stash@{20}`, `stash@{21}`, `stash@{22}`, `stash@{23}`
- Feature/security/audit stashes across CoachHelm, Baseball, testing, and Agent City work

Do not drop any stash until a dedicated stash audit records `git stash show --stat` and either preserves, branches, or discards each entry with a reason.

## 8. Git Object And Local Metadata Health

`git count-objects -vH`:

- Loose objects: 429
- Loose size: 3.41 MiB
- Packed objects: 76041
- Packs: 5
- Pack size: 198.90 MiB
- Garbage: 0

`git fsck --full` exited `16`.

Observed counts from `git fsck --full`:

- `failed to parse commit`: 75
- `dangling commit`: 1411
- `dangling tree`: 1698
- `dangling blob`: 33

The actionable finding is the 75 commit-graph parse failures. This looks like stale/corrupt local commit-graph metadata rather than application code breakage. Recommended next safe local-only fix: rewrite or remove commit-graph metadata, then rerun `git fsck --full`.

## 9. Untracked And Ignored Artifact Audit

`git clean -nd` returned no output.

`git clean -Xdn` reported 791 ignored removable paths. Major categories include:

- `.next/`
- `node_modules/`
- `.helmdev/` screenshots and workflow artifacts
- `.playwright-mcp/` screenshots, YAML snapshots, and console logs
- `.vercel/`, `.vscode/`, `.codex/`, `.claude/`, `.worktrees/`
- iOS build/cache output
- generated screenshots, PDFs, decks, zip files, and temporary audit outputs

No cleanup was performed. A future local artifact cleanup should start with targeted removal of generated caches and screenshot/log folders, not a blind `git clean -Xdf`.

## 10. GitHub PR Baseline

`gh auth status` is authenticated as `njrini99-code` with `repo` and `workflow` scopes.

Open PR count: 9.

All open PRs are Dependabot PRs:

- `#767` production dependencies group, `CHANGES_REQUESTED`
- `#766` helm-website-ui group, `CHANGES_REQUESTED`
- `#765` ux-flow-auditor group, `CHANGES_REQUESTED`
- `#764` dev-dependencies group, `CHANGES_REQUESTED`
- `#760` `@visx/visx` 4.0.0, `REVIEW_REQUIRED`
- `#753` Puppeteer in `tools/ultra-agent-audit`, `REVIEW_REQUIRED`
- `#744` GitHub Actions group, `CHANGES_REQUESTED`
- `#741` Anthropic SDK in `helm-intelligence`, `APPROVED`
- `#735` `tar` 7.5.19, `APPROVED`

Recommended order:

1. Start with approved security/small PRs: `#735`, `#741`.
2. Re-run CI and package gates after each.
3. Treat grouped dependency PRs as separate PRs, not one bulk merge.

## 11. GitHub Issue Baseline

Open issue count from `gh issue list --state open --limit 200`: 24.

Most visible groups:

- Supabase drift/errors: `#732`, `#728`, `#651`
- Baseball RLS/security follow-ups: `#520`, `#519`, `#394`, `#391`
- Baseball module/runtime correctness: `#504`, `#503`, `#431`, `#430`
- Baseball mobile/UX route work: `#485` through `#479`
- Baseball stats/testing/contracts: `#382`, `#379`, `#377`, `#373`, `#372`
- Partner GolfHelm item: `#632`

Do not close issues automatically. Next cleanup step should tag each issue as one of:

- still valid
- fixed but needs evidence comment
- duplicate/superseded
- blocked by DB/admin access
- backlog/product decision

## 12. Package Freshness

`npm outdated` exits `1`, as expected when packages are outdated.

Notable update families:

- Next.js: `16.2.7` current, `16.2.10` wanted/latest
- Sentry: `10.56.0` current, `10.63.0` wanted/latest
- Supabase JS: `2.107.0` current, `2.110.0` wanted/latest
- Supabase CLI: `2.107.0` current, `2.109.0` wanted/latest
- Datadog browser packages: `6.25.3` current, `6.33.0` wanted, `7.4.0` latest
- Capacitor packages: mostly patch updates from `8.4.0` to `8.4.1`
- `tar`: `7.5.15` current, `7.5.19` wanted/latest
- Tooling: eslint, typescript-eslint, tsx, jsdom, knip, vite plugin updates
- Major updates available but not safe to bulk-merge: `ai`, `@ai-sdk/anthropic`, `lucide-react`, `tailwindcss`, `typescript`, `@visx/*`

## 13. Security Audit Baseline

`npm audit --omit=dev` exits `1`.

Reported production dependency audit summary:

- 32 vulnerabilities total
- 1 low
- 31 moderate

Notable advisory families:

- `tar <=7.5.15`, fix available via `npm audit fix`
- `@babel/core <=7.29.0`, fix available via `npm audit fix`
- `@opentelemetry/core <2.8.0` and related OpenTelemetry packages, fix available via `npm audit fix`
- `js-yaml 4.0.0 - 4.1.1`, fix available via `npm audit fix`
- `protobufjs <=7.6.2`, fix available via `npm audit fix`
- `postcss <8.5.10` nested under Next.js; npm suggests `npm audit fix --force` but that output proposes a bad downgrade path and should not be used blindly.

Full `npm audit` also exits `1`.

Full audit summary:

- 39 vulnerabilities total
- 1 low
- 34 moderate
- 4 high

Additional full-audit-only notable findings:

- `ws` high-severity memory-exhaustion DoS through `engine.io`, `engine.io-client`, `socket.io-adapter`, and `webpack-bundle-analyzer` paths.
- `uuid <11.1.1` via `@lhci/cli`.
- Additional `js-yaml` and `protobufjs` ranges through dev/tooling dependencies.

`npm audit fix --dry-run` was run. It did not change the working tree, but it proposed a large dependency reshuffle:

- 152 packages added
- 24 packages removed
- 122 packages changed
- includes Next.js `16.2.7 -> 16.2.10`, `tar 7.5.15 -> 7.5.19`, `ws 7.5.10 -> 7.5.11`, OpenTelemetry package upgrades, Babel patch upgrades, and protobuf/js-yaml updates

Because the dry-run proposes broad observability/tooling movement, do not apply it as a blind cleanup.

Recommended security PR order:

1. Merge or reproduce Dependabot `#735` for `tar`.
2. Patch Next.js to the wanted patch version before attempting any force audit fix.
3. Inspect OpenTelemetry dependency source before bumping observability packages.

## 14. Verification Gates

Gates run on `main` at `8b9986e1a`:

- `npm run lint`: passed
- `npm run typecheck`: passed
- `npm run test -- --run`: passed
- `npm run build`: passed
- `npm run lint:ratchet`: passed
- `npm run test:run`: passed
- `npm run test:business`: passed
- `npm run test:rls`: passed
- `npm run docs:check`: passed
- `npm run knowledge:check`: passed
- `npm run baseball:route-coverage`: passed
- `npm run check:types-drift`: skipped authoritative production check because `SUPABASE_ACCESS_TOKEN` is not configured
- `npm run db:types:check`: skipped because it regenerates `src/lib/types/database.ts` before diffing it
- `npm run check:ledger`: not directly runnable without ledger JSON on stdin; see Supabase section

Unit test result:

- Test files: 428 passed, 1 skipped
- Tests: 4398 passed, 39 skipped
- Duration: 61.80s
- Repeated warning: `localStorage is not available because --localstorage-file was not provided`

`npm run test:run` result:

- Test files: 428 passed, 1 skipped
- Tests: 4398 passed, 39 skipped
- Duration: 59.61s

`npm run test:business` result:

- Test files: 440 passed, 1 skipped
- Tests: 4472 passed, 39 skipped
- Duration: 117.76s

`npm run test:rls` result:

- Test files: 440 passed, 1 skipped
- Tests: 4472 passed, 39 skipped
- Duration: 118.11s

Build result:

- Next.js `16.2.7`
- Production build compiled successfully
- TypeScript completed successfully
- Static generation completed for 187 pages
- Admin Bridge routes are present in the built app route table, including `/admin/errors` and `/admin/errors/[fingerprint]`

Docs and knowledge result:

- `docs:check` regenerated inventory docs and exited cleanly, so tracked inventory docs are current.
- `knowledge:check` returned `Knowledge coverage clean. No mapped feature code changes found.`

Route coverage result:

- `baseball:route-coverage` wrote `docs/operations/generated/route-coverage-report.json`.
- Report summary: 119 disk routes, 92 declared hrefs, 62 total gaps across 5 buckets.
- The command did not add tracked working-tree changes in this pass.

## 15. Knip Dead-Code And Dependency Audit

`npx knip` exits `1` with findings. No deletions were performed.

Top-level `npx knip` summary:

- 8 unused files
- 5 unused dependencies
- 1 unused devDependency
- 5 unlisted dependencies
- 695 unused exports
- 1 configuration hint

Unused files reported:

- `src/components/baseball/dashboard/dashboard-types.ts`
- `src/components/baseball/recruiting-philosophy/MatchScoreBadge.tsx`
- `src/components/products/golf-mockups/index.tsx`
- `src/lib/admin/__tests__/fixtures/broken-delegation.fixture.ts`
- `src/lib/admin/__tests__/fixtures/unwrapped-actions.fixture.ts`
- `src/lib/mapbox/client.ts`
- `src/lib/recruiting/match-calculator.ts`
- `src/lib/types/table.ts`

`npx knip --dependencies` tighter dependency findings:

- Unused dependencies: `@capacitor/app`, `@capacitor/ios`, `@capacitor/local-notifications`, `@capacitor/network`, `@capacitor/share`
- Unused devDependency: `postgres`
- Unlisted dependencies: `postcss-load-config`, `@radix-ui/react-compose-refs`, `fflate`
- Configuration hint: `next.config.mjs` has a redundant entry pattern in `knip.json`

`npx knip --production` is much noisier and reports 60 unused dependencies. Treat that as a signal to tune Knip configuration for framework/runtime entrypoints before acting.

`npx knip --exports` reports 695 unused exports. This is too broad for bulk deletion; prioritize by feature ownership and export barrel patterns.

`npx knip --files` reports the same 8 unused files listed above.

## 16. Supabase Read-Only Checks

Supabase guidance was loaded before running DB-adjacent commands. No DB writes or migrations were applied.

Supabase CLI:

- Installed CLI: `2.101.0`
- CLI reports newer available version: `2.109.0`

`DATABASE_URL`:

- Not present in this shell, so `check:ledger` could not be run with the documented `psql "$DATABASE_URL" ... | node scripts/check-migration-ledger.mjs` flow.

Local Supabase:

- `supabase migration list --local`: failed because local Postgres at `127.0.0.1:54322` is not running.
- `supabase db lint --local --schema public --level warning --fail-on warning`: failed for the same local Postgres connection reason.

Linked Supabase:

- `supabase migration list --linked`: ran successfully and showed substantial local/remote migration mismatch. Many old remote-only rows exist, and many recent local migrations are not present remotely.
- `supabase db lint --linked --schema public --level warning --fail-on warning`: exited `1`.

Linked lint findings:

- Error: `public.can_manage_baseball_lift_group` references missing relation `public.baseball_strength_groups`.
- Error: `public.baseball_accept_staff_invite` references missing record field `v_invitation.invitee_email`.
- Warning: `public.get_golf_conversations_with_details` has unused parameter `p_user_id`.
- Warning: `public.sg_expected_strokes` has shadowed/unused loop variable `i`.

`supabase db diff --linked --schema public`:

- Failed before producing a diff because Docker is not running; the CLI tried to create a local shadow database.

These Supabase results are read-only evidence of DB drift/hygiene work still needed. Do not repair the linked migration ledger or apply migrations without a reviewed DB-specific audit and approval.

## 17. GitHub PR/Issue Expanded Baseline

Additional read-only GitHub checks:

- `gh pr list --state all --limit 200 ...`
- `gh issue list --state all --limit 200 ...`

Recent all-state PR read confirms the current open set is Dependabot-only while the recent Bridge/admin/hotfix train has merged. Examples:

- `#771`, `#770`, `#769`, `#768`, `#763`, `#762`, `#740`, `#739`, `#738`, `#737`, `#736`, `#734`, `#733`, `#731`, `#730`, `#729`, `#727` are merged.
- Recent closed Dependabot PRs exist for superseded individual bumps after grouping.

The all-state issue read confirms several Baseball issues are already closed while the open count remains 24. This reinforces that issue cleanup should be evidence-commented and grouped rather than bulk-closed.

## 18. Skipped Or Deferred Checks

`npm ci` was not run because `node_modules` and `package-lock.json` are already present and this pass avoids unnecessary dependency-tree churn.

`npm run db:types:check` was not run because the script runs `npm run db:types` before diffing `src/lib/types/database.ts`; that is a generated source-file mutation and should be done in a clean disposable worktree or a dedicated DB-types PR.

No destructive Git cleanup was run:

- no `git remote prune origin` beyond fetch/prune and dry-run
- no `git branch -d` / `git branch -D`
- no `git clean -fd`, `git clean -Xdf`, or `git clean -xfd`
- no `git worktree prune` beyond dry-run
- no `git gc`

No GitHub mutations were run:

- no label creation
- no PR close
- no issue close
- no branch deletion

No dependency mutations were run:

- no `npm audit fix`
- no `npm audit fix --force`
- no `npm prune`
- no `npm dedupe`

No dead-code deletion was performed.

## 19. Recommended Small PR Sequence

1. Local metadata and generated-file hygiene PR:
   - Decide whether `next-env.d.ts` and `public/sw.js` should be committed, ignored differently, or regenerated in CI only.
   - Repair local commit-graph metadata and re-run `git fsck --full`.

2. Local branch and stash audit:
   - Delete the 6 merged `[gone]` local branches after approval.
   - Produce a stash manifest before dropping or preserving each stash.

3. Dependency security PRs:
   - Start with `tar` and small approved Dependabot PRs.
   - Patch Next.js and Sentry/Supabase in separate PRs with full gates.

4. GitHub issue cleanup PR/process:
   - Produce an issue ledger update before closing anything.
   - Add evidence comments for fixed Supabase and Baseball issues.

5. Ignored artifact cleanup:
   - Remove targeted local cache/screenshot/log folders after approval.
   - Do not run broad `git clean -Xdf` without preserving local env and agent/tooling folders.

6. Supabase drift audit PR:
   - Capture linked migration mismatch in a structured file.
   - Fix or supersede the two linked lint errors only after confirming live schema intent.
   - Run ledger reconciliation with `DATABASE_URL` in a secure environment.

7. Knip audit PR:
   - Start with the 8 unused files and 5 unlisted dependencies.
   - Tune Knip config before acting on production-mode or export-mode noise.
