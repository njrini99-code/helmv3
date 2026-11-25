# P003 Roster — Changelog

## 2026-11-21 — The desk opens on the table

```text
Design package: premium plan 2026-11-19, batch 4 (section 3.8)
PR/commit: agent/clubhouse-desk-keys
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- The coach's desk Roster opens on the table, with the player panel
  beside it (owner decision 8). A coach who chose the cards keeps them.
- The table is the shared `ui/DataTable`. Its header stays under the top
  bar on a desk 1193px and wider, and the headers sort.
- Up and Down, or J and K, walk the players. The panel follows the keys.
- Sort is a menu ("Sort: Avg") with a check on the order in force
  (CONS-31). The bar keeps one segmented control for status.
