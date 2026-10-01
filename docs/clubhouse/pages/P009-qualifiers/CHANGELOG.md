# P009 — Qualifiers: changelog

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification
log and decisions).

## 2026-10-01 — Owner rules for page states (P009)

Owner, 2026-10-01: never an empty or a zero for a failed or unfinished read;
loading, refreshing, empty, failed, stale and pending are different states;
the last choice wins; qualifier context and standings first, the breakdowns
stream; Back restores the list's filters and scroll. Standard:
`docs/clubhouse/PAGE_PERFORMANCE.md`.

```text
PR/commit:      agent/swap-audit: cb1739fe9, 6dcbae1ff, dadc1f8e2, 112afa945,
                75df19425, 8d9d48f86, 43d50e341
Design package: none (no new visual; placeholders reuse the page's classes)
Contract IDs:   CH-09220, CH-09221, CH-09222, CH-09409, CH-09410, CH-09904,
                CH-09905 (new); CH-09202, CH-09205, CH-09206, CH-09207,
                CH-09208, CH-09306, CH-09406, CH-09408 (reworded)
Actions:        none new; the tie row has its own action (qualifiers.chooseTie)
Data impact:    none: no write, no cache, no new table, no 'use server' file.
                The detail's reads are the same; the courses, tees and
                scorecards no longer hold up the first paint
Held items:     none
```

- **False empties (rule 1).** `/my-qualifiers` says its entries failed
  (CH-09222, with Try again) instead of "You aren't entered in any
  qualifiers", and its head carries no "0 active · 0 concluded". The hero says
  nothing about where a player stands when the standings did not load (it said
  "You aren't entered" or "no rounds in yet"). The coach's pick notes that
  did not load are named (CH-09221) instead of reading as "no notes". A
  confirmed squad whose entries did not load is the squad's notice (CH-09207),
  not a row of "A player". The form carries no "0 of 0 active players
  entered" while the roster failed. Every Try again on these pages goes
  through `useRefresh` ("Trying again", a second tap ignored).
- **Refresh failed, old data kept (rule 2).** A live `router.refresh` whose
  entries or rounds read fails keeps the last good standings of the same
  qualifier, with the courses and cards that came with them, and says "These
  standings may be out of date" with Try again (CH-09220), on desktop and phone
  (`useLastGood`). A recovered read clears it, another qualifier never
  inherits the rows, and a first load that fails is still CH-09203 or CH-09204.
- **Races (rule 4).** The course picker drops a slower answer for an earlier
  course, so the tees under a course's name are that course's. Manage
  selections no longer copies candidates from props into state: a landed write
  is laid over the server's read until the read shows it, or a second read has
  come in, so a refresh started before the write cannot undo it. Giving a place
  at a tied cut waits on that player's row only (its own action and "Saving"),
  and counts the give in flight against the places left. On the phone, Reopen
  keeps its sheet up while the server answers and says "Reopening" there.
- **Small.** Manage selections has its own skeleton (CH-09409): it drew the
  qualifier's facts and leaderboard. Creating or saving a qualifier replaces
  the form instead of pushing it, so Back from the qualifier does not return
  to a spent form (a Create there would make a second qualifier).
- **Streaming (rule 6).** `loadQualifierDetail` returns the core (the
  qualifier, its entries, rounds, squad and pick notes: what the standings,
  facts and squad need) after two waves, and `secondary`, a promise that never
  rejects: the round courses with their tees and pars, and the scorecards. The
  tees start when the round courses are in and the scorecards when the rounds
  are, not after the whole core; the privacy filter on scorecards is the same
  expression as before. The route passes the core as `data` and the promise as
  `secondary`; the Par fact, Course per round, an opened row's cards, the
  phone's round sheet and the round-by-round column titles read it through
  `Streamed` (`use()` inside its own `Suspense`) with a placeholder of the
  final size (CH-09410). A failed read, or a stream cut off in the browser, is
  that section's own notice (CH-09205, CH-09206), never an empty. This
  supersedes the earlier "left" note about the scorecards.
