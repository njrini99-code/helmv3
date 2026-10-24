# P016 — Tournaments: page contract

Every behaviour Tournaments promises, by the 25 V2 categories (D-69). A contract's number is its Bridge ID (D-68:
namespace 16, category, item); `Code` is the catalog code on the element and in the test
(`docs/clubhouse/catalog/tournaments.md`). The shell's contracts (P001) apply here too and are named where they carry
a category. `clubhouse:check` holds this file to the registry.

Status: the base only (types, fixtures, primitives, placeholders, preview screens). Several lanes build the views in
parallel; each fills the categories its view touches, from its own serial range in the catalog.

## 01 — Default / core UI

Status: N/A — not defined yet: no view is built (each renders the base's placeholder) and nothing is wired. The lane that builds the view defines this category with its catalog rows (screens/tournaments/README.md).

## 02 — Initial loading / skeleton

Status: DEFINED

Every view takes `load`; `loading` draws the view's head and body as placeholders in place, marked busy (CH-16401). A built view replaces the placeholder with its own skeleton at its final geometry and keeps the code. The route skeletons arrive with the routes (Phase 7).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 160201 | CH-16401 | `A_TOURNAMENTS_VIEW_IS_ON_ITS_WAY` | A Tournaments view is on its way (`load: 'loading'`) |

From the shell (P001): 10201 CH-1401, 10202 CH-1402.

## 03 — Background loading / refresh

Status: N/A — not defined yet: no view is built (each renders the base's placeholder) and nothing is wired. The lane that builds the view defines this category with its catalog rows (screens/tournaments/README.md).

## 04 — Empty

Status: DEFINED

Until a lane builds its view, the view says so honestly (CH-16301, preview only). Each view's real empty states (no events this season, no field entered, no rounds to link, and so on) are its lane's rows.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 160401 | CH-16301 | `A_VIEW_ITS_LANE_HASNT_BUILT_YET` | A view its lane hasn't built yet (preview only: no route serves Tournaments yet) |
| 160402 | CH-16310 | `HOME_NO_EVENT_IN_THE_SEASON_NOTHING` | Home: no event in the season, nothing failed |
| 160403 | CH-16311 | `THE_SEASON_LEDGER_THE_SEASON_HAS_NO` | The season ledger (Home, History): the season has no finished event yet |
| 160404 | CH-16312 | `HOME_NO_EVENT_IS_UPCOMING_OR_LIVE` | Home: no event is upcoming or live |

## 05 — Validation

Status: N/A — not defined yet: no view is built (each renders the base's placeholder) and nothing is wired. The lane that builds the view defines this category with its catalog rows (screens/tournaments/README.md).

## 06 — Server / system error

Status: DEFINED

A view whose one read failed draws its head and "Tournaments didn’t load" with Try again (CH-16201); sections that fail on their own are each view's `errors` flags and its lane's rows.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 160601 | CH-16201 | `A_TOURNAMENTS_VIEWS_ONE_READ_FAILS` | A Tournaments view's one read fails (any view; `load: 'failed'`) |
| 160602 | CH-16210 | `HOME_THE_EVENTS_READ_FAILS_WHILE_THE` | Home: the events read fails while the page itself loads (`errors.events`) |

## 07 — Network / offline

Status: DEFINED

No Tournaments route is served yet, so the shell's offline contracts are the whole of it today; the live round's outbox (5L.8.5) adds its own.

From the shell (P001): 10701 CH-1901, 10702 CH-1902, 10703 CH-1903,
10704 CH-1905, 10705 CH-1909, 10706 CH-1910.

## 08 — Permission / authorization

Status: DEFINED

Coach-only views (new, edit, lineup, compare, history, links, review) and the player's own view are decided by the route (plan 14.2, Phase 7); until then the shell's gate is the only one, and Tournaments is reachable in the preview only.

From the shell (P001): 10801 CLUBHOUSE_GATE, 10802 ROLE_SCOPED_NAV,
10803 TEAM_SWITCH_IS_A_HEAD_COACHS, 10804 CH-1911.

## 09 — Success

Status: N/A — not defined yet: no view is built (each renders the base's placeholder) and nothing is wired. The lane that builds the view defines this category with its catalog rows (screens/tournaments/README.md).

## 10 — Warning

Status: N/A — not defined yet: no view is built (each renders the base's placeholder) and nothing is wired. The lane that builds the view defines this category with its catalog rows (screens/tournaments/README.md).

## 11 — Destructive

Status: N/A — not defined yet: no view is built (each renders the base's placeholder) and nothing is wired. The lane that builds the view defines this category with its catalog rows (screens/tournaments/README.md).

## 12 — State preservation

Status: N/A — not defined yet: no view is built (each renders the base's placeholder) and nothing is wired. The lane that builds the view defines this category with its catalog rows (screens/tournaments/README.md).

## 13 — Optimistic UI

Status: N/A — not defined yet: no view is built (each renders the base's placeholder) and nothing is wired. The lane that builds the view defines this category with its catalog rows (screens/tournaments/README.md).

## 14 — Retry / recovery

Status: N/A — not defined yet: no view is built (each renders the base's placeholder) and nothing is wired. The lane that builds the view defines this category with its catalog rows (screens/tournaments/README.md).

## 15 — Data freshness / sync

Status: N/A — not defined yet: no view is built (each renders the base's placeholder) and nothing is wired. The lane that builds the view defines this category with its catalog rows (screens/tournaments/README.md).

## 16 — Micro animation

Status: DEFINED

A value that changes after first paint takes its new value in place and gets the 520 ms changed-wash (CH-16601, D-100); nothing rolls and nothing draws in on first paint.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 161601 | CH-16601 | `A_VALUE_CHANGES_AFTER_FIRST_PAINT` | A value changes after first paint (a live score, a team total, a place) |

From the shell (P001): 11601 CH-1601, 11602 CH-1602, 11603 CH-1603,
11604 CH-1604, 11605 CH-1605, 11606 CH-1606, 11607 CH-1607, 11608 CH-1608,
11609 CH-1609, 11610 CH-1610, 11611 CH-1611, 11612 CH-1612, 11613 CH-1613,
11614 CH-1614, 11615 CH-1615, 11616 CH-1616, 11617 CH-1617, 11618 CH-1618,
11619 CH-1619, 11620 CH-1620, 11621 CH-1621, 11622 CH-1622.

## 17 — Haptic

Status: N/A — not defined yet: no view is built (each renders the base's placeholder) and nothing is wired. The lane that builds the view defines this category with its catalog rows (screens/tournaments/README.md).

## 18 — Accessibility

Status: DEFINED

DeltaChip and TrustChip speak their meaning in words and never rest on hue alone (CH-16801).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 161801 | CH-16801 | `A_SIGNED_DIFFERENCE_OR_A_TRUST_STATE` | A signed difference or a trust state is read |

From the shell (P001): 11801 CH-1801, 11802 CH-1802, 11803 CH-1803,
11804 CH-1804, 11805 CH-1805, 11806 CH-1806, 11807 CH-1807, 11808 CH-1808,
11809 CH-1809, 11810 CH-1810, 11811 CH-1811, 11812 CH-1812, 11813 CH-1813,
11814 CH-1814, 11815 CH-1815, 11816 CH-1820, 11817 CH-1821, 11818 CH-1822,
11819 CH-1830, 11820 CH-1831, 11821 CH-1832, 11822 CH-1840, 11823 CH-1841,
11824 CH-1842, 11825 CH-1816, 11826 CH-1817.

## 19 — Responsive layout

Status: N/A — not defined yet: no view is built (each renders the base's placeholder) and nothing is wired. The lane that builds the view defines this category with its catalog rows (screens/tournaments/README.md).

## 20 — Keyboard / input

Status: N/A — not defined yet: no view is built (each renders the base's placeholder) and nothing is wired. The lane that builds the view defines this category with its catalog rows (screens/tournaments/README.md).

## 21 — Performance

Status: N/A — not defined yet: no view is built (each renders the base's placeholder) and nothing is wired. The lane that builds the view defines this category with its catalog rows (screens/tournaments/README.md).

## 22 — Analytics

Status: N/A — not defined yet: no view is built (each renders the base's placeholder) and nothing is wired. The lane that builds the view defines this category with its catalog rows (screens/tournaments/README.md).

## 23 — Logging / observability

Status: N/A — not defined yet: no view is built (each renders the base's placeholder) and nothing is wired. The lane that builds the view defines this category with its catalog rows (screens/tournaments/README.md).

## 24 — CI / automated test

Status: N/A — not defined yet: no view is built (each renders the base's placeholder) and nothing is wired. The lane that builds the view defines this category with its catalog rows (screens/tournaments/README.md).

## 25 — Helm Bridge action

Status: N/A — not defined yet: no view is built (each renders the base's placeholder) and nothing is wired. The lane that builds the view defines this category with its catalog rows (screens/tournaments/README.md).
