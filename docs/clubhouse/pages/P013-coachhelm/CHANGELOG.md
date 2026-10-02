# P013 — CoachHelm: changelog

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification
log and decisions).

## 2026-10-01 — Aesthetic audit: a two-line metric label takes caption leading

```text
PR/commit:      agent/swap-audit (#2111): 6f5f08123
Design package: none (owner's aesthetic audit guide, 2026-10-01)
Contract IDs:   none new
Actions:        none
Data impact:    none; visual only
Held items:     none
```

- **Issue.** The evidence chart's metric label ran at line-height 1.0; on a
  phone it wraps ("Downhill penalty vs level putts (distance-controlled)", 286px
  at 390px) and the two lines touched.
- **Fix.** `coachhelm.css`: `.ch-hl-ev__l` is 12.5px at 1.3. Nothing in
  `src/lib/coachhelm` or any data path changed.
- **Not done, on purpose.** The Program pulse card keeps its reserved height (a
  performance rule: nothing below moves when the rows land); the three
  filter-chip languages are Q-148.
- **Verification.** Before and after at 375, 390, 430 and 1440, coach and
  player. `coachhelm-views.test.tsx` 22 of 22.

## 2026-10-01 — The CoachHelm gate reads in two round trips

The gate (`src/lib/coachhelm/v2/gate.ts`) stood in front of every CoachHelm
view and read in turn: the coach row, the coach's settings, the staffed
teams, then each team's settings. It is shared with Fairway, the chat route
and the actions, so its answer must not change.

```text
PR/commit:      agent/swap-audit (its own commit: "coachhelm gate: the reads
                that do not depend on each other start together")
Contract IDs:   none changed
Data impact:    none; the same tables, the same filters, read-only
Held items:     none
```

- **What changed.** The row, the settings and the staffed teams (a player's
  row and memberships) start together; every team's settings come in one read
  (`.in('team_id', ids)`; `team_id` is unique on `golf_team_coachhelm_settings`).
  A coach gate is two round trips, not four; a closed gate with three teams
  was six reads in turn and is four reads in two.
- **The answer is the same.** `gate-batching.test.ts` runs the batched gate
  and `gate-serial.reference.ts` (a frozen copy of the serial one) over the
  same fake database in every combination of each read's outcome (the row
  found, missing or failed; the settings enabled, off, off with no reason,
  missing or failed; no teams, a failed staff read, or one to three teams each
  enabled, off, off with no reason, null, missing or failed): over 1,000
  worlds, equal in every one. It also states the rules outright: a failed row
  is never enabled (LIVE-17), a missing row is the enabled default, a coach
  who switched it off is off before any team is looked at, a gate is off only
  when every team is, and it names the first reason given.
- **A read nobody needed is dropped unseen.** The settings of a coach whose
  row is missing are started anyway; their result, or their failure, is
  ignored, and a rejection nobody awaits is handled (a test pins it).
- **Left as it is, and worth a decision.** A failed read of a team's settings
  reads as "enabled" (`error || !data` is null, and null is the enabled
  default), in the serial version and in this one. Only the coach or player
  row fails closed. A batch that fails answers the same for every team it
  covered as each failed single read did, so the answer cannot differ by
  one team succeeding and another failing; it can differ from the serial
  version only on a transient failure that hit the batch and would have
  missed every single read, which the rule above already treats as enabled.
  Whether a failed team read should close the gate is the owner's call: it is
  a product and safety decision, not changed here.

## 2026-10-01 — Owner rules: a failed read is never an empty page

Owner, 2026-10-01: never show 0 strokes, "No rounds yet", "no insights" or an
empty table while loading or after a failed read; separate first load, refresh,
empty, error and a refresh that failed over old data; a stale response never
wins; the board frame and the top card first, the rest streams; a back
navigation returns to what the list showed. Standard:
`docs/clubhouse/PAGE_PERFORMANCE.md`.

```text
PR/commit:      agent/swap-audit (phase commits, see the list below)
Design package: none (notices reuse InlineNotice; no new surface)
Contract IDs:   CH-13206, CH-13207, CH-13208, CH-13226, CH-13272 (new);
                CH-13221, 13223, 13309, 13322, 13325 reworded
Actions:        none
Data impact:    none; no write, no cache, no new table. The reads are the
                ones the page already made; each now says when it failed
Held items:     none
```

### Phase 1: false empties and silent degrades

- **Ask roster.** `loadActiveRoster` swallowed a failed membership read and
  answered `[]`, which Ask drew as "Add players". `loadActiveRosterResult`
  says it failed, the chat context carries `roster_failed` (absent when the
  read landed, so Fairway is unchanged), and the loader answers the context
  failing (CH-13221, Try again). An empty roster that read is still the
  first-run page.
