# P009 — Qualifiers: verification

Only what was observed. Gates are in `docs/clubhouse/PROGRESS.md`; the per-gate checklist is
`docs/clubhouse/screens/qualifiers.md`.

## Current verification status

```text
Status:     partial
Commit/PR:  agent/swap-audit: seven commits for the 2026-10-01 owner rules (CHANGELOG); no PR opened or checked here
Date:       2026-10-01
```

## Static checks

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run typecheck:fast` | exit 0 (2026-10-01) |
| Lint | `npx eslint` on every changed screen, loader, route and test file | exit 0, 0 warnings (2026-10-01) |
| Registry check, P009 | `checkRegistry` from `scripts/clubhouse/registry.mjs`, run on the working tree with P009's 45 hand contracts merged in memory | no P009 violations (the hand contracts are in a sidecar until the coordinator runs `registry.mjs sync`) |
| Clubhouse check | `scripts/clubhouse/check.mjs` on HEAD plus this page's files, in a scratch copy (the shared checkout had other pages' catalog rows mid-edit) | clean: 15 pages, Bridge IDs registered (2026-10-01) |
| Markdown | `npm run markdown:ratchet` | exit 0 (2026-10-01) |
| Knowledge check | `npm run -s docs:check` | not run in this pass |
| Build | `npm run build` | not run; no `'use server'` file was changed. A promise passed from the route to a client component is proven by unit tests only |

## Automated tests

| Test | Contract | Result |
| --- | --- | --- |
| `src/clubhouse/__tests__/qualifiers.test.tsx` (148 cases, each named by the codes and Bridge IDs it forces) | every catalog row of kinds 0 to 5 that is not marked preview, and 45 hand contracts | pass (2026-10-01) |
| `src/clubhouse/__tests__/qualifiers-reads.test.ts` (6) and `qualifiers-hydration.test.tsx` (18) | the detail's two core waves and its streamed part, the form's waves; the server and client first frames agree | pass (2026-10-01) |
| `src/app/golf/actions/__tests__/qualifying-coach-gate.test.ts` (6 cases, new) | 90810 | pass |
| `src/app/golf/actions/__tests__/qualifier-setup.test.ts` (17 cases) | 90811, 92302 | pass |
| `src/app/golf/actions/__tests__/golf-qualifier-manual-close.test.ts` (3 cases) | 90812 | pass |

The four files together: 130 passed, 0 failed (2026-09-30).

Mutation checks (2026-09-30): for each new test, the code it guards was broken, the test was seen to fail, and the
code was put back. 73 breaks, 73 killed, 0 survived. They cover the eight Retry follow-ups (91401), the Try again
paths (91402), the re-read after a write (91501), the route's coach-only, no-team and not-found answers
(90105, 90803 to 90805), the loaders' team compare and the player's own-holes-only rule (90805, 90806, 90807),
the refusal wording (90809), the offline refusals (90702), field alerts and focus (91804, 92001, 92002), the phone
views (91901 to 91904, CH-09901), the debounce (92102), the one-pass reads (92101), reporting (92301, 92304), and
the three server gates (90810 to 90812, 92302). Not mutation-checked: the assertion in the 90106 test that the
shell does not list `/my-qualifiers` for a coach (`isRebuilt` is shared shell code).

## Visual verification

### Desktop

```text
Viewport:  1280 and 924px (preview)
Reference: design/handoff/Coach - Qualifiers.html (v2); Qualifiers.html (v1)
Result:    matched, logged 2026-09-29 in PROGRESS.md (21 states). Not re-checked in this pass, which had no
           browser. Not yet re-checked after the v2 motion and navigation changes.
