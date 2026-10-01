# P013 — CoachHelm: page contract

Every behaviour CoachHelm promises, by the 25 V2 categories (D-69). A contract's
number is its Bridge ID (D-68: namespace 13, category, item); `Code` is the
catalog code on the element and in the test (`docs/clubhouse/catalog/coachhelm.md`).
Rows without a code are behaviours with no single element, recorded in
`config/clubhouse/bridge-contracts.json` by hand. The shell's contracts (P001,
namespace 1) apply here too and are named where they carry a category.
`clubhouse:check` holds this file to the registry.

The hand contracts on this page start as `reserved`. The registry marks a hand
contract `implemented` only when a test file names its Bridge ID in a test title, and
`coachhelm.test.tsx` names catalog codes, not these IDs yet. Each note below says which of
them a test in that file covers today (`VERIFY.md` has the same list); the ones it says
are not tested, or only partly, stay reserved.

## 01 — Default / core UI

Status: DEFINED

One address, `/golf/dashboard/coachhelm`, is the coach's board for a coach and the player's for a player, and the role is the session's (130101). The server has read the page before first paint, so nothing is fetched in the browser to draw it. The focus is the top-ranked insight that is not working, or the one the person picks (130102), and a coach's players come most pressing first (130103). Every number is the generator's own, re-shaped and never computed here (130106). The header counts the players with an open signal, never the rows behind them, and a strength, a card that states no finding and a read that is out of date are not open signals (130105, 130107). `?view=development`, `profile` and `standing` show the shell's not-rebuilt page instead of the board (130104, Q-76). Not tested: that a coach following one of those links gets the same page (the route checks `?view=` before it reads the session), and that `?view=deep-dive` draws the board.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 130101 | — | `COACHHELM_OPENS_FOR_THE_ROLE` | One address gives a coach the coach's board and a player the player's, from the session (a coach who also has a player profile is a coach here). A player's page is the header (the Player chip, CoachHelm, one line), one focus card, Also worth knowing (up to five), Working (up to five) and a closing note (reads update as rounds are posted, and coaches see the same insights). A coach's page is the header (the Coach chip and the count of players with an open signal), the program pulse (up to six rows), By player, the chosen player's focus with Assign as focus and Dismiss, and a count of players with no insight yet. Everything is read on the server before first paint. |
| 130102 | — | `THE_FOCUS_IS_THE_TOP_INSIGHT_THAT_IS_NOT_WORKING` | The player's focus card is the insight the person picked or, without a pick, the top-ranked finding that is current (a read older than the newest round, and a card that states no finding, do not lead), in the delivery feed's own order. The picked insight leaves both lists and the one it replaced joins them; Also worth knowing keeps at most five findings and Working at most five strengths; with only strengths there is no focus and CH-13303 says nothing needs work. On the coach's board the focus is the chosen player's top insight. |
| 130103 | — | `PLAYERS_ARE_ORDERED_MOST_PRESSING_FIRST` | The coach's By player list is ordered by how pressing each player's top insight is (Priority, then Worth closing, then Minor; a strength last, whatever its own priority), then by how many open signals the player has, then by name. A strength, and a top read that is out of date, come after the findings, and a card that states no finding comes last. The first player's focus is open when the page opens, and picking a player (a toggle, aria-pressed) shows that player's focus. |
| 130104 | — | `FAIRWAY_DRILL_LINKS_SAY_NOT_REBUILT` | ?view=development, ?view=profile and ?view=standing (where /my-development, /my-game-profile, /my-standing and the focus-area cards send people) show the shell's not-rebuilt page (CH-1301) naming Development, Game profile or Standing, with Back to Home, instead of the board. The page passes ?view= to the route and the route checks it before it reads the session, so it holds for a coach as well as a player. ?view=insights, no view and any other value (?view=deep-dive is a Fairway view) draw the board (Q-76, open). |
| 130105 | — | `OPEN_SIGNALS_FOLLOW_DISMISSALS` | The header counts the players with an open signal ("4 players have an open signal."): the board draws one card per player, so it never counts the rows behind them. A player's open signals are their visible findings whose read is current, and each row shows that count: a strength, a card that states no finding and a read older than the player's newest completed round are not open signals, and a player with only those has none. Dismissing a player's top insight here takes one off that player's count when the card was one of their open signals, and a player left with none leaves the count of players; Undo puts both back. The row reads Dismissed while the notice is up. |
| 130106 | — | `INSIGHTS_ARE_GENERATOR_OUTPUT_ONLY` | Every insight is a delivery-action row (EvidenceInsight) re-shaped by toChInsight; nothing is generated, ranked or computed here beyond a gauge's display scale. The value is the generator's own display; the downhill-penalty finding is two bars and no gauge, any other insight with a comparison is a gauge (you, the cohort, and the Tour when it differs) and one with no comparison draws no gauge; the sample names what it counts and the window is days or All rounds; the read is a word; the drill is the attached drill (its text read from golf_drills.description) and the generator's placeholder action is not shown as a drill. An insight is working when it is resolved, or better than the comparison the card draws (the Tour's value where the generator carried a college comparison, never a stored college one the page does not show) at low priority or with an encouraging tone (isNegativePolarityMetric decides which way a number is good; a missing comparison is none, never zero). The read says Solid, Early or Thin from the one table every surface uses. The text is the player's own on the player's board (a coach's "have the player" instruction is dropped) and about the player by their first name on the coach's board (the gauge says "Jonah ·", not "You ·"). |
| 130107 | CH-13904 | `COACH_A_PLAYERS_TOP_CARD_STATES_NO` | Coach: a player's top card states no finding (a note) |

## 02 — Initial loading / skeleton

Status: DEFINED

The route skeleton is a Clubhouse one inside the shell and Fairway's outside it, in the signed-in role's shape (130204); a write in flight says so on its button (Assigning, Dismissing, Undoing: CH-13403). CoachHelm loads no section on its own after the server render, so there are no section skeletons.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 130201 | CH-13401 | `THE_PLAYERS_PAGE_IS_ON_ITS_WAY` | The player's page is on its way |
| 130202 | CH-13402 | `THE_COACHS_PAGE_IS_ON_ITS_WAY` | The coach's page is on its way |
| 130203 | CH-13403 | `ASSIGN_OR_DISMISS_IS_SAVING` | Assign or Dismiss is saving |
| 130204 | — | `THE_ROUTE_SKELETON_TAKES_THE_ROLES_SHAPE` | The route's loading.tsx draws the Clubhouse skeleton only inside the Clubhouse shell (Fairway's skeleton everywhere else), in the shape of the signed-in role's page: the coach's program pulse, then the players beside the focus card; the player's focus card beside a short list. The player's shape is used until the role is known. |
| 130205 | CH-13404 | `A_PLAYERS_ACCEPT_OR_DECLINE_IS_BEING` | A player's Accept or Decline is being sent |
| 130206 | CH-13420 | `ASK_THE_CHAT_PAGE_LOADS` | Ask: The chat page loads |
| 130207 | CH-13421 | `ASK_A_REPLY_IS_STREAMING` | Ask: A reply is streaming |
| 130208 | CH-13450 | `ASK_AN_ACTION_WAS_CONFIRMED_AND_IS` | Ask: An action was confirmed and is being carried out |

