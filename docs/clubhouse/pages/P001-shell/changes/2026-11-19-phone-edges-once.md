# P001 Shell — Changelog

## 2026-11-19 — The phone edges are written once, not on every page change

```text
Design package: none
PR/commit: agent/clubhouse-verify-switch
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `shell/ClubhouseFrame.tsx` `usePhoneEdges` and the new `lib/phone-edges.ts`:
  - The phone's edge colours are no longer put back and written again on every
    page change. These are the page colour on `<html>` and `<body>`,
    theme-color and `data-status-bar`.
  - They are written when they change (a route on another canvas colour, a
    theme change), and put back once, when the frame goes or the screen leaves
    the phone width.
  - The canvas colour is read a frame after the page shows, not inside the
    switch's commit.

### Why

- F-23 (audit 2026-11-19, verify after merge):
  - Each section switch rewrote `<html>`'s inline style, `<body>`'s background
    and `data-status-bar` three times inside the commit that swaps the page.
  - It also forced the new page's style with a `getComputedStyle` between the
    writes.
  - Each write restyles the whole document.

### Verification

- W phone, production build: attribute writes on `<html>` and `<body>` inside a
  switch's commit went from 9 to 0.
- The edges still read the page colour, the frame's green and light glyphs
  after every switch.
- `lib/__tests__/phone-edges.test.ts`.
- No visible change, so no screenshots.
