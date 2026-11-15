# 2026-11-11 — qualifiers

## 2026-11-11 — My qualifiers is retired; players have one Qualifiers page

```text
Design package: none (owner decision, 11 Nov 2026; same cards, no new look)
PR/commit:      agent/clubhouse-release-train, e8eb79b972
Contract IDs:   90105 and 90106 reworded; 90406 (CH-09306) and 90632 (CH-09222) tombstoned
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- In Clubhouse `/golf/dashboard/my-qualifiers` redirects to
  `/golf/dashboard/qualifiers` for a coach and a player (it was a player's own
  list rendered in place). The address is on the frame's aliased list for both
  roles and no longer a rebuilt route. Fairway keeps its My Qualifiers page.
- The list has no "mine" mode: no "My qualifiers" title or lede, no "You
  aren't entered in any qualifiers" empty state (CH-09306) and no "Your
  qualifiers didn't load" notice (CH-09222). On the one list a failed entries
  read is CH-09202, as before.
- The one list already put a player's entered qualifiers first (D-30); nothing
  about the cards changed.
- The `my-qualifiers` preview opens `qualifiers-player`
  (`src/clubhouse/preview/retired.ts`).

### Why

- The owner: players get one Qualifiers page with the qualifiers they are
  entered in listed first.

### Verification

- `npm run test:file` on qualifiers, qualifiers-premium, qualifiers-hydration,
  alias-frame, shell, route-label and large-title-skeletons tests: exit 0.
- Dev server: `/clubhouse-preview/my-qualifiers` answers 307 to
  `/clubhouse-preview/qualifiers-player`, which lists the entered qualifiers
  first and "You aren't entered" last.
- Not checked: the live `/golf/dashboard/my-qualifiers` redirect in a signed-in
  browser (a test reads the page and the alias list instead). No screenshots:
  the surviving page did not change.