## 03 — Background loading / refresh

Status: N/A — CoachHelm has no realtime, polling or pull to refresh: the server reads the page once per visit, and Try again reads it again (categories 14 and 15).

## 04 — Empty

Status: DEFINED

First run is a whole-page empty state for each role and each way of having nothing: a player with no round posted (CH-13301), with rounds and no insight yet (CH-13302), with only strengths (CH-13303) and with CoachHelm off (CH-13304); a coach with CoachHelm off (CH-13305), with players and no signal (CH-13306), with no players (CH-13307) and with no team (CH-13308). Two smaller states sit in the page: nothing flagged in the pulse (CH-13309) and the count of players with no insight yet (CH-13310). A failed read is never shown as empty (130411): the delivery actions answer an empty list when a read fails, so the loaders read the insights table themselves to tell the two apart. CoachHelm has no search or filter, so it has no filtered empty state.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 130401 | CH-13301 | `PLAYER_NO_ROUND_POSTED_YET` | Player: no round posted yet |
| 130402 | CH-13302 | `PLAYER_ROUNDS_POSTED_NO_INSIGHT_YET` | Player: rounds posted, no insight yet |
| 130403 | CH-13303 | `PLAYER_EVERY_INSIGHT_IS_A_STRENGTH` | Player: every insight is a strength |
| 130404 | CH-13304 | `PLAYER_COACHHELM_IS_OFF_FOR_THEM` | Player: CoachHelm is off for them |
| 130405 | CH-13305 | `COACH_COACHHELM_IS_OFF` | Coach: CoachHelm is off (by them, by the team, or globally) |
| 130406 | CH-13306 | `COACH_PLAYERS_ON_THE_TEAM_NO_SIGNAL` | Coach: players on the team, no signal yet |
| 130407 | CH-13307 | `COACH_NO_PLAYERS_ON_THE_TEAM` | Coach: no players on the team |
| 130408 | CH-13308 | `COACH_NOT_ON_A_TEAM` | Coach: not on a team |
| 130409 | CH-13309 | `COACH_THE_PULSE_HAS_NOTHING_FLAGGED` | Coach: the pulse has nothing flagged |
| 130410 | CH-13310 | `COACH_SOME_PLAYERS_HAVE_NO_INSIGHT_YET` | Coach: some players have no insight yet |
| 130411 | — | `A_FAILED_READ_IS_NEVER_DRAWN_AS_EMPTY` | The delivery actions answer an empty list or map when a read fails, so the loaders tell a failed read from a first run. An empty feed, or empty top insights, while a drawable visible insight is on file (for a player, one they have not dismissed themselves: the newest feedback row per insight decides) is a failed read (CH-13201, CH-13202), and so is a failed visible-insights, feedback or roster read; only when that check finds nothing is it a first run (CH-13301, CH-13302, CH-13306). A player who dismissed every insight themselves is a first run, not a failure, and a failed roster read is never an empty team (CH-13307). |
| 130412 | CH-13320 | `ASK_A_CONVERSATION_THAT_IS_GONE_OR` | Ask: A conversation that is gone or not the coach's |
| 130413 | CH-13321 | `ASK_THE_ROSTER_IS_EMPTY` | Ask: The roster is empty |
| 130414 | CH-13322 | `ASK_PLAYERS_BUT_NO_RECORDED_ROUND` | Ask: Players but no recorded round |
| 130415 | CH-13323 | `ASK_NO_CHATS_YET` | Ask: No chats yet |
| 130416 | CH-13324 | `ASK_A_CHAT_SEARCH_WITH_NO_MATCH` | Ask: A chat search with no match |
| 130417 | CH-13325 | `ASK_ROUNDS_RECORDED_NOTHING_FLAGGED` | Ask: Rounds recorded, nothing flagged |
| 130418 | CH-13350 | `ASK_A_READ_TOOL_FOUND_NOTHING_RECORDED` | Ask: A read tool found nothing recorded |

