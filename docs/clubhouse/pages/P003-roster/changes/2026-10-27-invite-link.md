# 2026-10-27 — Polish pass: Roster invite link

## 2026-10-27 — The invite link reads in order, and the sheet hydrates cleanly

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
  `screens/roster/Roster.tsx` scrollToEnd).
- The sheet read `window.location` and `navigator.share` while rendering, so a
  sheet open on first paint (`?invite=1`) did not match the server's HTML.
  Both are read after mount, as Settings' invite already does.

### Why

- A coach copies or reads this link aloud; it must read in order.

### Verification

- Roster tests (104 pass). WebKit at 390: the field reads "0.0.1:3100/golf/join/FINLEY-26".