- **Program pulse.** Supabase answers a failed read as `{ error }` and does not
  throw, so `safeRows` and `safeCount` read it as no rows: a failed rounds read
  became "N players have no recorded rounds", "Nothing to report yet" and an
  empty opener list. `ProgramPulse.failed` now names the reads that failed
  (absent when none did; `items` and the counts are what they were, Fairway
  reads them). The Clubhouse layer drops an item made from a failed read,
  says what is missing (CH-13206 on the board, CH-13226 on Ask) and says
  "Nothing is flagged" (CH-13309, CH-13325) and "Nothing to report yet"
  (CH-13322) only when every read landed. A rounds read that failed leaves the
  coverage line and the counts behind the openers unused ("Brief me" still
  shows). The phone Ask Home, which draws no findings, now says when the pulse
  did not load (CH-13223).
- **Pulse over a roster that did not read.** The pulse resolves its own chat
  context, and when the membership read fails that context's roster is empty:
  `getProgramPulse` answers an empty program with no `failed`, which the board
  drew as "Nothing is flagged" (CH-13309). `pulseOf` now reads the
  request-cached context beside the pulse and answers the pulse not loading
  (CH-13203, logged as `pulse`) when `roster_failed` is set. A roster that read
  and is empty is unchanged, and so is what Fairway's callers get.
- **Dead retry.** Ask copied the chats list into state once; History's Try
  again re-ran the server render, but the key did not change and the copy was
  never replaced, so "your chats didn't load" stayed up. The list is now the
  server's, read each render; a chat started in this visit is kept beside it
  until the server's list holds it.
- **Reads beside the top card** (`ChBoardMissing`, present only when one
  failed) are each a decision, in the table below and the notes after it.

| Read | On failure we show | Before |
| --- | --- | --- |
| Drills | CH-13208, drill text missing | a short card |
| Assigned | coach CH-13207, no Assign | Assign offered |
| Declined | coach CH-13207, no Assign | Propose again hid |
| Newest round | CH-13208 and CH-13207 | a clean board |
| Tour values | CH-13208, comparison gone | "no comparison" |
| Deep dive team | CH-13208 on the page | ignored |
| Standing cohort | CH-13272 over the rows | men's Tour, as fact |

- **Why, per read.** Drills: the name and length stay, the text is said to
  be missing, and nothing else depends on it. Assigned and declined: "nothing
  is assigned" is not what a failed read says, so neither Assign nor Propose
  again is offered and neither claim is made (Dismiss stays: it depends on
  neither); the player's board and the Deep dive have no Assign, so they say
  it as CH-13208. Newest round: a clean board and the open-signal counts were
  drawn over reads that may be stale; CH-13906 already withholds Assign for a
  stale read, and an unknown one is held back the same way. Tour values or
  the team they come from: the card keeps what it has, says the comparison is
  unavailable, and a strength may read as a finding without it, which the
  notice says.