## 05 — Validation

Status: DEFINED

The board has no form: Assign as focus, Dismiss and Undo are buttons, and what they send is the insight's own text. The Ask composer has one rule: nothing is sent while an action card waits for Confirm or Cancel, and the box says why (CH-13120).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 130501 | CH-13120 | `ASK_SEND_WHILE_AN_ACTION_CARD_WAITS` | Ask: Send while an action card waits for Confirm or Cancel |

## 06 — Server / system error

Status: DEFINED

Every write has its own toast naming what failed and what to do, with Retry (CH-13001 to CH-13003). A player who already has an active focus on the metric is not an error (130903). Every section that fails to load has its own notice with Try again (CH-13201 to CH-13203), and a crash stays in its section (CH-13204, `SectionBoundary`). A gate that cannot be looked up is a failed read and not "CoachHelm is off" (130608), for a coach as for a player; see the contract for what the coach's board draws in that case. The toast's Retry runs the whole change again, follow-ups included (131401).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 130601 | CH-13001 | `ASSIGN_AS_FOCUS_FAILS` | Assign as focus fails |
| 130602 | CH-13002 | `DISMISS_FAILS` | Dismiss fails |
| 130603 | CH-13003 | `UNDO_FAILS` | Undo fails |
| 130604 | CH-13201 | `THE_PLAYERS_INSIGHTS_DONT_LOAD` | The player's insights don't load (the read fails, throws, comes back empty while insights are on file, or the gate lookup fails) |
| 130605 | CH-13202 | `THE_COACHS_ROSTER_OR_PLAYERS_INSIGHTS_DONT` | The coach's roster or players' insights don't load (same tests, for the team) |
| 130606 | CH-13203 | `THE_PROGRAM_PULSE_DOESNT_LOAD` | The program pulse doesn't load |
| 130607 | CH-13204 | `A_SECTION_CRASHES_WHILE_DRAWING` | A section crashes while drawing |
| 130608 | — | `A_FAILED_GATE_LOOKUP_IS_A_FAILED_READ_NOT_OFF` | The gate that says CoachHelm is off is asked first. A gate that throws, or whose reason says the lookup failed, is a failed read and not off: a player gets Your insights didn't load (CH-13201) and a coach gets the roster flagged as failed (CH-13202); it is logged as gate. Found in this pass, not fixed: on a coach's gate failure the pulse is not read, and the board draws its empty line 'Nothing is flagged in the pulse right now.' beside the CH-13202 notice. |
| 130609 | CH-13004 | `A_PLAYERS_ACCEPT_OF_A_PROPOSED_FOCUS` | A player's Accept of a proposed focus area fails |
| 130610 | CH-13005 | `A_PLAYERS_DECLINE_OF_A_PROPOSED_FOCUS` | A player's Decline of a proposed focus area fails |
| 130611 | CH-13205 | `THE_PLAYERS_PROPOSED_FOCUS_AREAS_DONT_LOAD` | The player's proposed focus areas don't load (the read fails, or the team they are read through can't be read) |
| 130612 | CH-13050 | `ASK_AN_ACTION_COACHHELM_PROPOSED_FAILS_AFTER` | Ask: An action CoachHelm proposed fails after Confirm |
| 130613 | CH-13051 | `ASK_COPY_IS_REFUSED_BY_THE_CLIPBOARD` | Ask: Copy is refused by the clipboard |
| 130614 | CH-13221 | `ASK_THE_CHAT_CONTEXT_DOES_NOT_LOAD` | Ask: The chat context (the program) does not load |
| 130615 | CH-13222 | `ASK_THE_CHAT_LIST_DOES_NOT_LOAD` | Ask: The chat list does not load |
| 130616 | CH-13223 | `ASK_THE_PULSE_DOES_NOT_LOAD` | Ask: The pulse does not load |
| 130617 | CH-13224 | `ASK_A_CONVERSATION_OR_ITS_MESSAGES_DO` | Ask: A conversation or its messages do not load |
| 130618 | CH-13225 | `ASK_ONE_SECTION_OF_THE_PAGE_CRASHES` | Ask: One section of the page crashes |
| 130619 | CH-13250 | `ASK_A_READ_TOOL_BEHIND_AN_ANSWER` | Ask: A read tool behind an answer failed |
| 130620 | CH-13251 | `ASK_AN_ANSWER_FAILS_WHILE_IT_STREAMS` | Ask: An answer fails while it streams |
| 130621 | CH-13252 | `ASK_AN_ANSWER_ARRIVES_MALFORMED_AND_IS` | Ask: An answer arrives malformed and is rejected |
| 130622 | CH-13253 | `ASK_A_CONFIRMED_ACTION_FAILED_OR_ONLY` | Ask: A confirmed action failed or only partly completed |
| 130623 | CH-13254 | `ASK_THE_CONVERSATION_MOVED_PAST_A_CARD` | Ask: The conversation moved past a card that was never answered |
| 130624 | CH-13255 | `ASK_THE_EVIDENCE_PANEL_IS_OPENED_FOR` | Ask: The evidence panel is opened for a player the conversation has nothing on |

## 07 — Network / offline

Status: DEFINED

Every write refuses while offline before anything is sent, with the shell's toast naming what did not happen (130702), the error haptic and Retry. A save over 5 seconds says so once (the shell's). CH-13901, the dismissed notice, sits in this category by its kind's default: it is the outcome of a Dismiss and not a network state. CoachHelm has no realtime, so it has no connection-lost state of its own.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 130701 | CH-13901 | `AN_INSIGHT_IS_DISMISSED` | An insight is dismissed |
| 130702 | — | `WRITES_REFUSE_OFFLINE` | Assign as focus, Dismiss and Undo are refused while the browser is offline, before anything is sent: the shell's toast (CH-1903) names what did not happen (Couldn’t assign the focus to Jonah: you're offline), the error haptic fires and Retry is offered. Dismiss's warning haptic has already fired when the refusal comes. |
| 130703 | CH-13902 | `A_PROPOSED_FOCUS_AREA_IS_ACCEPTED_OR` | A proposed focus area is accepted or declined |
| 130704 | CH-13920 | `ASK_SEND_WHILE_OFFLINE` | Ask: Send while offline |
| 130705 | CH-13921 | `ASK_A_SEND_FAILS` | Ask: A send fails |
| 130706 | CH-13922 | `ASK_A_NEW_THREAD_STARTS` | Ask: A new thread starts |
| 130707 | CH-13923 | `ASK_THE_SUB_TAB_STRIP` | Ask: The sub-tab strip |
| 130708 | CH-13950 | `ASK_COPY_AN_ANSWER` | Ask: Copy an answer |
| 130709 | CH-13951 | `ASK_COACHHELM_PROPOSES_AN_ACTION` | Ask: CoachHelm proposes an action |
| 130710 | CH-13952 | `ASK_A_PROPOSED_ACTION_IS_CANCELLED` | Ask: A proposed action is cancelled |
| 130711 | CH-13953 | `ASK_A_CONFIRMED_ACTION_LANDS` | Ask: A confirmed action lands |

