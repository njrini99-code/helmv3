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
   means every team, so never leave it unset for a canary.
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

- **One team:** remove its UUID from `HELM_CLUBHOUSE_TEAMS` and deploy.
- **Everyone:** a flag-off commit (`production: false`, `npm run
  flags:generate`) and a deploy.
- **No schema to undo.** Both UIs share the round engine and the device's
  offline stores, so a round queued under Clubhouse replays under Fairway. An
  open tab keeps Clubhouse until it reloads; auto-reload waits while a round
  is unsaved.
- **Before turn-on, name the rollback deployment.** Record the current
  flag-off production deployment id here so a promote back to it is one step.
- **Never promote `dpl_DowNH8VfxSXvSp5ggp2ZMkHMZpCb` (`ef6e017a2`).** It was
  the 2026-09-30 train's rollback target. Promoting it now would undo #2170
  and everything after it.

## Turn-on criteria

- [ ] #2189 builds (`npm run build`) and a browser check of it is clean.
- [ ] The owner's real-iPhone pass is clean (see Remaining work, item 3).
- [ ] The Q-120 server decision is made (`20261001000000`, apply or keep
      holding with the app-side check).
- [ ] The rollback deployment is named above.
- [ ] After the canary deploy: no new Sentry issue families on Clubhouse
      routes for a full weekday.
- [ ] After the canary deploy: zero rounds completed with zero holes
      (read-only SQL).

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
- **Motion spec:** two duration sets are in the docs. The D-64 set (press 110,
  quick 180, base 260, release 280, reveal 520ms) is what the rules and tokens
  use; a second set needs the owner to pick one. Related, inferred: the screen
  checklist says skeletons wait 150ms while the shell holds them for 300ms
  (`--ch-dur-vt-hold`, `CHANGELOG.md`).
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
