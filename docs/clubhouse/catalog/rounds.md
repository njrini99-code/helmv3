# Rounds catalog (11xxx)

Route: `/golf/dashboard/rounds`, for players. Coaches have no Rounds library in v2; they reach a round from Stats, Home and Qualifiers. Spec: `docs/clubhouse/phone/rounds.md`. Plan: `docs/clubhouse/ROUNDS_PLAN.md`.

The library shows the round in progress, the season's scoring, then every posted round by month or by course. Review, New round and Continue are the next surfaces in the plan. Until each is rebuilt, its control is not drawn (`nav.rebuiltHref`). No control ever leads nowhere.

Where things live:
- Code: `src/clubhouse/screens/rounds/` (`RoundsLibrary`, `parts`, `writes`, `RoundsSkeleton`)
- Loader: `src/clubhouse/data/rounds.ts` (`loadRoundsLibrary`), with its pure steps in `rounds-shape.ts`
- Route: `src/clubhouse/routes/rounds.tsx`
- Tests: `src/clubhouse/__tests__/rounds.test.tsx`
- Preview: `/clubhouse-preview/rounds` (`?state=idle|many|empty|noseason|failed|unfinished-failed|failwrites`)

Discard goes through `useAction`, so these belong to the shell: offline refusal (CH-1903), slow saves (CH-1902), and the success and error haptics (D-70).

## 110xx Error toasts

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-11001 | Discarding an unfinished round fails | "Couldn't discard the round at Finley GC" + "It is still saved. Try again, or continue it instead." + Retry; the card stays. Done: "Round discarded", and the card goes, whether the discard came from the dialog or from Retry | `useAction('rounds.discard')` → `deleteInProgressRound`, then `clearEmergencySave` | rounds.test › CH-11001 |

## 112xx Didn't load

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-11201 | The posted rounds don't load | "Your rounds didn't load" + "Nothing is lost. Your posted rounds are still saved; try again in a moment." + Try again (asks the server again). The season card, search and the book are not drawn; it never reads as "no rounds" | `InlineNotice` in the hero | rounds.test › CH-11201 |
| CH-11202 | The round-in-progress check fails | "Couldn't check for a round in progress" + "Any round you started is still saved. Try again in a moment." + Try again, in place of the card | `UnfinishedCard` | rounds.test › CH-11202 |
| CH-11203 | A section crashes while drawing | "Season scoring couldn’t be shown." (or "Your round in progress", "Your rounds") + "The rest of the page is fine. This has been reported automatically." + Try again; the rest of the page stays | `SectionBoundary rounds.unfinished`, `rounds.season`, `rounds.book` | rounds.test › CH-11203 |

## 113xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-11301 | No round posted and none in progress | "No rounds yet" + "Track your first round shot by shot. Your scores, stats and every round you post show up here." Start a round, once round entry is rebuilt | `EmptyState size="page"` | rounds.test › CH-11301 |
| CH-11302 | Rounds posted, but no countable 18-hole round since August 1 | "Your season starts with your first 18-hole round." + "Scoring average, best round, putts and greens fill in here from 18-hole rounds posted since August 1." The rounds still list below | `SeasonCard` | rounds.test › CH-11302 |
| CH-11303 | A course search matches nothing | "No rounds at “Pinehurst”" + "Check the spelling, or search part of the course name." | `EmptyState compact` | rounds.test › CH-11303 |
| CH-11304 | No round in progress | "No round in progress" · "Ready when you are." + "Start a round and track every shot. It saves as you go, so you can pick it back up here." A ghost 18-hole strip, then "Last round Sep 26 · Finley GC" (or "No rounds posted yet") | `UnfinishedCard` | rounds.test › CH-11304 |

## 114xx Loading

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-11401 | The page is on its way | The header, the round card beside the season card, the tools and four rows, in place | `RoundsSkeleton` via `rounds/loading.tsx` (`ClubhouseSwitch`) | rounds.test › CH-11401 |

## 115xx Confirm

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-11501 | Discard on an unfinished round | "Discard this round?" + "Every shot from Finley GC on Oct 14 is deleted. This can't be undone." Keep it · Discard round (danger; "Discarding" while it runs) | `Modal` | rounds.test › CH-11501 |

## 116xx Motion

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-11601 | Hovering a round that opens its review | It lifts 1px and its ring turns green (quick) | `a.ch-rd-sc:hover`, `--ch-dur-quick` | preview |

## 117xx Haptics

| # | When | They feel | How | Test |
| --- | --- | --- | --- | --- |
| CH-11701 | Discard is tapped | Warning, before the question | `askDiscard` | rounds.test › CH-11701 |
| CH-11702 | A round is opened | Selection | `RoundRow` | rounds.test › CH-11702 |
| CH-11703 | Continue, Submit or Start a round is tapped | Light (press) | `UnfinishedCard`, the more-unfinished list | rounds.test › CH-11703 |

## 118xx Accessibility

| # | When | They get | How | Test |
| --- | --- | --- | --- | --- |
| CH-11801 | A screen reader moves through the book | Each round is one link (or one group before Review is rebuilt) named "Sep 26, Finley GC, 72 (E)"; each month or course is a labelled region; the page is labelled by "Your rounds" | `RoundRow`, `main aria-labelledby` | rounds.test › CH-11801 |
| CH-11802 | The in-progress card's hole strip | The strip is hidden from screen readers; the card says the same in words: "+1 through 3", "Continue at hole 4" | `Strip aria-hidden` | rounds.test › CH-11802 |
| CH-11803 | The season ribbon | One labelled image: "Strokes over par for your last 8 rounds, oldest to newest; average +1.9"; each bar has a title with its date, score and type | `Ribbon role="img"` | rounds.test › CH-11803 |
