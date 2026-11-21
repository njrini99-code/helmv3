# P004-stats-team — Changelog

## 2026-11-20 — Detail tables on the page's rows (look-09)

```text
Design package: Nick's request of 20 Nov (Short game screenshot)
PR/commit: claude/project-thread-jn6rm7
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- Every figure table inside a pushed Stats detail (team details included)
  takes the new table drawing: quiet footnote header, 44pt rows on row
  hairlines, no stat changed. A table that passes `keyCol` draws that
  column as the feature green band, and toned cells draw as soft gain or loss
  chips. The short-game rows and the summary well are
  described in `../../P005-stats-player/changes/2026-11-20-short-game-cards.md`.
- Option F (21 Nov): every pushed detail card, team details included, opens on
  the deep green title bar; a `feature` panel (a detail's headline numbers) is
  the one fully green card. Plain rails and compare bars are near-black.
