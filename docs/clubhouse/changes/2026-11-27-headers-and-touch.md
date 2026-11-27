# Clubhouse (cross-page) — Changelog

## 2026-11-27 — One header system, and every control answers a press (dsx-08)

```text
Design package: design lab foundation (GAP-H1, GAP-P4), Nick 27 Nov
PR/commit: claude/project-thread-7b225i
Contract IDs: none
Actions: none changed
Data impact: none
Held items: none
```

### Added

- `ui/Header.tsx`: `PageHeader`, `SectionHeader` and `EntityHeader`, one anatomy (lead mark, eyebrow, title, one
  meta line, a detail row, the toolbar, key figures, a row below) drawn by one sheet, `styles/header.css`, at zero
  specificity so a page's sheet places a head and never re-draws it. `ui/HeaderToolbar.tsx` is the contextual toolbar:
  a WAI-ARIA toolbar with arrow keys, a More menu for the rest, and a selection mode that swaps in the selection's own
  actions with a live count and Escape to clear.
- The shared pressed look: a control whose sheet draws no pressed rule now takes one from the press controller, the
  linen wash on an ivory surface and a lean toward its own ink on any other plate (a green card); an SVG mark dims. A
  selected segment, day or option still does not answer, by design. On the live phone routes this took the controls
  that answered a press with no visible change from 153 to 41, every one left either selected or drawing its look on a
  pseudo-element the probe cannot read (tier C, fixture data, internal).

### Changed

- `ui/Section` renders through `SectionHeader`, keeping its `.ch-sec__*` hooks.
- The Settings, Tournaments and Recruiting desk heads are `PageHeader`s (same look, same hooks).
- The press cancels the moment a tap turns into something else: a move past 10px, a scroll anywhere under the
  finger (WebKit does not always send `pointercancel` for a nested scroller), a long press's menu, a drag, or leaving
  the page. Tabs, options, menu items, switches, checkboxes, radios, `summary` and labels press as buttons do.
- Hover rules in the free page sheets sit behind `(hover: hover)`; a reveal that only hover showed (a practice
  insert, the compare divider's grip) shows on touch.

### Why

- Nick's design lab brief: one page, section and entity header with a contextual toolbar, and touch feedback
  everywhere, with no hover-only affordance on a phone.

### Verification

- `lib/__tests__/press-cancel.test.tsx`, `lib/__tests__/press-fallback.test.ts`, `ui/__tests__/Header.test.tsx`,
  `__tests__/hover-only-affordance.test.ts`; the live-route phone probe (Chromium at 402×874 with touch, fixture data).
