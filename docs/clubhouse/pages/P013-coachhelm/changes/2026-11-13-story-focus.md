# 2026-11-13 — coachhelm

## 2026-11-13 — A This week story hands focus back to its tile on the phone

```text
Design package: none (audit 2026-11-13, F-0012; no visible change)
PR/commit:      agent/ch-look-a11y
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The phone story viewer (`team/Stories.tsx`) takes its opener from
  `chDialogOpener()` (`lib/dialog-lifetime.ts`), the rule every Clubhouse sheet
  now follows, in place of `document.activeElement`. Closing a story puts focus
  back on the tile that opened it. Only that line changes; the stations are
  untouched.

### Why

- Audit 2026-11-13 F-0012 (S2, AX-03): on the phone, closing any of the three
  This week stories left focus on the page, because Safari focuses no tile it is
  tapped on, so the opener read was the page itself.

### Verification

- `screens/coachhelm/team/__tests__/story-focus-return.test.tsx` (a tap that
  focuses nothing, Escape, focus on the tile); seen failing with the old line.
