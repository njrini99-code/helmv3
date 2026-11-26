# Bridge ⇄ Clubhouse sync: execution plan (addendum)

Status: 2026-11-25. Written against `origin/main` at `02c6f0dbaf`.

This is the **execution addendum** to the approved design,
`docs/superpowers/specs/helm-bridge/2026-11-18-clubhouse-bridge-redesign.md`.
Read the copy on `origin/bridge/pr1-spine`, because #2611 rewrites §12 and §15.
That design is still the plan: four large PRs, with the decisions locked on
2026-11-24 (§15). This file says where each PR stands, what to do next, and
which steps wait on the owner. It is written so a fresh session can run it.

"Completely synced" means three things:

1. **Docs ⇄ code.** Every button, code and action in the docs matches the code.
   `clubhouse:check` keeps it that way.
2. **Clubhouse → Bridge data.** Every button, toast and state reports when it
   happens (the signal spine).
3. **Bridge UI.** The Bridge shows all of it (B01–B14).

## 1. Where things stand

| Spec PR | State | Evidence |
| --- | --- | --- |
| 0. Base | **Landed** (#2588) | P017 registered, `clickable-map.mjs`, route labels |
| 1. Spine + graph | **Draft #2611**, `bridge/pr1-spine`, 7 commits, 60 files, 15 commits behind main | CI has only ever *skipped* (draft). Migration `20261124090000_clubhouse_bridge_signals.sql` is HELD. Flag `clubhouse_signals` is off. Emitters E5 and E9 moved to PR 3. |
| 2. Registry screens + control numbering | **Not started.** No branch. | `/admin/clubhouse/*` does not exist. `data-ctl` count in `src/clubhouse`: **0** |
| 3. Live lenses | **Not started** | Needs PR 1's data, or a seeded fixture |
| 4. Drift, Duet, numbering | **Not started** | |
| Unrelated draft #2610 (look-09 styling) | Draft, `claude/project-thread-jn6rm7` | Edits the stats, roster and qualifier screens and `component-catalog.json`, so it **collides with PR 2's numbering** |

### The button docs today (recounted 2026-11-25)

`docs/clubhouse/generated/CLUBHOUSE_CLICKABLE_MAP.md` is **stale on main**:
`clickable-map.mjs --check` exits 1, and nothing in CI failed. The spec counted
1,762 controls; the live code has **1,799 controls in 394 files**. Of those,
149 have no label, 551 build their label at run time, and 404 sit under a
`CH-` code.

| Page | Controls | No label | Run-time label | Under a CH- code |
| --- | ---: | ---: | ---: | ---: |
| P001 Shell | 55 | 4 | 21 | 24 |
| P002 Home | 76 | 3 | 33 | 15 |
| P003 Roster | 52 | 1 | 9 | 13 |
| P004 Stats (team) | 86 | 7 | 27 | 7 |
| P005 Stats (player) | **0**, see note | | | |
| P006 Calendar | 159 | 21 | 38 | 16 |
| P007 Messages | 148 | 14 | 48 | 30 |
| P008 Settings | 97 | 10 | 32 | 28 |
| P009 Qualifiers | 66 | 2 | 28 | 24 |
| P010 Team Hub | 75 | 4 | 36 | 3 |
| P011 Rounds | 173 | 11 | 65 | 80 |
| P012 Classes | 66 | 8 | 20 | 21 |
| P013 CoachHelm | 302 | 12 | 101 | 50 |
| P014 Recruiting | 39 | 3 | 19 | 15 |
| P015 Auth | 88 | 14 | 17 | 29 |
| P016 Tournaments | 139 | 17 | 41 | 27 |
| P017 Practice | 102 | 6 | 27 | 21 |
| Shared (no manifest claims the file) | 76 | 12 | 29 | 1 |

**P005 note:** P005 has a manifest with actions (`ACT-P005-CHANGE-WINDOW`,
`ACT-P005-PAGE-PLAYERS`), but the map credits its files to P004 or Shared. PR 2
must fix the page assignment in `clickable-map.mjs` (or in the manifests'
`files`) before numbering. Otherwise P005's controls get `CTL-P004-*` IDs, and
those IDs are permanent.

## 2. Owner gates

Landing on `main` ships nothing: Vercel Git deploys are off. The steps below
are not agent work. The sync is not complete until they are done, and each one
waits for the owner to say so in that conversation.

| Gate | What | Unblocks |
| --- | --- | --- |
| **G1** | Apply the held migration `20261124090000_clubhouse_bridge_signals.sql` to production (rollout thread, after local Docker and reviews) | Rows and counters can be stored |
| **G2** | Turn on `clubhouse_signals` in production | Signals flow. The W-tier check (forced CH-7004 → one `admin_events` row with `bridge_id 70603`) |
| **G3** | Production deploy of each landed PR (no preview deploys either) | Anything reaching users or the live Bridge |
| G4 (optional) | Token for the §9.2 Duet read-only API (D9) | Duet's door |

PR 2 needs none of these: every screen works with no live data. PR 3 is built
and tested against a seeded fixture. Its live view needs G1 and G2.

## 3. Steps

### Step 1. Refresh and land PR 1 (#2611)

Do this in its own worktree, because the canonical checkout is shared:
`git worktree add ~/worktrees/helmv3/bridge-pr1 bridge/pr1-spine`.

1. `git merge origin/main`. Main has since landed repo tidy 2–4 (deleted files,
   moved scripts) and new Clubhouse code (`ui/DataTable.tsx`, `ui/Menu.tsx`).
   `git merge-tree` reports no textual conflict. Still, PR 1's new checks (every
   `where` is a live path, every `CH-` literal is catalogued) can fail on the
   merged tree, so expect real fixes.
