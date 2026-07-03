# Agent Handoff: Cleanup, Knip, and Supabase Linked Lint - 2026-07-03

## Purpose

This document packages three HelmV3 follow-up plans into one agent-ready handoff:

- `docs/audits/CLEANUP_PR_SEQUENCE_2026-07-03.md`
- `docs/audits/KNIP_TRIAGE_2026-07-03.md`
- `docs/audits/SUPABASE_LINKED_LINT_FIX_PLAN_2026-07-03.md`

Use this as the starting brief for the next agent. The goal is controlled repo cleanup without deleting live code, mutating linked Supabase by accident, or turning noisy static-analysis output into unsafe changes.

## Hard Guardrails

- Do not mutate linked Supabase during planning or discovery.
- Do not close GitHub issues or PRs automatically.
- Do not delete source files from a first Knip pass.
- Do not run `npm audit fix` or `npm audit fix --force`.
- Do not run broad destructive cleanup commands such as `git clean -Xdf`.
- Do not use `npm run db:types:check` as a harmless read-only check; it runs `npm run db:types` first and can rewrite `src/lib/types/database.ts`.
- Treat generated files and audit outputs as separate PR scope from application behavior changes.

## Current State Summary

The repo has three active cleanup tracks:

1. Repo hygiene and PR sequencing.
2. Knip/dead-code triage.
3. Supabase linked lint follow-up for two production database lint errors.

The safest path is a sequence of small PRs, each with one type of risk and clear validation.

## Track 1: Cleanup PR Sequence

### Correction Needed

The freshness baseline should not claim `npm run db:types:check` was run successfully. It was deferred because it can regenerate tracked database types. The read-only production drift check is `npm run check:types-drift`, but that requires `SUPABASE_ACCESS_TOKEN`.

### Generated File Decision

| File | Current Drift | Recommendation |
| --- | --- | --- |
| `next-env.d.ts` | Route types import changed from `./.next/dev/types/routes.d.ts` to `./.next/types/routes.d.ts`. | Keep tracked for now and commit the current production-build form in a narrow generated-file PR, unless the team decides to stop tracking it. |
| `public/sw.js` | Cache version changed from `golfhelm-v48d739cec` to `golfhelm-v8b9986e1a`. | Keep tracked only if deploys require a committed service worker artifact; otherwise generate it at build time and stop tracking stamped output. |

### Recommended PR Order

| PR | Scope | Actions | Validation |
| --- | --- | --- | --- |
| 1 | Audit correction and generated-file policy | Correct the `db:types:check` record and decide whether to commit or rework `next-env.d.ts` / `public/sw.js`. | `npm run typecheck`, `npm run lint:ratchet`, `npm run docs:check`, `npm run knowledge:check` |
| 2 | Local Git hygiene tooling | Add read-only helpers for status, cleanup dry run, and stash audit. | Run each helper and inspect output. |
| 3 | Tar security patch | Reproduce or merge Dependabot `#735` for `tar@7.5.19`. | `npm run typecheck`, `npm run lint:ratchet`, `npm run test:run`, `npm audit` |
| 4 | Anthropic SDK approved PR | Reproduce or merge Dependabot `#741` separately from grouped dependency PRs. | Full package gates plus smoke affected AI surfaces. |
| 5 | Supabase lint plan | Keep as read-only until live function bodies and columns are confirmed. | No linked mutation. |
| 6 | Supabase additive migration | Patch only confirmed function drift. | `npm run test:rls`, `npm run test:business`, `npm run build`, linked lint |
| 7 | Knip tuning | Tune `knip.json` before deleting files. | `npm run knip`, `npm run knip:files`, `npm run knip:deps` |
| 8 | Dead-file deletion batch 1 | Delete only files proven unused by source, route, docs, and tests. | `npm run typecheck`, `npm run lint:ratchet`, focused tests, `npm run test:run` |
| 9 | Issue cleanup ledger | Add evidence rows for open issues. | Docs checks |
| 10 | Issue comments/closures | Close/comment in small evidence-backed batches. | Human GitHub review before each batch |

## Track 2: Knip Triage

### Rules

- Treat `knip --production` and `knip --exports` as noisy until `knip.json` is tuned.
- Verify route loading, dynamic imports, tests, native builds, and docs before removing anything.
- Leave the large export-finding set for scoped feature-owner passes.

### File Findings

