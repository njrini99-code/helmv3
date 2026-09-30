# Clubhouse handoff (2026-09-29, end of session)

Read this first, then `docs/clubhouse/foundation-v2/START_HERE.md` (the owner's
process plan), then `docs/clubhouse/PROGRESS.md` (gates, decisions, questions,
data gaps, verification log).

## Where everything is

- **Branch:** `agent/clubhouse` in `~/worktrees/helmv3/clubhouse`. It is local
  only. Nothing is pushed and there is no PR.
- **Merged in:** `agent/clubhouse-messages-mobile`,
  `agent/clubhouse-roster-mobile` and `agent/clubhouse-qualifiers`. Those three
  branches and their worktrees can be retired once this branch lands.
- **Production is unchanged.** Nothing is deployed, `golf_clubhouse_ui` is off,
  and no migration has been applied.
- **Checks on the merged head:**
  - `clubhouse:check` 0 (150 files, tracker valid)
  - `typecheck:fast` 0
  - vitest 1298/1298: `src/clubhouse`, the golf action tests, and the
    qualifier write-integrity test
  - `knowledge:check` 0
  - `docs:check` 0
  - `npm run build` was not run on the merged head: it was started and then stopped when the owner called the stopping point. Run it first next session (`NODE_OPTIONS=--max-old-space-size=8192 npm run build`).

## The process from here: Foundation V2 (owner, D-60 to D-62)

The plan is `docs/clubhouse/foundation-v2/`. Follow `09_AGENT_MASTER_HANDOFF.md`.
Owner decisions on it:

- **D-60, numbering.** Page IDs follow the existing catalog digits, so nothing
  is renumbered:

  | Page | Screen |
  | --- | --- |
  | P001 | Shell |
  | P002 | Home |
  | P003 | Roster |
  | P004 | Stats team |
  | P005 | Stats player |
  | P006 | Calendar |
  | P007 | Messages |
  | P008 | Settings |
  | P009 | Qualifiers |

  Each existing `CH-` code gets a Bridge contract in its V2 category (01 to 25).
- **D-61, held capabilities.** New capabilities are HELD: a server gate plus a
  held plan in `docs/clubhouse/held/`.
- **D-62, rollout order.** Build the registry and checks, then make Messages
  (P007) the gold-standard page, then copy it to the other pages. New designs
  wait until the gold standard is done.

**Not started yet:** the V2 registry itself. None of these exist:
- `config/clubhouse/`
- `check-registry`, `check-contracts`, `check-held`, `generate-docs` and
  `status` under `scripts/clubhouse/`
- `docs/clubhouse/pages/`
- `docs/clubhouse/templates/`

A foundation agent was started and then stopped by the owner before it
committed anything.

## Next steps, in order

1. **Finish D-61 for Qualifiers:**
   - `setQualifierSquadSize` and `setQualifierEntrants`
     (`src/app/golf/actions/qualifier-setup.ts`) refuse unless
     `isClubhouseFor('coach')`, with a test.
   - Write `docs/clubhouse/held/features/qualifier-squad-and-entrants.md`.
   - Give `supabase/migrations/20260929200000_golf_qualifier_db_hardening.sql`
     the exact header `-- STATUS: WRITTEN — HOLD — NOT APPLIED` and a held data
     plan at `docs/clubhouse/held/data/qualifier-db-hardening.md`, linked from
     its `HELD.md` row.
2. **Build the V2 foundation** per `09_AGENT_MASTER_HANDOFF.md` and D-60:
   registry schema, page manifests P001 to P009, `bridge-contracts.json` from
   the catalogs, tombstones, the checks wired into `clubhouse:check`, generated
   views, templates, and `docs/clubhouse/README.md` rewritten to the V2
   pipeline.
3. **Gold standard:** Messages (P007). Write its six docs (PAGE, DESIGN,
   CONTRACT with all 25 categories, WIRING, VERIFY, CHANGELOG) and its
   manifest.
