# P003 — Roster: verification

Only what was observed. Gates are in `docs/clubhouse/PROGRESS.md`; the per-gate
checklist is `docs/clubhouse/screens/roster.md`.

## Current verification status

```text
Status:     partial
Commit/PR:  agent/clubhouse (local, not committed when this was written; draft PR #2102 is behind it)
Date:       2026-09-30
```

## Static checks

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run -s typecheck:fast` | exit 0 (2026-09-30, after this pass) |
| Lint | `npx eslint src/clubhouse/screens/roster src/clubhouse/routes/roster.tsx src/clubhouse/__tests__/roster.test.tsx` and the Roster page under `src/app/golf/(dashboard)/dashboard/roster/` | exit 0 |
| Clubhouse check | `npm run -s clubhouse:check` | not run in this pass (the lead runs it with the registry sync); the registry and contract rules were dry-run against the merged Bridge list with no violation for P003 |
| Knowledge check | `npm run -s docs:check` | exit 1, not from this page: `memory/projects/golfhelm.md` says 236 routes and the source has 237 (this pass added no `page.tsx`) |
| Build | `npm run build` | not run in this pass; no server action changed, and the page now calls the new route adapter |

## Automated tests

| Test | Contract | Result |
| --- | --- | --- |
| `src/clubhouse/__tests__/roster.test.tsx` (63 cases, each named by the codes and Bridge IDs it forces) | every catalog row of kinds 0 to 5 that is not preview, CH-3306, and the 22 hand contracts (30101 to 32401) | pass (`npx vitest run src/clubhouse` 536/536, 2026-09-30) |
| `src/clubhouse/__tests__/shell.test.tsx` | the shell contracts this page inherits (10703, 10802, 12001 and the rest) | pass |

Mutation checks (2026-09-30): each new test was watched to fail with the code it
guards broken, and pass again with it restored (only Roster's own files were
broken). Checked: 30101, 30102 (phone, and desktop ignoring the link), 30303
(players and requests), 30502, 30701 (approve, Approve all, remove and note sent
without `useAction`), 30801, 30802 (members by team, notes by coach), 30803,
30901, 31202 (storage write, and its try/catch), 31203 (desktop and phone),
31301 (hide at once, restore on refusal, other decisions wait), 31403 (the
dialog, the note, the request), 31704, 32001 (trim, skip an unchanged note),
32101, 32301 (action name, breadcrumb), 32401, CH-3306 (copy, and the class the
phone hides), CH-3703 Share (dismissed, and the fallback), CH-3803 Esc inside a
dialog. Not mutation-checked: the success haptic and the offline refusal
themselves, which live in shared `useAction` (not touched; 30701 was checked by
taking `useAction` out of each Roster caller in turn), and the existing tests
that only gained an ID in their title.

## Visual verification

### Desktop

```text
Viewport:  924, 1280 and 1400px (preview)
Reference: design/handoff/screenshots/roster-01..05 (v1); Coach - Roster.html (v2, same screen)
Result:    matched, logged 2026-09-29 in PROGRESS.md (cards, list, panel, requests, invite, empty, failed, partial and
           loading states). Not re-checked after the v2 motion, haptics and empty state, or after this pass.
```

### Phone

```text
Viewport:     390 × 844 (preview)
Device/shell: not yet on a real iPhone (npm run ios:dev, owner)
Reference:    design/handoff/mobile/Roster Mobile.html; Coach - Roster - Mobile.html (v2)
Result:       built to the approved spec and compared with the boards on 2026-09-29; 430px, toasts over content and
              drag to dismiss are open