```

### Phone

```text
Viewport:     390 × 844 (preview)
Device/shell: not yet on a real iPhone (npm run ios:dev, owner)
Reference:    design/handoff/Coach - Qualifiers - Mobile.html (v2); mobile/Qualifiers Mobile.html
Result:       built to the approved spec 2026-09-30; the browser pass at 390 and 430 and the iPhone pass are open
```

## Forced states

| State | Contract | How forced | Observed result |
| --- | --- | --- | --- |
| Skeleton | 90201 to 90205 | tests (`QualifiersSkeleton`, an in-flight write), `?state=loading` | shaped like the page; the write's button says what it is doing |
| Empty | 90401 to 90412 | tests, `?state=empty` | distinct from a failed read |
| Validation | 90501 to 90514 | tests | message under the field, nothing sent, focus on the first problem |
| Server failure | 90601 to 90628 | tests | toast or notice with its code; fields and dialog kept |
| Offline | 90702, 10703 | test (all eight writes) | nothing sent, the action named, error haptic |
| Permission | 90801 to 90812 | tests (route, loaders, screens, three server files) | coach-only page, not found, no player controls, server refusals |
| Destructive | 91101 to 91104 | tests | confirm first, warning haptic |
| Retry | 91401, 91402 | tests (a scenario table over the eight writes, plus the sections) | the write runs again and finishes; the page reads again |
| Slow save | 10702 | the shell's own test (`shell.test.tsx`); not forced in this page's tests | the still-saving notice |
| Partial save | 90622 | test | the toast says it failed, the form says what saved and what did not |
| Optimistic | 91301 | test | nothing changes until the server answers |
| Failed read, never an empty | CH-09202, CH-09207, CH-09208, CH-09218, CH-09221, CH-09222 | tests (loaders with a failing table, then the screen; the selection workspace loader with a failed picks, reasons or rounds read, and the tie and confirm writes behind it, `src/test/coachhelm/v3/qualifying-loader-failed-reads.test.ts`) | a notice with Try again; no "you aren't entered", no "A player", no "0 of 0", no "no notes"; a write refuses instead of counting zero picks |
| Stale | CH-09220 | test (good data, an empty good board, a failed refresh, a recovered one, another qualifier, desktop and phone) | the last good standings stay with the notice; another qualifier never inherits them |
| Streaming | CH-09410, CH-09205, CH-09206 | tests (an unresolved promise, a failed part, a cut stream, new standings with a part that has not landed, the phone sheet, the route with the reads held; a refresh as a transition is not unit-testable) | the standings are on screen while the courses and cards are placeholders; a failure is that section's notice |
| Race | 92102, 91301 | tests (two deferred tee answers, a stale re-read, a pending give beside a second one) | the last choice wins; a landed write is not undone by an older read; only the row that is saving waits |
| Filter, search and Back | CH-09904, CH-09905 | tests (the filter and search coming back for the same team and not another, no address write, the Back notes on the desktop link, the phone top bar, the not-found page and Manage selections, a note read once, a double tap, strict mode, a new-tab click, a blocked store, and the list inside RouteFrame) | the list opens as it was left, and Back is a step back when the list opened the qualifier |

Not forced against a live session: any of the above with a real coach account, Manage selections against a real
qualifier, the realtime feed against a real channel (the test drives the hook with a fake channel), and the
`createGolfQualifier`, `updateGolfQualifierDetails` and `setQualifierRoundCourses` refusals (see the contract's
category 08 note).

## Accessibility

```text
Keyboard:       Enter submits the form (92002); focus goes to the first problem (92001); a scorecards button takes
                Enter and Space (92003). Not tested: that a dialog keeps Tab inside it (the shell's Modal). A full
                keyboard walk at 1280 and 390 is open.
VoiceOver:      not tried on a device.
Focus:          a pushed phone screen takes focus on its title (the shell's CH-1809).
Reduced motion: this page's motion is the shell's press and reveal, both off under reduced motion (shell tests).
                Not tested here.
Contrast:       clubhouse:a11y (axe, WCAG 2.2 AA) ran on 2026-09-29 (156 pages, 53 of them Qualifiers), before the
                phone build and Manage selections. Rerun open.
Text scaling:   not checked.
```

## Performance

```text
Layout shift:      not measured
Request waterfall: none after first paint except a live qualifier's re-read and the course picker (tested: 92101, 92102).
                   Server depth (qualifiers-reads.test, 2026-10-01): the detail's core (standings, facts, squad) is two
                   passes: the qualifier, then its entries, rounds, round courses and squad together. The tees (from the
                   round courses) and the scorecards (from the rounds) start the moment their input is in and stream
                   behind the first paint (it was three passes with both before it); the edit form reads the roster
                   beside the qualifier, then its parts, then the tees (it was four, the roster first); the list is two.
Large list:        the list reads up to 1,000 qualifiers and chunks its entry and round reads; not measured with a large team
Animation:         v2 tokens only
Notes:             first-load JS and LCP after the v2 reveal are open (CH-1954)
```

## Screenshots

Evidence log. The images stay in `.helm/screenshots/clubhouse/` (never committed) and travel in the PR description; this table is the committed record of them. One row per file; the label is the file's basename, named by `npm run clubhouse:shots -- name` (convention: `.claude/rules/clubhouse.md`). Phase is before, after, baseline or evidence.

| Label | Phase | Commit | What it shows |
| --- | --- | --- | --- |

## Open verification gaps

- The owner-rules pass (2026-10-01) had no browser: the streamed placeholders' sizes (layout shift not measured), the
  frame's scroll restore under the real view transition on a desktop and a phone, `router.back()` landing on the list
  inside the App Router, and a refresh as a transition (the page staying whole until the new render lands) are proven
  by unit tests and by reading the code, not seen. A rejected stream chunk is simulated, not observed.

- A browser pass at 390 and 430, the iPhone pass through `npm run ios:dev` (owner), and a `clubhouse:a11y` rerun on
  the phone build and Manage selections.
- Manage selections against a live coach session, and a browser check of what a player sees on each address.
- The refusals of `createGolfQualifier`, `updateGolfQualifierDetails` and `setQualifierRoundCourses` have no test
  here. All three were read in this pass, not run: create resolves the coach's organisation and active team, details
  compares organisations (RLS is the narrower gate), and round courses uses the team access check.
- The realtime feed against a real channel; D-31's rule that a closed qualifier refuses rounds, which belongs to
  round entry and was not re-checked.
- The RLS statements in the contract are quoted from the 2026-09-29 read of the live policies, not read again.
- CH-09601, CH-09602 and CH-09801 are preview-checked only.
- The registry marks CH-09701 to CH-09703, CH-09802 and CH-09601, CH-09602 `reserved` although tests name them,
  because `sync` derives the status; the coordinator's sync will settle it.
- `registry.mjs sync` has not been run on the 45 hand contracts (they are in the sidecar).

## Found and fixed in the owner-rules pass (2026-10-01)

- A failed entries read emptied /my-qualifiers into "You aren't entered in any qualifiers"; a failed standings read let
  the hero say "You aren't entered" or "no rounds in yet"; a failed notes read read as "no notes"; a failed entries read
  on a confirmed squad listed "A player"; a failed roster read said "0 of 0 active players entered".
- A live refresh that failed to read the rounds replaced good standings with the error.
- A slower tees answer for an earlier course overwrote the later course's tees; a late refresh undid a landed pick or
  place; giving one tied player a place froze the other rows; the phone's Reopen showed its wait on a closed sheet.
- Manage selections drew the qualifier's skeleton; a saved form stayed in the history.
- The detail waited for the tees and the scorecards before its first paint.
- Review of the first six commits: the list's own scroll restore did nothing on a phone, its return mark never expired,
  and its address was rewritten on every key without a guard. All three went away when rule 8 moved onto the shell's
  session state and RouteFrame's scroll restore (the list now keeps no address, scroll or return mark of its own).

## Found and fixed in the 2026-09-30 pass

- The failure toast's Retry re-ran only the write. The follow-up (closing the question, changing the pill,
  opening the new qualifier, reading the page again) lived in the button, so a coach who retried after a failure
  saw the write land and the page stay as it was. Fixed in `QualifierDetail`, `QualifierForm` and
  `QualifierSelection` by moving the follow-up into the action; 91401 tests all eight writes and fails with the fix
  taken out (mutation-checked).
- The phone's closed note for a coach said less than the desktop's and the catalog's (CH-09901). It now says
  "Players can’t enter or submit rounds in it, including rounds already started, until you reopen it." Tested.

## Found, not fixed (outside this page's files or an owner call)

- `createGolfQualifier` (shared server action) is not atomic: a failed entries insert leaves the qualifier in
  place, the toast says "Nothing was created" and Retry creates a second qualifier; a failed round-courses insert
  is logged and the create still reports success.
- The confirm toast counts the squad (`Squad confirmed · N players told`); the server notifies every candidate,
  and a failed notification is logged and not shown.
- `loadQualifierSelection` reads `golf_qualifiers` twice (ownership, then the workspace).
- A coach who opens `/my-qualifiers` gets the shell's not-rebuilt page (10401), because that address is in the
  player's rebuilt routes only.
- `selectionReason` maps a signed-out "Unauthorized" to "Only this team’s coaches manage its squad."
- The checklist (`docs/clubhouse/screens/qualifiers.md`) said live updates reuse a channel on three tables; the hook
  built is new and listens to `golf_rounds` only. The checklist row now says so; whether an entry or pick change
  should also refresh the page is open.