## 08 — Permission / authorization

Status: DEFINED

Who may open the page: a coach or a player with `golf_clubhouse_ui` on; anyone else gets the Fairway page (130805). The role decides the view: only the coach's board has Assign, Dismiss and Undo, and the player's board has no write (130801). A coach reads only the active players of the team the shell resolved, whichever other teams they staff (130802), and a player reads only their own insights, with or without a team (130803). Assign is offered only for an insight that has no focus made from it, a strength included (130806, Q-80). Off a team a coach gets the no-team page (CH-13308, category 04). The server actions are the gate that counts (130804, reserved: read, not run). The program pulse is the coach's own (`getCoachProgramPulse` takes no team) and this page's team comes from `resolveClubhouseTeam`; both follow the active-team cookie and nothing here proves they can never differ.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 130801 | — | `CONTROLS_FOLLOW_THE_ROLE` | The coach's controls (Assign as focus, Dismiss, Undo) exist only on the coach's board. The player's board has no write of any kind and is never drawn Assign, Dismiss, Undo or Share, and neither board has a Share button: no action sits behind it. |
| 130802 | — | `A_COACH_READS_ONLY_THE_TEAMS_ACTIVE_PLAYERS` | A coach's board reads only the active members of the team the shell resolved (golf_team_members, team_id and status active), whichever other teams the coach staffs; only those ids reach the visible-insights read, the top-insight read (one per player) and the focus-area read. A coach session with no resolved team, or one that is not a coach team, gets the no-team page (CH-13308) and no player is read. The program pulse is the coach's own (getCoachProgramPulse, which resolves its team through the coach chat context), not a read of this page's team id. |
| 130803 | — | `A_PLAYER_READS_ONLY_THEIR_OWN_INSIGHTS` | A player's board is built from the session's own player id and nothing else: the gate, the feed (up to 30), the dismissal read and the rounds count are that player's, with or without a team, and no team read or teammate's insight reaches it. |
| 130804 | — | `SERVER_ACTIONS_ARE_THE_GATE` | Every write is checked again by its server action, whatever the board shows: dismissInsight and reactivateInsight refuse a caller who is not a coach of the insight's team (verifyInsightAccess; an insight with no team is refused) and update only that team's row; createFocusAreaFromInsightV2 refuses a caller who fails verifyPlayerAccess for the player (a coach of the player's team, or the player themself, whose own use would make an active focus with no proposal and is not reachable from this board) and refuses a second active focus on the same metric with ACTIVE_FOCUS_DUPLICATE_ERROR. Read in this pass, not run: no test here forces a refusal. |
| 130805 | — | `THE_PAGE_GIVES_CLUBHOUSE_ONLY_BEHIND_THE_FLAG` | With golf_clubhouse_ui on, a signed-in coach or player gets the Clubhouse route, drawn in place with no redirect, and ?view= is handed to it. With it off, everyone keeps the Fairway page (a coach gets its pointer to the Brief), and no session goes to sign in. |
| 130806 | — | `ASSIGN_IS_OFFERED_ONLY_FOR_AN_INSIGHT_NOT_YET_MADE` | Assign as focus is offered when no focus has been made from the chosen player's top insight. One that is working (a strength) is offered too, as a keep-doing focus, as the board draws it on Theo's card (Q-80); it can also be dismissed. One with a proposed, active, in-progress or paused focus already made from it opens as the Assigned chip (CH-13601): the loader reads only those statuses, so a declined or completed focus no longer blocks Assign, and a failed focus-area read leaves Assign available (the server's duplicate guard still holds). |

From the shell (P001): 10801 CLUBHOUSE_GATE, 10802 ROLE_SCOPED_NAV.

## 09 — Success

Status: DEFINED

A change that lands confirms itself where it happened and does not ask for a toast: the Assigned chip, the dismissed notice, the returned focus card (130901); Assign makes a proposal the player accepts (130902, Q-77); a player who already has the focus is treated as done, with one toast saying so (130903).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 130901 | — | `CHANGE_LANDED` | A change that lands confirms itself in place with the success haptic and no toast: Assign becomes the chip Assigned as Jonah’s focus, Dismiss becomes the dismissed notice, Undo brings the focus card back. The one toast is the existing-focus outcome (130903). |
| 130902 | — | `ASSIGN_MAKES_A_PROPOSAL_THE_PLAYER_ACCEPTS` | Assign as focus sends the insight's own title, first sentence, area type and metric to createFocusAreaFromInsightV2, which makes a proposal (a coach's use is a prescription), not an active focus. The chip says Assigned and the line under it says the player sees it as a proposal and accepts it to start. The player answers it in Stats, Development (Q-77); this board has no Accept or Decline. |
| 130903 | — | `AN_EXISTING_ACTIVE_FOCUS_IS_THE_OUTCOME_WANTED` | When the write answers ACTIVE_FOCUS_DUPLICATE_ERROR (the player already has an active focus on that metric), Assign is done, not failed: the chip shows and a toast says the player already has a focus on this, with no failure toast and no error haptic. The proposal line is left out, because it is not known whether they have started it. |

From the shell (P001): 10901 CHANGE_LANDED.

## 10 — Warning

Status: N/A — CoachHelm has no non-blocking warnings: the one notice it raises (the player already has a focus on this) is an outcome the coach wanted (category 09), and the warning haptic before Dismiss is category 17.

## 11 — Destructive

Status: N/A — Dismiss is undoable, so it does not ask: the notice keeps Undo in place until the page is left (CH-13901, category 07), and Undo restores the state the insight had (131403). Nothing else on the page deletes.

## 12 — State preservation

Status: DEFINED

The Assigned chip, the dismissed notice and the chosen player live in the page's own state, so they stay while the page is open (131201). The chosen player or insight is not in the address: a reload reads the server again and opens on the first player. There is no form, so no text to keep. Not tested: that the dismissed notice survives choosing another player, and a reload.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 131201 | — | `THIS_VISITS_CHANGES_STAY_WHILE_THE_PAGE_IS_OPEN` | The Assigned chip, the dismissed notice and the chosen player are held in the page's own state: choosing another player and coming back finds the chip still there. A reload reads the server again and opens on the first player (the chip then comes from the focus-area read). The chosen player or insight is not kept in the address. |

## 13 — Optimistic UI

Status: N/A — nothing is optimistic: the chip, the dismissed notice and the returned card wait for the server, and the buttons stay disabled until it answers (CH-13403).

## 14 — Retry / recovery

Status: DEFINED

The error toast's Retry runs the same write with the same arguments, and when it lands everything the button would have done follows (131401); Try again on a failed-read notice has the server read the whole page again (131402); Undo puts an insight back in the state it had (131403).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 131401 | — | `RETRY_FINISHES_THE_JOB` | The error toast's Retry runs the same write again with the same arguments, and when it lands everything the button would have done follows, because the follow-ups live inside the action: Assign shows the chip, Dismiss the notice, Undo the returned focus card. Every control on the board waits while any of the three is running. |
| 131402 | — | `TRY_AGAIN_REREADS_THE_PAGE` | Try again on a failed-read notice (CH-13201, CH-13202, CH-13203) has the server read the whole page again (router.refresh); no section re-reads itself and nothing retries a read on its own. |
| 131403 | — | `UNDO_RESTORES_THE_STATE_THE_INSIGHT_HAD` | Undo calls reactivateInsight with the lifecycle state the insight had when it was dismissed (detected, matured, addressed or resolved), so it returns to the feed where it was rather than always as new. The dismissed notice stays until it has landed. |

From the shell (P001): 11401 ROUTE_TRY_AGAIN, 11402 TOAST_RETRY.

## 15 — Data freshness / sync

Status: DEFINED

Nothing refreshes in the background: the page is as fresh as its last read (131501). Each card says when its read was made (131503), and a read older than the player's newest completed round is marked Out of date rather than drawn as current (131502, 131504); the check reads the player's completed countable rounds and writes nothing. Insights are ranked and deduplicated by the delivery actions and counted through the v3 visibility rules, not by this page. Not tested: that a landed Assign or Undo does not call `router.refresh`.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 131501 | — | `THE_PAGE_IS_AS_FRESH_AS_ITS_LAST_READ` | Nothing on the page refreshes in the background. A landed Assign, Dismiss or Undo changes the page in place from the board's own state and does not call router.refresh (the dismissed notice is never refreshed away); Try again on a failed-read notice is the one client re-read (131402). |
| 131502 | CH-13903 | `A_READ_IS_OLDER_THAN_THE_PLAYERS` | A read is older than the player's newest completed round |
| 131503 | CH-13905 | `A_CARD_SAYS_WHEN_ITS_READ_WAS` | A card says when its read was made |
| 131504 | CH-13906 | `COACH_THE_TOP_READ_IS_OUT_OF` | Coach: the top read is out of date |

## 16 — Micro animation

Status: DEFINED

The Assigned chip and the dismissed notice rise in once (CH-13601), still with reduced motion or Animations off; hovering a row or a player tints it (CH-13602, preview only). Everything else is the shell's (D-64).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 131601 | CH-13601 | `AN_INSIGHT_IS_ASSIGNED_OR_DISMISSED` | An insight is assigned or dismissed, or a proposed focus area is answered |
| 131602 | CH-13602 | `HOVERING_AN_INSIGHT_ROW_OR_A_PLAYER` | Hovering an insight row or a player |
| 131603 | CH-13620 | `ASK_HIDE_CHATS` | Ask: Hide chats |
| 131604 | CH-13621 | `ASK_THE_PHONE_DRAWER_IS_DRAGGED` | Ask: The phone drawer is dragged |

From the shell (P001): 11601 CH-1601, 11602 CH-1602, 11603 CH-1603, 11604 CH-1604, 11605 CH-1605, 11606 CH-1606, 11607 CH-1607, 11608 CH-1608, 11609 CH-1609, 11610 CH-1610, 11611 CH-1611, 11612 CH-1612.

## 17 — Haptic

Status: DEFINED

On the v2 grammar (D-70): selection for choosing a player or an insight (CH-13701), the light press on Assign as focus with success or error from `useAction` (CH-13702), and the warning before Dismiss (CH-13703).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 131701 | CH-13701 | `A_PLAYER_OR_AN_INSIGHT_ROW_IS` | A player or an insight row is picked |
| 131702 | CH-13702 | `ASSIGN_AS_FOCUS_IS_TAPPED` | Assign as focus is tapped |
| 131703 | CH-13703 | `DISMISS_IS_TAPPED` | Dismiss is tapped |
| 131704 | CH-13704 | `ACCEPT_OR_DECLINE_IS_TAPPED` | Accept or Decline is tapped |
| 131705 | CH-13721 | `ASK_AN_OPENER_PILL_OR_SHORTCUT_CARD` | Ask: An opener pill or shortcut card is tapped |
| 131706 | CH-13752 | `ASK_A_FOLLOW_UP_IS_TAPPED` | Ask: A follow-up is tapped |

From the shell (P001): 11701 CH-1701, 11702 CH-1702, 11703 CH-1703, 11704 CH-1704, 11705 CH-1705, 11706 CH-1706, 11707 CH-1707.

## 18 — Accessibility

Status: DEFINED

The page is labelled by its title and each section is a labelled region (CH-13801); a gauge's numbers are in its legend and its track is hidden (CH-13802); an insight or player row is one button named in words, and a player button is a toggle (CH-13803); Why we think this is a disclosure naming what it controls (CH-13804); the focus is a polite live region (CH-13805); priority is a word, never colour alone (CH-13806). Failed-read and crash notices are alerts and toasts are announced by the shell. Axe over the ten preview states the a11y script walks, at 1280 and 390, was run and clean (131807, reserved: it is not a unit test); the six coach and player states it does not walk are listed in `VERIFY.md`. A full keyboard walk and VoiceOver were not done.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 131801 | CH-13801 | `A_SCREEN_READER_MOVES_THROUGH_THE_PAGE` | A screen reader moves through the page |
| 131802 | CH-13802 | `A_GAUGE` | A gauge |
| 131803 | CH-13803 | `AN_INSIGHT_OR_PLAYER_ROW` | An insight or player row |
| 131804 | CH-13804 | `WHY_WE_THINK_THIS` | Why we think this |
| 131805 | CH-13805 | `CHOOSING_ANOTHER_INSIGHT_OR_PLAYER` | Choosing another insight or player |
| 131806 | CH-13806 | `PRIORITY` | Priority |
| 131807 | — | `NO_AXE_VIOLATIONS_IN_THE_AXE_PREVIEW_STATES` | No axe violations in the ten preview states clubhouse:a11y walks for CoachHelm (the coach's default, assigned, empty, failed, off and loading; the player's default, empty, norounds and failed), at 1280px and 390px: 20 runs, clean on 2026-09-30 as reported by the lead in PROGRESS.md. Checked by npm run clubhouse:a11y (CH_A11Y_PAGES in scripts/clubhouse/a11y.mjs), not by a unit test. Not walked: the coach's noroster, pulsefailed, quiet, failwrites, failundo and duplicate states and the player's working, off and loading states. |
| 131808 | CH-13807 | `THE_PLAYERS_PROPOSED_FOCUS_AREAS` | The player's proposed focus areas |
| 131809 | CH-13820 | `ASK_THE_CHAT_PAGE` | Ask: The chat page |
| 131810 | CH-13821 | `ASK_A_PLAYER_IS_MENTIONED` | Ask: A player is mentioned |
| 131811 | CH-13822 | `ASK_THE_PHONE_CHATS_BUTTON` | Ask: The phone Chats button |
| 131812 | CH-13823 | `ASK_THE_OPEN_CHAT_IN_THE_LIST` | Ask: The open chat in the list |
| 131813 | CH-13850 | `ASK_COACHHELM_IS_WORKING_ON_AN_ANSWER` | Ask: CoachHelm is working on an answer |
| 131814 | CH-13851 | `ASK_THE_EVIDENCE_CONTROL` | Ask: The evidence control |
| 131815 | CH-13852 | `ASK_EVIDENCE_DRAWN_AS_A_CHART` | Ask: Evidence drawn as a chart |

From the shell (P001): 11801 CH-1801, 11802 CH-1802, 11803 CH-1803, 11804 CH-1804, 11805 CH-1805, 11806 CH-1806, 11807 CH-1807, 11808 CH-1808, 11809 CH-1809, 11810 CH-1810, 11811 CH-1811, 11812 CH-1812, 11813 CH-1813, 11814 CH-1814.

## 19 — Responsive layout

Status: DEFINED

The phone build at 820px and below (131901); the phone spec is `docs/clubhouse/phone/coachhelm.md` (approved). CoachHelm is a phone tab for both roles. The pill row and the sheet-free layout are CSS and are not tested.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 131901 | — | `PHONE_LAYOUT` | At 820px and below CoachHelm is the phone build, never a shrunken desktop: the page takes the phone frame, the shell's top bar reads CoachHelm, and the boards, writes and states are the desktop's. Separately, when the page's container is 640px wide or less the coach's players are a row of pills that scrolls sideways. Choosing an insight on the player's phone brings the focus into view; on a wider screen the page stays where it is. |

From the shell (P001): 11901 PHONE_CHROME.

## 20 — Keyboard / input

Status: N/A — CoachHelm has no keyboard handling of its own: every control is a native button or link in the tab order, the player buttons are toggles and Why we think this is a disclosure button. There are no shortcuts. A keyboard walk of the page was not done (`VERIFY.md`).

## 21 — Performance

Status: DEFINED

The loaders read in a few rounds and never per row (132101): a coach's gate, roster, then the pulse, the visible insights and each player's top insight together, then the drills and the focus areas together; a player's gate, feed, then the drills. The coach's board asks for one top insight per player and not their whole feed. Web vitals are the shell's.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 132101 | — | `LOADER_READS_IN_ROUNDS` | The loaders read on the server before first paint, in a few rounds and never per row. A coach: the gate; the roster, then the players' names; then the program pulse, the visible insights (paginated) and each player's top insight (one per player, so only it counts as shown in the effectiveness ledger) together; then the drills and the focus areas made from those insights together. A player: the gate, the feed (up to 30), then the drills; the dismissal and visible reads and the rounds count are read only when the feed comes back empty. A drill or focus-area read that fails is logged and the board draws without it. |

From the shell (P001): 12101 CH-1954.

## 22 — Analytics

Status: DEFINED

The shell records rage, dead and slow clicks for every page. CoachHelm adds no events of its own.

From the shell (P001): 12201 CH-1951, 12202 CH-1952, 12203 CH-1953.

## 23 — Logging / observability

Status: DEFINED

Failed reads are logged by name under the `coachhelm` feature, failed writes are reported under the `coachhelm` surface with their action, intents leave a breadcrumb and a crash reports under its own section (132301). Only some of the read logs are asserted in a test (the contract says which).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 132301 | — | `FAILURES_REPORTED` | A read that fails in a loader is logged through chLogServer('coachhelm', <read>, …) under the coachhelm feature (gate, feed, visible, dismissed, rounds, drills, assigned, roster, players, heads) and named on the page; a write that fails is reported through chReport under the coachhelm surface with its action (coachhelm.assign, coachhelm.dismiss, coachhelm.undo), at low severity when the server refused it, after a chTrail breadcrumb for the intent; a section that crashes reports under its own surface (coachhelm.focus, coachhelm.side, coachhelm.pulse, coachhelm.players). |

From the shell (P001): 12301 FAILURES_REPORTED.

## 24 — CI / automated test

Status: DEFINED

`src/clubhouse/__tests__/coachhelm.test.tsx` names in a test title every catalog code of kinds 0 to 5 on this page that is not marked preview (CH-13001 to CH-13901), which `clubhouse:check` enforces for the catalog. It does not name the hand contracts above by Bridge ID yet, which is why they are reserved.

From the shell (P001): 12401 TESTS_NAME_CONTRACTS.

## 25 — Helm Bridge action

Status: N/A — the Bridge is wired later (owner, D-68). Every contract above already has its Bridge ID; the commands (open the board, choose a player, assign a focus, dismiss an insight) are defined when the Bridge is.