- **Tour read.** `loadTourBenchmarks` (Stats, not this page's) logs a failed
  read and answers the same empty map as a tour with no rows, so the Tour's
  values are read in `coachhelm.ts` with their error.
- **Standing cohort.** It is probed beside the standing read
  (`loadPlayerStandingMap` resolves it inside and cannot say it fell back, and
  `standing/loader.ts` is not this page's): the two lookups can disagree on a
  transient failure, so the probe catches a failing lookup and is not a proof
  of the one the map used. The men's fallback stays for the generators and
  the nightly job, now marked `failed`.
- **Tests.** `coachhelm-failed-reads.test.tsx` fails each read through
  `supabase-fake` (the assigned read alone, the declined read alone, and so
  on) and asserts the failure copy, never the empty or zero copy, and never
  Assign; `program-pulse-failed-reads.test.ts`, `chat-roster-failed.test.ts`,
  `player-cohort-failed.test.ts` and `coachhelm-ask-races.test.tsx` (the retry)
  cover the library and the Ask frame.

### Phase 2: pending scope and races

- **Pending is one player's.** The write hooks are hook-wide (`useAction`'s
  in-flight guard is one ref), so while Jonah's Assign ran, Eli's card read
  "Assigning" too. The player a write is for is now set inside the action
  (so a toast's Retry sets it too) and only that card says "Assigning",
  "Dismissing" or "Undoing" (CH-13403). Another card, opened meanwhile, shows
  its own button as it is, disabled: one write is in flight at a time, and a
  tap on it would be dropped as busy. Proposal rows were already per row.
  Changed by design: the CH-13403 catalog row says so; no assertion changed
  (the existing tests check the card the write is for).
- **Retries.** Every Try again on these pages is `RefreshNotice`
  (`useRefresh`): it says "Trying again", is disabled while it runs and
  ignores a second tap. No screen calls `router.refresh()` bare any more
  (`coachhelm-retry.test.tsx` renders each failed state and retries it, and
  greps the screens). The `onRetry` props that carried it through Proposals,
  History, the Ask home and the Deep dive's parts are gone.
- **New chat during a send.** New chat (all three entry points: the panel,
  the phone's header, the thread) now stops a reply that is on its way first,
  and the id that arrives late for the chat that was left is not adopted: the
  frame keeps which send is waiting for its chat's id, and an id for any other
  does not move the address, retitle the new chat or list anything. A chat
  left by opening another is the same (the replaced frame ignores it).
  Residual, in code this page does not own: the hook's own `conversationId`
  can still take a late id after `newConversation()`, so a question asked in
  the new chat would go to the abandoned one. The stop makes this window the
  few microtasks between the header arriving and the click; it is not closed
  from this side without editing `components/golf/coachhelm/**`.
- **A name over another's card.** The coach board and the player board kept
  the picked player or read by id and fell back to the first player or the
  default focus when it left the data after a refresh, in silence. They keep
  the name too, and say so (CH-13908, CH-13909).
- **Rapid switching.** `view-switch-boundary.test.tsx` taps Board, Game
  profile, Standing and Deep dive through the real tabs and `useViewSwitch`:
  the tabs follow the last tap, the view on screen stays busy, an earlier
  choice that lands late changes nothing, and a tap back to the view on screen
  sends the page back to it.
- **Left alone.** History is not team-scoped (a coach on two teams sees both
  teams' chats): a documented product question, unchanged.

### Phase 3: the board and the top card first, the pulse streams

- **The pulse.** It was a chain of seven reads that only the pulse card used,
  yet the loader awaited it before it answered, and before every early return.
  `loadCoachCoachHelm` now hands it over still on its way
  (`ChCoachHelmData.pulse` is a `ChPulse` or a `Promise<ChPulseResult>`: `ok`
  with the pulse, or `failed`; it never rejects, `handled`, and a read that
  threw is logged and drawn as the pulse not loading, CH-13203).
  `CoachBoard` reads it with `use()` in the card's own `<Suspense>`; the board
  waits for seven reads in a row (the gate, then four) instead of ten
  (`coachhelm-reads.test`). The early returns (a roster or players that did
  not read) hand it over too, so a failure notice no longer waits for it.
- **A card that holds its place** (CH-13405). The slot under "Program pulse"
  keeps the height of three rows, whether the skeleton, the rows or a notice
  are in it, so nothing below moves when the pulse lands: zero shift for the
  desktop's six items in two columns. Cost, for the owner: a pulse of one or
  two items sits in a card with room under it, and a phone's single column
  past three rows grows the card, which is the one case that shifts.
  Moving the card under the top card would end the shift for good; it is a
  change to the board's order and is not done here.
- **Never a false empty while it loads.** The skeleton is not "Nothing is
  flagged"; that line (CH-13309) is only for a pulse whose reads all landed.
- **Exposure.** The delivery actions (`getTopInsightsForPlayers`,
  `getInsightsForPlayer`) record what they return as shown. The pulse was
  never one of them and starts after the gate as before. A render test counts
  calls: once per render, after the gate answered, none for a board that is
  off, and the pulse landing adds none (`coachhelm-streaming.test`).
- **Not done, and why.** Player Proposals: its read is in the same wave as the
  top card's other reads (drills, assigned, newest round), so streaming it
  saves no depth, and it draws above the focus card, so a late arrival would
  push the card down. Ask: the pulse feeds the new-chat page's greeting, the
  pills, the coverage line and the findings, and the chats list is one wave
  beside the thread; splitting them would reshape `ChAskData` and its
  fixtures for no depth won, so it is left as it is.
- **Assertions changed by design.** `coachhelm-reads.test`: the board's depth
  10 became 7 (the pulse is no longer waited for) and the pulse's hops are
  excluded from the count; `coachhelm.test` reads the pulse the loader hands
  over by awaiting it (`pulseLanded`) in three assertions (the same rows and
  flags as before).

### Phase 4: Back returns to what the coach or player had picked

- **Kept for the tab, never written to the address.** The coach's board keeps
  the player picked, the player's board the read picked and the Deep dive the
  read open, each in the shell's `useChSessionState` (tab scoped, keyed by
  route and team, so Back, or another view and back, returns to it). The
  screens do not touch the address or the history at all. The first version of
  this phase (`4bf4c16f9`) wrote the pick to `?player=` and `?insight=` with
  `history.replaceState(window.history.state, ...)`; a review found it wrong
  and this follow-up replaces it. Next's patched `replaceState` skips its
  router sync when it is handed an entry's own `__NA` state (`app-router.js`),
  so the router's canonical URL never learned the parameter: the next
  `router.refresh()` (every Try again) or revalidating action (Assign,
  Dismiss, Undo, Accept, Decline) navigates to the old canonical URL, which
  resets the address and can push a second history entry. `url-state.ts` is
  deleted.
- **`?player=` and `?insight=` are read-only inputs.** They arrive as the
  props the route makes from them (`initialPlayer`, `initialId`). One named on
  arrival wins over a kept pick, as a link from Roster must, and it is looked
  up every render, not once: a first load that failed or came back empty,
  then answered by Try again, still opens on the player or read named. With
  none named the kept pick returns. A pick by hand stands until the server
  hands down a different value (a new link is a new opening). A value that is
  not on the page is ignored. The route hands `?insight=` to the Deep dive
  only (the player's Board no longer takes it), so a view switch, whose tab
  links carry none, cannot open the next view on the last view's read.
  Known: Back to an entry that was opened with `?player=Eli` reopens Eli, not
  a later pick by hand, because a link and a Back cannot be told apart.
- **Hydration.** Every view sits in the route's one Suspense, so a hard reload
  can hydrate one after `RouteFrame` has marked the app running, which is
  when `useChSessionState` reads storage: a kept pick would be drawn over
  server markup made from the default (a hydration error, reproduced in
  `coachhelm-return-state.test`). The three views mask the kept value with
  `useHydrated` (`useSyncExternalStore`: the default during the hydration
  pass, the kept value in the render React does straight after, and from the
  first render on a client navigation, so nothing flashes). The hook itself
  is the shell's and has the same hole for every other page that uses it.
- **The phone's pushed read.** A kept read that was open comes back open (the
  pushed screen); the screen's own back closes it and forgets it. Known: a
  return after leaving from inside the open read pushes a second history entry
  (`usePhoneStackHistory` starts at zero and the entry it restored already
  stands for the screen), so one more Back is needed; that is the shell
  hook's, not changed here.
- **Ask.** The unsent message is kept in this tab per team, coach and chat
  (the new chat is its own), cleared by a send or an emptied box, and moved to
  the chat's own id when the new chat gets one (`chat/drafts.ts`, precedent
  `messages/drafts.ts`). New chat leaves the chat it was typed in with its own
  draft and the box shows the new chat's: the text is not carried across (the
  box used to keep it). The History search and the chats panel are kept the
  same way (`useAskKept`). All three are restored in an effect after mount,
  never during the render, for the hydration reason above. The phone's chats
  drawer is a modal and is not kept.
- **Known limit, Ask's `?c=`.** Ask names a new chat in the address with the
  same `replaceState` call (`chat/Ask.tsx`, CH-13922, which predates these
  rules), so it has the same router blind spot: a `router.refresh()` (the Try
  again of History or Home) or a revalidating action after a chat was started
  can reset the address to the one Next knows and may push a second entry. Not
  changed here.
- **Scroll is the shell's.** `RouteFrame` records `#ch-canvas` and the window
  per route and team and restores them on Back or Forward (the lead's, commit
  e9b833761), so this page adds no scroll code: a second restore would race
  the shell's. Not covered by it: the Ask thread's own scroller and the
  Deep dive's phone screen scroller.
- **Assertions changed by design.** None remain from this phase: the address
  resets it first added to `coachhelm.test`, `coachhelm-dive.test` and
  `coachhelm-selection.test` are taken out again, as nothing writes the
  address now. `coachhelm-return-state.test` is rewritten for the session
  state (it passed for the wrong reason before: it read back the address the
  screen had just written, and a remount at the same address stood for Back).
- **Not verified in a browser.** Next's `replaceState` behaviour was read in
  `node_modules/next/dist/client/components/app-router.js` (Next 16.3.6), and
  the screens no longer rely on it; Back, a hard reload with a kept pick and
  the phone's pushed read were exercised in jsdom only.

## 2026-10-01 — Page performance: reads in parallel, a view switch that keeps the view

Owner, 2026-10-01: "Everything page transition and load needs to be extremely
smooth and accurate." Standard: `docs/clubhouse/PAGE_PERFORMANCE.md`.

```text
PR/commit:      agent/swap-audit: 81ce79e83 (reads), ae0e78355 (view switch
                and route), plus the skeleton strip and these docs
Design package: none
Contract IDs:   none changed (no state added or removed)
Data impact:    none; no write, no cache, no new read
Held items:     none
```

- **Reads.** The coach's board went from 13 serial waves to 10
  (`coachhelm-reads.test`, each wave a round trip): once the gate has answered,
  the program pulse (a chain of seven) and the team's Tour start beside the
  roster and are waited for last, and the follow-up reads do not wait for
  them. The Deep dive went from 10 to 5: the team, the plans and the category
  reads start with the feed instead of after it.
- **Never early.** The delivery actions record every insight they return as
  shown, so the feed and the top insights are still read once, after the gate,
  and a board that is off reads nothing else (both pinned).
- **One Suspense.** Board, Ask, Game profile, Standing and Deep dive are one
  async view inside one `<Suspense>` that is not keyed by view. The old key
  drew the next view's skeleton over the view on screen, after waiting for the
  CoachHelm gate to show even that. Now a switch keeps the view on screen,
  dimmed and not tappable, and replaces it once; the skeleton is for a hard
  load, and is the one the address names (the route's `loading.tsx` cannot see
  `?view=`). The gate is read inside the boundary.
- **The strip.** The tap moves it at once (`useViewSwitch`, the F-55 pattern:
  `useTransition`, the target held until the server answers, `aria-busy` on
  the page) and the header stays crisp. Choosing a saved chat in Ask is the
  same switch: its row takes the selected look at once (a click for a new tab
  is still the link), the conversation dims and the list of chats stays
  crisp, until the thread lands. The route skeletons now draw the strip's
  place and height (38px desktop, 44px phone); before, it arrived with the
  page and pushed everything under it down.
- **Not cached, not prefetched.** A server cache here cannot be shown
  correct: the delivery actions write as they read, the reads go through the
  signed-in user's own session, the standing is rewritten by a nightly job
  that has no tag to invalidate, and the writes that change a board (Assign,
  Dismiss, a regenerated insight, a round submit) are spread over both UIs.
  Prefetching a view would run those loaders and count insights nobody saw, so
  the strip prefetches nothing: Next's own prefetch stops at the loading
  boundary, which this page is already inside.
- **Left, for a decision.** (1) The CoachHelm gate is three to four reads in a
  row (`lib/coachhelm/v2/gate.ts`, shared with Fairway), a third of the
  board's remaining depth; it can read the coach and their settings together
  and every team's settings in one query, with the same answers. (2) The pulse
  could stream behind its own boundary, but its height is one line or up to
  three rows, so a skeleton cannot match it and the board below would move;
  that needs a reserved height or a new place on the page. (3) Ask reads the
  pulse (twelve reads in a row) only to draw its new-chat page, and "New chat"
  after opening a thread needs it, so it cannot simply be skipped.

## 2026-10-01 — Assign starts from the player's value; a decline shows; only drawn cards count

Swap audit CH13-22, CH13-23, CH13-21 and CH13-8.

```text
PR/commit:      agent/swap-audit (#2111): 39270df3b, 22a26ff00, 5107895ee
Design package: none
Contract IDs:   CH-13907 (new)
Actions:        createFocusAreaFromInsightV2 takes currentValue;
                getInsightsForPlayer takes `drawn`
Data impact:    a new focus area made from a card carries its starting
                value; exposure rows only for drawn cards
Held items:     Q-124 (test rounds in the stored cache)
```

- **Starting value.** Assign as focus sends the player's value for the
  metric now; the focus starts there (owner: starting value only, no target).
- **Declined.** When the player declined a focus made from the top card and
  none stands now, the button reads Propose again and a note says the player
  declined it (CH-13907).
- **Shown.** The player board and Deep dive record exposure only for the
  cards they draw; a card that states no finding is no longer counted.
- **Round sets.** Every live card names its window and sample (CH13-9);
  nothing new to build for CH13-8.
- **Checked.** CoachHelm suites 555/555; `insight-delivery-drawn-exposure`
  2/2; `development.team-id` for the server half.

## 2026-10-01 — The player's Game profile, Standing and Deep dive (F-04, Q-76)

Owner, 2026-10-01: "coachhelm for player you can build but be detailed."

```text
PR/commit:      agent/swap-audit (#2111): 28f83d3a8 (Game profile and the
                sub-navigation), a657a7d15 (Standing), 438781162 (Deep dive),
                c34d3046c (contrast and tap-area fixes, docs), adc9c8320 (what a
                gap is closed to; movement units)
Design package: none (no owner board for these views; the phone layouts are a
                draft built on the phone grammar, DESIGN.md)
Contract IDs:   30 new Bridge IDs, all CH-13xxx: CH-13260, 13270, 13271,
                13280 to 13283 (didn't load); 13360, 13361, 13370 to 13373,
                13380 to 13384 (empty, early, partial); 13460, 13470, 13480
                (loading); 13780 (haptic); 13860, 13880, 13890
                (accessibility); 13930, 13931 (sub-navigation); 13980 to 13982
                (the pushed read, ?insight=, a hypothesis). CH-13304 widened to
                every view. CH-1301 (not rebuilt) is no longer said by this page;
                130104 reworded
Actions:        none: the three views are reads, with no write path
Data impact:    none (reads of golf_player_genome, golf_player_standing,
                golf_player_stats_cache, the delivery feed, golf_rounds,
                golf_player_focus_areas and golf_goals; WIRING.md
                DATA-COACHHELM-VIEWS)
Held items:     none
```

- **Sub-navigation.** Board, Game profile, Standing and Deep dive are one
  radiogroup of views of the page on desktop and a row of chips on the phone,
  with a link out to Stats' Development. Each view is a real address
  (`?view=profile`, `standing`, `deep-dive`) behind the board's own switch:
  off is the board's page, and a gate lookup that failed is the view's
  did-not-load, never "off". `VIEWS_NOT_REBUILT` and its not-rebuilt page are
  gone from this route.
- **Game profile.** The genome as the shape of their game in words, then the
  seven measures, each on its own scale with its value, what it means, the
  confidence word and how it is measured. No radar and no 0 to 100 score; a
  value at the bound of its scale says it is a bound; a measure with too few
  rounds is locked, never estimated.
- **Standing.** Every tracked stat against the Tour (the LPGA's for a women's
  team) and the team, with the percentile in words, what closing the gap is
  worth in strokes a round (the shared counterfactual, five-round floor) and the
  three biggest. A comparison that cannot be made says why and is a dash.
- **Deep dive.** Every insight the Board draws, in full: what was measured, how
  it has moved, the rounds behind it, why (a cause is "Measured in your shots"
  or "Likely, not measured"), this week's drill and the focus area or goal it
  belongs to. A list beside the read on desktop; on the phone a pushed screen
  that the iOS back swipe pops. `?insight=<id>` opens on a read of the
  player's own.
- **Honest failures.** A failed read is never an empty page. The Deep dive's
  rounds, plans and category trends each fail on their own, in place, with Try
  again, and "In your plan" is a dash while plans did not load.
- **Checked** at `adc9c8320`. `coachhelm-dive.test.tsx` 65/65; every
  `coachhelm*.test.ts(x)` 13 files, 552/552 (exit 0); `npm run typecheck:fast`
  exit 0; `npx eslint` on the changed files exit 0; `npm run clubhouse:check`
  exit 0 (15 pages, 1351 Bridge IDs). An axe scan (WCAG 2.2 AA, with contrast)
  of the previews at 1280px and 390px over 11 Deep dive, 4 Game profile and 5
  Standing states, and the Deep dive's open phone read: no violations. It found
  and fixed amber text at 4.47:1 on the phone's darker ivory (now
  `--ch-chart-loss-on-tint`) and the chip row clipping its own tap area to 42px.
