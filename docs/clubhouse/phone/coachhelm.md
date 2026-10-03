# Design: CoachHelm (coach and player, desktop and phone)

Status: approved. The owner's boards are the spec (D-22): `design/handoff/Player - CoachHelm.html`, `Coach - CoachHelm.html` and `Coach and Player - CoachHelm - Mobile.html` (`helm3.jsx`, `helm3.css`, `coachhelm2.css`). The mobile board draws the same two pages, the player's and the coach's, at phone width (`PlayerHelm` and `CoachHelm` in `helm3.jsx`, inside the phone shell).

The route is `/golf/dashboard/coachhelm`, for both roles. The Fairway page is the player's only; a coach lands on a pointer to the Brief. In Clubhouse one route draws the role's page from the session: `session.coach` is the coach's board (a coach who also has a player profile is a coach here), `session.player` the player's. The coach's Brief (`/intelligence`) is a different screen and is not built here.

Built in `src/clubhouse/screens/coachhelm/`. `CoachBoard` takes an injected set of writes (`ChCoachHelmWrites`): the live set (`writes.ts`) is the three server actions the Fairway Brief already uses, unchanged; the preview passes fake ones. No new action and no migration.

## Board to data

Every insight is generator output: an `EvidenceInsight` from `getInsightsForPlayer` (the player's ranked feed, up to 30) or `getTopInsightsForPlayers` (the coach's one top insight per player). Nothing is generated on the client and no number is written by hand. The confidence read and the drill come from the same code the Fairway hub uses (`buildInsightUnit`, `readQuality`), so one insight reads the same on every surface.

