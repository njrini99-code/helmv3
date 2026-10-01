# P013 — CoachHelm: design handoff

## Package

```text
Source:   the owner's Claude Design bundle, in design/handoff/ (VERSIONS.md)
Version:  v2 (received 2026-09-29): Coach - CoachHelm.html, Player - CoachHelm.html,
          Coach and Player - CoachHelm - Mobile.html, helm3.jsx, helm3.css, coachhelm2.css
Date:     2026-09-29
Status:   approved (the owner's v2 boards are the spec, D-22; docs/clubhouse/phone/coachhelm.md maps each
          piece to its data and names every gap)
```

## Design objective

One calm page that turns CoachHelm's read of the rounds into one thing to act on, drawn once for both roles:
the same focus card, with the player reading it and the coach choosing whose to read, assigning it or
dismissing it. The evidence is shown, not asserted: a gauge or two bars, the sample and window it rests on,
and a word for how strong the read is.

## Problems being solved

Insights that live in a feed nobody opens; a coach who cannot tell which player needs a conversation this
week; a player who is told to fix something with no way to see why.

## User goal

Player: one clear thing to work on, and a way to see the reasoning. Coach: who to look at first, and a
one-tap way to prescribe or set aside the top signal.

## Visual hierarchy

Header (role chip, "CoachHelm", one line), then the boards. The player's is, when a coach proposed a focus area
to them, one "Proposed for you" card (each focus area with Accept and Decline), then the focus card beside a
column of "Also worth knowing" and "Working". The coach's is the program pulse across the top, then By player beside
the chosen player's focus card with Assign as focus and Dismiss under it. The frame is a container named
`chhl` (at most 1180px): the two columns collapse to one below 900px of canvas, and below 640px the header is
smaller, the pulse is a single column and the coach's players become a row of pills that scrolls sideways.
On the phone (820px and below) the title also moves to the top bar.

## Components

### Reused Clubhouse primitives

`Avatar`, `Button`, `Icon`, `EmptyState` (page and compact, D-71), `InlineNotice`, `SectionBoundary`,
`Skeleton`, `PhoneTop`, `useChPhone`, `useAction`, `useToast`, and the shell's `NotRebuilt`.

### New Clubhouse components

`PlayerBoard` and `CoachBoard` (the containers: the page's state and the three writes), `Proposals` (the
player's Accept and Decline for a proposed focus area, with its own `ProposalRow`; not Stats' `ProposalAnswer`,
whose toast numbers and style are Stats'), the cards in
`parts.tsx` (`FocusCard`, `Evidence` with its `Gauge` and bars, `ReadMeter`, `PriPill`, `InsightRow`,
`PulseList`, `Head`), `CoachHelmSkeleton` (one shape per role) and `CoachHelmRouteSkeleton`, and
`LIVE_COACHHELM_WRITES` and `LIVE_PLAYER_WRITES` in `writes.ts` (the one place the server actions are named). The loaders are
`data/coachhelm.ts`, with `coachhelm-shape.ts` (types, partition, ordering, the pulse rows) and
`coachhelm-map.ts` (generator output to what is drawn).

### Modified Clubhouse components

None for this page beyond the foundation's v2 changes (motion, haptics, page empty state).

## Actions affected

The four in `config/clubhouse/pages/P013-coachhelm.json` `actions`: Assign as focus, Dismiss, Undo and Try
again. The graph is WIRING.md.

## Contract categories affected

All 25 (CONTRACT.md), seven of them N/A with a reason.

## Motion intent

Its own: the Assigned chip, the dismissed notice and a proposal's Started or Declined chip rise in (base), and hovering an insight row or a player
tints it (quick); with reduced motion or Animations off the rise is skipped and the chip and notice appear at
once (CH-13601, CH-13602). Everything else (presses, the skeleton fade, toasts) is the shell's (D-64).
Nothing counts up.

## Haptic intent

v2 grammar (D-70): selection for choosing a player or an insight; the light press on Assign as focus, with
success when it lands and error when it does not; the warning before Dismiss; Accept is a primary button (the
light press) and Decline is silent, each with success or error from `useAction` (CH-13704); other taps are silent.

## Desktop

Two columns above 900px (`1.65fr / 1fr` for the player's focus beside its lists; a 290px players column
beside the focus for a coach), one below. The focus card, evidence and drill are the same component for both
roles.

## Phone

Approved spec `docs/clubhouse/phone/coachhelm.md`: CoachHelm is a phone tab for both roles. The top bar is
the shell's "CoachHelm" and the page keeps its own header; the focus card takes less padding; the coach's
players are a row of pills (the "By player" heading stays for screen readers); Assign as focus and Dismiss
share a row; on the player's page, choosing a row brings the focus into view, and each proposed focus area is
a row with its two 44px buttons underneath, side by side.

## Accessibility

The page is a main landmark labelled by its title and each section is a labelled region; a gauge's track is
hidden and its legend says every number in words; an insight or player row is one button named in words (a
player button is a toggle); Why we think this is a disclosure that names what it controls and opens closed;
the focus is a polite live region; priority is a word and never colour alone; failed-read and crash notices
are alerts.

## Data assumptions

Only data the app has. Nothing is generated or computed on this page beyond a gauge's display scale (a
ceiling a step above the largest value). Not drawn because there is no source or no action behind it:
Share with the player (players already see their own insights and no action shares one), "It comes back only
if Jonah's pattern changes" (nothing records that rule for a dismissed insight; the notice says what is
true), and the board's static fixtures (five players, eight signals, four pulse
rows). The pulse's rows end in whatever names the pulse wrote. A high-priority finding is amber, not red
(D-42).

## Existing backend capabilities used

`getInsightsForPlayer` and `getTopInsightsForPlayers` (the delivery actions, reads), `getCoachProgramPulse`,
`isCoachHelmEnabledForPlayer` and `isCoachHelmEnabledForCoach` (the gate), and `createFocusAreaFromInsightV2`,
`dismissInsight` and `reactivateInsight` (writes). WIRING.md maps each.

## HELD requirements

### New features

None built as held.

### New data/schema

None. A nudge to the player when a signal is assigned (a push or a message) would need an action that does not
exist; it is not built.

### Owner decisions

D-22 (phone), D-42 (red), D-64 (motion), D-66 (navigation), D-70 (haptics), D-71 (page empty state). Open:
Q-76 (the Fairway drills reached by `?view=`: built as "not rebuilt yet", with Development, Profile and
Standing to be rebuilt) and Q-77 (Accept and Decline: built in Stats Development and on the player's board here).

## Explicit non-goals

The Fairway page's Development, Game profile, Standing and Deep dive views; the coach's Brief
(`/intelligence`); Share with the player; any control the board draws for a screen that is not rebuilt.

## Fresh-build confirmation

```text
[x] No old Fairway presentation is required
[x] No old Fairway component is nested in the new screen (clubhouse:check refuses the imports)
[x] Shared reuse is non-UI/headless infrastructure only (the delivery actions, the loaders' helpers, the
    generator's own view-model helpers `buildInsightUnit`, `readQuality` and `deriveTone`)
```
