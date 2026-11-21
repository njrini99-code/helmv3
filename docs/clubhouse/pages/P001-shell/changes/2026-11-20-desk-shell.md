# P001-shell — Changelog

## 2026-11-20 — Desktop shell and page head (premium plan, batch 2)

```text
Design package: premium plan 2026-11-19, batch 2
PR/commit: agent/clubhouse-desk-shell
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- G1, D16: the desk page title is the 30px large title in the primary
  ink, set flat. The letterpress edge, the green-900 ink and the
  double rule above the head are gone, and the head is 20px tall
  padding instead of 32px.
- G1: the canvas mist fills only the margin left of the content, at
  most 240px, so it ends before the page head. Its bottom-right glow
  is gone.
- D16: the shared hero's section line and sentence share one meta
  line beside each other, with the actions inline.
- D16: while the page's title is in view the top bar hides its last
  crumb. It fades in with a 4px rise as the title goes under the bar.
- S1: the top bar's contents start on the content's left edge and end
  on the wide measure's right edge.
- S4: a crumb that names a page links to it. A crumb trail that names
  an object (a player's stats) names the window too.
- The head's secondary keys take their hover fill from the key layer.
