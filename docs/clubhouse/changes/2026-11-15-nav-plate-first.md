# Shared — Changelog

## 2026-11-15 — The sidebar's current row is lit from the first frame (CH-1613)

```text
Design package: MOTION-AND-VISUAL.md 3.3 (owner, 15 Nov 2026); found on the ivory thread's PR #2542 and on main
PR/commit: draft follow-up to #2537, branch claude/project-thread-10vtd2-motion-2 (queue row pa-mot-07)
Contract IDs: CH-1613
Actions: none
Data impact: none
Held items: none
```

### Changed

- On a desktop page load the gliding nav plate takes over from the current row's own plate in one frame with no transition (`data-ch-plate-first` on the nav, `shell/NavPlate.tsx`, `styles/shell.css`). Before, the row's plate faded out over the quick beat while the gliding plate faded in from 0 over it, so both stood half there and the current row read dim. The transitions come back a frame later, so a change of row still glides and its ink still follows at the base pace.

### Why

- The current page is the one row that must read lit at a glance; a page load is not a change and has nothing to animate (3.3).

### Verification

- vitest: `shell/__tests__/nav-plate-first.test.tsx` (jsdom): the swap holds the transitions for two frames and then lets them back; unmounting leaves nothing behind; the CSS holds the plate, the rows and their icons. A W-tier look at a desktop page load (1440, light and dark) is still owed.
