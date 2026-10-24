# Tournaments catalog (16xxx)

Page P016 (`config/clubhouse/pages/P016-tournaments.json`; plan: the handoff's
section 4.33). Routes, once wired (Phase 7, behind `golf_tournaments_v1`):
`/golf/dashboard/tournaments` and its children in plan 14.1. Until then every
view renders in the preview only (`/clubhouse-preview/tournament*`).

Numbers are `CH-16` + the kind digit + a two-digit serial. Several lanes build
this page in parallel, so each owns a serial range in every kind and never
writes a number outside it (`src/clubhouse/screens/tournaments/README.md` has
the file ownership):

| Serials | Owner |
| --- | --- |
| 01–09 | base (page-level states, the placeholders, shared pieces) |
| 10–19 | home |
| 20–34 | desk (desk, who counted, holes, evidence drawer) |
| 35–44 | review (review, history, link inbox) |
| 45–59 | compare |
| 60–69 | lineup (event form, lineup builder) |
| 70–89 | live |
| 90–99 | player |

The plan's provisional codes (CH-16009 NoTeam, CH-16010 NotFound, CH-16011
CoachOnly, CH-16400 to 16418, 16420 to 16424, 16460 to 16463 and 16520 to
16532) were never used; each lane re-slots the ones it builds into its own range
with the right kind digit (plan 0.4, item 7). A row is added with the code that
uses it and the test that names it; then `node scripts/clubhouse/registry.mjs
sync` mints its Bridge ID.

## 160xx Error toasts

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |

## 161xx Validation

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |

## 162xx Didn't load

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-16201 | A Tournaments view's one read fails (any view; `load: 'failed'`) | The view's head, then "Tournaments didn’t load" + "Nothing is lost. Your events and scores are still saved; try again in a moment." + Try again (which re-runs the server render; offline it says so, CH-1905) | `TourPlaceholder` → `EmptyState size="page" tone="danger"`; a built view keeps this code for its page failure | tournaments/views.test › CH-16201 |

## 163xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-16301 | A view its lane hasn't built yet (preview only: no route serves Tournaments yet) | The view's head, then "[View] isn’t built yet", one line read from the view's data, and "Its data, types and preview states are ready." It goes when the last placeholder does | `TourPlaceholder` | tournaments/views.test › CH-16301 |

## 164xx Loading

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-16401 | A Tournaments view is on its way (`load: 'loading'`) | The head's eyebrow and title as placeholders, then the body's block, in place; the page is marked busy and named "Loading [view]" | `TourPlaceholder`; a built view replaces the placeholder with its own skeleton at its final geometry and keeps this code | tournaments/views.test › CH-16401 |

## 165xx Confirm

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |

## 166xx Motion

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-16601 | A value changes after first paint (a live score, a team total, a place) | It takes its new value in place (no rolling, D-100) and its cell is washed in `--ch-bg-selected` for 520 ms, then fades on `--ch-dur-reveal`. Never on first paint. Under reduced motion and Animations off the wash still shows; only its fade is skipped | `useChangedWash` + `.ch-tour-washable` / `.ch-tour-changed` (`styles/tournaments.css`) | tournaments/use-changed-wash.test |

## 167xx Haptics

| # | When | They feel | How | Test |
| --- | --- | --- | --- | --- |

## 168xx Accessibility

| # | When | They get | How | Test |
| --- | --- | --- | --- | --- |
| CH-16801 | A signed difference or a trust state is read | A delta says "Better by 1.4 strokes than his season average", "Worse by …" or "Level: … no clear change"; the triangle is hidden and points by better or worse, not by sign, so hue never carries the meaning alone. A trust chip says its state in words; the live dot and the check are hidden | `ui/DeltaChip.tsx`, `ui/TrustChip.tsx` | delta-chip.test, trust-chip.test |

## 169xx Network and UX

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
