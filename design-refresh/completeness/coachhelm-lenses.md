# Lane report: coachhelm-lenses (Completeness pass, 4 Nov 2026)

Files changed: `pkg/design-refresh/coachhelm-lenses/02-PLAN.md`, `05-SCREENS.md`, `06-SCREEN-SPECS.md`, `07-MOTION.md`, `08-ACCEPTANCE.md`. Each has the H1 pointer and the section at the end (02 adds 12 rows, 05 adds 30, 06 adds 33, 07 adds 9, 08 adds 23).

## 1. Matrix

| Item ID | Kind | States covered before | Gaps found | What I added |
|---|---|---|---|---|
| S-LIST (push only) | lane 1's screen | default, flag off | none | none |
| S-FILE | push or screen | full set incl. early, nofield, nointent | no rule for 821 to 1179; no player on a coach URL, bad id, cold start, refresh, Back and lens restore, two devices, deleted mid-session, 1 Aug, timezone, keyboard, share or print; flag off was only in 08 | new ID `S-FILE.off`; 14 rows; 06 layouts and focus; M-LNS-33 to 37; CP-LNS-1 to 3, 10 to 16, 21 |
| S-FILE.rail | desktop | full | data source vs BUILD_BRIEF ("uses Team's loader") unclear | 05 data row (rows from `loadFileRoster`, top read later from CT0 under CT0a's drawn-only rule); CP-LNS-18 |
| S-FILE.read | sheet | full | differed from Team's sheet: card vs grouped, wells, close 32, no drill, gathering, no-Tour or links, no Team-pool flag in the rule; no gone or not-allowed `insight=`; no stale or gathering rule | fixed in place (§8 rows, redline, 08 criteria 1 to 3); new ID `S-FILE.read.gone`; shared read sheet contract in 06; M-LNS-30 to 32; CP-LNS-4 to 8, 14, 19 |
| S-FILE.plan | sheet | full | no unsaved-change rule; scrim or swipe silently dropped edits | new ID `S-FILE.plan.discard`; 06 row; M-LNS-29; CP-LNS-9; 08 plan criterion 5 fixed |
| S-FILE.focus | inline | full | the "Assigning" label differed from FocusActions | fixed in place |
| S-FILE.more | menu | full | profile target unstated (lead's message) | fixed to `/golf/dashboard/roster?player=<id>` in 05, 06 and 08; 02 section; CP-LNS-23 |
| `playerFileHref` | link contract | signature only | no flag-off fallback or player-role rule; Ask needs it (lead's message) | 02 §2.2 fixed in place (`on = false`, as `readHref`); 02 Completeness pass contract; CP-LNS-22 |
| S-FILE.lens, .undo, .toast, S-BOARD (+ focus, read) | | full | covered by the board-wide rows | none extra |

## 2. Gaps filled

107 rows added, 16 fixed in place:
- 06 §8: sheet surface, close 34, section cards (contrast to recheck, CP-LNS-14), the new drill, gathering, no-Tour and links row, redline, the Assigning label.
- 06 §9 plan fields as section cards.
- 08 S-FILE.read criteria 1, 2 and 3.
- 08 plan criterion 5.
- 02 `playerFileHref` signature.
- The profile link in 05, 06 and 08.

## 3. Handoffs

| From | To | Trigger | Context | Back | Other flag off |
|---|---|---|---|---|---|
| Team | Lenses | player sheet "Open {first}'s page"; S-LIST row | `playerFileHref(id, undefined, on)` | to Team or the list, scroll kept | Lenses off: today's player page |
| Ask | Lenses | a player name in an answer (coach only) | `playerFileHref` | browser Back | `on` false gives today's Deep dive |
| Lenses | Read | "Open the full read" (sheet), or an All reads row with the read flag on | player, insight | to the file, same scroll and lens | read off: the row opens the sheet only; no link |
| Lenses | Stats | "Full standing" | `&from=file` (no redirect back) | to the file | n/a |
| Lenses | Roster | "Open {first}'s profile" | `/golf/dashboard/roster?player=<id>` | "‹ Roster" goes to the list; browser Back returns to the file | before Roster PR 8 the param is ignored |
| Lenses | Messages | "Message {first}" | player, no prefill | compose's own | n/a |
| Roster profile and peek, old Deep dive and Standing links, notifications with `at=` and `insight=` | Lenses | redirect (02 §2.2) | card, insight | as the file | off: no redirect |
| Team | Lenses | shared read sheet | Lenses imports Team's component | n/a | n/a |

Contradictions:
- The sheet differed from Team's (fixed to one contract).
- BUILD_BRIEF says the rail uses Team's loader, while the lane uses `loadFileRoster` (reconciled: rows come from the roster query and the top read from CT0 later).
- On success Lenses closes the sheet and Team keeps it open (logged as the host's choice).

## 4. Needs a shared-file change

- START_HERE §4 row 9 and BUILD_BRIEF §L say "L1 to L6". The lane has 0, 1 to 4, 5a, 5b and 6. Suggested: "L1 to L6 (L5 is two PRs, L5a and L5b)". Why: so nobody looks for a missing PR.
- BUILD_BRIEF line 281, "the desktop rail uses Team's loader". Suggested: "The rail lists players from its own roster query. Each row's top-read line comes from Team's CT0 loader under CT0a's drawn-only rule, so CT0 lands first." Why: as written, the rail would record roster exposures for rows it never draws.
- The shared read sheet text and the 1180 breakpoint are the same items as in the Team report.

## 5. Calls only Nick can make

- The top-read card when both Read and Lenses are on (as in the Read report).
- The plan sheet's "Discard changes?" footer row. It is new behaviour, so Nick may prefer a plain close.

## 6. START_HERE and BUILD_BRIEF check

- L0 is row 2. L1 to L6 is row 9, after Team (7) and Read (8), so CT0 and Team's sheet land first.
- Every 05 ID has a PR. The new ones: `S-FILE.off` and `S-FILE.read.gone` go to PR 1, and `S-FILE.plan.discard` goes to PR 4.
- No screen lacks a PR.