- **Address and scroll (rule 8).** The list's filter and search are its
  address (`?filter=`, `&q=`; defaults left out, any other query kept): read
  when it mounts, so they survive its remount, and rewritten with
  `history.replaceState` after a pause in typing and before a link is
  followed. Back from a qualifier (desktop link, phone top bar, the not-found
  page) returns to the list as it was left, the team's or a player's own
  (CH-09904). The list keeps its scroll when a link is followed and restores it
  once on a return, two frames after mount so it lands after the frame's own
  scroll to the top, on a desktop (canvas) and a phone (window) (CH-09905).
- **Review.** An independent read of the first six commits found the phone
  scroll, a return mark that never expired, the unguarded per-key history
  writes and an edit that could linger over a server change; all fixed in
  `43d50e341` with tests.
- **Checked.** `qualifiers.test.tsx`, `qualifiers-reads.test.ts` and
  `qualifiers-hydration.test.tsx`, 172 cases. The tests for the tees race,
  the selection overlay, the tie row, the phone sheet, the address and the
  return mark were each seen to fail with their fix taken out.
- **Test assertions changed by design.** The detail loader's holes, courses
  and logs are read from `await result.secondary` (90806, 92101, 92301); the
  detail depth test in `qualifiers-reads.test` now asserts two waves for the
  core and that the tees and scorecards do not delay it; the create, save,
  retry and offline write scenarios assert `router.replace` for create and save
  (and that `push` is not called), `push` stays for confirm.
- **Left.** (1) Rule 2's "updating mark" on a live refresh is not drawn: a
  refresh is a transition, so the page stays whole until the new render lands
  and then changes in one commit; a unit test cannot see a transition's pending
  state, so a badge for it would be untested. (2) A refresh therefore commits
  when its courses and cards have streamed in too (as before the split, but
  now only the refresh waits, not the first paint). (3) The sidebar's link to
  the list while it is filtered keeps the filter on screen and drops the query
  from the address (the filter is seeded from the address once); a reload then
  opens unfiltered. (4) Saving an edit replaces the form with the qualifier it
  was opened from, so Back from there reads the same qualifier once. (5)
  Confirming a squad still pushes the qualifier, so Back lands on the confirmed
  Manage selections page. (6) Not seen in a browser: the scroll restore under
  the real view transition, the streamed placeholders' final sizes (no layout
  shift measured), and the phone sheet. No `next build` was run (no
  `'use server'` file changed); a Flight promise prop into `use()` is
  exercised only through unit tests.

## 2026-10-01 — Page performance: the detail and the form read in fewer passes

Owner, 2026-10-01: "Everything page transition and load needs to be extremely
smooth and accurate." Standard: `docs/clubhouse/PAGE_PERFORMANCE.md`.

```text
PR/commit:      agent/swap-audit: b4842d7de
Design package: none
Contract IDs:   none changed
Data impact:    none; no write, no cache, no new read
Held items:     none
```

- **Detail.** The qualifier detail went from four serial waves to three
  (`qualifiers-reads.test`): the qualifier, then its entries, rounds, round
  courses and squad together, then the tees and the scorecards together. The
  tees used to be read before the scorecards, one after the other.
- **Form.** Editing went from four to three: the roster is read beside the
  qualifier instead of before it. Creating is one read, as it was; the list is
  two, as it was.
- **Left.** The qualifier is still read before its parts, not beside them: a
  read of another team's qualifier would start three reads that are then
  thrown away, which is not worth one round trip. Manage selections reads the
  qualifier's team and then the workspace for the same reason (a missing
  qualifier and a failed read are told apart by the first). The scorecards
  could stream behind their own boundary, but their read is no longer the
  longest on the page; revisit with measured numbers.
- **Switching and prefetching.** The list, the detail and Manage selections
  have no client-side view switch (filters and search are on the page's own
  data), and every link into them is a `<Link>`, so Next prefetches each one up
  to its `loading.tsx`. A fuller prefetch is not used: it would show a
  qualifier's standings up to five minutes old after a round is submitted.

## 2026-10-01 — A tie at the cut waits for the coach (Q-114)