- **Not done.** The pages were not read against a live player session (the
  previews and the loader tests with fakes); no device pass or VoiceOver;
  `npm run build` not run (no `'use server'` file changed); the Fairway Deep
  dive's shot-analysis and what-if content and the Game profile's fingerprint,
  composite and trend cards are not rebuilt (DESIGN.md non-goals).

## 2026-10-01 — Undo keeps an acknowledgement; Assign tells the player

Swap audit CH13-14 and CH13-24.

```text
PR/commit:      agent/swap-audit (#2111): 024a7669a, f0c107d34
Design package: none
Contract IDs:   none new (CH-13003 Undo, CH-13001 Assign unchanged)
Actions:        reactivateInsight gains `undoing` ('dismiss' from Clubhouse);
                createFocusAreaFromInsight(V2) notify the player
Data impact:    none
Held items:     none
```

- **Undo.** Undoing a dismissal returns an acknowledged insight to
  "acknowledged" with its stamp; before, it came back active and unread.
- **Assign.** Assign as focus sends the player the "New focus area" notice
  and email, as a coach's proposal from Development always did. The link is
  Clubhouse's when the player's team is on Clubhouse (allowlist by the
  player's team, not the coach's session: `isClubhouseForTeam`).
- **Checked.** `reactivate-insight.test.ts` 3/3; `development.team-id.test.ts`;
  `gate-allowlist.test.ts` 6/6; `coachhelm.test.tsx`.