| File | Decision |
| --- | --- |
| `src/components/baseball/dashboard/dashboard-types.ts` | Keep pending type-only import and route review. |
| `src/components/baseball/recruiting-philosophy/MatchScoreBadge.tsx` | Candidate for removal after confirming no recruiting route or barrel export depends on it. |
| `src/components/products/golf-mockups/index.tsx` | Candidate for removal/archive after route and docs review. |
| `src/lib/admin/__tests__/fixtures/broken-delegation.fixture.ts` | Keep pending security/test fixture review. |
| `src/lib/admin/__tests__/fixtures/unwrapped-actions.fixture.ts` | Keep pending security/test fixture review. |
| `src/lib/mapbox/client.ts` | Candidate only if Mapbox is no longer supported. |
| `src/lib/recruiting/match-calculator.ts` | Keep pending recruiting feature review. |
| `src/lib/types/table.ts` | Candidate after exported type-name search. |

### Dependency Findings

Keep Capacitor dependencies until native iOS usage is reviewed:

- `@capacitor/app`
- `@capacitor/ios`
- `@capacitor/local-notifications`
- `@capacitor/network`
- `@capacitor/share`

Keep `postgres` for now because local migration scripts import it.

Review unlisted dependencies before adding them directly:

- `postcss-load-config`
- `@radix-ui/react-compose-refs`
- `fflate`

### Recommended Knip PR

1. Tune `knip.json` for Next route entrypoints, native iOS/Capacitor, local migration scripts, generated files, and fixture directories.
2. Re-run `npm run knip`, `npm run knip:files`, and `npm run knip:deps`.
3. Delete only the lowest-risk file candidates after focused `rg` checks and tests.
4. Do not act on broad export findings in this PR.

## Track 3: Supabase Linked Lint

### Scope

The Supabase plan is read-only until live database function definitions and live table columns are fetched and reviewed.

Linked lint reported:

- `public.can_manage_baseball_lift_group` references missing relation `public.baseball_strength_groups`.
- `public.baseball_accept_staff_invite` references missing record field `v_invitation.invitee_email`.

### Error 1: `can_manage_baseball_lift_group`

Local migration `20260624000050_baseball_rls_helpers_and_policies.sql` defines `can_manage_baseball_lift_group(p_team_id uuid, p_player_id uuid)` without referencing `baseball_strength_groups`.

Likely cause: production has an older function body that still references `public.baseball_strength_groups`, while `20260704090000_graveyard_legacy_liftlab_tables_phase3.sql` moved legacy Lift Lab tables to `graveyard`.

Next agent should:

1. Fetch live function body with `pg_get_functiondef('public.can_manage_baseball_lift_group(uuid, uuid)'::regprocedure)`.
2. Confirm whether the second argument is intended as player id or group id in live policies and app calls.
3. If current local contract is correct, add a migration that re-emits the local helper body and grants.
4. If group scope is still required, rewrite against `helm_lifting_groups` / `helm_lifting_group_members`.
5. Add or update an RLS regression for staff capability, player self access, and non-owning player denial.

Do not restore `public.baseball_strength_groups`.

### Error 2: `baseball_accept_staff_invite`

Local migrations define `baseball_accept_staff_invite(p_token text)` twice; `20260624000081_baseball_staff_roles_scope_audit.sql` supersedes the earlier version and uses `v_invite.email`, not `v_invitation.invitee_email`.

Likely cause: production has an older or manually edited function body with a record variable named `v_invitation` whose selected row does not include `invitee_email`, or whose table no longer has that column.

Next agent should:

1. Fetch live function body with `pg_get_functiondef('public.baseball_accept_staff_invite(text)'::regprocedure)`.
2. Fetch live `public.baseball_staff_invitations` columns from `information_schema.columns`.
3. Confirm which email column the app writes. Start at `src/app/baseball/actions/staff.ts`.
4. Prefer re-emitting the current local `20260624000081` body if live schema supports `email` and the capability columns.
5. Add a regression for wrong-email rejection and successful invite acceptance.

Do not add an `invitee_email` column without confirming product intent and current writers.

### Supabase Verification After Reviewed Migration

```bash
npm run test:rls
npm run test:business
npm run build
supabase db lint --linked --schema public --level warning --fail-on warning
```

If Docker is available, also run the linked diff workflow in a disposable environment. A previous `supabase db diff --linked --schema public` attempt failed because Docker was not running.

## Suggested First Agent Task

Start with PR 1 from the cleanup sequence:

1. Correct the freshness baseline so `db:types:check` is marked skipped/deferred.
2. Decide and document the generated-file policy for `next-env.d.ts` and `public/sw.js`.
3. Keep the PR scoped to docs/generated artifacts only.
4. Validate with:

```bash
npm run typecheck
npm run lint:ratchet
npm run docs:check
npm run knowledge:check
```

Then move to Knip tuning before any source deletion, and leave Supabase mutation for a reviewed migration after live function bodies are confirmed.
