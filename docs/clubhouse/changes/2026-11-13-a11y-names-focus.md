# 2026-11-13 — accessible names and sheet focus

## 2026-11-13 — Ledger rows and week strip days are named by their faces; a tapped sheet hands focus back

```text
Design package: none (audit 2026-11-13, F-0011, F-0012; no visible change)
PR/commit:      agent/ch-look-a11y
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- `ui/Ledger.tsx`: a row's lead, title, line and trail are kept apart by a space that is
  not drawn (the row and its text are flex boxes), so a row named by its words reads
  "Sat 26 Sept Dylan Brooks", not "Sat 26 SeptDylan Brooks". The `label` prop's note
  says a row that opens something is named by its own words.
- `ui/WeekStrip.tsx`: `weekDayName` opens each day's name with its face, the top line
  and the number ("S 8, Sun 8, 0 events"); a label that already opens with the face
  ("Wed 15: 1 event") is kept. The space between the top line and the number is not
  drawn (a flex column).
- `lib/dialog-lifetime.ts` (F-0012): `chDialogOpener()` names a sheet's opener: the
  control pressed in the last second; else the focused control; else a control pressed
  in the last five seconds. One capture listener for pointerdown and click tracks the
  presses. Safari and the iOS app focus no button they click, so a tapped sheet found
  the page focused, or the opener of the sheet before it. Both close paths hand focus
  back to it. Every Modal, FormSheet, Peek, Ask and History sheet goes through this
  hook, and the CoachHelm story viewer now reads the same function.
- Test helper `src/clubhouse/__tests__/label-in-name.ts` mirrors axe's reading of a
  control's face and its string comparison.

### Why

- Audit 2026-11-13 F-0011 (S2, axe `label-content-name-mismatch`, WCAG 2.5.3 Label in
  Name): the name a screen reader and Voice Control use did not hold the words on the
  control, so a voice-control user who said what they saw could not reach it.
- F-0012 (S2, AX-03): on the phone, closing Home's term sheet and player peek,
  CoachHelm's This week cards, the Stats Filter, Calendar's More and the Settings
  account sheet left focus on the page; desktop returned it only because Chromium
  focuses a clicked button.

### Verification

- `ui/__tests__/Ledger-name.test.tsx`, `ui/__tests__/WeekStrip.test.tsx`,
  `ui/__tests__/modal-focus-return.test.tsx` (phone and desktop: a tap that focuses
  nothing still gets focus back; a second sheet in a row goes back to its own opener;
  a press a minute old is not taken for the opener).
- Not checked in Safari in this change (the lead verifies on a preview).