```

## Forced states

| State | Contract | How forced | Observed result |
| --- | --- | --- | --- |
| Skeleton | 30201 | test (`aria-busy`), `/clubhouse-preview/roster?state=loading` | skeleton in Roster's shape |
| Empty | 30401 to 30406 | tests, `?state=empty` | distinct from a failed read; no team is Roster's own state |
| Validation | 30501 | test | the counter and the limit |
| Server failure | 30601 to 30616 | tests; `?state=failed`, `partial` | toast or notice with its code; the text stays in the field |
| Offline | 30701 | test | nothing sent, the action named, the screen unchanged |
| Permission | 30801 to 30803 | tests | a player session gets nothing; the loader is scoped; the server's sentence is shown |
| Destructive | 31101, 31704 | tests | confirm first, the warning haptic, then success |
| Optimistic rollback | 31301 | tests | the request comes back in its place |
| Retry | 31401 to 31403 | tests | Retry finishes the change on screen |
| Refresh | 30303, 31402 | test | new data replaces the first copy |

Not forced against a live session: removal, approval, decline and note failures.
A state never observed in a browser is not verified
(08_CI_PROGRESS_AND_VERIFICATION.md).

## Accessibility

```text
Keyboard:       Esc closes the panel except while typing a note (roster.test CH-3803). Dialogs are native <dialog>, which
                traps focus; that is not tested here. A full keyboard walk at 1280 and 390 is open.
VoiceOver:      the phone row reads as one button (CH-3806); not tried on a device.
Focus:          a pushed profile takes focus on its title (the shell's CH-1809).
Reduced motion: the panel fades instead of sliding (RosterPeek); not tested in this file.
Contrast:       clubhouse:a11y (axe, WCAG 2.2 AA) for roster ran clean at 1280 and 390 on 2026-09-29 (15 pages) before the
                v2 changes and this pass; the rerun is open, and RosterNoTeam is new.
Text scaling:   not checked.
```

## Performance

```text
Layout shift:      not measured
Request waterfall: none on the client. The server makes two parallel rounds (the second needs the first's player ids);
                   not timed.
Large list:        not measured. The member read has no pagination (one team); season rounds page at 1,000 rows and the id
                   lists are chunked at 200.
Animation:         v2 tokens only
Notes:             first-load JS and LCP after the v2 reveal are open (CH-1954)
```

## Screenshots

Evidence log. The images stay in `.helm/screenshots/clubhouse/` (never committed) and travel in the PR description; this table is the committed record of them. One row per file; the label is the file's basename, named by `npm run clubhouse:shots -- name` (convention: `.claude/rules/clubhouse.md`). Phase is before, after, baseline or evidence.

| Label | Phase | Commit | What it shows |
|---|---|---|---|

## Open verification gaps

- The iPhone pass through `npm run ios:dev` (owner); 430px and toasts over content (merge pass).
- A browser pass with a real coach account (Q-4), including forced remove, approve, decline and note failures.
- The full keyboard walk; `clubhouse:a11y` rerun after the v2 changes and this pass; LCP and layout shift.
- Not verified: that an approved player appears on the roster in a real session. 30303 relies on Next sending the
  revalidated page back after the server action (each action calls `revalidatePath`); the test simulates that page
  with `rerender`, and nothing has watched it in a browser.
- Fixed 2026-09-30, each with a test that fails without the fix: the toast's Retry did not finish the change on
  screen (a retried removal left the player listed and the dialog open, a retried approval put the request back);
  Try again after a failed read showed "No players yet" because the screen kept its first copy; a saved note read
  back as the old text; Remove player fired no warning haptic (D-70); a coach with no team saw Home's empty state;
  on desktop, Approve on a second request while the first was in flight did nothing and said nothing; the CSV export
  wrote a player's name that starts with `=`, `+`, `-` or `@` as it was typed, which a spreadsheet may read as a
  formula; Esc inside the Remove or Invite dialog also closed the player panel.
- Found, not fixed (owner or lead decides):
  - Fairway's roster warned when one student is on the roster twice (#1477); Clubhouse dropped that notice.
  - The desktop Message button opens the inbox, while the phone opens the player's thread (`?player=`, as
    `phone/roster.md` records). P007's PAGE.md says Roster's Message buttons use `?player=`.
  - The join-request notification links to `roster?tab=requests`; Roster ignores `tab`, though the requests are the
    first thing under the header.
  - `docs/clubhouse/screens/roster.md` said the page reads in one pass; it is two parallel rounds (corrected).
  - The Clubhouse roster files are not mapped to a feature in `memory/registry.yml` (`knowledge:map` finds none), so
    no feature doc is updated by a Roster change.
  - The desktop Schedule 1:1 (panel) and View insights (row menu, CoachHelm `?player=`) were built 2026-09-30
    (CLICKABLES gaps 4 and 16).
