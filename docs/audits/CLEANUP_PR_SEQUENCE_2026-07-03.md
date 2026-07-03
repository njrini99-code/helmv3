# HelmV3 Cleanup PR Sequence - 2026-07-03

## Guardrails

- Do not mutate linked Supabase.
- Do not close issues or PRs automatically.
- Do not delete source files until Knip findings are manually verified.
- Do not run `npm audit fix` or `npm audit fix --force`.
- Do not run broad cleanup commands such as `git clean -Xdf`.

## Audit Correction

`npm run db:types:check` was not run in the freshness baseline. The package script currently runs `npm run db:types` before diffing `src/lib/types/database.ts`, so it can rewrite generated source in the working tree. Treat it as a DB-types regeneration check for a clean disposable worktree or a dedicated DB-types PR, not as a harmless read-only verification gate.

The freshness baseline should list `db:types:check` as skipped/deferred, not passed. `npm run check:types-drift` is the read-only production drift checker, but it was skipped because `SUPABASE_ACCESS_TOKEN` was not configured.

## Generated File Decision

| File | Current Drift | Why It Happens | Recommendation | Tradeoff |
| --- | --- | --- | --- | --- |
| `next-env.d.ts` | Route types import changed from `./.next/dev/types/routes.d.ts` to `./.next/types/routes.d.ts`. | Next regenerates this file depending on build/dev mode. | Keep tracked for now and commit the current production-build form in a small generated-file PR. | Tracking makes CI/deploy shape explicit, but local dev/build can keep flipping it. If this continues, move to a generated-only workflow. |
| `public/sw.js` | Cache version changed from `golfhelm-v48d739cec` to `golfhelm-v8b9986e1a`. | `scripts/stamp-sw.mjs` stamps the current commit during `prebuild`. | Keep tracked only if deploys need a committed service worker artifact. Otherwise generate at build time and stop tracking the stamped output. | Tracking exposes service-worker cache changes, but every build can dirty the tree. Build-time generation is cleaner if CI/deploy reliably runs `prebuild`. |

## Small PR Sequence

| PR | Scope | Actions | Validation |
| --- | --- | --- | --- |
| 1 | Audit correction and generated-file decision | Correct the `db:types:check` record, document generated-file policy, and either commit or rework `next-env.d.ts` / `public/sw.js` handling. | `npm run typecheck`, `npm run lint:ratchet`, `npm run docs:check`, `npm run knowledge:check` |
| 2 | Local Git hygiene tooling | Add read-only `git:audit`, `git:clean:dry`, and `git:stash:audit` helpers. Keep actual branch/stash/cache deletion local and approval-gated. | Run each helper and inspect output. |
| 3 | Tar security patch | Reproduce or merge Dependabot `#735` for `tar@7.5.19`. | `npm run gate:heavy` if present, otherwise `npm run typecheck`, `npm run lint:ratchet`, `npm run test:run`, `npm audit` |
| 4 | Anthropic SDK approved PR | Reproduce or merge Dependabot `#741` separately from grouped dependency PRs. | Full package gates plus smoke any affected `helm-intelligence` surface. |
| 5 | Supabase linked lint fix plan | Keep this as a read-only plan for the two linked lint errors. Confirm live function bodies and table columns before writing a migration. | `supabase db lint --linked --schema public --level warning --fail-on warning` after a reviewed migration, not during planning. |
| 6 | Supabase additive migration fix | Patch only `can_manage_baseball_lift_group` and `baseball_accept_staff_invite` once the intended live schema is confirmed. | `npm run test:rls`, `npm run test:business`, `npm run build`, linked lint. |
| 7 | Knip tuning | Tune `knip.json` for Next, Capacitor/native, scripts, fixtures, and generated entrypoints before deleting code. | `npm run knip`, `npm run knip:files`, `npm run knip:deps` |
| 8 | Dead-file deletion batch 1 | Delete only files proven unused by static search, route ownership, and tests. Avoid the 695 export findings. | `npm run typecheck`, `npm run lint:ratchet`, focused tests, `npm run test:run` |
| 9 | Issue cleanup ledger | Add evidence rows for the 24 open issues. Do not bulk close. | Docs checks only. |
| 10 | Issue comments/closures | Close or comment in small evidence-backed batches. | GitHub review before each batch. |

## Local Branch Cleanup Commands

These are deletion candidates because they are merged into `main` and track gone upstreams. Run only after local approval and only with `-d`:

```bash
git branch -d chore/clean-slate-20260704
git branch -d feat/liftlab-helm-unification
git branch -d fix/admin-consolidated-20260703
git branch -d hotfix/green-main-ci-env
git branch -d hotfix/semgrep-comment-fp
git branch -d hotfix/visx-subpackages
```

Before deleting, re-run:

```bash
npm run git:audit
```

## Stash Audit Command

Use:

```bash
npm run git:stash:audit
```

This writes `docs/audits/generated/stashes/README.md`, `stash-list.txt`, and one `stash-N-stat.txt` per stash. It does not apply, pop, drop, or clear stashes.
