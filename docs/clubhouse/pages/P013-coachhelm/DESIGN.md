# P013 — CoachHelm: design handoff

## Package

```text
Source:   the owner's Claude Design bundle, in design/handoff/ (VERSIONS.md)
Version:  v2 (received 2026-09-29): Coach - CoachHelm.html, Player -
          CoachHelm.html, Coach and Player - CoachHelm - Mobile.html, helm3.jsx,
          helm3.css, coachhelm2.css
Date:     2026-09-29
Status:   approved (the owner's v2 boards are the spec, D-22;
          docs/clubhouse/phone/coachhelm.md maps each piece to its data and
          names every gap)
```

## Design objective

One calm page that turns CoachHelm's read of the rounds into one thing to act
on, drawn once for both roles: the same focus card, with the player reading it
and the coach choosing whose to read, assigning it or dismissing it. The
evidence is shown, not asserted: a gauge or two bars, the sample and window it
rests on, and a word for how strong the read is.

## Problems being solved

Insights that live in a feed nobody opens; a coach who cannot tell which player
needs a conversation this week; a player who is told to fix something with no
way to see why.

## User goal

Player: one clear thing to work on, and a way to see the reasoning. Coach: who
to look at first, and a one-tap way to prescribe or set aside the top signal.

## Visual hierarchy

Header (role chip, "CoachHelm", one line), then the boards. The player's is,
when a coach proposed a focus area to them, one "Proposed for you" card (each
focus area with Accept and Decline), then the focus card beside a column of
"Also worth knowing" and "Working". The coach's is the program pulse across the
top, then By player beside the chosen player's focus card with Assign as focus
and Dismiss under it. The frame is a container named `chhl` (at most 1180px):
the two columns collapse to one below 900px of canvas, and below 640px the
header is smaller, the pulse is a single column and the coach's players become a
row of pills that scrolls sideways. On the phone (820px and below) the title
also moves to the top bar.

## Components

### Reused Clubhouse primitives

`Avatar`, `Button`, `Icon`, `EmptyState` (page and compact, D-71),
`InlineNotice`, `SectionBoundary`, `Skeleton`, `Segmented`, `PhoneTop`,
`PhoneScreen`, `PhoneBar`, `usePhoneStackHistory`, `useChPhone`, `useAction` and
`useToast`.

### New Clubhouse components

`PlayerBoard` and `CoachBoard` (the containers: the page's state and the three
writes), `Proposals` (the player's Accept and Decline for a proposed focus area,
with its own `ProposalRow`; not Stats' `ProposalAnswer`, whose toast numbers and
style are Stats'), the cards in `parts.tsx` (`FocusCard`, `Evidence` with its
`Gauge` and bars, `ReadMeter`, `PriPill`, `InsightRow`, `PulseList`, `Head`),
`CoachHelmSkeleton` (one shape per role) and `CoachHelmRouteSkeleton`, and
`LIVE_COACHHELM_WRITES` and `LIVE_PLAYER_WRITES` in `writes.ts` (the one place
the server actions are named). The loaders are `data/coachhelm.ts`, with
`coachhelm-shape.ts` (types, partition, ordering, the pulse rows) and
`coachhelm-map.ts` (generator output to what is drawn). The player's views add
`views/Frame`, `PlayerHelmTabs`, `Profile`, `Standing`, `DeepDive`,
`KeepReading` and `Skeletons`, their loaders (`coachhelm-profile.ts`,
`coachhelm-standing.ts`, `coachhelm-dive.ts`) with their pure steps
(`*-shape.ts`) and `coachhelm-views-shape.ts`, and three page stylesheets
(`coachhelm-profile.css` `.ch-hg-`, `coachhelm-standing.css` `.ch-hs-`,
`coachhelm-dive.css` `.ch-hd-`) over the views' shared `coachhelm-views.css`
(`.ch-hv-`).

### Modified Clubhouse components

None for this page beyond the foundation's v2 changes (motion, haptics, page
empty state).

## Actions affected

The four in `config/clubhouse/pages/P013-coachhelm.json` `actions`: Assign as
focus, Dismiss, Undo and Try again. The graph is WIRING.md.

## Contract categories affected

All 25 (CONTRACT.md), seven of them N/A with a reason.

## Motion intent

Its own: the Assigned chip, the dismissed notice and a proposal's Started or
Declined chip rise in (base), and hovering an insight row or a player tints it
(quick); with reduced motion or Animations off the rise is skipped and the chip
and notice appear at once (CH-13601, CH-13602). Everything else (presses, the
skeleton fade, toasts) is the shell's (D-64). The Deep dive's pushed phone
screen slides in over the page in the shell's base duration and fades with
reduced motion (CH-13980). Nothing counts up.

## Haptic intent

v2 grammar (D-70): selection for choosing a player or an insight; the light
press on Assign as focus, with success when it lands and error when it does not;
the warning before Dismiss; Accept is a primary button (the light press) and
Decline is silent, each with success or error from `useAction` (CH-13704);
choosing a view in the sub-navigation, a read in the Deep dive's list and a
round or a plan link under it are selections (CH-13780); other taps are silent.

