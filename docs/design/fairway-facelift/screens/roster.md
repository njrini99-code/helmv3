<!-- markdownlint-disable MD013 -->
# Roster — `/golf/dashboard/roster` (coach)

Files: `src/components/fairway/pages/roster/FairwayCoachRoster.tsx`, `FairwayPlayerCard.tsx`, `src/components/fairway/pages/coachhelm/RosterHealthHeader.tsx`, `FairwayJoinRequests.tsx`, `FairwayPlayerActionsMenu.tsx`.

## What the capture shows

A "Who needs your attention" card, a "Did the coaching land?" card, a 4-number block, a search field, a sort Segmented, an Export pill, then EIGHT player cards each ~400px tall (avatar, chips, avg score, SG, focus, goals, a full-width green "View player" button). The phone page is 9,900px. A coach comparing two players scrolls a screen and a half between them. This is the player card gallery the brief bans.

## SCREEN

- Archetype: B (operational board).
- Dominant object: the roster MatrixBoard.
- Supporting: attention strip (who is trending down / needs a focus area), join requests.
- Tertiary: coaching-landed outcomes, export.
- Floating: dock (mobile).
- Modal: player sheet on phone (tap row); player actions Menu.

## EXISTING FAIRWAY

ViewHeader, Toolbar (search + sort Segmented + Export IconButton + primary "Invite"), MatrixBoard, RankCell, SignalChip, Sparkline, PlayerIdentity, StatusPill, Menu, Sheet, DrillPanel, EmptyState.

## NEW FAIRWAY NEEDED

None (Menu comes from Phase 2).

## CONTAINERS TO REMOVE

1. `FairwayPlayerCard` as the list unit → a MatrixBoard row: identity (avatar, name, year, status dot) · scoring avg (tabular) · trend Sparkline (last 10) · SG total with tone · focus (count or "—") · signal (SignalChip: trending down / no intent / ok) · overflow Menu. Row tap = inline DrillPanel on desktop (the card's detail: goals, intent control, message, view player), Sheet on phone.
2. "Who needs your attention" card + "Did the coaching land?" card + 4-number block → one matte header Surface: left StatMatrix (Players · Active focus · Completed · With recent rounds), right the attention list as 3 seam rows (name · reason · [Add focus area]) with "6 to look at" as a Readout-style number, not a card.
3. Search + sort + export as loose controls → one Toolbar row above the board (sticky, matte at rest, frost when stuck).
4. Full-width "View player" buttons → gone; the row is the link; the primary action in the header is "Invite player".

## COMPOSITION (desktop)

```text
ViewHeader  Your players · 8 on Demo University Golf        [Invite player] [⋯]
┌ Header surface ────────────────────────────────────────────────────────┐
│ 8 players │ 8 active focus │ 5 completed │ 7 recent   ║ 6 need a look    │
│                                                        ║ Mason · trending down   [Add focus]
│                                                        ║ Owen · trending down    [Add focus]
│                                                        ║ +4 more → filter board │
└────────────────────────────────────────────────────────────────────────┘
Toolbar  [🔍 Search players]  [Name · Avg · Hcp · Rounds]     [Export] [Needs attention ◯]
MatrixBoard
  #  Player            Avg    Trend        SG     Focus   Signal        ⋯
  1  Cole Bennett '27  74.7   ╱╲╱╱         −3.62  3       ↗ Improving
  2  Tyler Hayes '27   74.4   ╲╱╱          −4.21  —       ↘ Declining
  … (row expand → DrillPanel: goals, intent, message, open profile)
Join requests: a quiet InlineNotice row above the board only when > 0.
```

Phone: header StatMatrix 2×2 and attention rows; Toolbar collapses to search + a filter Sheet; board rows compress to identity · avg · trend glyph · signal; tap opens the player Sheet (matte) with the drill content and "Open profile" as a block CTA.

## STATES

- Loading: board skeleton rows (8), header skeleton numbers.
- Empty: EmptyState in the board slot with "Invite player".
- Error: InlineNotice above the board, retry.

## RISKS

- `FairwayPlayerCard` is imported by other surfaces (check `rg FairwayPlayerCard`); keep the file, stop using it here.
- Roster tests pin the sort Segmented, search aria-label and export.
- `RosterHealthHeader` is also used by CoachHelm; do not change its API, only how the roster composes it (or compose new header parts from its data).
