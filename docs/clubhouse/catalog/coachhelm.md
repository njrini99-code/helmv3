# CoachHelm catalog (13xxx)

Route: `/golf/dashboard/coachhelm`, one page for both roles. The player sees their own insights, one focus first, and the focus areas a coach proposed to them, which they accept or decline (Q-77). Beside that board the player has three views of their own data (owner, 2026-10-01: "coachhelm for player you can build but be detailed"), chosen with the sub-navigation (CH-13930) and addressed by `?view=`: Game profile (`profile`, rows marked "Profile:"), Standing (`standing`, "Standing:") and Deep dive (`deep-dive`, "Deep dive:"). Development stays Stats' Development tab, a link out of the sub-navigation (CH-13931). The coach sees the program pulse and their team's players, each with a top signal, and can assign it as a focus or dismiss it. Every comparison is against the Tour of the team (Q-88): the LPGA's for a women's team, and never a college one. Spec: `docs/clubhouse/phone/coachhelm.md`.

A player never sees a coach control (Assign, Dismiss, Undo), and a coach never sees Accept or Decline. A coach reads only the players on their team, whichever other teams they staff. Controls that lead to a screen that isn't rebuilt yet (Roster, CoachHelm settings, Start a round) are not drawn (`nav.rebuiltHref`); no control leads nowhere.

