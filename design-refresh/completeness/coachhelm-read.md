# Lane report: coachhelm-read (Completeness pass, 4 Nov 2026)

Files changed: `pkg/design-refresh/coachhelm-read/05-SCREENS.md`, `06-SCREEN-SPECS.md`, `07-MOTION.md`, `08-ACCEPTANCE.md`. Each has the H1 pointer and the section at the end (05 adds 31 rows, 06 adds 15, 07 adds 15, 08 adds 27).

## 1. Matrix

| Item ID | Kind | States covered before | Gaps found | What I added |
|---|---|---|---|---|
| S-DIVE.why | fix | player, coach | flag-off scope unstated; no 07 row | 05 rows; M-READ-27; CP-READ-8 |
| S-READ-BOARD (+ actions, dismissed, loading) | card | full | its radial light broke SHARED-2; hosts listed the Team inspector; no flag-off or XXL rule | fixed in place; 05 rows; CP-READ-26, 27 |
| S-READ | page | default, loading, error, gone, partfail, long, lots, stale, XXL, RM, 430 | none of: player opening another player's read, cold start Back, from Team or Lenses, refresh, scroll restore, two devices, deleted mid-session, 1 Aug, timezone, keyboard, offline, share or print, 821 to 1179 | new IDs `S-READ.notyours`, `S-READ.off`; 14 state rows; 06 rows; M-READ-37 to 41; CP-READ-6, 7, 9 to 11, 22 to 25 |
| .sure.answerfail | inline | 05, 08 | no 07 row | M-READ-28; CP-READ-19 |
| .moved, .moved.notrend | card | 05, 06, 08 | no 07 row (slope chart motion unset) | M-READ-29 (at rest); CP-READ-17 |
| .proposed, .declined, .noassign | inline | 05, 08 | no 07 row | M-READ-30; CP-READ-18 |
| .stale, .countdown, .gap | inline | 05, 08 | no 07 rows | M-READ-31, 32 |
| .cleared, .contradicted, .underreview | inline | gallery only; 08 had one line each | no 06 spec; no player-before-a-day row; no recheck-flag rule | 05 rows; 06 chip and notice specs with contrast; M-READ-31; CP-READ-1 to 3 |
| .partfail, .dismissed, .copied, .nopool, .long | inline | 05, 08 | no 06 box | 06 rows; CP-READ-12 to 16 |
| .failed, .gone | page | 05, 06 §12, 08 group line | no 07 rows; player wording not checked | M-READ-34, 35; CP-READ-4, 5 |
| .do, .more, S-READ-DESK bar | | full | Ask showed with no href guard on More and the desk bar (the chips had one); "Assigning…" and "Assigned" strings could drift from FocusActions | fixed in place (7 rows); CP-READ-20, 21 |
| S-READ-DESK (+ rail, more, jump) | desktop | full | 821 to 1179 unspecified in 08 | M-READ-40; CP-READ-11 |

## 2. Gaps filled

88 rows added, 11 fixed in place:
- 06 §2 and 08 board criterion 1: the radial light is gone; flat (SHARED-2).
- 05 S-READ.more, 06 §11 and 08 More criterion 3: Ask only once `askAboutReadHref` exists.
- 06 §13 and 08 S-READ-DESK criterion 4: the same condition.
- 06 §10: the Assigning and Assigned strings defer to FocusActions (2).
- 05 S-READ-BOARD: the hosts list.
- 07 interrupt case 8: "no haptic" now means no success haptic; today's error feedback stays.

## 3. Handoffs

| From | To | Trigger | Context | Back | Other flag off |
|---|---|---|---|---|---|
| Team or Lenses sheet | Read | "Open the full read" | player, insight | to the host, sheet closed, scroll kept (M-READ-38) | Team falls back to `coachReadHref`; Lenses leaves the row out |
| Read | Ask | "Ask CoachHelm about this" | read id | Ask's own | absent until `askAboutReadHref` exists and Ask's flag is on |
| Read | Practice | "Add to practice plan" | read id | Practice's own | absent until `practicePlanHref` and `golf_practice_plans` (and `coachhelm_practice_plans_v1`) |
| Read | Messages | "Message {first}" | player only, no prefill | compose's own | n/a |
| Read | round review | hole chip, round row | round | same card and scroll | n/a |
| Cold link | Read | copied link, deep link | insight | the label's place: the player's file (Lenses on) or player page, or CoachHelm for a player | read flag off: today's Deep dive |
| Notification | board | insight notifier | none | n/a | unchanged |
| Not-allowed or gone link | gone card | URL | none | to CoachHelm or the player | no data loads |

Contradictions:
- The radial light (fixed).
- The Ask guard (fixed).
- The S-READ-BOARD hosts against BUILD_BRIEF 271 (see 4).
- Haptics against Team (resolved as today's FocusActions behaviour).

## 4. Needs a shared-file change

- DESIGN_LANGUAGE lines 84 and 169 allow "one soft radial light" on the feature card. Replace with: "The feature card is a flat `--ch-feature-bg` fill. No radial light or gradient (SHARED-2)." Why: three lanes and SHARED-2 already say flat.
- DESIGN_LANGUAGE §8 "chart grow 360": add "Inside the shared read sheet, chart marks are drawn at rest (app owner, 24 Oct). The Read page keeps its first-view reveals M-READ-04 to 07." Why: the two rules conflict as written.
- BUILD_BRIEF line 271, the `ReadSummaryCard` in the shared sheet: see the Team report. With `coachhelm_player_file_v1` on, the Lenses feature card is the top read on the file and the player board (see 5).

## 5. Calls only Nick can make

- When both Read and Lenses flags are on, which top-read card shows on the player file and the player board: Lenses' feature card or Read's `ReadSummaryCard`. My pick: Lenses' feature card, with ReadSummaryCard kept for hosts that have no card of their own. CP-READ-27 is written to that pick.
- Observed, not reopened: the settled back label is the player's first name, but Back from a read opened in Team returns to Team.

## 6. START_HERE and BUILD_BRIEF check

- CR0 is first (row 1); CR1 to CR6 are row 8, after Team.
- Team's CT3 needs `readHref` before CR1, so either CR1 exports `readHref` early or Team uses `coachReadHref` until it does. Suggest saying so in BUILD_BRIEF §CR.
- Every 05 ID has a PR. `S-READ.copied` is CR2 and uses today's toast, with nothing new built. The new IDs `notyours` and `off` go to CR1.
