<!-- markdownlint-disable MD013 -->
# Qualifiers — `/golf/dashboard/qualifiers` (coach)

Files: `src/components/fairway/pages/qualifiers/FairwayQualifiers.tsx` (524), `FairwayQualifierDetail.tsx`, `FairwayQualifierLeaderboard.tsx`, `FairwayQualifyingWorkspace.tsx`.

## What the capture shows

Header (eyebrow, h1 "Lineup decisions.", subtitle, counts), a primary pill, a status pill row, search, then one big "Live" card and card galleries under ACTIVE and CONCLUDED headings — each card: title, description, dates, spots, course, "View details →". Every qualifier has the same weight; the live one is only larger.

## SCREEN

- Archetype: B/E (a board of events in time).
- Dominant object: the live qualifier as the ONE raised object (Elevated) with its leaderboard peek (top 3 + spots).
- Supporting: the active and concluded lists as seam rows in one Surface.
- Tertiary: search, status filter.
- Modal: none here (detail is a route).

## EXISTING FAIRWAY

ViewHeader, Elevated (live), RankCell (leaderboard peek), Toolbar (search + status Segmented + primary "Create qualifier"), Surface, StatusPill, Chip, EmptyState.

## CONTAINERS TO REMOVE

1. Status pills + search as loose controls → Toolbar.
2. Active/Concluded card galleries → one Surface with two seam sections; rows: name · date range (tabular) · spots · course · StatusPill · →.
3. Live card → Elevated with leaderboard peek (top 3 via RankCell, "5 spots", "View leaderboard" as the only link).

## COMPOSITION (desktop)

```text
ViewHeader  QUALIFIERS / Lineup decisions. / 3 active · 2 concluded    [Create qualifier]
Elevated    ● Live  QA — Round Type Verification · Aug 31
            1 Cole Bennett 73  · 2 Tyler Hayes 70 · 3 Dylan Brooks 78   5 spots  [Leaderboard →]
Toolbar     [🔍 name, course, detail]   [All 5 · Active 3 · Concluded 2]
Surface
  ── Active ──
  MOMENTIC HELL 20260824-V2   Feb 2 – Feb 2   —   Upcoming   →
  ── Concluded ──
  Pre-Season Qualifier        Aug 7, 2026     5 spots · Home Course   Completed →
```

Phone: identical order; the Elevated live block shows top 3 stacked; rows compress.

## RISKS

- Leaderboard peek needs data the list already has or a light fetch; if not available without a new query, show spots + dates only (no new data logic).