4. **Copy to the other pages:** Shell, Roster, Stats team, Stats player,
   Calendar, Home, Settings and Qualifiers.
5. **Merge-pass leftovers** (D-27; they need a dev server):
   - the full `clubhouse:a11y`
   - Roster at 430px, and toasts over content
   - the `domMax` pill slide and first-load JS
   - Messages e2e (it signs in to production, so ask first)
   - `test:rls` for the D-35 pgTAP (needs local Supabase in Docker)
6. **Then resume designs:**
   - the Stats player views (Overview, Game detail, Rounds, Development, Early
     read)
   - the Qualifiers phone build (the phone spec is approved; D-34 says it opens
     from Rounds)

## Screens (gates are in `PROGRESS.md`)

| Screen | State | Waiting on |
| --- | --- | --- |
| Stats (team) | Desktop gates done. `/stats/team` renders it (D-23). | Owner review, a real-coach pass, a Stats mobile design |
| Qualifiers (coach and player) | Desktop gates done, security-reviewed. D-35 migration written, not applied. | Step 1 above, owner review, real-coach pass, phone build |
| Messages (coach and player) | Desktop plus phone built. Phone gate `doing`. | Owner review, the iPhone check (`npm run ios:dev`) |
| Phone foundation (shell) | Tab bar, top bar, More sheet, pushed screens, draggable sheets, bell sheet | The iPhone check, and the shell sections not yet crash-contained |
| Roster (coach) | Phone built on the foundation. Phone gate `doing`. | 430px and toasts (merge pass), the iPhone check, owner review |
| Calendar, Stats (player) | Desktop built earlier. This session added `?new=1&with=` and `?tab=` | Their own passes |
| Home, Settings | Built earlier; gates `doing` | Their own passes |

## Owner items

- **Reviews:**
  - Team stats: `scratchpad/stats-team/compare-*`
  - Qualifiers: `scratchpad/qualifiers/build-1280/`
  - Messages phone: `scratchpad/messages-mobile/built/`
  - Roster phone: `scratchpad/roster-mobile/roster-34..44`
  - The scratchpad is session-local, so recapture if it's gone.
- **Real-coach pass and iPhone check** on each built screen.
- **A Stats mobile design.**
- **OD-01** still blocks two held migrations. See "Release with the Clubhouse
  deploy" in `PROGRESS.md`, which lists every migration, flag and backfill
  that goes out with the deploy, in order.
- **After Clubhouse:** the queued attachment migration
  (`docs/clubhouse/held/data/message-attachments-hardening.md`, SQL not
  written).

## Rules learned this session (follow them)

- **Two agents at a time; this is a 16 GB laptop.**
  - At most one dev server, only while capturing or scanning, and stop it
    right after.
  - No `npm run build` until the merge pass (D-27).
  - Four agents with four servers pushed it 10 GB into swap.
- **Agents don't receive messages mid-turn.** A teammate in one long turn only
  sees lead messages when it next goes idle. Check the agent's transcript
  before assuming it ignored an instruction. `TaskStop` followed by
  `SendMessage` resumes it with the message.
- **Commit with a pathspec** (`git commit -m ... -- <paths>`) when agents share
  a checkout.
- **Disk.** The worktree script refuses under a 12 GiB reserve. `.next`
  caches can be deleted when no dev server is running; they were about 41 GB
  here.
- **DesignSync (Claude Design) only works in the main session** after
  `/design-login`. The lead fetches design files and commits them into
  `design/handoff/`.
- **Numbering ranges keep tracker merges clean.**
  - Decisions: D-24 to D-29 Stats, D-30 to D-39 Qualifiers, D-40 to D-49 phone
    foundation and Messages, D-50 to D-59 Roster, D-60 to D-69 Foundation V2.
  - Questions: Q-5 to Q-20 Qualifiers, Q-30 to Q-39 Roster, Q-40 to Q-64
    Messages.