Where things live:
- Code: `src/clubhouse/screens/coachhelm/` (`PlayerBoard`, `CoachBoard`, `Proposals`, `parts`, `writes`, `CoachHelmSkeleton`); the player's views in `screens/coachhelm/views/` (`PlayerHelmTabs`, `Frame`, `Profile`, `Skeletons`)
- Player views' loaders: `src/clubhouse/data/coachhelm-profile.ts` (`loadPlayerProfile`) with its pure steps in `coachhelm-profile-shape.ts`, and the shared `coachhelm-views-shape.ts` (the view union, the addresses, the Development link); the gate every view and the board share is `loadPlayerHelmGate` in `coachhelm.ts`
- Player views' tests: `coachhelm-profile.test.tsx`, `coachhelm-views.test.tsx` (the route, the gate, the sub-navigation)
- Loader: `src/clubhouse/data/coachhelm.ts` (`loadPlayerCoachHelm`, `loadCoachCoachHelm`), with its pure steps in `coachhelm-shape.ts` (types, partition, sorting, the pulse, the stance pill), `coachhelm-classify.ts` (what a card states, finding, strength or note, and whether its read is current), `coachhelm-voice.ts` (whose voice the text is in) and `coachhelm-map.ts` (generator output to what the screen draws); the confidence read uses the one set of words `lib/coachhelm/confidence-label.ts` holds (Solid, Early, Thin); the Tour values come from `loadTourBenchmarks` in `stats-common.ts` (`golf_pga_standards`, the team's own tour)
- Route: `src/clubhouse/routes/coachhelm.tsx`; `coachhelm/page.tsx` branches on `isClubhouseFor` and `coachhelm/loading.tsx` uses `ClubhouseSwitch`
- Tests: `src/clubhouse/__tests__/coachhelm.test.tsx`; the swap audit's code
  fixes (section 13) in `coachhelm-audit.test.ts` (the pure steps) and
  `coachhelm-audit.test.tsx` (the loaders, the route and the cards)
- Ask (the chat sub-tab, rows marked "Ask:"): `src/clubhouse/screens/coachhelm/chat/`, loaders `src/clubhouse/data/coachhelm-chat.ts` and `coachhelm-chat-thread.ts`; tests `coachhelm-ask.test.tsx`, `coachhelm-ask-loader.test.tsx`, `coachhelm-thread-ui.test.tsx`; preview `/clubhouse-preview/coachhelm-ask`
- Preview: `/clubhouse-preview/coachhelm-views` (`?view=profile`, `?state=partial|empty|edge|failed|off|loading`); `/clubhouse-preview/coachhelm` (the coach; `?state=assigned|empty|noroster|failed|pulsefailed|quiet|off|loading|failwrites|failundo|duplicate`) and `/clubhouse-preview/coachhelm-player` (`?state=empty|norounds|working|failed|off|loading|proposed|failproposal|proposalsfailed`)

Accept and Decline (the player's answer to a proposed focus area) go through `useAction` as well, and confirm in place: the follow-up (the "Started" or "Declined" chip) is inside the action, so a toast's Retry completes it.

Assign, Dismiss and Undo go through `useAction`, so these belong to the shell: offline refusal (CH-1903), slow saves (CH-1902), and the success and error haptics (D-70). The follow-ups (marking Assigned, hiding a dismissed card, restoring it) are inside the action, so a toast's Retry completes them.

## 130xx Error toasts

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-13001 | Assign as focus fails | "Couldn’t assign the focus to Jonah" + the server's reason when it is short and plain, else "Nothing was saved. Try again." + Retry; the button stays. Done: the "Assigned as Jonah’s focus" chip (no toast), also when Retry lands. A player who already has an active focus on the metric is the outcome wanted: the chip, and a toast "Jonah already has a focus on this", not an error | `useAction('coachhelm.assign')` → `createFocusAreaFromInsightV2` | coachhelm.test › CH-13001 |
| CH-13002 | Dismiss fails | "Couldn’t dismiss the insight" + "It’s still on the board. Try again." + Retry; the insight stays. Done: the dismissed notice (CH-13901), also when Retry lands | `useAction('coachhelm.dismiss')` → `dismissInsight` | coachhelm.test › CH-13002 |
| CH-13003 | Undo fails | "Couldn’t undo the dismissal" + "It’s still dismissed. Try again." + Retry; the notice stays. Done: the insight is back, also when Retry lands | `useAction('coachhelm.undo')` → `reactivateInsight` with the lifecycle state it had | coachhelm.test › CH-13003 |
| CH-13004 | A player's Accept of a proposed focus area fails | "Couldn’t accept Lag putting" + the server's reason when it is short and plain, else "It is still waiting for you. Try again in a moment." + Retry; both buttons stay. Done: the "Started · Lag putting" chip (CH-13902, no toast), also when Retry lands | `useAction('coachhelm.acceptFocusArea')` in `Proposals` → `acceptFocusArea` | coachhelm.test › CH-13004 |
| CH-13005 | A player's Decline of a proposed focus area fails | "Couldn’t decline Lag putting" + the same hint + Retry; both buttons stay. Done: the "Declined · Lag putting" chip, also when Retry lands | `useAction('coachhelm.declineFocusArea')` in `Proposals` → `declineFocusArea` | coachhelm.test › CH-13005 |
| CH-13050 | Ask: An action CoachHelm proposed fails after Confirm | A toast "Create focus area, not completed" with the reason; the card becomes the failed receipt (CH-13253) | `Thread` (the receipt stream) | coachhelm-thread-ui.test › CH-13050 |
| CH-13051 | Ask: Copy is refused by the clipboard | A toast that says the answer was not copied and how to copy it by hand (select the text) | `Thread` Copy | coachhelm-thread-ui.test › CH-13051 |

## 131xx Validation

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-13120 | Ask: Send while an action card waits for Confirm or Cancel | Send is off, Enter sends nothing, and the box says to confirm or cancel first; a pill or a follow-up sent over a waiting card is not sent either | `Composer`, `Ask` | coachhelm-ask.test › CH-13120 |

## 132xx Didn't load

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-13201 | The player's insights don't load (the read fails, throws, comes back empty while insights are on file, or the gate lookup fails) | "Your insights didn’t load" + "Nothing is lost. Your CoachHelm reads are still saved; try again in a moment." + Try again (asks the server again). It never reads as "no insights" | `InlineNotice` in `PlayerBoard` | coachhelm.test › CH-13201 |
| CH-13202 | The coach's roster or players' insights don't load (same tests, for the team) | "Your players’ insights didn’t load" + "Nothing is lost. Every insight is still saved; try again in a moment." + Try again. The program pulse still shows. It never reads as "no signals" or an empty team | `InlineNotice` in `CoachBoard` | coachhelm.test › CH-13202 |
| CH-13203 | The program pulse doesn't load | "The program pulse didn’t load" + "Your players’ insights below are not affected. Try again in a moment." + Try again, in the pulse's place | `InlineNotice` in the pulse section | coachhelm.test › CH-13203 |
| CH-13204 | A section crashes while drawing | "Your focus couldn’t be shown." (or "Your other insights", "Proposed focus areas", "The program pulse", "Your players", "This player’s focus") + "The rest of the page is fine. This has been reported automatically." + Try again; the rest of the page stays | `SectionBoundary coachhelm.focus`, `coachhelm.side`, `coachhelm.proposals`, `coachhelm.pulse`, `coachhelm.players` | coachhelm.test › CH-13204 |
| CH-13205 | The player's proposed focus areas don't load (the read fails, or the team they are read through can't be read) | "Your proposed focus areas didn’t load" + "Nothing is lost. Anything your coach proposed is still waiting for you; try again in a moment." + Try again (asks the server again), above the insights, which still show. It never reads as "nothing proposed" | `InlineNotice` in `Proposals` | coachhelm.test › CH-13205 |
| CH-13260 | Profile: the Game profile doesn't load (the genome read fails or throws) | "Your game profile didn’t load" + "Nothing is lost. Your profile is still saved; try again in a moment." + Try again (asks the server again), under the sub-navigation. It never reads as the first run ("Your game profile starts with a few rounds"): `loadGenome` throws on a failed read, which is the failed state, and answers null only for no row or nothing computed | `InlineNotice` in `Profile`, `loadPlayerProfile` (logged `clubhouse.coachhelm.profile.genome`) | coachhelm-profile.test › CH-13260 |
| CH-13221 | Ask: The chat context (the program) does not load | A notice with Try again (a page refresh) and no composer; the loader returns a failed result and logs it, never a thrown page | `coachhelm-chat.ts`, `States` | coachhelm-ask-loader.test › CH-13221 |
| CH-13222 | Ask: The chat list does not load | A notice in the chat list with Try again, never "No chats yet"; the loader flags it and logs it | `coachhelm-chat.ts`, `History` | coachhelm-ask-loader.test › CH-13222 |
| CH-13223 | Ask: The pulse does not load | A notice with Try again in place of the findings, and the chat still works; the loader returns pulse null, never an empty list | `coachhelm-chat.ts`, `Home` | coachhelm-ask-loader.test › CH-13223 |
| CH-13224 | Ask: A conversation or its messages do not load | A notice with Try again and no composer to write into it; the loader returns threadFailed, never an empty thread | `coachhelm-chat-thread.ts`, `States` | coachhelm-ask-loader.test › CH-13224 |
| CH-13225 | Ask: One section of the page crashes | That section shows a notice; the rest of the page stays usable | `Ask` (`SectionBoundary`) | coachhelm-ask.test › CH-13225 |
| CH-13250 | Ask: A read tool behind an answer failed | "Could not read this:" + the reason, in the evidence, never shown as no data | `Evidence` | coachhelm-thread-ui.test › CH-13250 |
| CH-13251 | Ask: An answer fails while it streams | The answer says it failed, with Ask again; nothing partial is kept as an answer | `Thread` | coachhelm-thread-ui.test › CH-13251 |
| CH-13252 | Ask: An answer arrives malformed and is rejected | "This answer didn't finish coming through, so it isn't being shown. Please ask again." | `Thread` | coachhelm-thread-ui.test › CH-13252 |
| CH-13253 | Ask: A confirmed action failed or only partly completed | The receipt says it was not completed and why; Ask again asks CoachHelm to propose it again | `ActionCard` (receipt) | coachhelm-thread-ui.test › CH-13253 |
| CH-13254 | Ask: The conversation moved past a card that was never answered | No buttons; the card says nothing was created | `ActionCard` | coachhelm-thread-ui.test › CH-13254 |
| CH-13255 | Ask: The evidence panel is opened for a player the conversation has nothing on | It says so, never an empty panel | `EvidencePanel` | coachhelm-thread-ui.test › CH-13255 |

## 133xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-13301 | Player: no round posted yet | "Post a round to start CoachHelm" + "CoachHelm reads the rounds you post. Once there is enough to go on, one thing to work on this week shows up here." Start a round once round entry is rebuilt; until then "Open Rounds" | `EmptyState size="page"` in `PlayerBoard` | coachhelm.test › CH-13301 |
| CH-13302 | Player: rounds posted, no insight yet | "No insights yet" + "You’ve posted 3 rounds. CoachHelm needs enough rounds to find a pattern worth acting on. Every round you post sharpens the read." No threshold is named (the generators each set their own); the count is left out when it can't be read. The same page when every insight on file states no finding ("no clear preference", "Scoring by par type"): the player's board draws no such card | `EmptyState size="page"` | coachhelm.test › CH-13302 |
| CH-13303 | Player: every insight is a strength | "Nothing needs work right now" + "CoachHelm found nothing to fix in the rounds you’ve posted. What is working is listed beside this." The Working list stays | `EmptyState` in the focus's place | coachhelm.test › CH-13303 |
| CH-13304 | Player: CoachHelm is off for them (the board, and Game profile, Standing and Deep dive, which say the same, answered at once and with no sub-navigation) | "CoachHelm is off for your team" + "Your coach turned it off: “…”. Ask your coach if you want it back on." (the coach's own words when there are some; otherwise "CoachHelm is turned off, so no insights are being shown.") | `EmptyState size="page"`, `HelmOff` | coachhelm.test › CH-13304, coachhelm-profile.test › CH-13304 |
| CH-13305 | Coach: CoachHelm is off (by them, by the team, or globally) | "CoachHelm is off" + "You have turned CoachHelm off…" / "Your team has turned CoachHelm off…" + "Turn it back on in Settings to see signals again." + Open CoachHelm settings; a global switch says "CoachHelm is turned off for GolfHelm right now" and has no link. Ask is CoachHelm's, so `?view=ask` is this same page, no chat is read, and the Board and Ask strip is not drawn; a gate lookup that failed there is Ask's own "did not load" notice, never a chat | `EmptyState size="page"` in `CoachBoard`, `ClubhouseCoachHelmRoute` | coachhelm.test › CH-13305, coachhelm-audit.test › CH-13305 |
| CH-13306 | Coach: players on the team, no signal yet | "No signals yet" + "CoachHelm reads posted rounds. Each player’s insights appear once they’ve posted enough rounds to find a pattern." + View roster. The pulse still shows | `EmptyState size="page"` | coachhelm.test › CH-13306 |
| CH-13307 | Coach: no players on the team | "Add players to start CoachHelm" + "CoachHelm reads the rounds your players post. Invite players from Roster, and their insights show up here." + Open roster | `EmptyState size="page"` | coachhelm.test › CH-13307 |
| CH-13308 | Coach: not on a team | "You aren't on a team yet" + "Once your team is set up, CoachHelm reads the rounds your players post and shows their signals here." Not an error, not a redirect | `ClubhouseCoachHelmRoute` | coachhelm.test › CH-13308 |
| CH-13309 | Coach: the pulse has nothing flagged | "Nothing is flagged in the pulse right now." It doesn't claim all is well | the pulse section | coachhelm.test › CH-13309 |
| CH-13310 | Coach: some players have no insight yet | "1 player has no insights yet." (or "3 players have") under the list | `CoachBoard` | coachhelm.test › CH-13310 |
| CH-13360 | Profile: no measure has enough rounds yet (no genome row, or one with nothing computed) | "Your game profile starts with a few rounds" + "CoachHelm reads how you play from the rounds you post. Each measure has its own minimum, so they fill in one at a time. Nothing is estimated before then." + Start a round (until round entry is rebuilt, Open Rounds), and below it "What it will read": the seven measures locked, each with what it needs | `EmptyState size="page"` in `Profile` | coachhelm-profile.test › CH-13360 |
| CH-13361 | Profile: some measures have enough rounds and some do not (an early read) | "4 of 7 measures have enough rounds so far. The rest fill in as you post more; none is estimated in the meantime." above the page; each locked measure says "Needs more rounds" and the least data it reads from, with no word, figure, marker or read | `Profile` (`ch-hg-early`, `ch-hg-m.is-locked`) | coachhelm-profile.test › CH-13361 |
| CH-13320 | Ask: A conversation that is gone or not the coach's | An alert with Start a new chat, and the composer still works; on the phone it points at History | `States`, `coachhelm-chat-thread.ts` | coachhelm-ask-loader.test › CH-13320 |
| CH-13321 | Ask: The roster is empty | The first-run page with the team name, Open roster and the sub-tab strip, and no composer | `States` | coachhelm-ask-loader.test › CH-13321 |
| CH-13322 | Ask: Players but no recorded round | The greeting carries the nothing-to-report line; no strokes or trending opener, and the cards are only what the data supports | `coachhelm-chat.ts` (noRounds), `Home` | coachhelm-ask-loader.test › CH-13322 |
| CH-13323 | Ask: No chats yet | "No chats yet" with New chat, not a search box over nothing (desktop panel and phone drawer) | `History` | coachhelm-ask.test › CH-13323 |
| CH-13324 | Ask: A chat search with no match | Search chats filters by title, and no match says so | `History` | coachhelm-ask.test › CH-13324 |
| CH-13325 | Ask: Rounds recorded, nothing flagged | The pulse says nothing is flagged, not that nothing has been recorded | `Home` | coachhelm-ask.test › CH-13325 |
| CH-13350 | Ask: A read tool found nothing recorded | The evidence says nothing is recorded for it, distinct from a failed read (CH-13250) | `Evidence` | coachhelm-thread-ui.test › CH-13350 |

## 134xx Loading

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-13401 | The player's page is on its way | The header, the focus card beside a short list of rows, in place; `aria-busy`, "Loading CoachHelm" | `CoachHelmSkeleton` via `coachhelm/loading.tsx` (`ClubhouseSwitch`) | coachhelm.test › CH-13401 |
| CH-13402 | The coach's page is on its way | The header, the pulse, then the players beside the focus card, in place | `CoachHelmSkeleton` (the role comes from the signed-in user; the player's shape until it is known) | coachhelm.test › CH-13402 |
| CH-13403 | Assign or Dismiss is saving | The button reads "Assigning" or "Dismissing" and every control waits (Undo reads "Undoing") | `CoachBoard` (`useAction` pending) | coachhelm.test › CH-13403 |
| CH-13404 | A player's Accept or Decline is being sent | The pressed button reads "Accepting" or "Declining" and both buttons of that focus area are disabled until it lands; another proposed focus area is its own | `Proposals` (`useAction` pending) | coachhelm.test › CH-13404 |
| CH-13460 | Profile: the Game profile is on its way | The header, the sub-navigation's place, the persona card and six measure cards, at their final height, in place; `aria-busy`, "Loading your game profile". Drawn by the profile's own Suspense (keyed by view), because `coachhelm/loading.tsx` cannot read `?view=` | `ProfileSkeleton` | coachhelm-profile.test › CH-13460 |
| CH-13420 | Ask: The chat page loads | A skeleton (aria-busy) that draws the sub-tab strip, the chats and the greeting in place, with no script | `AskSkeleton` | coachhelm-ask.test › CH-13420 |
| CH-13421 | Ask: A reply is streaming | Send becomes Stop; Stop is silent | `Composer` | coachhelm-ask.test › CH-13421 |
| CH-13450 | Ask: An action was confirmed and is being carried out | "Confirmed. Working on it." in place of the buttons | `ActionCard` | coachhelm-thread-ui.test › CH-13450 |

## 135xx Confirm

None. Dismiss is undoable, so it doesn't ask: the notice (CH-13901) keeps Undo in place.

## 136xx Motion

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-13601 | An insight is assigned or dismissed, or a proposed focus area is answered | The Assigned chip, the dismissed notice or the Started or Declined chip (CH-13902) rises in (base). With reduced motion or Animations off it appears at once | `.ch-hl-done`, `.ch-hl-dis`, `ch-hl-rise` | coachhelm.test › CH-13601 |
| CH-13602 | Hovering an insight row or a player | The row tints (quick) | `.ch-hl-row:hover`, `.ch-hl-pl:hover` | preview |
| CH-13620 | Ask: Hide chats | The panel folds away (inert) and Show chats and New chat move into the header; Show chats brings it back | `History` | coachhelm-ask.test › CH-13620 |
| CH-13621 | Ask: The phone drawer is dragged | A drag left past 80px closes it; a nudge of a few pixels leaves it open | `History` | coachhelm-ask.test › CH-13621 |

## 137xx Haptics

| # | When | They feel | How | Test |
| --- | --- | --- | --- | --- |
| CH-13701 | A player or an insight row is picked | Selection | `InsightRow`, the player buttons | coachhelm.test › CH-13701 |
| CH-13702 | Assign as focus is tapped | Light (press) on the tap; success when it lands, error when it doesn't (`useAction`) | primary `Button`, `useAction('coachhelm.assign')` | coachhelm.test › CH-13702 |
| CH-13703 | Dismiss is tapped | Warning, before the write; then success when it lands | `CoachBoard` | coachhelm.test › CH-13703 |
| CH-13704 | Accept or Decline is tapped | Accept: light (press) on the tap, as any primary button; Decline: silent, as a ghost button. Success when either lands, error when it doesn't (`useAction`) | `Proposals`, `useAction('coachhelm.acceptFocusArea')`, `useAction('coachhelm.declineFocusArea')` | coachhelm.test › CH-13704 |
| CH-13721 | Ask: An opener pill or shortcut card is tapped | The select haptic, and the question is sent | `Home` | coachhelm-ask.test › CH-13721 |
| CH-13752 | Ask: A follow-up is tapped | The select haptic; follow-ups show on the last answer only, and not while it works | `Thread` | coachhelm-thread-ui.test › CH-13752 |

## 138xx Accessibility

| # | When | They get | How | Test |
| --- | --- | --- | --- | --- |
| CH-13801 | A screen reader moves through the page | The page is labelled by "CoachHelm"; each section is a labelled region ("Program pulse", "By player", "Also worth knowing", "Working"); the claim is the focus card's heading | `main aria-labelledby`, `section aria-labelledby` | coachhelm.test › CH-13801 |
| CH-13802 | A gauge | The track is hidden from screen readers; the legend says every number in words: "You · 1.1", "Tour 0.3" ("LPGA Tour 0.4" for a women's team), with the sample and the window beside it. A college cohort is never drawn, in the legend or in the reasoning (Q-88); where the tour has no value for the metric there is no comparison and no gauge, and the sample and window still show | `Gauge`, `gaugeFor` | coachhelm.test › CH-13802 |
| CH-13803 | An insight or player row | One button named for its category, title, priority in words, and value; the player buttons are toggles (`aria-pressed`) | `InsightRow`, the player buttons | coachhelm.test › CH-13803 |
| CH-13804 | Why we think this | A disclosure button that names what it controls (`aria-expanded`, `aria-controls`); it opens closed on every insight | `FocusCard` | coachhelm.test › CH-13804 |
| CH-13805 | Choosing another insight or player | The focus is a polite live region, so the change is announced | `aria-live="polite"` around the focus | coachhelm.test › CH-13805 |
| CH-13806 | Priority | The pill is a word (Priority, Worth closing, Minor, Working for a strength, Note for a card that states no finding, Out of date for a read older than the newest round, Assigned or Acknowledged for a finding already acted on), never colour alone; the rows say it in words too | `PriPill` | coachhelm.test › CH-13806 |
| CH-13807 | The player's proposed focus areas | A labelled region, "Proposed for you", above the focus; each focus area's two buttons are a group named "Answer Lag putting"; the answer is a `role="status"` chip (CH-13902), so it is announced | `Proposals` | coachhelm.test › CH-13807 |
| CH-13860 | Profile: a screen reader moves through the page | The page is labelled by "CoachHelm"; the shape of the game is a region named by its sentence, "Every measure" a region, each measure an item named by its measure. Every number is in words next to the figure; the scale is decoration, hidden from assistive tech. The persona's call is a word (Strength, Worth watching) as well as a colour; a "How it is measured" disclosure is a native details element | `Profile` | coachhelm-profile.test › CH-13860 |
| CH-13820 | Ask: The chat page | One landmark labelled Ask CoachHelm, with the chats as a complementary region | `Ask` | coachhelm-ask.test › CH-13820 |
| CH-13821 | Ask: A player is mentioned | Typing @ or the mention button opens the roster; arrow keys and Enter pick, and the mention is text in the box; an empty roster says so | `Composer` | coachhelm-ask.test › CH-13821 |
| CH-13822 | Ask: The phone Chats button | Opens the drawer; Esc, the scrim and choosing a chat close it | `History` | coachhelm-ask.test › CH-13822 |
| CH-13823 | Ask: The open chat in the list | Marked as the current one (aria-current) for assistive tech | `History` | coachhelm-ask.test › CH-13823 |
| CH-13850 | Ask: CoachHelm is working on an answer | What it is doing is announced politely (a live region), step by step | `Thread` | coachhelm-thread-ui.test › CH-13850 |
| CH-13851 | Ask: The evidence control | A button that opens the evidence as a labelled dialog | `Evidence`, `EvidencePanel` | coachhelm-thread-ui.test › CH-13851 |
| CH-13852 | Ask: Evidence drawn as a chart | View as table shows the same numbers as a table | `Evidence` | coachhelm-thread-ui.test › CH-13852 |

## 139xx Network and UX

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-13901 | An insight is dismissed | The focus card is replaced by "Insight dismissed. It no longer shows on your board or on Jonah’s. Undo brings it back." (`role="status"`) with Undo; the player's row reads "Dismissed"; that player's count drops by one when the card was one of their open signals. Nothing refreshes the page away from the notice | `CoachBoard` | coachhelm.test › CH-13901 |
| CH-13902 | A proposed focus area is accepted or declined | The two buttons are replaced by a chip, "Started · Lag putting" or "Declined · Lag putting" (`role="status"`), with no toast. It stays while the page is open, and a reload reads the server again (the answered focus area is then no longer proposed). Nothing refreshes the page away from it | `Proposals` | coachhelm.test › CH-13902 |
| CH-13903 | A read is older than the player's newest completed round | The pill reads Out of date and a note sits beside the claim: "A round played Sep 30 isn’t in this read yet, so it may not match the rounds posted since." (`role="note"`), with the "As of Sep 28" line (CH-13905). It does not lead while a current finding exists, and it is not counted as an open signal. Out of date is: last refreshed on an earlier day than the newest completed countable round, or evidence whose window ended more than its own window before that round (a lifetime value has no window; a row that says neither cannot be told). It is marked, never hidden, and nothing is written: the row is untouched | `FocusCard`, `staleSince` in `coachhelm-classify.ts`, the loaders' `newestRounds` | coachhelm-audit.test › CH-13903 |
| CH-13904 | Coach: a player's top card states no finding (a note) | The card draws its claim and no number, gauge or read, the pill reads Note, and there is no Assign and no Dismiss: "This card states no finding, so there is nothing to assign." The player is listed with 0 open signals and sorts last. The generators' "nothing to fix" rows (tee strategy sharp or inconclusive, putt break balanced) and every `feed_exempt` row (Scoring by par type, the hole 1 warm-up) are notes; the player's own board does not draw them | `CoachBoard`, `isNote` in `coachhelm-classify.ts` | coachhelm-audit.test › CH-13904 |
| CH-13905 | A card says when its read was made | "As of Sep 30" in the evidence footer: the day the read was last refreshed (`metadata.last_refreshed_at`, UTC), else the day its evidence window ended; nothing when the row says neither | `Evidence` | coachhelm-audit.test › CH-13905 |
| CH-13906 | Coach: the top read is out of date | Assign as focus is not offered; "This read is older than Jonah’s newest round, so it can’t be assigned as a focus yet." Dismiss stays | `CoachBoard` | coachhelm-audit.test › CH-13906 |
| CH-13920 | Ask: Send while offline | Refused before anything is sent: the shell toast CH-1903 and an error haptic; the text stays. A pill tapped offline is refused the same way | `Composer`, `Ask` | coachhelm-ask.test › CH-13920 |
| CH-13921 | Ask: A send fails | The text comes back once, into an empty box, never over what was typed since | `Composer` | coachhelm-ask.test › CH-13921 |
| CH-13922 | Ask: A new thread starts | It lands in History at once, titled by the first question, and the address names it | `Ask` | coachhelm-ask.test › CH-13922 |
| CH-13923 | Ask: The sub-tab strip | Board and Ask as one radiogroup; Board is a route change. Not drawn when CoachHelm is off (CH-13305) | `SubTabs` | coachhelm-ask.test › CH-13923 |
| CH-13930 | Player: the sub-navigation | Board, Game profile, Standing and Deep dive as one radiogroup of views of this page, on the board and on every view (desktop: below the header; phone: a row of chips that scrolls sideways above it, the current one pressed and brought into view). A choice is a route change to its address. Not drawn when CoachHelm is off (CH-13304) | `PlayerHelmTabs` | coachhelm-views.test › CH-13930 |
| CH-13931 | Player: Development | A link after the views, not a radio: it leaves this page for Stats' Development tab (`/golf/dashboard/stats?tab=dev`), and is drawn only while that screen is rebuilt | `PlayerHelmTabs` | coachhelm-views.test › CH-13931 |
| CH-13950 | Ask: Copy an answer | Copies the answer as plain text and says so | `Thread` | coachhelm-thread-ui.test › CH-13950 |
| CH-13951 | Ask: CoachHelm proposes an action | A card with what it will do, Confirm and Cancel | `ActionCard` | coachhelm-thread-ui.test › CH-13951 |
| CH-13952 | Ask: A proposed action is cancelled | "Cancelled. Nothing was created." | `ActionCard` | coachhelm-thread-ui.test › CH-13952 |
| CH-13953 | Ask: A confirmed action lands | The receipt says what was created, links only to a screen that is rebuilt, and states Confirmed once | `ActionCard` (receipt) | coachhelm-thread-ui.test › CH-13953 |
