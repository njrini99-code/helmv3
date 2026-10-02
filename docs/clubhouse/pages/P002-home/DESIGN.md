# P002 — Home: design handoff

## Package

```text
Source:   the owner's Claude Design bundles, in design/handoff/ (VERSIONS.md)
Version:  v2 (2026-09-29): Coach - Home.html, Coach - Home - Mobile.html, Player - Home.html,
          Player - Home - Mobile.html
          v1: Coach Home v3.html, coach-home-v3.jsx, screenshots home-01-top and home-02-leaderboard
          (the coach desktop that was built first; kept because the records cite it)
Date:     received 2026-09-29; the coach phone and Player Home were built 2026-09-30
Status:   approved (the owner's v2 boards are the spec, D-22)
```

## Design objective

A calm morning view on the depth vocabulary: the day's facts on a lit sheet, no card grid and no imagery (the owner rejected both). The coach's Home answers "who needs a look and what is next". The player's answers "what is next, and where is my game". Everything on it is a fact the app has.

## Problems being solved

Coaches open five screens to learn who has gone quiet, what is on today and how the last rounds went. Players cannot see their own week and their own scoring in one place, and have no way to see how long until the next event.

## User goal

Coach: read the day in one glance, then act (message the team, add an event). Player: know what is next and how the game is going.

## Visual hierarchy

Coach desktop: header (date, greeting, brief, two actions); one sheet holding the week and the latest round side by side; the leaderboard below. Coach phone: a green hero (day, greeting, brief, Up next), then Today, the team's scoring form, This week and Latest rounds, each round opening a card in a sheet. Player desktop: header (date, greeting, brief, Message coach); the sheet with the week (Up next and its countdown between the days and the agenda) beside My latest round; Scoring; By part of the game. Player phone: the hero with Up next, its countdown and the two actions, then This week, Today, My latest round (paged, its card inline), Scoring and the parts of the game.

## Components

### Reused Clubhouse primitives

