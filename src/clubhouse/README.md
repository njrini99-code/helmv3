# Clubhouse

The from-scratch GolfHelm UI for coaches and players. It runs beside Fairway,
never on top of it. Agent guidance for working in this tree is in `AGENTS.md`;
the workflow is in `docs/clubhouse/README.md`.

## Who sees it

Two checks decide it, both in `gate.ts`, both server-side.

1. **The flag.** `golf_clubhouse_ui` in `config/feature-flags.yml`. Production
   is off, preview and development are on. The value is compiled into
   `src/lib/flags/registry.generated.ts`, so changing it is a code change and a
   deploy. Turning production on is an owner decision.
2. **The team allowlist.** `HELM_CLUBHOUSE_TEAMS`, a comma-separated list of
   `golf_teams` ids.

| `HELM_CLUBHOUSE_TEAMS` | Result with the flag on |
| --- | --- |
| unset or empty | Every team sees Clubhouse. The flag alone decides. `scripts/check-required-env.mjs` fails a production build in this state while a clubhouse flag is on, so set it explicitly there. |
| `team-a,team-b` | Only the signed-in user's **active** team, if listed. Everyone else gets Fairway. |
| `*` | Every team, written on purpose. This is how a production deploy with the flag on says "no limit". |

A user whose team cannot be read gets Fairway. Only the roles `coach` and
`player` can get Clubhouse. Players get the shared screens (Stats, Calendar,
Messages); their other screens show "not rebuilt yet".

Changing the allowlist is a deploy. Vercel binds environment values to a
deployment, so a canary change is not a hot toggle; it takes a redeploy of
`main` like any other release.

`isClubhouseForTeam(teamId)` answers the same question for a team rather than
the signed-in user (a link one person's action sends to another).

The entrance pages (sign in, welcome, sign up, onboarding) have no role yet, so
they use a separate flag, `golf_clubhouse_front_door`, through
`isClubhouseFrontDoor()`. It chooses the page drawn, never what signing in does.

## Where it mounts

Clubhouse is reached only from route files. Each calls `isClubhouseFor` (or the
front-door check) and renders a screen from `routes/`.

- `src/app/golf/(dashboard)/**`: `layout.tsx`, `loading.tsx` and the dashboard
  pages for calendar, classes, CoachHelm, hub, messages, qualifiers,
  recruiting, roster, round entry/continue/recover/review, rounds, settings,
  stats and team.
- `src/app/golf/(auth)/{login,signup,welcome}/layout.tsx` and
  `src/app/golf/(onboarding)/player/layout.tsx`: the front door.
- `src/app/clubhouse-preview/**`: the preview app and component gallery. It is
  not linked from the product.

## Import boundary

Code outside `src/clubhouse` may not import from it, except the route files
above (`page`, `layout`, `loading`, `error`, `not-found`, `route`, `template`
and `default` under `src/app`). ESLint enforces it with `no-restricted-imports`
(`eslint.config.mjs`, built in `eslint-rules/import-restrictions.mjs`). Nine
non-route files imported Clubhouse when the rule was added; they are listed in
`CLUBHOUSE_IMPORT_ALLOWLIST` in `eslint-rules/import-allowlists.mjs`. The list
may only shrink, and a script test fails on a stale entry. Five are server
actions that call `isClubhouseFor`; the fix is to pass the answer in from the
route file rather than import the gate.

Tests under `__tests__` are not covered by the rule.

## Rollout and rollback

Cutover, rollback and the open items are tracked in `docs/clubhouse/PROGRESS.md`
and `docs/clubhouse/SWAP_AUDIT.md`. Rollback is setting the flag's production value
back to `false` (a code change and deploy) or removing a team from the
allowlist (an environment change and redeploy).
