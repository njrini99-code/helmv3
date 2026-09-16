<!-- markdownlint-disable MD013 -->
# Qualifiers — `/golf/dashboard/qualifiers` (coach) · PHONE

Files: `src/components/fairway/pages/qualifiers/FairwayQualifiers.tsx` only. The desktop composition (`qualifiers.md`) is already in place: Elevated live hero, bare Toolbar, one Surface with Active/Concluded seam sections.

## What the phone capture shows (this branch, coach, 393×852)

Header, block "Create qualifier", the Elevated live hero (Live pill · name · date · "View leaderboard →"), then the bare Toolbar: search on one line and the three status pills on a second line — pushed to the RIGHT, because they sit in the trailing `viewToggle` cluster (`ml-auto`), so they read as orphaned from the search above them. The placeholder "Search qualifiers by name, course, or detail" clips at 393px. Below, the seam list: name · date · StatusPill · → (the "Feb 2, 60824" dates are the QA rows' stored data, REVIEW.md).

## SCREEN (phone)

- Archetype: B/E, phone reading. Dominant: the live hero. Supporting: the seam list. Tertiary: search + status pills.
- Floating: the dock only; the Toolbar is not sticky here (a short list under a hero; nothing to pin).
- Modal: none (detail is a route).
- EXISTING FAIRWAY: ViewHeader, Elevated, StatusPill, Toolbar (search · filters), SearchField, FilterPill, Surface, EmptyState.
- NEW FAIRWAY NEEDED: none.

## CONTAINERS TO CHANGE (phone + desktop, same JSX)

1. Status pills move from the Toolbar's `viewToggle` slot to its `filters` slot: left-aligned under the search on phone (the scrolling filters line), beside the search on desktop. FilterPills are the filters slot's own content type; the Segmented-shaped `viewToggle` slot was the wrong host.
2. Placeholder → "Search qualifiers" (aria-label unchanged).

## MOBILE

- 44 px: FilterPills clear it under a coarse pointer via the recipe; rows are `min-h-11` links.
- Haptics: none added (FilterPill keeps its own).
- Context preservation: search/status state lives in the component; no sheet on this screen.
- Reduced motion / hydration: nothing new; `formatDate` parses local-midnight (documented in the file).

## RISKS

- `FairwayQualifiers.list.test.tsx` pins the list/hero behaviour, not the toolbar slots.