## 2026-10-01 — Development links open Stats; the Ask stream respects the gate; the program pulse counts total-only rounds (§14 D4, CH13-20, F-58)

```text
PR/commit:      agent/swap-audit (#2111): 5c4a9c33a, ffc5861cf, c7e24b4f9
Design package: none
Contract IDs:   none new (CH-1301 narrowed to profile, standing, deep dive)
Actions:        none
Data impact:    none; 114 Demo insight rows regenerated 2026-10-01
                (owner-approved, Q-125)
Held items:     the cache migrations (Q-124) still count test rounds; regenerate
                again after they are applied
```

- **Development.** `?view=development` (30 unread dev-plan notifications and
  their pushes) redirects to Stats → Development instead of the not-rebuilt
  placeholder.
- **Ask.** The chat stream endpoint returns 403 when CoachHelm is off for the
  team, not only the Ask tab.
- **Pulse.** The program pulse dates the team's latest round by the score
  rule (Q-123), so a team posting qualifiers as totals no longer reads "no
  rounds in 60 days".
- **Checked.** `coachhelm.test.tsx` 144/144; route tests; F-58 test.

## 2026-10-01 — Swap audit section 13: the card, its voice, its age

```text
PR/commit:   agent/swap-audit
Catalog:     CH-13903 to CH-13906 (new); CH-13302, CH-13305, CH-13806,
             CH-13901, CH-13923 (reworded)
Data impact: none written. One new bounded read of the player's completed
             rounds (golf_rounds, failure logged). Focus-area creators
             write team_id (new rows only; no backfill)
```