## Desktop

Two columns above 900px (`1.65fr / 1fr` for the player's focus beside its lists;
a 290px players column beside the focus for a coach), one below. The focus card,
evidence and drill are the same component for both roles.

## Phone

Approved spec `docs/clubhouse/phone/coachhelm.md`: CoachHelm is a phone tab for
both roles. The top bar is the shell's "CoachHelm" and the page keeps its own
header; the focus card takes less padding; the coach's players are a row of
pills (the "By player" heading stays for screen readers); Assign as focus and
Dismiss share a row; on the player's page, choosing a row brings the focus into
view, and each proposed focus area is a row with its two 44px buttons
underneath, side by side.

## Owner rules (2026-10-01)

No new surface: every state below reuses `InlineNotice` (through
`RefreshNotice`, so a retry says "Trying again" and ignores a second tap),
the page's `ch-hl-note` line and `Skeleton`.

- A failed read draws its own notice where the content would be, never the
  empty or zero copy. The coach's focus status that could not be checked
  replaces the Assign button with a notice in the action row (Dismiss stays);
  a read beside the cards that failed is one notice above the board
  (CH-13208); the pulse's partial failure sits under its rows (CH-13206).
- The pulse card holds its place: the slot under "Program pulse" keeps the
  height of three rows (about 197px: 65px a row, two columns on desktop), so
  the skeleton, the rows and a notice share it and nothing below moves when
  the pulse lands (CH-13405). Cost: a short pulse leaves room under it, and
  the phone's single column past three rows grows the card. Moving the pulse
  under the top card is the other way to end the shift; it changes the board's
  order and is the owner's call.
- A pick that the data took away (a refresh) is said in one status line above
  the card, in the card's own register: "Priya is no longer on the board, so
  this is Jonah's card." (CH-13908, CH-13909, CH-13910).

## The player's views (Game profile, Standing, Deep dive)

Owner, 2026-10-01: "coachhelm for player you can build but be detailed." Three
views of the player's own data beside the board, each at `?view=`, each read for
the signed-in player alone and only once CoachHelm is on for them. Development
stays Stats' Development tab, linked from the sub-navigation. Sources: the
Fairway pages' own reads (the genome, the standing rows and the counterfactual,
the Board's feed with the category reads and goals), re-drawn; no number is
computed here that the Fairway page does not compute.

**Sub-navigation.** Board, Game profile, Standing and Deep dive are one
radiogroup of views of this page (the coach's Board and Ask strip is its
pattern), below the header on desktop and a row of chips above it on the phone
(the current one pressed and brought into view); Development is a link after
them, not a radio, drawn only while Stats is rebuilt. A choice is a route
change, so each view has a real address that reloads and shares. With CoachHelm
off no view is drawn and no strip is: every view answers with the board's own
"CoachHelm is off" page.

**Look.** One page grammar, in the Clubhouse tokens (`--ch-*`) and the darker
ivory page: each view opens on a deep-green feature card (the persona, where
they stand, what CoachHelm has found) with its figures in mint and champagne,
then white cards on the ivory with a hairline ring and a soft green shadow.
Numbers are never plain ink where they say something: green for ahead or
working, amber for behind or worth watching (red stays for under par and the
flag, D-42), tertiary ink only for a number that is neutral. Hierarchy is one
big figure per card, then its words, then the proof.

**Game profile.** The shape of the game as a headline from the persona, Strong
and Worth watching beside it, then the seven measures, each on its own scale (a
gap from "no difference" filled in the stance's colour, a share filled from the
left): the value, what it means in plain words, the confidence word (Solid,
Early, Thin, from `lib/coachhelm/confidence-label.ts`) and "How it is
measured"; how many rounds the genome was computed over is said once, in the
card's header. There is no radar and no 0 to 100 score: the genome
stores a normalised score for a chart, which is a figure with no unit that a
player cannot check, so the page shows the value on the dimension's real scale
instead. A value at the bound of its scale says it is a bound, not a
measurement. A measure with too few rounds is locked, says what it needs, and is
never estimated. A dimension has no sample size of its own in the genome, so
none is shown (see WIRING.md).

**Standing.** Every tracked stat against the Tour and against the team on the
stat's own scale: the player's mark, the Tour's tick and the team's tick, the
three figures with their keys, the rank in words and what closing the gap is
worth in strokes a round (the shared counterfactual from their scoring average).
The Tour is the only benchmark (Q-88), the LPGA's for a women's team; strokes
gained is against the field average, not a Tour player's score. A comparison
that cannot be made says why in the row and is drawn as a dash (a team under
five measured teammates, a Tour value that is not comparable): never a zero.
Ranks are never averages, and percent wording starts at 20 teammates. The top
card counts how many comparisons they are ahead on and the three biggest
projections, which overlap and are not added. Under five rounds it is an early
read, with no projection.