`Avatar`, `Badge`, `Button`, `IconButton`, `Icon`, `Modal` (a sheet on the phone), `EmptyState` (section and page, D-71), `Skeleton`, `RefreshNotice` (on `InlineNotice`), `SectionBoundary`, `Segmented`, `ScoreMark`, `ScrollRegion`, `FormLine`, `Nine`, `usePhoneHero` (the shell's phone chrome), `useChPhone`, `useChReducedMotion`, `useNow`, `chSwap`. Home also imports the event type label and icon from Calendar's screens (`calendar/model`, `calendar/views`) and the handicap format from Roster's (`roster/format`).

### New Clubhouse components

Coach: `CoachHome` (with `HomeFirstRun` and `CoachHomeNoTeam`), `HomeActions`, `Week`, `LatestRound`, `Leaderboard`, `HomeSkeleton`, and the phone's `HomePhone` with `UpNext`, `NoEvents`, `Today`, `Form`, `WeekStrip`, `Rounds` and `RoundSheet`. Player: `PlayerHome` (with `DeskNext`, `PlayerFirstRun` and `PlayerHomeNoTeam`), `PlayerHomePhone` (with its paged `Latest`), `PlayerGame` (`Scoring`, `ScoreChart`, `Legs`, `Leg`, `Spark`) and `Countdown`. `Week`, `LatestRound` (with a `mine` mode), and the phone's `UpNext`, `Today` and `WeekStrip` are shared by both roles.

### Modified Clubhouse components

`ui/Nine` became the shared phone scorecard nine (Qualifiers moved onto it); the page empty state (D-71) and `usePhoneHero` are the foundation's. Nothing else outside `screens/home` changed for this page.

## Actions affected

The list is `config/clubhouse/pages/P002-home.json` `actions` (13), and the graph is WIRING.md. Home only reads: every action is a link, a pager, a segmented choice, the N shortcut or Try again.

## Contract categories affected

All 25 (CONTRACT.md). Eight are N/A with a reason: validation, success, warning, destructive, state preservation, optimistic UI and data freshness, because Home takes no input and makes no change, and the Helm Bridge action, which is wired later (D-68).

## Motion intent

Paging the latest round slides the card 12px out and the next in from that side, or fades when motion is reduced (CH-2601); a leaderboard row lifts on hover and shrinks on press (CH-2602). Everything uses the v2 tokens (D-64). The player's countdown ticks in place. There is no count-up and no stagger beyond the shell's first-paint reveal.

## Haptic intent

v2 grammar (D-70): a selection tick for paging, opening a round's card, choosing a quick event type and choosing the Scoring window; the light tap for New event (button or N), Add event and, on the phone, Message coach; nothing for Message team. Home makes no change, so it has no success or error haptic (21703).

## Desktop

Coach: a 1280px canvas holds the header, then one lit sheet in two columns (the week, the latest round), then the leaderboard table. Player: the same sheet, then Scoring (a chart of the last 5, 10 or 20 scores against par and the player's own mean, four figures and one sentence), then the four parts of the game. Below a 860px canvas (a container query) the sheet stacks into one column. A team with nothing yet, and a player with nothing yet, get the v2 page empty state under the date and greeting in place of the rest (D-71).

## Phone

Approved specs `docs/clubhouse/phone/home.md` (coach) and `docs/clubhouse/phone/home-player.md` (player), from the owner's v2 boards. The top bar turns green (`usePhoneHero`) over a hero holding the date, the greeting, the brief and Up next. At 820px and below the phone Home takes over from the desktop page; it is never the desktop shrunk (21901).

The player's phone follows `Player - Home - Mobile.html` (`m-player-home.jsx`,
`m-player-home.css`), not the coach's. Today is a small label inside This
week, with no Calendar link (the week's days open it): the row under way reads
Now, with none under way the next one reads Next, and a row that has passed
keeps its ink with only its time stepping back. Scoring and By part of the
game each have their title and one-line meta above their card; Scoring's card
opens on the full-width Last 5 / Last 10 / Last 20 picker (always all three),
then the line, the four figures (26px, green when the average fell or strokes
gained is at or above zero, amber when worse, plain when it rounds to zero;
the grey line under each only states the change), and the italic note. The
chart's dates are labelled once per day (a run of one date is labelled where
it starts) and its score axis keeps to about six whole-stroke ticks; a round
is marked under par against its own par, and the par line is drawn only when
every round in the window was played to the same par. The hero's greeting,
brief and Up next sit apart by margins that carry more than one selector,
because base.css zeroes every heading's and paragraph's margin and a one-class rule
lost that tie (the brief hugged Up next).

## Accessibility

Named regions and headings, every day of the week read as words, the leaderboard and both nines as tables, the pager announcing its position, the scorecard a focusable named region on the phone, and the countdown a timer heard once (CH-2801 to CH-2806, 21807).

## Data assumptions

Only data the app has. Not shown because no source exists: the prototype's weather and "Week 7 of 12" (golf teams have no season dates), the coach phone's "Needs you" rail (defined in `m-home.jsx` and never drawn by it), a team switcher (one team per coach), a Workout event type (the fourth quick type is Meeting), and a single-round recap (the round's card links to the player's stats instead). For the player: the Handicap figure's "down from +0.2 in Aug" (no handicap history is stored, so it says Index), shot-level notes (driver carry, proximity) need shot data Home does not read, Tour marks exist for Approach only (`golf_pga_standards` has greens in regulation among the four), and "the best on the team" would compare the player with teammates, so it is left out.

Which rounds Home counts (owner, 2026-09-30, Q-122 and Q-123). A round
posted as a total only (18 holes, no nines, no holes) counts in the scores:
the leaderboard's rounds, average, to par and trend, the player's brief ("Your
last three rounds average...") and scoring chart, and the team form's average.
It counts in no hole-level figure: strokes gained, the team form's greens and
putts, and the player's four leg figures, which read the newest rounds with
their holes and say how many ("in the last 3 rounds"). The coach's team form is
Stats' Last 10, so it reads each player's ten newest rounds in any season
(`lastTenFloor`); the leaderboard and the latest rounds stay this season.
Player Home reads the same way: its scoring card (Last 5, 10 and 20), its leg
figures and its brief are the player's newest rounds in any season, and its
strokes gained ("Season, per round") stays the season's.

## Existing backend capabilities used

None of the server actions: both loaders read through the signed-in user's own Supabase client (`createClient` from `@/lib/supabase/server`). WIRING.md lists the tables.

## HELD requirements

### New features

None.

### New data/schema

None.

### Owner decisions

D-4 (Message team and New event), D-17 (the brief states facts; "ready" is accepted replies), D-22 (the owner's phone boards are the spec), D-42 (red means under par, the flag or destructive; gains green, losses amber), D-60 (page IDs), D-64 (motion), D-66 (navigation), D-67 (order: phone Home, then player Home), D-70 (haptics), D-71 (page empty states), Q-66 (the coach phone's differences from the board), Q-69 (the player Home's differences from the boards).

## Explicit non-goals

Weather, a season week count, the "Needs you" rail, a phone leaderboard, a team switcher, a single-round recap, and for a player: Post a round, Start a round and Add classes until round entry and Classes are rebuilt for players.

## Fresh-build confirmation

```text
[x] No old Fairway presentation is required
[x] No old Fairway component is nested in the new screen (clubhouse:check refuses the imports)
[x] Shared reuse is non-UI/headless infrastructure only (the Supabase client, the season and stats loaders)
```
