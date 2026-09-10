<!-- markdownlint-disable MD013 -->
# Coach home — `/golf/dashboard` (coach)

Files: `src/components/fairway/pages/dashboard/FairwayCoachDashboard.tsx` (1332), `DaySchedule.tsx`, `FairwayDashboardSkeleton.tsx`.

## What the capture shows

A hero card (greeting + 3 pills), a giant WINDOW segmented control as the first interactive object, a "Latest" feed card, a "Today" card, EIGHT MetricCards in a 2×2/2×4 grid, an invite-code card, a "Recent rounds" card, a "Schedule" card that repeats Today, a "Performance trend" card, a "Team pulse" card with three insets, a "Top performers" card. Twelve containers, one grammar, nothing wins. The coach's morning question — what is on today, who needs me — is answered fourth and ninth.

## SCREEN

- Archetype: A (intelligence overview), operational flavour. This is the operations home; the CoachHelm cockpit lives at `/intelligence` and must not be duplicated here.
- Dominant object: Today (schedule timeline) with "Who needs attention" beside it.
- Supporting: team pulse (one StatMatrix), scoring trend (one chart), recent rounds, latest activity.
- Tertiary: invite code (only while roster < 3), roster-full notice.
- Floating: dock (mobile), none on desktop.
- Modal: none.

## EXISTING FAIRWAY

ViewHeader, Surface, StatMatrix, Segmented (small, inside the pulse header), MatrixBoard (compact), TrendChart, TickerStrip, NotificationsLatestModule (rows only), DaySchedule, EmptyState, InlineNotice, Menu (overflow).

## NEW FAIRWAY NEEDED

None.

## UNDERLYING KIT

Recharts (existing TrendChart). No new libraries.

## CONTAINERS TO REMOVE

1. Hero card around the greeting → ViewHeader (eyebrow: date · team, h1 greeting, one primary action "New event", overflow Menu: Add player, Qualifiers, Invite).
2. WINDOW Segmented as a page-level control → small Segmented in the Team pulse header only.
3. Eight MetricCards → one StatMatrix (Scoring avg · GIR · Putts/rd · Rounds), each cell with delta chip; 4 columns desktop, 2×2 phone.
4. "Schedule" card → merged into Today (Today shows now/next; the next 3 days follow as quiet rows under a hairline).
5. Team pulse card + three insets + Top performers card → one compact MatrixBoard "Who needs attention" (5 rows: player, trend glyph, scoring avg, SG, signal) with a footer link "Roster →".
6. Invite-code card → an inline row under the attention board only when roster < 3 (otherwise absent).
7. Latest and Recent rounds → two matte surfaces with seam rows, no inner cards, no per-row icon circles.

## COMPOSITION (desktop 12-col)

```text
ViewHeader ─────────────────────────────────────────── [New event] [⋯]
┌ Today (7) ─────────────────────────┐ ┌ Team pulse (5) ───────────┐
│ 7:00 PM  End-of-Season Banquet     │ │ [7D 30D 90D Szn All]      │
│          Meeting · Ballroom        │ │ 75.4   66%   33.0   97    │
│ ── next 3 days ──                  │ │ avg    GIR   putts  rounds│
│ Sun 13 · 7:00 PM · Banquet         │ ├───────────────────────────┤
│ (empty: "Clear today" as a quiet   │ │ TrendChart (scoring, 12w) │
│  inline line, not a notice card)   │ │                           │
└────────────────────────────────────┘ └───────────────────────────┘
┌ Who needs attention (7) ───────────┐ ┌ Latest (5) ───────────────┐
│ MatrixBoard compact, 5 rows        │ │ seam rows, unread dot     │
│ Roster →                           │ │ View all →                │
└────────────────────────────────────┘ └───────────────────────────┘
┌ Recent rounds (12) ── TickerStrip of last 10 · seam rows · View all ┐
```

Phone: same order, single column; Today first; pulse StatMatrix 2×2; attention board as compressed rows; no chart until the coach scrolls.

## STATES

- Loading: skeleton keeps the 7/5 grid; chart skeleton is a chart-shaped block.
- Empty roster: onboarding steps stay (existing), but inside one Surface, not three.
- Errors: local InlineNotice inside the affected surface with retry; the rest renders.

## RISKS

- `FairwayCoachDashboard.tsx` is 1332 lines with several data contracts; keep every data hook and server-action call, change composition only.
- Tests in `src/components/fairway/pages/dashboard/__tests__` pin headings and the single h1.
