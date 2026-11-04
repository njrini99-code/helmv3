# Lane report: coachhelm-team (Completeness pass, 4 Nov 2026)

Files changed: `pkg/design-refresh/coachhelm-team/05-SCREENS.md`, `06-SCREEN-SPECS.md`, `07-MOTION.md`, `08-ACCEPTANCE.md`. Each has the H1 pointer and a `## Completeness pass, 4 Nov 2026` section at the end (05 adds 34 rows, 06 adds 39, 07 adds 11, 08 adds 27).

## 1. Matrix

| Item ID | Kind | States covered before | Gaps found | What I added (file, ids) |
|---|---|---|---|---|
| S-TEAM | screen | default, loading, empty, failed, long, lots, one, stale, XXL, dark, RM, 390, 430, 1280+ | no 821 to 1179 rule (build used `!useChPhone()`); no flag-off, player role, first run without players, deep link, notification, cold start, pull to refresh, scroll restore, removed player, two devices, 1 Aug, timezone, keyboard, share or print | 05 new IDs `S-TEAM.noplayers`, `S-TEAM.off`, `S-TEAM.player`, plus 15 state rows; 06 noplayers, 821 to 1179, focus ring; 07 M-TEAM-49 to 52; 08 CP-TEAM-1 to 17 |
| S-TEAM.hole | inline | full | "At most 5 coins" contradicted 02 §5.2, 04 N, AC-HOLE-05 (three slots) | fixed in place (2 rows); 06 hole at mid widths; CP-TEAM-5 |
| S-TEAM.read-sheet (+ assigning, assigned, gathering, no-tour) | sheet | default, assigning, assigned, gathering, no-tour | page's "Proposing" label and inline "Didn't send" line differed from `useFocusActions`; page sheet motion (105%, 280 close) differed from `ui/Modal` and Lenses; ladder bars grew 520ms against the at-rest rule; Team row rule differed from Read's nopool; no stale, part failed, gone, double submit, links rules; gathering had no 07 row | 14 rows fixed in place across 05 to 08; new IDs `.gone`, `.stale`, `.partfail`; shared read sheet contract in 06; M-TEAM-45, 47; CP-TEAM-8, 13, 14, 18 to 24, 26 |
| S-TEAM.player-sheet, .no-rounds | sheet | default, no-rounds | no 07 row for no-rounds; "Open Eli's page" target and removed player not stated | 05 rows; M-TEAM-46; CP-TEAM-12 |
| S-TEAM.roster, .record, .empty-steps | cards | full in 05 | no 07 rows | M-TEAM-42, 43, 44 |
| S-TEAM.inspector | desktop sheet | 1280+ | no 821 to 1179 behaviour | 06 row; M-TEAM-48; CP-TEAM-6 |
| S-TEAM.toast | page only | not built | build rule unstated | 05 row; CP-TEAM-27 |
| others (today, spot, course, course.all, course-sheet, story, story.desk, huddle, working) | | full | none beyond the board-wide rows | covered by S-TEAM rows |

## 2. Gaps filled

111 rows added, 21 rows fixed in place (log below).

Fix log (all `(fixed 4 Nov: ...)` in the file):
- 05: two rows on the hole coins (5 became three slots with "+N"), three on the "Proposing" label, two on the inline failure line (now today's toast with the sheet open).
- 06: the sheet chrome note (phone is `ui/Modal` unchanged); the assigning button is 44 with the FocusActions label; redline 3.
- 07: M-TEAM-18 to 22 changed to Modal's travel, scrim, close, drag and the at-rest bars. M-TEAM-26 and the haptics note use the FocusActions label and feedback. Interrupt cases 6 and 9 were updated.
- 08: AC-READ-04's Team row now follows Read's nopool rule. AC-READ-10 uses the FocusActions label.

## 3. Handoffs

| From | To | Trigger | Context carried | Back behaviour | Other flag off |
|---|---|---|---|---|---|
| Team read sheet | Read page | "Open the full read" | player, insight | to Team, sheet closed, scroll and station kept | read flag off: `coachReadHref` (today's Deep dive) |
| Read page | Team | Back | none | Read's back label stays the player's first name (settled) | n/a |
| Team player sheet | Lenses file | "Open {first}'s page" | `playerFileHref(id, undefined, on)` | to Team, sheet closed | Lenses off: today's player page |
| Team | Lenses | shared read sheet | one component, Team lands first, Lenses imports it | n/a | n/a |
| CT0 loader | Lenses rail | top-read second line | CT0a drawn-only rule | n/a | the rail shows the class year until then |
| Team read sheet | Ask, Practice | links | none | n/a | absent until those hrefs and flags exist |
| Notification | Team | insight notifier | none | lands at the hole | Team off: today's board |
| Deep link `?player=`, `?open=read` | sheets | URL | id | param dropped by replace, so Back closes the sheet | gone or removed: plain board or gone card |

Contradictions:
- Inside Team: the coins rule and the page's sheet motion (both fixed).
- Team vs Lenses on the shared sheet: surface, close size, links, Team-row rule and motion (fixed to one contract).
- Team vs Read on the Team row (fixed).
- Haptics:
  - Team 07 says the app has no haptic bridge at 75b4956.
  - Read and Lenses cite a success or error haptic from FocusActions.
  - Resolved as "whatever `useFocusActions` does today; this lane adds none". Confirm in code at build.
- On success, Team keeps the sheet open on the Assigned row while Lenses closes it (M-LNS-15). Logged as a host choice; the sheet's states are the same.

## 4. Needs a shared-file change

- START_HERE §4 cross-lane list, after "share one read sheet": "Team lands first, so Lenses imports it. The contract is in coachhelm-team/06 and coachhelm-lenses/06, under Completeness pass, and the text is identical in both. Phone is today's `ui/Modal` unchanged. On desktop the container belongs to the host: Team uses its 420 inspector, Lenses its 480 dialog." Why: the second lane needs one place to look.
- BUILD_BRIEF line 271 says the shared sheet uses Read's `ReadSummaryCard`. The lane contract draws its own head (coin, name, chips, title), as the Team page does. Suggested text: "Team's read sheet and Lenses' EvidenceSheet become one sheet (contract in coachhelm-team/06 Completeness pass). Read's `ReadSummaryCard` stays the board card." Why: by precedence the lane files win, so BUILD_BRIEF now reads wrong.
- Shared values: "Desktop layouts start at 1180. From 821 to 1179 each lane draws one column in the desktop shell." Why: the three lanes used three different rules.
- XXL value: Team files use 1.35, Lenses 1.36, and some places 1.353. SHARED-5 should name one. Why: Nick's rule says 1.36.
- `--ch-ease-spring-smooth`: say clip checks compare against `tokens.css`, not the pages' `linear()` strings. Why: the strings overshoot 1.017.

## 5. Calls only Nick can make

None blocking. Optional: the shared sheet surface is grouped ground with section cards, as the Team page and Read draw it; the Lenses page drew wells on a card.

## 6. START_HERE and BUILD_BRIEF check

- Order: CT0a to CT7 is row 7, before Read (8) and Lenses (9). That puts CT0 before the Lenses rail and Team's sheet before Lenses imports it.
- CT3 ships before CR1, so Team's "Open the full read" uses `coachReadHref` until Read's `readHref` exists. Then it passes the flag.
- Every 05 ID maps to a PR. The new ones: noplayers, off and player go to CT1; the gone, stale and partfail sheet states go to CT3.
- S-TEAM.toast has no build: it is page only.