2. `npm run regen:resolve` for the generated files: `bridge-graph.json`,
   `CLUBHOUSE_BRIDGE_MAP.md`, `CLUBHOUSE_ACTION_MAP.md`, `CLUBHOUSE_STATUS.md`
   and `registry.generated.ts`.
3. **Wire `clickable-map.mjs --check` into `clubhouse:check` now**, rather than
   in PR 2. The map went stale silently, so PR 1 should stop that. Make it
   report-only for unlabelled or unnumbered controls (the blocking half is D11,
   PR 2). Regenerate the map (1,799 controls).
4. Gates: `npm run clubhouse:check`, then `npm run test:file --` on PR 1's test
   files (route, signal, use-action-signals, use-signals, ingest, resolve,
   rules, registry, bridge-graph), `npm run test:rls`, and `npm run build` in
   the background to a log (this is a new `route.ts`).
5. Confirm and record in the PR body what spec §12 asks for and the PR body
   does not show:
   - migration run on local Docker
   - `db-migration-reviewer` and `security-reviewer` passes, since the route
     takes unauthenticated batches and stores user ids
6. Carry this addendum file into the branch (one PR, not a docs-only PR).
7. Mark the PR ready; that starts the one full CI run. Then
   `npm run pr:land -- 2611`.

Landing is safe: the flag is off, the route returns 204, and the migration
stays held.

**Watch for:** the `agent/tidy-docs-config` worktree (no PR yet) also edits
`.vercelignore`, `docs/clubhouse/PROGRESS.md` and **this spec file**. Whichever
lands second merges the other's changes. Do not overwrite that session's files.

**Done when:** #2611 is merged, `clubhouse:check` is green on main including
the clickable-map check, and the HELD.md row is present with its reason.

### Step 2. Hand G1 and G2 to the owner

Post the migration, its rollback, and the W-tier script for the rollout
thread. Do not apply or flip anything without the owner's word. PR 2 does not
wait on this.

### Step 3. PR 2: number every button, and build the registry screens

Branch `bridge/pr2-registry` from main after step 1, in its own worktree.

**Before starting:** land or park #2610 (look-09). It edits the same screen
files PR 2 stamps with `data-ctl`. If it is still open, do the numbering with a
codemod so it can be rerun after a rebase. Do not hand-edit.

**3a. Control numbering (spec §4.7, D11).** One commit per page, P001 → P017,
then Shared.

- Fix the P005 assignment first (see the note in §1).
- `clickable-map.mjs --assign`:
  - Gives each control a permanent `CTL-P###-NNN` and writes `data-ctl` on the
    element.
  - Writes the ledger `config/clubhouse/controls/P###.json`. Each entry holds
    file, element, label, description, role, viewport and actions.
  - Keeps tombstones, like Bridge IDs.
  - Matching is by file, element and label, never by line number.
- Labels:
  - Each of the 149 "(no label)" controls gets a ledger label. Where it lacks
    an accessible name, add an `aria-label` in the code as well.
  - Each of the 551 run-time labels gets a template, for example "Open
    {player}'s stats".
- Board verdicts (works, decided, GAP) carry over from `CLICKABLES.md` where a
  row matches.
- Each control that runs `useAction` gets its `ACT-` id from the action map.
  Controls with neither an action nor a link are listed for B11.
- Then make the check blocking: `clubhouse:check` fails on a new control with
  no `data-ctl` or no label.
- Done when: `data-ctl` is on 100% of the controls the map lists, and the
  check is blocking and green.

**3b. Registry screens.**

- Screens: B02 Pages, B03 Controls, B04 Actions, B05 Codes, B12 Readiness, and
  the B14 palette.
- Also: the scope bar, the category legend and the chips (spec §7–8).
- They read the graph only, and show "No signal yet" (`BR-xx93`) where live
  data would go.
- `requireSuperAdmin` on every entry.
- Done when:
  - page tests pass for every BR code
  - `admin-gate-coverage` is green
  - Safari has passed desktop and phone (tier named)

### Step 4. PR 3: live lenses

Branch `bridge/pr3-live`. It can start in parallel with 3b once step 1 has
landed. Build against a seeded fixture.

- Emitters E5 and E9 (moved out of PR 1).
- Screens: B01 Pulse, B06 additions, B07 Sessions, B08 People and teams,
  B09 Experience and B10 Releases.
- The digest section.
- Done when there are seeded-fixture tests per rule (R-01…R-12) and per
  screen. Live data appears only after G1 and G2.

### Step 5. PR 4: drift, Duet, the rail

- B11 Drift (the nine lists, each driven to zero and held by `clubhouse:check`).
- B13 Duet desk, and the §9.2 read-only API (off until G4).
- `config/bridge/contracts.json` and `BRIDGE_UI_MAP.md`, with category 25 rows
  per page (D4).
- The rail regrouping (D3; URLs unchanged).
- Docs: DECISIONS, a Bridge feature doc, and the registry docs.
- Done when the full gates have run once and the `verifier` agent has checked
  the done claim.

### Step 6. Owner release

G3: deploy when the owner says so. Then `npm run release:status -- --strict`.
After that, check spec §13's targets on the live Bridge.

## 4. Order and parallelism

```text
Step 1 (land #2611) ──┬─► Step 3a numbering ─► Step 3b screens ─┐
                      ├─► Step 4 live lenses (fixture) ─────────┼─► Step 5 ─► G3
                      └─► Step 2: G1, G2 (owner) ───────────────┘
#2610 land or park ───► before Step 3a
```

Follow the owner's PR-size rule: four PRs total, page-by-page commits inside
PR 2, drafts until ready, local gates as the inner loop, and few pushes.
