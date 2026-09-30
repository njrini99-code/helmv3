# P009 — Qualifiers: design handoff

## Package

```text
Source:   the owner's Claude Design bundles, in design/handoff/ (VERSIONS.md)
Version:  v2 (2026-09-29): Coach - Qualifiers.html, Coach - Qualifiers - Mobile.html
          v1: Qualifiers.html, qualifiers.jsx, qual-core.jsx, qual-data.js, qual.css (design/handoff/);
          mobile/Qualifiers Mobile.html, with qual-mobile.jsx and qual-mobile.css (in design/handoff/ and mobile/;
          the approved phone spec)
Date:     2026-09-29
Status:   approved for the list, the qualifier, the form and the phone. Manage selections has no drawing (Q-65, open)
```

Every board is the coach's view. There is no player design (Q-5), so a player's list and qualifier are the
coach's screens with the coach's controls left out (D-30).

## Design objective

A calm place to run a qualifier and decide a lineup: the standings on a lit sheet, the cut lines where the
decision is, and one clear next step at each stage.

## Problems being solved

Standings kept in a spreadsheet; a squad decided in a message thread; players who never learn how they
placed or why they were left out.

## User goal

See who is in, decide the squad, and tell everyone, without leaving the page.

## Visual hierarchy

The list: the live qualifier and its leaders first, then Active, then Concluded. One qualifier: the head and
its actions, the facts, the leaderboard, then the side sections. Manage selections: the head, the three-step
strip, a note for the current step, then the lists and the picks.

## Components

### Reused Clubhouse primitives

`Avatar`, `Badge`, `Button`, `Checkbox`, `EmptyState` (section and page, D-71), `InlineNotice`, `Modal` (a
sheet on the phone), `RefreshNotice` (the route's "selections didn't load"), `ScoreMark`, `Nine`,
`ScrollRegion`, `SearchField`, `SectionBoundary`, `Skeleton`, `PhoneTop`, `PhoneIconAction`, `PhoneTextAction`,
`usePhoneTabsHidden`, `useChPhone`, `useAction`. The press (`useChPress`) is mounted by the shell and reaches
every button and link; this page does not call it.

### New Clubhouse components

`QualifiersList` (with the hero and the cards), `QualifierDetail` (the facts, the leaderboard with its
scorecard tray, round-by-round), `QualifierSections` (Selections, Course per round), `QualifierDetailPhone`
(three facts, the leaderboard as cards, the player rounds sheet), `QualifierForm` (with `RoundCourses`),
`CoursePicker`, `QualifierSelection` (the steps strip, the lists, `PickDialog`), `QualifiersSkeleton` (three),
`parts` (`StatusPill`, `StateBadge`, `ToPar`, `Meta`), and the pure `model.ts` (ranking, ties, cut lines, form
rules), `writes.ts` (every write and lookup behind one interface) and `live.ts` (the live standings hook).

### Modified Clubhouse components

Two shared pieces were added for this page (PROGRESS.md, 2026-09-30): `usePhoneTabsHidden` in the phone chrome,
so a full-page form hides the tab bar, and `RefreshNotice` moved into `ui/`.

## Actions affected

The list is `config/clubhouse/pages/P009-qualifiers.json` `actions`, and the graph is WIRING.md.

## Contract categories affected

All 25 (CONTRACT.md).

## Motion intent

A card, the hero and a status pill press in about 6px and spring back (CH-09601). A leaderboard row's
scorecards appear in place at their final state, with no count-up and no stagger, and the Live dot is static
(CH-09602, D-33). The phone's player sheet is the shared `Modal` sheet and takes its motion from it. This page's own CSS uses
only the v2 tokens (`--ch-dur-quick`, `--ch-dur-base`; D-64).

## Haptic intent

v2 grammar (D-70): select for a status pill, a leaderboard row, a round chip, a player checkbox, a course, a tee
and a player in the pick dialog; warning before Close, Discard, Start selecting, Confirm and Remove; success when
a write lands; error when it fails.

## Desktop

The list: head, tools, hero and cards. A qualifier: back link, head with its actions, six facts, then two
columns (the leaderboard and, for a coach, round-by-round scores; the selections, the course per round and the
rules). The form: two columns, with the travel squad and the actions on a sticky right column. Manage
selections: head, steps strip, note, then two columns (on score now and the rest of the field; the coach's
picks). The leaderboard draws the top-score line and the travel cut between rows.

## Phone

Approved spec `docs/clubhouse/phone/qualifiers.md`. The list is the desktop list with phone CSS under a "‹ More"
top bar. A qualifier is one column: three facts, the confirmed squad above the leaderboard, the leaderboard as
cards, and a rounds sheet for a player (round chips, Out and In, Message and Stats); Close and Reopen sit behind
Edit (Q-20), and round-by-round stays on desktop. The form puts Cancel and Create in the top bar and hides the
tab bar. Manage selections has its own top bar and a foot for the primary action.

## Accessibility

Tables with row and column headers for the leaderboard and round-by-round, a button with `aria-expanded` for each
row's scorecards, captioned scorecard tables, a polite live region for standings updates, alerts tied to their
fields, and a named list for the selection steps.

## Data assumptions

Only data the app has. Not shown because no source exists: a par for the qualifier as a whole (Q-13; a par per
round comes from the tee, else from the submitted rounds), a date per round (Q-12), and a player's average over
rounds that are not 18 holes (the average says how many it counts). Ties share a position only when to par and
total strokes both match.

## Existing backend capabilities used

`createGolfQualifier`, `updateGolfQualifierDetails`, `setQualifierRoundCourses`, `updateQualifierStatus`
(`src/app/golf/actions/golf.ts`), `setQualifierSquadSize`, `setQualifierEntrants`
(`qualifier-setup.ts`), `advanceSelectionState`, `setQualifierCoachPick`, `removeQualifierCoachPick`,
`confirmQualifierSelection` (`v3/qualifying.ts`), `listCoursesStrict`, `getTeamSavedCourses`,
`getCourseDetail` (`course-library.ts`) and the realtime channel on `golf_rounds`. WIRING.md maps each.

## HELD requirements

### New features

`setQualifierSquadSize` and `setQualifierEntrants` (Edit's squad and players): built, and HELD behind
`isClubhouseFor` (`docs/clubhouse/held/features/qualifier-squad-and-entrants.md`, D-61).

### New data/schema

The database hardening migration (players can read `coach_reasoning`; the entry-insert policy does not check
the player's team; the stranding trigger runs as the caller): written, reviewed, not applied
(`docs/clubhouse/held/data/qualifier-db-hardening.md`, D-35). Until it is applied the page reads pick reasons
through `readQualifierSelectionReasons`, which works on both sides of the apply.

### Owner decisions

D-30 to D-34 (players, closed means closed, edit, navigation, the phone), D-35 (the database fixes), D-61
(held features), D-64 (motion), D-66 (navigation), D-70 (haptics), D-71 (page empty state), Q-65 (Manage
selections).

## Explicit non-goals

Entering a round from a qualifier (not rebuilt, Q-6), a date per round (Q-12), computing the scorecard playoff
(it stays rules text), changing the squad after it is confirmed, taking a player out of a qualifier they have a
round in, round-by-round scores and pick reasons for players, and round-by-round on the phone.

## Fresh-build confirmation

```text
[x] No old Fairway presentation is required
[x] No old Fairway component is nested in the new screen (clubhouse:check refuses the imports)
[x] Shared reuse is non-UI/headless infrastructure only (the existing server actions and the realtime channel)
```
