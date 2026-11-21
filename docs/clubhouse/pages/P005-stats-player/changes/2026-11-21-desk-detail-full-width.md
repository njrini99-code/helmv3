# Changelog

## 2026-11-21 — Desktop detail opens across the page (look-09)

```text
Design package: Nick's decision card of 21 Nov ("Full width, back to overview")
PR/commit: claude/project-thread-jn6rm7
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- On a desk, a Stats card no longer changes a 420px pane beside the cards.
  The overview stands alone across the page; choosing a card opens its detail
  across the page in the overview's place, under "Overview" (Back) and the
  detail's title, with the window switch and filter. Back or Escape returns
  to the overview where it was left, focus on the card that opened it. No
  history entry or hash is written.
- The detail's cards stand two across on shared rows; the headline, the green
  feature card and any panel drawn wide keep the full width. On a desk wider
  than 1180px the page runs to the wide measure while a detail is open.
- With no card beside it, a detail draws its own head again (the figure, its
  change and, for Scoring, Score by round and What changed).
- Team scoring opens on The round as its one green feature card, first under
  the headline (phone too). Team putting, Personal bests and What changed take
  the green title bar; table column names wrap instead of running together.
