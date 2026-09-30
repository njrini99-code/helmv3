# CoachHelm catalog (13xxx)

Route: `/golf/dashboard/coachhelm`, one page for both roles. The player sees their own insights, one focus first. The coach sees the program pulse and their team's players, each with a top signal, and can assign it as a focus or dismiss it. Spec: `docs/clubhouse/phone/coachhelm.md`.

A player never sees a coach control (Assign, Dismiss, Undo). A coach reads only the players on their team, whichever other teams they staff. Controls that lead to a screen that isn't rebuilt yet (Roster, CoachHelm settings, Start a round) are not drawn (`nav.rebuiltHref`); no control leads nowhere.

Where things live:
- Code: `src/clubhouse/screens/coachhelm/` (`PlayerBoard`, `CoachBoard`, `parts`, `writes`, `CoachHelmSkeleton`)
- Loader: `src/clubhouse/data/coachhelm.ts` (`loadPlayerCoachHelm`, `loadCoachCoachHelm`), with its pure steps in `coachhelm-shape.ts` (types, partition, sorting, the pulse) and `coachhelm-map.ts` (generator output to what the screen draws)
- Route: `src/clubhouse/routes/coachhelm.tsx`; `coachhelm/page.tsx` branches on `isClubhouseFor` and `coachhelm/loading.tsx` uses `ClubhouseSwitch`
- Tests: `src/clubhouse/__tests__/coachhelm.test.tsx`
- Preview: `/clubhouse-preview/coachhelm` (the coach; `?state=assigned|empty|noroster|failed|pulsefailed|quiet|off|loading|failwrites|failundo|duplicate`) and `/clubhouse-preview/coachhelm-player` (`?state=empty|norounds|working|failed|off|loading`)

Assign, Dismiss and Undo go through `useAction`, so these belong to the shell: offline refusal (CH-1903), slow saves (CH-1902), and the success and error haptics (D-70). The follow-ups (marking Assigned, hiding a dismissed card, restoring it) are inside the action, so a toast's Retry completes them.

## 130xx Error toasts

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-13001 | Assign as focus fails | "Couldn’t assign the focus to Jonah" + the server's reason when it is short and plain, else "Nothing was saved. Try again." + Retry; the button stays. Done: the "Assigned as Jonah’s focus" chip (no toast), also when Retry lands. A player who already has an active focus on the metric is the outcome wanted: the chip, and a toast "Jonah already has a focus on this", not an error | `useAction('coachhelm.assign')` → `createFocusAreaFromInsightV2` | coachhelm.test › CH-13001 |
| CH-13002 | Dismiss fails | "Couldn’t dismiss the insight" + "It’s still on the board. Try again." + Retry; the insight stays. Done: the dismissed notice (CH-13901), also when Retry lands | `useAction('coachhelm.dismiss')` → `dismissInsight` | coachhelm.test › CH-13002 |
| CH-13003 | Undo fails | "Couldn’t undo the dismissal" + "It’s still dismissed. Try again." + Retry; the notice stays. Done: the insight is back, also when Retry lands | `useAction('coachhelm.undo')` → `reactivateInsight` with the lifecycle state it had | coachhelm.test › CH-13003 |

## 131xx Validation

None. CoachHelm has no form.

## 132xx Didn't load

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-13201 | The player's insights don't load (the read fails, throws, comes back empty while insights are on file, or the gate lookup fails) | "Your insights didn’t load" + "Nothing is lost. Your CoachHelm reads are still saved; try again in a moment." + Try again (asks the server again). It never reads as "no insights" | `InlineNotice` in `PlayerBoard` | coachhelm.test › CH-13201 |
| CH-13202 | The coach's roster or players' insights don't load (same tests, for the team) | "Your players’ insights didn’t load" + "Nothing is lost. Every insight is still saved; try again in a moment." + Try again. The program pulse still shows. It never reads as "no signals" or an empty team | `InlineNotice` in `CoachBoard` | coachhelm.test › CH-13202 |
| CH-13203 | The program pulse doesn't load | "The program pulse didn’t load" + "Your players’ insights below are not affected. Try again in a moment." + Try again, in the pulse's place | `InlineNotice` in the pulse section | coachhelm.test › CH-13203 |
| CH-13204 | A section crashes while drawing | "Your focus couldn’t be shown." (or "Your other insights", "The program pulse", "Your players", "This player’s focus") + "The rest of the page is fine. This has been reported automatically." + Try again; the rest of the page stays | `SectionBoundary coachhelm.focus`, `coachhelm.side`, `coachhelm.pulse`, `coachhelm.players` | coachhelm.test › CH-13204 |