- **CH13-5.** The player's board read their proposals by
  `team_id = their team`, and Fairway's Add focus area and Ask CoachHelm
  wrote `team_id` null, so those proposals never reached them. The read
  is now `team_id is null or = their team`, and `createFocusArea`,
  `createPlayerFocusArea` and the legacy `createFocusAreaFromInsight`
  write the team. Rows already on file with null are readable now; none
  is backfilled (an owner follow-up).
- **CH13-7.** The "New focus area" bell row and email linked
  `/my-development`, which Clubhouse answers "not rebuilt yet". With
  Clubhouse on they link Stats, Development tab.
- **CH13-4.** "77 open signals across 7 players" counted every visible
  row. The header counts players with an open signal; a strength, a card
  that states no finding and an out-of-date read are not open signals,
  and the floor of one is gone. Ask's findings drop the pulse's own
  "N open signals" item for the same reason.
- **CH13-11.** "No clear preference", "no directional bias", "Driver is
  performing" and the collapsed par card are notes: no Assign or
  Dismiss on the coach's board, no number, absent from the player's.
- **CH13-12.** A strength is better than the comparison the card draws
  (the Tour where the generator carried a college cohort), and
  `deriveTone` no longer reads a missing comparison as zero.
- **CH13-13.** The coach's board names the player; the player's board
  drops the coach's "have the player". A focus area made from the board
  is saved in the insight's own words, which the player reads.