**Deep dive.** Every insight the Board draws (the same feed, ranking, visibility
and mapper, so one insight reads the same on both pages), in full. Desktop is a
list (Needs work, then Working, a read that is out of date after the current
ones) beside the read; the phone is the list, and a read is a pushed screen. A
read shows: what was measured (the number in the colour of what it means, the
metric, the dates, then the Board's own evidence with its sample and confidence
word); how it has moved (since it was first seen, the outcome after it was
worked on, the category's trend in words, and a line of the scores in the rounds
listed); the rounds behind it (the newest eight of the total it names, each a
link to its review once that screen is rebuilt); why CoachHelm thinks so (the
cause marked "Measured in your shots" or "Likely, not measured": a hypothesis is
never read as fact; the drivers with their counts; why the confidence is what it
is; then the full write-up); this week's drill; and where it goes (the focus
area or goal made from it, or one on the same stat, linking to Development).
Strength against needs work follows the Board's doctrine. There is no coach
control and no write: nothing to assign, dismiss or accept.

**Honesty rules (all three).** A read that failed is its own notice with Try
again and is never drawn as nothing: the Deep dive's rounds, plans and category
trends each fail on their own, in place, without taking the insights down, and
"In your plan" is a dash rather than a zero while plans did not load. First run,
early read and failed read are three different pages. A read from before the
newest round says so (CH-13903). No sentence says strokes are being lost: a gain
is "worth about 0.9 strokes a round" to the team's average, or to the Tour (the
LPGA Tour for a women's team) when the cascade had no team average to anchor on,
and says which. A movement is in the stat's own unit (points for a share), never
a percent of a percentage.

**States.** Skeleton at the page's final height (a view's own, drawn by the
page's one Suspense on a hard load, because `coachhelm/loading.tsx` cannot read
`?view=`), first run, early or partial read, failed read, off, and the data
states above. **Switching view** (Board, Ask, Game profile, Standing, Deep dive)
draws no skeleton: the strip moves on the tap, the view on screen stays, dimmed
and not tappable, and is replaced once by the next one.

**Phone (DRAFT).** The owner's phone boards
(`docs/clubhouse/phone/coachhelm.md`) cover the board only; these layouts are
built on the phone grammar (the shell's top bar, the chips, cards, a pushed
screen with a back link, 44px targets) and are to be replaced if the owner draws
them. The Deep dive's pushed screen slides in over the page (the page under it
inert), is a history entry so the iOS back swipe pops it, and fades with reduced
motion. `?insight=<id>` opens on a read, checked against the player's own list.

## Accessibility

The page is a main landmark labelled by its title and each section is a labelled
region; a gauge's track is hidden and its legend says every number in words; an
insight or player row is one button named in words (a player button is a
toggle); Why we think this is a disclosure that names what it controls and opens
closed; the focus is a polite live region; priority is a word and never colour
alone; failed-read and crash notices are alerts.

## Data assumptions

Only data the app has. Nothing is generated or computed on this page beyond a
gauge's display scale (a ceiling a step above the largest value). Not drawn
because there is no source or no action behind it: Share with the player
(players already see their own insights and no action shares one), "It comes
back only if Jonah's pattern changes" (nothing records that rule for a dismissed
insight; the notice says what is true), and the board's static fixtures (five
players, eight signals, four pulse rows). The pulse's rows end in whatever names
the pulse wrote. A high-priority finding is amber, not red (D-42).

## Existing backend capabilities used

`getInsightsForPlayer` and `getTopInsightsForPlayers` (the delivery actions,
reads), `getCoachProgramPulse`, `isCoachHelmEnabledForPlayer` and
`isCoachHelmEnabledForCoach` (the gate), and `createFocusAreaFromInsightV2`,
`dismissInsight` and `reactivateInsight` (writes). WIRING.md maps each.

## HELD requirements

### New features

None built as held.

### New data/schema

None. A nudge to the player when a signal is assigned (a push or a message)
would need an action that does not exist; it is not built.

### Owner decisions

D-22 (phone), D-42 (red), D-64 (motion), D-66 (navigation), D-70 (haptics), D-71
(page empty state). Open: Q-76 (the Fairway drills reached by `?view=`: the Game
profile, Standing and Deep dive are built for the player, and Development is
Stats' tab; the owner's draft phone layouts for them are still to come) and Q-77
(Accept and Decline: built in Stats Development and on the player's board here).

## Explicit non-goals

A coach's version of the Game profile, Standing or Deep dive (a coach reads a
player through the Board and Ask); Fairway's Development view (it is Stats'
tab); the Fairway Deep dive's shot-analysis and what-if content and the Game
profile's fingerprint, composite and trend cards (not rebuilt: nothing here
estimates what the Fairway page computes from a model); the coach's Brief
(`/intelligence`); Share with the player; any control the board draws for a
screen that is not rebuilt; any write from a player view.

## Fresh-build confirmation

```text
[x] No old Fairway presentation is required
[x] No old Fairway component is nested in the new screen (clubhouse:check refuses the imports)
[x] Shared reuse is non-UI/headless infrastructure only (the delivery actions, the loaders' helpers, the
    generator's own view-model helpers `buildInsightUnit` and `deriveTone`,
    and the confidence words in `lib/coachhelm/confidence-label.ts`)
```
