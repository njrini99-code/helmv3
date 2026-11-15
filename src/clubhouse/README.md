# Clubhouse

The GolfHelm UI for coaches and players: the only one since the owner retired
Fairway's coach and player screens (2026-11-14, "No allowlist, complete
replacement of fairway"). Agent guidance for working in this tree is in
`AGENTS.md`; the workflow is in `docs/clubhouse/README.md`.

## Who sees it

Every coach and player, on every team. There is no flag and no allowlist:
`golf_clubhouse_ui`, `golf_clubhouse_front_door` and `HELM_CLUBHOUSE_TEAMS`
were removed with Fairway. `isClubhouseFor(role)` in `gate.ts` is now a role
check (a coach or a player) that also tags the request's server events
`ui=clubhouse`, the tag the monitoring in `docs/clubhouse/STATUS.md` filters
on. Players have their own Home, Rounds, Classes, CoachHelm and Qualifiers and
share Roster, Stats, Calendar, Messages, Team Hub and Settings with coaches. A
dashboard address Clubhouse has not rebuilt shows "not rebuilt yet"
(`shell/NotRebuilt.tsx`).

The entrance pages (sign in, welcome, sign up, onboarding, joining a team, a
staff invitation, the reset link) are Clubhouse's too. A signed-in visitor on
`/golf/forgot-password` keeps that page (CH-15920); a signed-out one resets
inside the sign-in panel.

Tournaments has its own release flag, `golf_tournaments_v1`
(`isTournamentsFor`).

## Where it mounts

Clubhouse is reached only from route files, which render a screen from
`routes/`.

- `src/app/golf/(dashboard)/**`: `layout.tsx`, `loading.tsx` and the dashboard
  pages for calendar, classes, CoachHelm, hub, messages, qualifiers,
  recruiting, roster, round entry/continue/recover/review, rounds, settings,
  stats, team hub, tournaments and what's new. Old addresses whose target
  depends on the role keep a layout that calls `redirectToClubhouse`
  (`routes/alias.ts`) over a page that draws nothing; the rest are
  `next.config.mjs` redirects.
- `src/app/golf/(auth)/**`, `src/app/golf/(onboarding)/**`,
  `src/app/golf/join/**` and `src/app/golf/staff/join/**`: the front door.
- `src/app/clubhouse-preview/**`: the preview app and component gallery. It is
  not linked from the product.

## Import boundary

Code outside `src/clubhouse` may not import from it, except the route files
above (`page`, `layout`, `loading`, `error`, `not-found`, `route`, `template`
and `default` under `src/app`). ESLint enforces it with `no-restricted-imports`
(`eslint.config.mjs`, built in `eslint-rules/import-restrictions.mjs`). The
non-route files that still import Clubhouse are listed in
`CLUBHOUSE_IMPORT_ALLOWLIST` in `eslint-rules/import-allowlists.mjs`. The list
may only shrink, and a script test fails on a stale entry.

Tests under `__tests__` are not covered by the rule.

## Rollback

There is no flag to turn off: the Fairway screens are deleted. A rollback is a
promote of an earlier production deployment (`docs/setup/DEPLOY.md`), or a
revert of the retirement change and a deploy. Both UIs share the round engine
and the device's offline stores, so a round queued under one replays under the
other.