- **CH13-16.** An assigned or acknowledged finding wears Assigned or
  Acknowledged, not a fresh Priority.
- **CH13-10, CH13-9.** The read says Solid, Early or Thin; the sample
  uses the generator's own unit; each card says "As of".
- **CH13-20.** `?view=ask` and the Board and Ask strip respect the
  CoachHelm switch like the board.
- **CH13-3.** A read older than the player's newest completed round is
  marked Out of date (not hidden, nothing written), does not lead, is not
  counted and cannot be assigned.
- **Left.** The chat stream API has no CoachHelm gate of its own; the null
  `team_id` proposals already on file are not backfilled.

## 2026-09-30 — Accept and Decline on the player's board, and the Tour in place of the college cohort (Q-77, Q-88)

```text
PR/commit:      agent/clubhouse
Catalog:        CH-13004, CH-13005, CH-13205, CH-13404, CH-13704, CH-13807,
                CH-13902 (new); CH-13204, CH-13601, CH-13802 (reworded)
Data impact:    none written. New reads: the player's own proposed
                golf_player_focus_areas, the team's gender (golf_teams), and
                golf_pga_standards (reference data, readable by any signed-in
                user). No migration
```

### Accept and Decline on the player's board (Q-77)

- **Issue.** A coach's Assign as focus makes a proposal the player accepts, but
  the only Clubhouse screen with Accept and Decline was Stats Development; a
  player on CoachHelm, where the coach's assignment is most likely to be talked
  about, had no way to answer it.
- **Fix.** The player's board has a "Proposed for you" card above the focus:
  each focus area the coach proposed (the player's own `proposed` rows on their
  active team, newest first, with the insight it came from when that insight is
  on the page) with Accept and Decline, over the same `acceptFocusArea` and
  `declineFocusArea`. The answer confirms itself in place ("Started · title",
  "Declined · title"), a failure says what failed with Retry and keeps both
  buttons (CH-13004, CH-13005), a read that failed is its own notice rather than
  "nothing proposed" (CH-13205), and the coach's board never has either button.
  Stats' `ProposalAnswer` is not reused (its toast numbers and style are
  Stats'); the row is this page's own over the same actions.
- **Checked.** coachhelm.test 142/142; typecheck:fast clean for these files;
  eslint 0; 17 mutations of Accept, Decline, the proposals read, the notice and
  the preview's writes each fail a test.

### The Tour in place of "College cohort avg" (Q-88)

