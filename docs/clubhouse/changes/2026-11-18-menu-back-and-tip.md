# Shared menu and tooltip — Changelog

## 2026-11-18 — Back closes an open menu; no tooltip for focus a menu hands back

```text
Design package: none
PR/commit: agent/clubhouse-motion-fixes
Contract IDs: MENU-01 (unchanged), A-25 (extended to tooltips)
Actions: none
Data impact: none
Held items: none
```

### Changed

- `lib/back-closes.ts` (new) `useBackCloses(open, onBack)`: while an overlay is
  open it owns one same-address history entry, as quick chat's panel does
  (`use-panel-history.ts`). Back or the iOS edge swipe pops it and closes the
  overlay on the page; closed any other way, the entry comes off quietly. A link
  picked from the overlay replaces the entry (`replaces()`), so Back skips no
  duplicate page. An action picked waits for the entry's Back to land (or
  400 ms) before it runs (`release(run)`), so an action that navigates in code
  (Calendar's Practice hours) is never undone by that Back. Unmounted while
  open (the practice builder's Delete removes the row and its menu), the hook
  takes the entry it still owns back off.
- `ui/Menu.tsx`: uses it on the phone only (the desktop pushes nothing, and a
  pick runs at once); returns focus to its trigger with `chFocusQuietly`.
  `MenuItems` takes `replace`, `onFollow` and `run` (ContextMenu passes none
  and is unchanged).
- `class-awareness-messages.test.tsx` (CH-7770): the phone's Notify anyway
  pick is checked after the menu's entry comes off; the assertion is the same.
- `ui/Tooltip.tsx`: a tip never opens for quiet focus (`data-ch-peek-quiet`): a
  menu or dialog handing focus back to its trigger is not someone arriving on
  it.

### Why

- Clubhouse audit 2026-11-18 (P2), WebKit, coach phone: on Recruiting, Back with
  the sort menu open went to the previous page (Team Hub); on Calendar, Escape
  closed the More menu and left the "More" tooltip showing. Both reproduced
  against the pre-fix build (`:focus-visible` true on the returned focus).

### Verification

- `ui/__tests__/menu-back-and-tip.test.tsx` (6 cases); `src/clubhouse/ui`,
  `lib`, Calendar, Recruiting and CoachHelm team suites pass.