```text
PR/commit:      agent/swap-audit (#2111)
Design package: none (a panel in the Manage selections grammar;
                Fairway gets a Give place button)
Contract IDs:   CH-09010, CH-09318 (new)
Actions:        qualifiers.chooseTie → chooseQualifierTiePlace (new);
                confirm refuses an unsettled tie
Data impact:    a place given at the cut is a top_score selection written
                before confirm; no schema change
Held items:     none
```

- **Issue.** Players level on to par and strokes at the last place on score
  were split by name order on the board, in selection and at confirm.
- **Fix.** Everyone level with the last place and the next player is "Tie at
  cut". The players clearly above keep their places; the coach gives the
  places left (and can take one back) before confirming, and confirm waits
  until they are all given. The board shows "Tie at cut"; Fairway's workspace
  gets the same Give place button so a tie never blocks it.
- **Checked.** `qualifying.test.ts` (the board and workspace agree, clean
  cuts are not ties); `selection-guards.test.ts` (confirm waits, places only
  to tied players, never beyond, taken back); `qualifiers.test.tsx` 109/109.

## 2026-10-01 — Picks need a scored round; an honest confirm toast (Q-115, Q-116)

```text
PR/commit:      agent/swap-audit (#2111)
Design package: none
Contract IDs:   CH-09009 (new); CH-09008 done copy now "Squad confirmed · N
                players"
Actions:        qualifiers.confirmSquad (unchanged call); setCoachPick refuses a
                player with no scored round
Data impact:    none; confirm returns whether the players were told
Held items:     none
```

- **Q-115.** The server refuses a coach pick for an entrant with no scored
  round (completed, not a test, with a total), as the pick sheet offers.
- **Q-116.** The confirm toast reads "Squad confirmed · N players"; when
  telling the players fails, an error toast says so (CH-09009).
- **Checked.** `qualifiers.test.tsx` 108/108; `selection-guards.test.ts` 7/7.

## 2026-10-01 — Selection ranks from the rounds, as the board does; the board's unknown-round rules; test qualifiers stay hidden (swap audit §11 reconciliation, Q-134)

```text
PR/commit:      agent/swap-audit (#2111): 802bcfbad, f55938c4b, 2e6c15651
Design package: none (no visual change)
Contract IDs:   none new
Actions:        none
Data impact:    loadQualifyingWorkspace reads the qualifier's completed,
                non-test rounds; updateQualifierEntryStats skips test rounds.
                Production: 30 entry aggregates rewritten from their rounds
                (owner-approved; 0 of 136 now disagree)
Held items:     none
```

- **Issue.** The board ranked from rounds and selection (and confirm) from
  the entry's stored aggregate, which was stale on a live qualifier (3 rounds
  played, 2 stored), so the two could rank a player differently.
- **Fix.** Selection and confirm rank from the same rounds as the board. Both
  treat a round with a total but no to-par as unknown (not even), count a
  second round in one round slot once, and a link to a test qualifier (detail
  or edit) is not found, as in the list.
- **Checked.** The SQL oracle matched the board on all 7 Demo entrants;
  `qualifiers.test.tsx` 107/107; `qualifying-loader-rounds.test.ts` (3 fail
  on the old loader); qualifying suites 143/143.

## 2026-09-30 — Manage selections has its own error and loading states (swap audit F-18)

```text
PR/commit:      agent/clubhouse (release train #2110)
Design package: none (swap audit fix, no visual change)
Contract IDs:   none
Actions:        none
Data impact:    `qualifiers/[id]/selection/error.tsx` and `loading.tsx` (new). No schema change.
Held items:     none
```

- **Issue.** The selection route had no error boundary or loading skeleton of
  its own (the route-state guard failed in `test:all`).
- **Fix.** `RouteErrorBoundary` for the route, and the Clubhouse qualifier
  skeleton while it loads (nothing outside Clubhouse, where the address
  redirects).
- **Checked.** `route-state-boundaries.test.ts` 5/5.

## 2026-09-30 — V2 page docs (contracts proven by tests); Retry now finishes the job