- **Issue.** Two generators (course-mgmt.ts and pressure-gap.ts) write a college
  comparison ("College cohort avg 0.6", value from
  `golf_player_standing.level_avg`), drawn as the gauge's comparison with the
  Tour beside it, and the reasoning quoted it ("College players in our data
  average ~0.6"). The owner's rule is the Tour, never a college benchmark.
- **Fix.** A college comparison (`cohort_avg`, or a division average) is drawn
  as the Tour's value for the metric from `golf_pga_standards.pga_tour_value`
  ("Tour 0.3"), for the team's own tour (the LPGA's for a women's team, "LPGA
  Tour 0.4"); the generator's own Tour tick beside it is the same number, so it
  is drawn once. Where the tour has no value for the metric, or the team's tour
  is not known, there is no comparison and no gauge (the sample and window still
  show), and the "College players in our data average" sentence is left out of
  the reasoning. Whether an insight is working is still the generator's call
  (its priority is anchored to its own comparison); only what is drawn moved.
- **Checked.** coachhelm.test 142/142 (the men's and women's tour, a missing
  value, an unknown team, a failed team read and a failed standards read, in
  both loaders); 9 mutations (the college source, the fallback to the college
  number, the LPGA label, the doubled Tour tick, the prose sentence and its
  specificity, the coach's and the player's tour) each fail a test; two more
  that changed nothing showed a redundant guard, which was removed.
- **Left, for the shared generators.** The generators' other college wording (a
  cold-start "top college teams stay under 0.5", "college typical is 2-5", and
  the women's-college "estimated target" comparisons on approach, putting and
  sand saves) and a women's team's cold-start "PGA Tour avg" (the men's value)
  are not this page's to reword; a women's cold-start Tour tick is the men's
  until the generators are moved (Q-93).

## 2026-09-30 — Phone tap targets

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

- **Issue.** The player rows in the phone list were 38px tall.
- **Fix.** They are at least 44 tall (`coachhelm.css`).
- **Checked.** scripts/clubhouse/native.mjs at 390 and 430px.

## 2026-09-30 — Assign as focus on a strength (Clickables gap 12)

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

### Assign as focus on a strength (Clickables gap 12)

- **Issue.** Assign was hidden on a strength, though the board draws it on
  Theo's card; contract 130806 had been written from the code, not the board.
- **Fix.** CoachHelm offers Assign as focus on a strength (a keep-doing focus);
  130806 is reworded (Q-80, kept by the owner).
- **Checked.** coachhelm 112/112; the old hide fails the reworded test.

## 2026-09-30 — CoachHelm for coach and player, and the V2 page docs

```text
Design package: design/handoff/ v2 (Coach - CoachHelm.html, Player -
                CoachHelm.html, the Mobile board)
PR/commit:      agent/clubhouse, 8476314a7 (the build); the docs were written
                afterwards and not yet committed
Contract IDs:   130101 to 132301 (28 hand contracts, all reserved; 18 covered by
                a test, 8 partly, 2 not), plus the catalog's 32 (CH-13xxx,
                Bridge IDs 130201 to 131806)
Actions:        4 (ACT-P013-*)
Data impact:    none (reads through the delivery actions and existing tables;
                the three writes are the Fairway Brief's)
Held items:     none
```

### Changed

- The page: one route, `/golf/dashboard/coachhelm`, is the coach's board
  (program pulse, By player, the chosen player's focus with Assign as focus,
  Dismiss and Undo) and the player's board (one focus, Also worth knowing,
  Working, no write), desktop and phone, behind `golf_clubhouse_ui`. The
  loaders, the catalog (13xxx) and the phone spec came with it.
- The six page docs, the manifest's actions (`status.docs` current,
  `status.contract` complete) and the hand contracts: core view, the focus and
  the player order, the generator-only rule, the route skeleton, failed reads
  never drawn as empty, a failed gate lookup, offline, the role's controls, each
  side's own reads, the server actions as the gate (reserved: read, not run),
  the flag, when Assign is offered, success, the proposal, the existing-focus
  outcome, state kept, Retry, Try again, Undo, freshness, axe (reserved: not a
  unit test), the phone layout, the loader's rounds and observability.
- **The Fairway drills.** `?view=development`, `profile` and `standing` (where
  /my-development, /my-game-profile, /my-standing and the focus-area cards send
  people) show the shell's "not rebuilt yet" page (CH-1301) instead of the
  one-focus board, which they used to land on as if it were the view they asked
  for. `?view=insights` stays the board. The guard is `VIEWS_NOT_REBUILT` in
  `routes/coachhelm.tsx`, and the page passes `?view=` to the route (Q-76).

### Why

- The contract pass (D-62, D-69): every category answered, every behaviour
  named, and every bug class the earlier passes found looked for here: a failed
  read shown as empty, a Retry that skips its follow-ups, a control drawn for
  the wrong role.
- Q-76 (open): falling through to the Fairway page for those views was rejected
  because it would draw Fairway inside the Clubhouse frame; rebuilding
  Development first, then Profile and Standing, is recommended.
- Q-77 (open): a coach's Assign as focus makes a proposal the player accepts.
  Accept and Decline are built on the player's side in Stats Development
  (CH-5003, CH-5004, CH-5404); this board still has none.

### Found, not fixed

- A coach's gate lookup failure draws "Nothing is flagged in the pulse right
  now." beside the roster notice: the loader returns an empty pulse with no
  error (130608).
- `?view=deep-dive`, a Fairway view, draws the board and not the not-rebuilt
  page (130104).
- `docs/clubhouse/phone/coachhelm.md`, "Open questions for the owner", predates
  the `?view=` guard and the Stats Accept and Decline.

### Verification

- See VERIFY.md.
