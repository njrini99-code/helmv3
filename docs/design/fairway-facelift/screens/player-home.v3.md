<!-- markdownlint-disable MD013 -->
# Player home v3: the field sheet

The player's dashboard, `/golf/dashboard` in the player role, rebuilt against
`../LANGUAGE.md`. It replaces the v2 pass, which was a greeting, a chart in a
card, and four more cards under four identical section headings.

## The first question

A player opening this page is asking two things in one breath: **am I getting
better, and what is costing me strokes?** The page answers the first with its
stage and the second with the first column of its ledger. Everything else is
typeset around those two.

## Why v2 failed here specifically

Five `Surface` blocks on one canvas (`FairwayPlayerDashboard.tsx:418`, `:449`,
`:496`, `:527`, plus the focus-areas panel), each introduced by the same
`SectionTitle` with the same trailing link. Every region carried identical
weight, so nothing anchored the eye, and the "instrument" was a smoothed trace
inside a rounded box. That is the template LANGUAGE.md was written against.

## Data (every field verified in the tree)

| Field | Source | What it really is |
| --- | --- | --- |
| `data.recentRounds` | `page.tsx:298` from `payload.recentRounds` | **Five rounds**, `rounds.slice(0, 5)` at `dashboard-data.ts:1294`. Carries `round_date`, `total_score`, `total_to_par`, `course_name`. |
| `enhancedData.scoringTrend` | `dashboard-data.ts:1192` | **Every** scored round, oldest first. NOT sliced. |
| `enhancedData.sparklines.*` | `:1250-1284` | Four metrics, each a 5-point series. `handicap.sparkline` is `[]`, always. |
| `enhancedData.secondaryStats` | `:1286` | `firPct`, `scramblingPct`, `birdiesPerRound`, `bestRound`. Any may be null. |
| `enhancedData.strokesGained` | `:1293` | Four signed zones plus total. Any may be null. |
| `enhancedData.actionItems` | `:1199` | Tasks, deadlines, announcements, with `overdue`. |
| `enhancedData.todayEvents` / `upcomingEvents` | payload | Today's schedule and what is coming. |

### The one server change this screen needs

`scoringTrend` covers every round, which is the only series long enough to be
a stage, but `dashboard-data.ts:1195` formats the date away before it ships:

```ts
label: new Date(r.round_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
```

`"Sep 10"` carries no year, so two rounds twelve months apart collapse onto one
label and a real date axis cannot be built from it. The fix is additive and
touches no existing consumer: carry `date: r.round_date` alongside `label`.
Nothing is inferred, nothing is reformatted, and the ordinal fallback below is
what renders until it lands.

**Until then the stage plots ordinal position, not time**, and its axis says
so: rounds in order, oldest first, no date ticks. A fake date axis built from
`"Sep 10"` strings would be a fabricated series, which is on the ban list.

## Composition

### 1. Masthead (bare on the canvas)

Eyebrow: today's date, uppercase caption, resolved **server-side** in the
team's timezone exactly as the greeting already is (`FairwayPlayerDashboard.tsx:119`)
so the line never rewrites itself after paint.

Title: the greeting and the player's first name, `text-display`. The name is
server-known and renders on first paint.

**Verdict**: one honest sentence in `text-h3` regular, max 64ch, built by a
pure `buildPlayerVerdict()` in `player-home-logic.ts`. Clauses, each omitted
when its input is absent, never guessed:

1. `{n} rounds logged.` from `stats.roundsPlayed`. Zero: `No rounds logged yet.`
2. `Scoring {avg}, {down|up} {d} over your last {k}.` from `computeSeriesTrend(scoringSeries)`. When the series is too short: `Not enough rounds yet to call a trend.`, stated rather than dropped.
3. `{zone} is costing you most.` from the worst SG zone, linked to the ledger column. **Only when that zone is actually negative** (see the fix below). Omitted entirely when strokes gained is absent.
4. `{n} waiting on you.` from overdue `actionItems`, linked. Omitted at zero.

Primary action `New round` sits on the eyebrow row, right. It is the page's
**one** primary.

### 2. The stage: `RoundField`

Page-local, in `round-field.tsx`. Not registered and not in any barrel.

