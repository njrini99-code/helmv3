# Clubhouse status: the single source of truth

Updated 2026-10-12. Read this page first. If another Clubhouse doc disagrees
with it on current state, rollout, rollback or what is left, this page wins;
fix the other doc in the same change. `PROGRESS.md` keeps the full history
(gates, decisions, questions, data gaps, verification log).

## Where it stands

- **Production: off.** `golf_clubhouse_ui` is `production: false` in
  `config/feature-flags.yml` (#2188) and the front door
  (`golf_clubhouse_front_door`) is off. Fairway serves coaches and players.
  Per the 2026-10-12 release check, production serves `main` (`86c43bd8e`;
  `main` has since moved to `8e48d84d2`).
- **Preview and development: on.** Every Vercel preview and `npm run dev`
  render Clubhouse.
- **History:** Clubhouse was on in production from 2026-10-08 to 2026-10-11
  through #2180, by mistake. The owner turned it off with #2188.
- **End state the owner chose (2026-10-11/12): "ready, not on."** Agents make
  it ready; the owner flips it.
- **The merge train is draft PR
  [#2189](https://github.com/njrini99-code/helmv3/pull/2189)**
  (`agent/clubhouse-release`). It is the only branch for Clubhouse release
  work. It carries the Fairway regressions found during the accidental release
  (the 30-second `staleTimes` removed; the attachment retry marker is opt-in),
  the Q-120 app side, the #2157 port (neutral loading frame with an
  allowlist), the player status change and round-type editor, an honest
  offline banner, paused email switches, named route errors, a Clubhouse 404,
  one dashboard role resolver for the Clubhouse decision, alias redirects that
  keep the query (`?task`, `?player`, `view=chat` to Ask), task focus
  highlight, review skeleton, catalog regeneration, and the held-migration
  hardening (lock timeouts, VERIFY blocks, rollback captures, `20260928160000`
  marked OBSOLETE, the apply order in `HELD.md` and `PROGRESS.md` fixed).
- **Database: nothing to apply.** Every held migration stays HELD (owner,
  2026-10-12; verified correct, not applied). Clubhouse reads nothing that
  only a held migration adds.

## Retired by the owner (2026-10-12)

These are not coming back. The current redirects stay, and nothing is built:

| Was | Today with Clubhouse on |
| --- | --- |
| Course management (`/courses`) | redirects to Home |
| Printable scouting report (`/players/[id]/game/print`) | the `players/[id]` alias, to `stats?player=` |
| Genome compare (`/coachhelm/genome/compare`) | redirects to `stats/team` |
| Settings display density, date format, score display | not shown in Clubhouse Settings |

The player status change and the round-type editor were rebuilt instead
(#2189).

## How to turn it on (canary first)

The flag is compiled into the bundle and the allowlist is read at request time
from a server environment variable, but both changes reach users only through
a new production deploy.

1. Every box in "Turn-on criteria" below is ticked.
2. Set `HELM_CLUBHOUSE_TEAMS` in the Vercel production environment to the
   canary team UUIDs (`golf_teams.id`, comma-separated). `*` or an empty value
   means every team, so never leave it unset or empty for a canary, and the
   same holds when the list shrinks later.
   `scripts/check-required-env.mjs` refuses a production build with a
   Clubhouse flag on and the variable unset.
3. In `config/feature-flags.yml`, set `golf_clubhouse_ui`
   `environment.production: true`, then run `npm run flags:generate` and
   commit `src/lib/flags/registry.generated.ts` with it. The prebuild step
   fails when the generated registry is stale.
4. Merge, deploy with the command in AGENTS.md "Production", and confirm with
   `npm run release:status -- --strict`.
5. Leave `golf_clubhouse_front_door` off. It is global (a signed-out visitor
   has no team), and coach onboarding, `coach/pending`, `join/[code]`,
   `staff/join` and the demo have no Clubhouse versions.
6. Watch the canary for a full weekday (criteria below), then widen the
   allowlist and deploy again.

## Rollback

**The rollback target** (recorded 2026-10-16 with read-only Vercel reads and
`npm run release:status`):

| | |
| --- | --- |
| Deployment | `dpl_HvAH49nAQ9xkg7wjT5MAZn67PZk6` |
| URL | `https://helmv3-6licoabp5-nick-rinis-projects.vercel.app` |
| Serves | `87bd60345` (#2189) with Clubhouse off: the flag is compiled off in that build, whatever `HELM_CLUBHOUSE_TEAMS` says. `release:status`: "production : 87bd60345 (verified in the served bundle)" |
| Created | 2026-10-14 00:25 UTC from the CLI; `helmsportslabs.com` resolves to it today |

**Fastest, seconds and no build:** promote it, from the linked checkout. Not
run; the owner says when.

    SCOPE=$(node -p 'require("./.vercel/project.json").orgId')
    ./node_modules/.bin/vercel promote dpl_HvAH49nAQ9xkg7wjT5MAZn67PZk6 --scope "$SCOPE" --yes
    npm run release:status    # expect "production : 87bd60345"

A promote also drops whatever was deployed after it. If a newer flag-off
production deploy goes out before the canary (the six merges waiting on
`main`, for example), that deployment becomes the target: record its id here
in its place.

**Never promote `dpl_DowNH8VfxSXvSp5ggp2ZMkHMZpCb`**
(`helmv3-2wdem48lr-nick-rinis-projects.vercel.app`, created 2026-10-01 00:43
UTC, `ef6e017a2`). It was the 2026-09-30 train's rollback target, and Vercel
still marks it a rollback candidate (`isRollbackCandidate: true` on
2026-10-16), so the dashboard's Instant Rollback list offers it. Promoting it
would undo #2170 and everything after it.

**Slower ways:**

- **One team:** remove its UUID from `HELM_CLUBHOUSE_TEAMS` and deploy. If it
  is the last team on the list, do the flag-off commit below instead: an empty
  or unset value means every team (`clubhouseTeamAllowlist` in
  `src/clubhouse/gate.ts`), so emptying the list would turn Clubhouse on for
  everyone.
- **Everyone, with a build (4 to 11 minutes):** a flag-off commit
  (`production: false`, `npm run flags:generate`) and a deploy.

**No schema to undo.** Both UIs share the round engine and the device's
offline stores, so a round queued under Clubhouse replays under Fairway. An
open tab keeps Clubhouse until it reloads; auto-reload waits while a round is
unsaved.

## Turn-on criteria

- [ ] #2189 builds (`npm run build`) and a browser check of it is clean.
- [ ] The owner's real-iPhone pass is clean (see Remaining work, item 3).
- [ ] The Q-120 server decision is made (`20261001000000`, apply or keep
      holding with the app-side check).
- [x] The rollback deployment is named (Rollback, 2026-10-16). Name it again
      if a newer flag-off deploy goes out before the canary.
- [ ] After the canary deploy: no new Sentry issue families on Clubhouse
      routes for a full weekday (the `ui:clubhouse` search in Monitoring,
      against its baseline).
- [ ] After the canary deploy: zero rounds completed with zero holes
      (the read-only SQL in Monitoring).

## Monitoring

Every Clubhouse error is tagged `ui:clubhouse`: the browser tags the session when
the shell mounts (`chTagSession`, `src/clubhouse/lib/track.ts`), and the server
tags the request's isolation scope when `isClubhouseFor` decides Clubhouse
(`src/clubhouse/gate.ts`, tested in
`src/clubhouse/__tests__/gate-sentry-tag.test.ts`). Fairway events carry no
`ui` tag. The server tag reaches production only with the deploy that carries
it, so take the canary from a build that includes it.

**The search to save** (Sentry org `helm-xs`, project `javascript-nextjs`):

    environment:production ui:clubhouse

It was not saved through the tools (the Sentry tools here can create alerts and
metric monitors, not saved searches, and an alert notifies people, so it waits
for the owner). Steps, before the canary deploy:

1. Sentry → Issues, project `javascript-nextjs`, environment `production`.
2. Search `ui:clubhouse is:unresolved`, then Save search as
   "Clubhouse canary (production)", visible to the organization.
3. Optional alert: Alerts → Create alert → Issues, project
   `javascript-nextjs`, environment `production`, when "A new issue is created"
   and the filter "The event's tags match `ui` equals `clubhouse`", notify the
   owner. Leave it active for the canary weekday.
4. Discover query for counts, to compare with the baseline below:
   dataset Errors, `environment:production ui:clubhouse`, fields `count()`,
   `count_unique(user)`, `count_unique(issue)`, period 14d.

**Baseline, recorded 2026-10-16 (read only).**

- Sentry, production, the 14 days to about 2026-10-16 21:35 UTC, error events whose
  transaction is under `/golf/dashboard` (`transaction:*golf/dashboard*` or
  `*golf/(dashboard)*`, which covers server GET and POST, browser routes and
  server components): **386 events, 28 issues, 26 users**. The largest:
  JAVASCRIPT-NEXTJS-Z0 statement timeout (86 events), -XP worst-hole read
  timeouts (79 events, 15 users), -YX AbortError (78), -196 the held-migration
  trace probe (73; its noise is dropped by #2197, not yet deployed) and -15A
  the round recap style trace (32 events, 17 users). `ui:clubhouse` in the
  same 14 days: 0 events.
- Production database, `golf_rounds` with `status = 'completed'` and no
  `golf_holes` row: **18 of 774 completed rounds** (14 not `is_test`), the
  newest created 2026-09-28; **0 of the 64 completed in the last 14 days**.
  The turn-on criterion is that this stays 0 for rounds completed after the
  canary deploy. `golf_rounds` has no completion time, so `updated_at` (which
  the submit sets) stands in, a superset:

      SELECT count(*) FROM golf_rounds r
      WHERE r.status = 'completed' AND r.updated_at >= '<canary deploy time>'
        AND NOT EXISTS (SELECT 1 FROM golf_holes h WHERE h.round_id = r.id);

## Remaining work, in order

1. `npm run build` and a browser check of #2189.
2. Before and after screenshots for the #2189 visible changes, logged in each
   page's VERIFY.md and placed in the PR description.
3. Owner real-iPhone pass: coach 20 minutes; player 30 minutes, including
   airplane mode mid-round, killing the app and Recover; VoiceOver, large text
   and dark mode, 10 minutes.
4. Dark-mode accessibility scan. `scripts/clubhouse/a11y.mjs` has no dark mode
   yet.
5. Timing for Stats, Home and CoachHelm (`npm run clubhouse:perf`).
6. Move the remaining role-rule sites to `getGolfDashboardRole`
   (`src/lib/auth/get-golf-dashboard-role.ts`): the recruiting, `stats/team`,
   `rounds/new`, `rounds/recover` and `rounds/continue` pages; the
   round-partial, round-submit, qualifier-setup and message-attachments
   actions.
7. App Store build items (native, owner's call): a possible reload loop on an
   offline cold start (`ios/App/App/GolfBridgeViewController.swift`, around
   lines 156-165), and the `#F2E6D2` launch flash.
8. Front door: partial and stays off (see turn-on step 5).

## Open owner decisions

- **Brand:** white `#ffffff` cards and Instrument Sans, against the brand doc.
- **Motion spec:** a conflict between two duration sets was reported in
  `README.md`. It was not found on this branch (2026-10-12): every duration in
  the rules, `README.md` and the checklist matches D-64 (press 110, quick 180,
  base 260, release 280, reveal 520ms). The owner confirms which set is
  current. Related, inferred: the screen checklist says skeletons wait 150ms
  while the shell holds them for 300ms (`--ch-dur-vt-hold`, `CHANGELOG.md`).
- **Make `clubhouse-quality` a required check.**
- **Held migration timing.** Release-relevant: qualifier privacy
  (`20260929200000`) and the Q-120 server check (`20261001000000`).
  Data-quality: the stats chain (Q-124) and the strokes-gained fix
  (`20260930150000`).
- **Roster availability.**
- **Messages delete** (`20261008160000`, held).
- **Player CoachHelm Ask.**
- **Open PRs:** #2096 travel, #2091 vintage theme, #2073 CoachHelm root map,
  #2048 course factory.

## Where things live

| What | Where |
| --- | --- |
| The release branch and PR | `agent/clubhouse-release`, [#2189](https://github.com/njrini99-code/helmv3/pull/2189) (draft) |
| Held migrations, reasons and apply order | `supabase/migrations/HELD.md`; the Clubhouse order is in [PROGRESS.md](PROGRESS.md) "Release with the Clubhouse deploy" |
| Gates, decisions (D-n), questions (Q-n), data gaps | [PROGRESS.md](PROGRESS.md) |
| Every state and outcome (CH- codes) | `catalog/` and `config/clubhouse/bridge-contracts.json` |
| Page manifests | `config/clubhouse/pages/` |
| The flag and the team allowlist | `config/feature-flags.yml`, `src/clubhouse/gate.ts` |
| Route aliases | `src/clubhouse/routes/alias.ts` and the route `layout.tsx` files; the table is [SWAP_AUDIT.md](SWAP_AUDIT.md) §3 |
| Audits and plans | [AUDITS.md](AUDITS.md) |
| How to build a page | [README.md](README.md); phone: [MOBILE.md](MOBILE.md) |
| Deploy and release check | AGENTS.md "Production", `docs/setup/DEPLOY.md`, `npm run release:status` |