```text
Design package: design/handoff/ v2 (Coach - Qualifiers.html, Coach - Qualifiers - Mobile.html)
PR/commit:      agent/clubhouse (working tree, not yet committed)
Contract IDs:   90101 to 92401 (122 on this page: 77 from the catalog, 45 new behaviour contracts without a code)
Actions:        12 (ACT-P009-*)
Data impact:    none
Held items:     qualifier-squad-and-entrants (feature), qualifier-db-hardening (data)
```

### Changed

- The six page docs, the manifest's actions (12, each mapped to its component,
  handler, server action, tables and
  contracts), `status.contract` complete and `docs` current, and the manifest's
  `/qualifiers/[id]/selection` route.
- 45 behaviour contracts for what the catalog does not number: the core views
  and addresses (90101 to 90107), the
  live refresh (90304), the edit form's locks (90513, 90514), offline refusal of
  all eight writes (90702), the
  permission rules (90803 to 90812), success (90901, 90902), state kept (91202
  to 91204), no optimistic writes
  (91301), Retry and Try again (91401, 91402), the re-read after a write
  (91501), field alerts (91804), the phone
  views (91901 to 91904), keyboard (92001 to 92003), one-pass reads and the
  debounce (92101, 92102), reporting
  (92301 to 92304) and the tests (92401). They are in a sidecar until the
  registry sync merges them into
  `bridge-contracts.json`.
- Category 08 (permission) is real: the coach-only addresses, what a player
  sees, the loaders' team ownership, the
  server gates behind each write, and what a refusal says. The open RLS gap (a
  player's database access to
  teammates' holes and, until D-35 is applied, to pick reasons) is stated in the
  contract.
- The catalog rows CH-09309, CH-09310 and CH-09311 (no team, not found, coach
  only) are now forced by tests, not
  marked preview.
- Tests: `qualifiers.test.tsx` 65 → 104; new `qualifying-coach-gate.test.ts` (6,
  90810); `qualifier-setup.test.ts`
  and `golf-qualifier-manual-close.test.ts` gain Bridge IDs (90811, 92302) and a
  test (90812). Every hand contract
  is named by its Bridge ID in a test title; nothing was weakened or removed.
- `docs/clubhouse/screens/qualifiers.md`: the live-updates row now describes the
  hook that was built (one channel,
  `golf_rounds`), not the three-table channel the first plan named.

### Fixed

- Retry on a failure toast re-ran only the write. Closing the question, changing
  the status pill, opening the new
  qualifier and reading the page again lived in the button, so a retry that
  landed left the page as it was. The
  follow-up now lives inside each action (Close, Reopen, Create, Save, Start
  selecting, Save pick, Remove pick,
  Confirm squad). One test drives all eight and fails with the fix taken out
  (checked).
- The phone's closed note for a coach now carries the rule the desktop and the
  catalog state (players cannot enter or
  submit rounds in a closed qualifier, including rounds already started;
  CH-09901).

### Why

- D-62: Messages is the gold standard the other pages copy. D-69: every category
  answered.

### Verification

- The four Qualifiers test files, 130 of 130. 73 deliberate breaks of the
  guarded code, all caught, all restored.
  `npm run -s typecheck:fast` and eslint on the changed files clean (VERIFY.md).
- Not run in this pass: `clubhouse:check`, `docs:check`, the build, a browser or
  the iPhone.

## 2026-09-30 — v2 phone and Manage selections

- The phone: list under a "‹ More" top bar, `QualifierDetailPhone`, the player
  rounds sheet, the form with Cancel and
  Create in the top bar, and Manage selections (`/qualifiers/[id]/selection`,
  coach only, Q-65) on the live
  selection actions. New catalog rows CH-09005 to CH-09008, CH-09111, CH-09112,
  CH-09218, CH-09219, CH-09315,
  CH-09316, CH-09408, CH-09503 to CH-09505, CH-09703 and CH-09903 (PROGRESS.md).

## 2026-09-29 — Desktop build

- Coach and player list, detail, create and edit on the existing qualifier
  server actions (D-30), the v2 motion and
  haptics (D-64, D-70), and the D-61 gate on the squad-size and entrants
  actions.
