# P006 — Calendar: verification

Only what was observed. Gates are in `docs/clubhouse/PROGRESS.md`; the per-gate checklist is
`docs/clubhouse/screens/calendar.md`.

## Current verification status

```text
Status:     partial
Commit/PR:  agent/clubhouse (local, not committed when this was written)
Date:       2026-09-30
```

## Static checks

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run -s typecheck:fast` | exit 0, no errors (2026-09-30) |
| Lint | `npx eslint` on the five files changed in this pass (editor, extras, inspector, the loader, the test) | exit 0 |
| Registry and contract check | `checkRegistry` from `scripts/clubhouse/registry.mjs`, run in memory over the registry plus the page's 30 new Bridge IDs (a scratch run; the IDs are merged into `bridge-contracts.json` afterwards) | 0 violations: the manifest, its 21 actions, all six docs and all 25 categories agree with the registry |
| Clubhouse check | `npm run -s clubhouse:check` | not run in this pass |
| Knowledge check | `npm run -s docs:check` | not run in this pass |
| Build | `npm run build` | not run: no `'use server'` file changed, and no build on the laptop |

## Automated tests

| Test | Contract | Result |
| --- | --- | --- |
| `src/clubhouse/__tests__/calendar.test.tsx` (67 cases) | every catalog row of kinds 0 to 5 that is not marked preview, and 29 hand contracts by Bridge ID (60101 to 62401) | pass (67/67, 2026-09-30) |
| `src/clubhouse/__tests__/logic.test.ts` ("calendar model") | the date, lane, overlap and open-time model | pass (2026-09-30; not changed) |
| `src/clubhouse/__tests__/shell.test.tsx` | the shell contracts this page inherits (10703, 10702, 11611, 11811 and the rest) | not run in this pass |

Mutation checks. 37 changes to the code the new tests guard were made one at a time, the tests run, and the
code put back. All 37 failed a test, so none survived: the seven Retry follow-ups moved back into the button
(each of the seven scenarios failed), the loader sending a player every reply, the replies read per event, busy time
read after the replies, a player offered the team link, a swallowed Undo error, Undo sending offline, an impossible
date accepted, another player's class shown, busy time read for a player, a player treated as a coach, the reply
offered to someone not invited, every step asking the server, the screen ignoring the server's new view, the T key,
Try again doing nothing, a reply that waits for the server, attendance forgetting what saved, a clash blocking
Publish, a removed file waiting for the server, the loader filing a time by UTC, a failed read not logged, the route
not stopping for no team, a player loaded without their id, Undo not re-reading, the page passing `new` for any
value, the count off by one, Publish bypassing the save hook, the seeds staying in the address, a refused reply
not going back, and the series scopes of Cancel event promising a soft cancel again.

## Visual verification

### Desktop

```text
Viewport:  924, 1280 and 1400px (preview)
Reference: design/handoff/screenshots/calendar-01..12 (v1); Coach - Calendar.html (v2, same screen)
Result:    matched, logged 2026-09-29 in PROGRESS.md (week, day, month, agenda, event, overlap, attendance, editor;
           the player view; the failed, partial and loading states). Not re-checked after the v2 motion and haptics
           changes. This pass changed no markup or style.
```

### Phone

```text
Viewport:     tests at the phone width only (jsdom, six cases); no browser at 390 or 430
Device/shell: not yet on a real iPhone (npm run ios:dev, owner)
Reference:    design/handoff/Coach - Calendar - Mobile.html, m-cal.jsx (v2)
Result:       built 2026-09-30 to the approved spec; the browser and iPhone passes are open
```

## Forced states

| State | Contract | How forced | Observed result |
| --- | --- | --- | --- |
| Skeleton | 60201 | test | the skeleton is busy |
| Empty | 60401 to 60408 | tests | each named state, distinct from a failed read |
| Validation | 60501 to 60504 | tests | message under the field, nothing sent |
| Server failure, writes | 60601 to 60612 | tests: every toast is forced once | toast with its code; the editor or sheet stays open; the file comes back; the reply goes back |
| Server failure, reads | 60613 to 60621, 60624 | tests | notice with its code and Try again; never an empty calendar |
| Crash | 60622, 60623 | tests | contained in its section |
| Retry | 61401 | test, one scenario for each of the seven writes | same write again with the same arguments, then the follow-up happens |
| Offline | 10703 (seven writes), 60701 (file removal and Undo) | tests | nothing sent, the action named, the error haptic |
| Permission | 60801 to 60805, 60807, 60808 | tests | see CONTRACT.md 08; the loader tests read the trimmed data |
| Destructive | 61101, 61102, 61201 | tests | confirm first, warning haptic |
| Optimistic | 61301, 61302 | tests | the choice shows at once and goes back; the file goes at once and comes back |

Not forced: a slow save (the shell's 10702) on a Calendar write; the server's own refusals (60806: read, not run); a
publish whose answer is lost on the way back. A state never observed is not verified.

## Accessibility

```text
Keyboard:       N, T, the arrows and Esc, and that none fires while typing or with a dialog open (62001). Not tested:
                the Find a time band's arrow keys; a full keyboard walk at 1280 and 390 is open.
VoiceOver:      not tried on a device.
Focus:          dialogs are the shell's Modal (a native dialog: focus is trapped, Esc closes, focus returns to the opener);
                not tested here. The event editor's title takes focus when it is missing (in the code; no test
                asserts the focus).
Reduced motion: not checked for Calendar's own motion (all three catalog rows are marked preview).
Contrast:       clubhouse:a11y (axe, WCAG 2.2 AA) ran for calendar on 2026-09-29, 20 pages at 1280 and 390, with one known
                finding (the 7-day week at 390px); rerun after the v2 phone build is open.
Text scaling:   not checked.
```

## Performance

```text
Layout shift:      not measured
Request waterfall: the loader reads in three rounds and no more (62101, tested); the browser fetches the links, an
                   event's files, the documents and attendance only when a person opens them
Large list:        not measured (the month draws up to three events a day and a count)
Animation:         v2 tokens only
Notes:             first-load JS and LCP after the v2 reveal are open (CH-1954)
```

## Screenshots

Evidence log. The images stay in `.helm/screenshots/clubhouse/` (never committed) and travel in the PR description; this table is the committed record of them. One row per file; the label is the file's basename, named by `npm run clubhouse:shots -- name` (convention: `.claude/rules/clubhouse.md`). Phase is before, after, baseline or evidence.

| Label | Phase | Commit | What it shows |
|---|---|---|---|

## Open verification gaps

- A browser pass with a real coach account and a real player account, desktop and phone (owner or merge pass).
- The iPhone pass through `npm run ios:dev` (owner).
- `clubhouse:a11y` after the phone build and the v2 changes; the full keyboard walk; LCP and layout shift.
- Each write forced against a live session; the server refusals in 60806 run against a database.
- Not verified in a browser: the toast's Retry when the failure came from inside a modal dialog. The tests click it in jsdom; a real browser makes everything outside a modal dialog inert, and the toasts are outside it (CONTRACT.md 14). The follow-up moves are proved; whether the button can be pressed there is not.
- Not reproduced: the editor setting its fields again when the page re-reads while it is open (CONTRACT.md 12).
- Not handled: a create whose answer is lost can be created twice by Retry (CONTRACT.md 06).
- v2 draws a whole-page first-run state for a team that has never scheduled anything (D-71); it is not built.
