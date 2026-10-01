# P013 — CoachHelm: changelog

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification
log and decisions).

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