## 133xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-13301 | Player: no round posted yet | "Post a round to start CoachHelm" + "CoachHelm reads the rounds you post. Once there is enough to go on, one thing to work on this week shows up here." Start a round once round entry is rebuilt; until then "Open Rounds" | `EmptyState size="page"` in `PlayerBoard` | coachhelm.test › CH-13301 |
| CH-13302 | Player: rounds posted, no insight yet | "No insights yet" + "You’ve posted 3 rounds. CoachHelm needs enough rounds to find a pattern worth acting on. Every round you post sharpens the read." No threshold is named (the generators each set their own); the count is left out when it can't be read | `EmptyState size="page"` | coachhelm.test › CH-13302 |
| CH-13303 | Player: every insight is a strength | "Nothing needs work right now" + "CoachHelm found nothing to fix in the rounds you’ve posted. What is working is listed beside this." The Working list stays | `EmptyState` in the focus's place | coachhelm.test › CH-13303 |
| CH-13304 | Player: CoachHelm is off for them | "CoachHelm is off for your team" + "Your coach turned it off: “…”. Ask your coach if you want it back on." (the coach's own words when there are some; otherwise "CoachHelm is turned off, so no insights are being shown.") | `EmptyState size="page"` | coachhelm.test › CH-13304 |
| CH-13305 | Coach: CoachHelm is off (by them, by the team, or globally) | "CoachHelm is off" + "You have turned CoachHelm off…" / "Your team has turned CoachHelm off…" + "Turn it back on in Settings to see signals again." + Open CoachHelm settings; a global switch says "CoachHelm is turned off for GolfHelm right now" and has no link | `EmptyState size="page"` in `CoachBoard` | coachhelm.test › CH-13305 |
| CH-13306 | Coach: players on the team, no signal yet | "No signals yet" + "CoachHelm reads posted rounds. Each player’s insights appear once they’ve posted enough rounds to find a pattern." + View roster. The pulse still shows | `EmptyState size="page"` | coachhelm.test › CH-13306 |
| CH-13307 | Coach: no players on the team | "Add players to start CoachHelm" + "CoachHelm reads the rounds your players post. Invite players from Roster, and their insights show up here." + Open roster | `EmptyState size="page"` | coachhelm.test › CH-13307 |
| CH-13308 | Coach: not on a team | "You aren't on a team yet" + "Once your team is set up, CoachHelm reads the rounds your players post and shows their signals here." Not an error, not a redirect | `ClubhouseCoachHelmRoute` | coachhelm.test › CH-13308 |
| CH-13309 | Coach: the pulse has nothing flagged | "Nothing is flagged in the pulse right now." It doesn't claim all is well | the pulse section | coachhelm.test › CH-13309 |
| CH-13310 | Coach: some players have no insight yet | "1 player has no insights yet." (or "3 players have") under the list | `CoachBoard` | coachhelm.test › CH-13310 |

## 134xx Loading

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-13401 | The player's page is on its way | The header, the focus card beside a short list of rows, in place; `aria-busy`, "Loading CoachHelm" | `CoachHelmSkeleton` via `coachhelm/loading.tsx` (`ClubhouseSwitch`) | coachhelm.test › CH-13401 |
| CH-13402 | The coach's page is on its way | The header, the pulse, then the players beside the focus card, in place | `CoachHelmSkeleton` (the role comes from the signed-in user; the player's shape until it is known) | coachhelm.test › CH-13402 |
| CH-13403 | Assign or Dismiss is saving | The button reads "Assigning" or "Dismissing" and every control waits (Undo reads "Undoing") | `CoachBoard` (`useAction` pending) | coachhelm.test › CH-13403 |

## 135xx Confirm

None. Dismiss is undoable, so it doesn't ask: the notice (CH-13901) keeps Undo in place.

## 136xx Motion

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-13601 | An insight is assigned, or dismissed | The Assigned chip or the dismissed notice rises in (base). With reduced motion or Animations off it appears at once | `.ch-hl-done`, `.ch-hl-dis`, `ch-hl-rise` | coachhelm.test › CH-13601 |
| CH-13602 | Hovering an insight row or a player | The row tints (quick) | `.ch-hl-row:hover`, `.ch-hl-pl:hover` | preview |

## 137xx Haptics

| # | When | They feel | How | Test |
| --- | --- | --- | --- | --- |
| CH-13701 | A player or an insight row is picked | Selection | `InsightRow`, the player buttons | coachhelm.test › CH-13701 |
| CH-13702 | Assign as focus is tapped | Light (press) on the tap; success when it lands, error when it doesn't (`useAction`) | primary `Button`, `useAction('coachhelm.assign')` | coachhelm.test › CH-13702 |
| CH-13703 | Dismiss is tapped | Warning, before the write; then success when it lands | `CoachBoard` | coachhelm.test › CH-13703 |

## 138xx Accessibility

| # | When | They get | How | Test |
| --- | --- | --- | --- | --- |
| CH-13801 | A screen reader moves through the page | The page is labelled by "CoachHelm"; each section is a labelled region ("Program pulse", "By player", "Also worth knowing", "Working"); the claim is the focus card's heading | `main aria-labelledby`, `section aria-labelledby` | coachhelm.test › CH-13801 |
| CH-13802 | A gauge | The track is hidden from screen readers; the legend says every number in words: "You · 1.1", "College cohort avg 0.6", "PGA Tour avg 0.3", with the sample and the window beside it | `Gauge` | coachhelm.test › CH-13802 |
| CH-13803 | An insight or player row | One button named for its category, title, priority in words, and value; the player buttons are toggles (`aria-pressed`) | `InsightRow`, the player buttons | coachhelm.test › CH-13803 |
| CH-13804 | Why we think this | A disclosure button that names what it controls (`aria-expanded`, `aria-controls`); it opens closed on every insight | `FocusCard` | coachhelm.test › CH-13804 |
| CH-13805 | Choosing another insight or player | The focus is a polite live region, so the change is announced | `aria-live="polite"` around the focus | coachhelm.test › CH-13805 |
| CH-13806 | Priority | The pill is a word (Priority, Worth closing, Minor, or Working for a strength), never colour alone; the rows say it in words too | `PriPill` | coachhelm.test › CH-13806 |

## 139xx Network and UX

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-13901 | An insight is dismissed | The focus card is replaced by "Insight dismissed. It no longer shows on your board or on Jonah’s. Undo brings it back." (`role="status"`) with Undo; the player's row reads "Dismissed"; the open count drops by one. Nothing refreshes the page away from the notice | `CoachBoard` | coachhelm.test › CH-13901 |
