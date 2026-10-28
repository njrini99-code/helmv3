# 2026-10-27 — Polish pass: Roster invite link

## 2026-10-27 — The invite link reads in order and opens on the team code

```text
Design package: none (production polish pass;
                doctrine in .claude/rules/clubhouse.md)
PR/commit:      agent/clubhouse-polish
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The invite sheet's link field used `direction: rtl` to show the end of a long
  link. Bidi reordering moved the host after the path ("…in/FINLEY-26/127.0.0.1:3100");
  production links would have scrambled the same way. The field is left to right
  again, and it opens scrolled to its end so the code shows (`styles/roster.css`,
  `screens/roster/Roster.tsx`, a layout effect keyed on the sheet opening). A
  callback ref could not do it: it ran before Modal called `showModal()`, while
  the dialog was still hidden and the field had no scroll width.
- The sheet now reads `window.location` and `navigator.share` in an effect, as
  Settings' invite already does. This is tidiness, not a hydration fix: the sheet
  starts closed and Modal draws its content only while open, so the server never
  rendered it.

### Why

- A coach copies or reads this link aloud; it must read in order.

### Verification

- Roster tests. WebKit at 390, opened by tapping Invite players: the field ends on
  the team code.