Every scored round as a bar from a par baseline: **amber above par, green
below, a neutral tick at even**. x is ordinal today and a real date axis the
day `scoringTrend` carries its date. The scoring average renders as a dashed
rule, and the last round is marked and named.

This is ScoreField's geometry for one player, and the mechanics are **copied,
not imported**, for the reason the development screen copied them: ScoreField
is deliberately single-purpose, and bending it to a second host makes it a
chart library.

Readouts column on desktop, separated by a vertical hairline: scoring average,
GIR, putts, handicap. Each prints its value and its split-half delta from ONE
`computeSeriesTrend` call, so a delta and the line it sits beside can never
classify the same series two different ways.

**`handicap.sparkline` is `[]` at the source**, so the handicap readout shows
its value and no delta, and it must not borrow another metric's direction.

Honest states: fewer than three rounds draws no trend line, prints the rounds
it has as marks, and says `Two more rounds and your trend draws.` An empty
stage states the case and does not repeat the masthead's primary.

### 3. The ledger row (two bare columns, vertical hairline)

Two, not three. The development screen measured this on the same shell: the
content tops out near 762px even at 1440 because the shell keeps a right rail,
and a third of that will not hold a sentence. 7/5, fractional, so the loss is
shared.

- **Where your strokes go** (7). The four SG zones as a diverging tornado, x = 0 is the field average. Green gaining, amber leaking, which is the page's only other hue. Its `My Standing` link is the column's action.
- **On your plate** (5). Today's events, then what is coming, then overdue action items, as hairline rows. Nothing renders when all three are empty, because the calendar already answers this question elsewhere.

**Nothing truncates.** A truncated row's minimum width is its whole unbroken
line, which is what pushed horizontal overflow through every width on the
development screen. Rows wrap.

### 4. The table: recent rounds

A dense full-width `<table>`, `Date | Course | Score | To par | Putts`, newest
first, one row is one link to that round. Mono numerals right aligned, `To par`
signed and coloured as ink (green under, amber over). Ten rows and a
`View all N` link.

It draws from `data.recentRounds`, which is **five rows**, so `View all N`
renders only when there are genuinely more, and the caption never claims a
count the page cannot show.

## The three confirmed audit findings, fixed in the rebuild

1. **`SectionTitle`'s action is a raw `<Link>` about 24px tall** (`player-dashboard-parts.tsx:80`), used five times. v3 has no repeated section-title-with-link at all: section heads are `h2` over a green rule, and the one column action that survives is a real control clearing 44px.
2. **`sgTakeaway()` claims a gain in a zone whose value is negative** (`player-dashboard-parts.tsx:241`). The `worst.value >= 0` branch is right, but the fallback says `Gaining most {best}` without ever checking `best.value >= 0`. A player losing strokes in all four zones is told they are gaining in one. The rebuild checks both ends and says `Leaking least {best}` when nothing is positive.
3. **The stage takeaway names a line that may not be drawn** (`player-dashboard-parts.tsx:193`). It is gated on `lastRound`, but the dashed average renders only when `scoringAverage != null`. The sentence is gated on the benchmark it describes.

All three are the same failure in three costumes: a caption asserting something
the thing underneath it does not support.

## Phone (390)

Same order, one column. The stage keeps its instrument; the readouts become a
2x2 typographic grid above it. The ledger stacks with horizontal hairlines. The
table hides `Course` and `Putts` with `hidden md:table-cell` and keeps the row
link at 44px.

## Bans, checked

One Surface (the stage). No identical card grid, no big-number tile, no panel
whose only content is a list, no chart in a card, no gradient text, no dot
slider, no em dash or arrow inside a sentence, no fabricated series (the date
axis waits for a real date), and no client-only breakpoint branch.

## Files

- `round-field.tsx` — the stage instrument, page-local.
- `player-home-logic.ts` — verdict clauses, the SG read, the trend reads. Pure, unit tested.
- `player-dashboard-parts.tsx` — rewritten regions.
- `FairwayPlayerDashboard.tsx` — composition only.
- `dashboard-data.ts:1195` — the one additive server field.

## Verification

tsc, eslint at zero warnings, one vitest runner at a time, then captures at
390 / 768 / 1024 / 1280 / 1440 read personally, checking for horizontal
overflow and for any element whose scroll width exceeds its client width.