| Board piece | Read | Write |
| --- | --- | --- |
| "One thing to work on this week, based on the rounds you’ve posted." (player) | Static. | none |
| Category ("Putting") and the pill (Priority, Worth closing, Minor) | `golf_coach_insights.category`; `priority` (urgent and high read Priority, medium Worth closing, low Minor). A strength reads Working | none |
| The claim and its first sentence | `title`; the first sentence of `content` (`splitContent`). The generators' "College players in our data average ~0.6." sentence is left out of the text (`withoutCollegeAverage`): it is the prose twin of the college comparison, which is not drawn | none |
| Proposed for you (player) | The player's own `golf_player_focus_areas` rows with `status = 'proposed'` on their active team, newest first (`id`, `title`, `from_insight_id`). Each names the insight it came from when that insight is on the page ("From: Downhill putts…"), else "Your coach proposed this as a focus." Above the focus card; no section when nothing is proposed | Accept: `acceptFocusArea(id)`, Decline: `declineFocusArea(id)`, the two actions Stats Development's Accept and Decline call. Each acts only on the player's own `proposed` row, so a stale answer is refused |
| Evidence: the label | `evidence.metric_label` | none |
| Evidence: two bars (the downhill penalty) | `evidence.detail.downhill_pct` and `level_pct` | none |
| Evidence: a gauge (every other insight) | `your_value` (shown as `your_value_display`) and the comparison: a college one (`comparison_source` `cohort_avg`, or a division average) is drawn as the Tour's value for the metric instead ("Tour 0.3"; the LPGA's for a women's team, "LPGA Tour 0.4"), from `golf_pga_standards.pga_tour_value` for the team's own tour, and where the tour has no value there is no comparison and no gauge (Q-88: the Tour is the only benchmark). Any other comparison keeps its label and value ("Your right-to-left make % (same band) 51%"), with `secondary_value` when it differs (the generator's Tour tick). The track's scale is a display ceiling a step above the largest value; no number on it is invented | none |
| "75 putts", "90 days", "Strong read" | `sample_n` with the noun the metric counts; `window_days`, or "All rounds" for a lifetime value; `confidence` through `readQuality` | none |
| This week (the drill) | The insight's attached drill: title, minutes and difficulty from the delivery shape, the description from `golf_drills.description`. The generator's placeholder action ("Target X in the next practice block") is not a drill and is hidden | none |
| Why we think this | The rest of `content` after the first sentence | none |
| Also worth knowing, Working | The rest of the player's feed: the not-working insights in the feed's order, then the strengths. A strength is resolved or encouraging (`deriveTone`), or ahead of its comparison at low priority | none |
| "8 open signals across 5 players." (coach) | The sum, and the players with at least one, of each team player's visible insights: the v3 visibility rules, par-scoring rows collapsed into one and the same subject counted once, as the player's feed draws them | none |
| Program pulse | `getCoachProgramPulse()`, the coach's own pulse (cached per request): each item's headline and evidence line as the pulse wrote them, its tone (attention amber, positive green), an icon chosen by the item's id. The `signals-open` item is left out because the header says it | none |
| By player: name, top signal, count | The active `golf_team_members` of this team with their `golf_players` names; the top insight from `getTopInsightsForPlayers(ids, { limit: 1 })`; the count as above. Ordered by how pressing the top insight is, then by count, then by name; a player whose top insight is a strength comes last | none |
| The chosen player's focus | The same card as the player's, for that player's top insight | none |
| Assign as focus | A focus area already made from the insight (`golf_player_focus_areas.from_insight_id`, in proposed, active, in progress or paused) shows the chip at once | `createFocusAreaFromInsightV2` with the insight's title, first sentence, area type and metric. It creates a proposal the player accepts. A player who already has an active focus on the metric (`ACTIVE_FOCUS_DUPLICATE_ERROR`) is treated as done |
| Dismiss, Undo | none | `dismissInsight`, then `reactivateInsight(id, priorLifecycleState)` with the state it had |

## Differences from the board (gaps), none built as a mock

- **Share with the player.** The board draws Assign, Share and Dismiss. Players already see every insight in their own feed and no action shares one, so a Share button would lead nowhere. It is not drawn. Open question for the owner: is a nudge to the player wanted (a push, a message), and what should it say?
- **"Assigned as Jonah’s focus."** The server creates a proposal the player accepts to start it. The chip says Assigned, and the line under it says "Jonah sees it as a proposal and accepts it to start." When the player already has the focus, the proposal line is left out (it isn't known whether they have started it).
- **"It comes back only if Jonah’s pattern changes."** Nothing records that rule for a dismissed insight. The notice says what is true: "It no longer shows on your board or on Jonah’s. Undo brings it back."
- **"Coach Reyes sees the same insights."** The board names one coach. The note says "Your coaches see the same insights." A coach reads the same insight rows, but sees each player's top one on the board.
- **Pulse names.** The board's pulse rows end in first names ("Jonah, Eli"). The pulse's evidence line carries whatever the pulse wrote ("Jonah Okafor +2.1 · Eli Brandt +0.8"); no name list is built from another source.
- **The board's static content.** Five players, 8 signals, the four pulse rows and the three insights are the board's fixtures. Everything drawn here is live; a team with fewer or more players draws fewer or more.
- **High priority is amber, not red.** The board draws a high-priority pill and dot in red. Red is kept for under par, the pin flag and destructive actions (D-42), so a high-priority finding is amber (the deeper amber of the two) and a strength is green; the pill says the priority in words as well.
- **Gauge colour.** The board colours a gauge by the insight's stance, so a gauge is green when the insight is a strength and amber otherwise. The metric's direction (`isNegativePolarityMetric`, the one polarity table) decides only whether an insight counts as a strength: ahead of its comparison at low priority, or resolved or encouraging.
- **Insights the board doesn't show.** The generators write more categories than the board's four; each draws as the same card. One with no comparison draws no gauge and still shows its sample and window.

## Open questions for the owner (found while building, nothing built for them)

- **The Fairway page's other views.** `/golf/dashboard/coachhelm` also serves `?view=development`, `profile`, `standing`, `insights` and `deep-dive` for players, and `/my-development`, `/my-game-profile` and `/my-standing` permanently redirect there (as do the focus-area cards' links, `?view=development&focus=<id>` and `?view=insights&insight=<id>`). **Built 2026-10-01 (owner: "coachhelm for player you can build but be detailed").** The player's Game profile, Standing and Deep dive are views of this page (`?view=profile`, `standing`, `deep-dive`, with `?insight=<id>` opening the Deep dive on a read), each read for the signed-in player alone behind the board's own switch, with a sub-navigation on the board and every view (Board, Game profile, Standing, Deep dive, and a link to Development). `?view=development` goes to Stats' Development tab. Their phone layouts are a DRAFT, built on the phone grammar here (the chips, cards and a pushed screen); there is no owner phone board for them yet. Design: `docs/clubhouse/pages/P013-coachhelm/DESIGN.md`.
- **Accepting a proposal (Q-77, built 2026-09-30, owner approved).** Assign as focus creates a proposal (`status = 'proposed'`) the player accepts (`acceptFocusArea`, `declineFocusArea`). The player's board now has a "Proposed for you" section above the focus card with Accept and Decline per focus area, as Stats Development has (its `ProposalAnswer` is not reused: its toast numbers (CH-5003, CH-5004) and its `.ch-pf-answer` style belong to Stats, so this page has its own row with its own numbers, CH-13004, CH-13005, CH-13404 and CH-13902). The answer confirms itself in place ("Started · title" or "Declined · title"); nothing refreshes the page away from it. The board draws no such section, so its wording is this page's: "Proposed for you", "Accept to start a focus, or decline to set it aside."

## States

Loading: a route skeleton per role (CH-13401, CH-13402), and "Assigning" or "Dismissing" while a write runs (CH-13403). The player's insights didn't load: CH-13201; the coach's players: CH-13202; the pulse: CH-13203; each in place of its section, never "no insights" or "no signals". A section that crashes is contained (CH-13204). First run: no round posted (CH-13301), rounds but no insight (CH-13302), only strengths (CH-13303). CoachHelm off: for the player (CH-13304) and for the coach (CH-13305). Coach with no signals (CH-13306), no players (CH-13307), no team (CH-13308), nothing flagged in the pulse (CH-13309), players without insights (CH-13310). Assign, dismiss and undo each say when they fail, with Retry (CH-13001 to CH-13003); Dismiss is undoable, so it doesn't ask (CH-13901). The player's Accept and Decline say when they fail, with Retry (CH-13004, CH-13005), read "Accepting" or "Declining" while they work (CH-13404) and confirm in place (CH-13902); the proposals that didn't load are their own notice (CH-13205), never "nothing proposed". Full list: `docs/clubhouse/catalog/coachhelm.md`.

A read that fails is never drawn as empty. The two delivery actions answer an empty list on failure, so the loader tells a failed feed from a first run by reading the insights table itself: any visible insight the player hasn't dismissed means the feed failed. The gate's "lookup failed" reasons are failures too, not "off".

## Who sees what

- A player reads only their own insights (`loadPlayerCoachHelm` takes the session's player id) and is never handed Assign, Dismiss or Undo. The one thing they write is their own answer (Accept or Decline) to a focus area proposed to them; a coach's board has neither button.
- Every comparison is against the Tour of the viewer's team (Q-88): the coach's active team, the player's active team. A team whose row cannot be read claims no benchmark.
- A coach reads the active players of the team the shell resolved, and only those ids reach every insight read, whichever other teams the coach staffs.
- The coach's board asks for each player's top insight only (`limit: 1`), not their whole feed. The delivery actions record an exposure for the rows they return, as they do for the Fairway pages; the counts come from a plain read of the insights table and record none.

## Phone

`Coach and Player - CoachHelm - Mobile.html`.

- The top bar is the shell's: "CoachHelm". The page keeps its own header (the role chip, "CoachHelm", one line).
- Below 640px the header is smaller, the focus card takes 20px of padding, the evidence rows and the drill tighten, and the pulse is one column.
- The coach's players become a row of pills that scrolls sideways (avatar, name, count); the chosen pill is the dark one. The top signal's title is left off the pill; the focus card under it names the player and the signal. The "By player" heading stays for screen readers.
- Assign as focus and Dismiss share the row and split its width.
- The player's focus sits above the lists, and choosing a row brings the focus into view.
- "Proposed for you" is one card above the focus: each focus area is a row with its two buttons underneath, side by side and sharing the width; both buttons are 44px tall on the phone.
- Not yet: a measured touch-target pass (the pills, the insight rows) and a pass on a real iPhone (haptics felt, the sideways row with the tab bar).
