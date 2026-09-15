<!-- markdownlint-disable MD013 -->
# Player home — `/golf/dashboard` (player) · PHONE

Files: `src/components/fairway/pages/dashboard/FairwayPlayerDashboard.tsx`, `player-dashboard-parts.tsx` (page-local parts). Read-only here: `DayScheduleSwipe.tsx` (its own wave), `MetricCard`, `StatMatrix`, `TrendChart`/`GenomeRadar` (ChartFrame), the legacy `components/golf/player-hub/HubInsightSignalCard` and `components/golf/coachhelm/insights` (PlayerFocusAreas). No desktop spec exists for this screen yet; the desktop composition is left as it is except where a container is a card inside a card on both viewports.

## What the phone capture shows (this branch, player, 393×852)

9,400 px tall, eleven boxed containers in a column: the plinth header (description clamps mid-sentence: "…trend, standing, and…"), the schedule card, EIGHT bordered MetricCards two-up (4 primary with delta chips + sparklines, 4 secondary), "Scoring trend" as a Surface wrapping ChartFrame's own bordered card (card in card), a "Where you stack up / My Standing" promo card (eyebrow + h3 + two lines + link: a paragraph to say "link"), "Strokes-gained shape" (Surface wrapping the radar's bordered frame, card in card), a "Today" card holding two tinted Inset rows and a footer, Recent rounds (Surface of rounded rows), Focus areas (Surface + a client-fetched list), then the legacy CoachHelm insight card (paragraph + tinted evidence panel + four stacked text actions, ~1,400 px).

## SCREEN (phone)

- Archetype: A (personal overview), phone reading.
- Dominant object: the schedule (what's next) — first after the header, kept.
- Supporting: ONE StatMatrix of the eight numbers; the scoring trend; recent rounds.
- Tertiary: standing and genome deep links; today's task; focus areas; the CoachHelm signal.
- Floating: the dock only.
- Modal: none.
- EXISTING FAIRWAY: ViewHeader, DayScheduleSwipe, StatMatrix, TrendChart, GenomeRadar, InsetGroup (+Row), Surface, EmptyState, InlineNotice, Button.
- NEW FAIRWAY NEEDED: none.

## CONTAINERS TO REMOVE / CHANGE

1. Eight MetricCards → below `md` ONE `StatMatrix` (matte, 2×4; value + a toned "+1.8 · last 5 rounds" hint where the delta exists; "—" when the metric is honestly empty). The MetricCard grids stay for `md`+ (desktop untouched; both branches are CSS-gated, no media-query hydration flip).
2. Scoring trend: the outer `Surface` goes (both viewports) — ChartFrame is already the card.
3. Strokes-gained shape: the teaser's outer Surface is bare below `md` (header + the radar's own frame); card from `md`.
4. Standing promo card → below `lg` one matte `InsetGroup.Row` link ("My Standing" · "See every metric vs your team and the PGA percentile"); the card stays in the desktop 3-column grid.
5. Today card → one Surface of seam rows (event row, task row, footer row) instead of tinted Insets inside a padded card (both viewports; page-local part).
6. Description: "Your game at a glance." (one line; no dash).
7. Left alone, reported in AUDIT.md: the legacy `HubInsightSignalCard` (a `components/golf/**` card with four stacked text actions) — CoachHelm/signals lane; `PlayerFocusAreas` (legacy client list); the schedule card's reserved two-row height.

## MOBILE

- 44 px: every link row is an `InsetGroup.Row` (≥44) or a Button; StatMatrix cells are static.
- Haptics: none added (no selects on this screen).
- Context preservation: no sheet; nothing to preserve.
- Reduced motion: nothing added animates.
- Hydration: greeting is server-resolved; dates already pinned to UTC/en-US; no new `Date.now()`.

## RISKS

- `player-dashboard-parts.test.tsx` pins TodayCard's "Full calendar" link and the absence of a restated count row; `FairwayPlayerDashboard.scoring-trend-heading.test.tsx` pins ONE "Scoring trend" heading. The phone StatMatrix duplicates KPI label text in the DOM next to the desktop MetricCards (one is display-none at any width); tests that query a KPI label by text must scope to one branch.
