# Clubhouse secondary screens: Intuitive Software Design improvement evidence

Mode: **IMPROVE**. This is a scoped correction, not a usability score or a
product-wide audit.

## Evaluation frame

- Intended users: college golf coaches reviewing their roster and players' form;
  players replying to team events, acknowledging a coach's post and completing
  team tasks.
- Starting points: the Roster or Stats screen reached through the existing phone
  navigation, and Team Hub Home for a player. Golf terms and team roles remain
  intact.
- Success: recognize the current player/window/event, choose a relevant action,
  distinguish a save in progress from its confirmed result, and recover from
  refusal without losing the prior state.
- Evidence: owner mobile boards in `design/handoff/`; local WebKit iPhone 13
  previews; deterministic fixture actions; source paths below; deferred-write
  unit checks. Earlier design-depth captures are in the page VERIFY logs.
- Not evaluated: intended-user research, physical iPhone Safari responsiveness,
  screen-reader operation, live database read-back, production permissions,
  durable cross-device results. No usability percentages or scores are assigned.

## Short task traces

| Task and visible clue | Prediction | Evidence-supported result | Continuation and boundary |
| --- | --- | --- | --- |
| Coach reviews a player's form: Roster row shows their name, status and average; tapping it opens their named profile. | The profile belongs to that player; Roster goes back to the list. | WebKit fixture walkthrough opened Theo's profile with Scoring trend, Recent rounds and All 24, plus Message and Plan 1:1. The existing list status wraps rather than hiding its reason. Profile spacing and figure material now match the list. | Profile navigation and displayed data were observed; message delivery, meeting creation and private-note persistence were not exercised. |
| Coach changes a statistics window: Last 10, Season and Qualifiers are visible with a filter control. | The figures belong to the selected window, or explain that an earlier window remains while loading. | Source `StatsTeamIslands.tsx` and `WindowSwitch.tsx` retains old figures with UpdatingNote, refuses an offline change and names what is still shown. The phone filter button was sized 40px; it now has an explicit 44px target. | Existing empty/failed previews retain their recovery copy. Live navigation/window loading is outside this focused correction. |
| Player replies to an event or completes a task: each event has Going/Maybe/Can't, each task a check. | Selection should be acknowledged, and its save should be distinguishable from completion. | Before correction, `useAction` prevented duplicate writes through one hook-wide gate, but controls exposed no pending state; another event/task could be silently refused as busy. The correction gives each object a Hub-lifetime action gate and pending feedback shared across tab remounts and older Retry callbacks. | Only the saving object's controls lock. Another object can proceed. Refusal rolls back and offers Retry for that original object/request. Fixture results and deferred-write tests are evidence of this behavior, not durable production storage. |
| Player acknowledges a coach's post: Got it sits on the named post. | It should be clear whether acknowledgment reached the service before moving on. | Previously the optimistic acknowledgment could advance Home to another post before its write answered. Acknowledging now names and retains the same featured post until the answer; success advances, failure restores Got it and Retry. | This preserves the existing acknowledgment action and failure copy. A real-account read-back remains unverified. |

## Diagnoses and smallest complete corrections

### Pending writes looked completed, or a later action was ignored

- **Area:** Flow and Feel. **Friction:** Feedback and Interaction. **Earliest
  Loop break:** Confirm. **Severity:** Medium for these non-destructive fixture
  actions; prevalence is unknown.
- **Observation:** `TeamHub.tsx` shared one `useAction` gate among all replies
  and one among all completion writes. `parts.tsx` exposed selected/check states
  without a pending affordance. The hook returned busy before executing another
  object's callback. Completing and reopening a task used separate gates, so the
  optimistic new state permitted the opposite action while the first was still
  pending.
- **Inference:** A player could mistake an optimistic choice for a confirmed
  save or repeat a tap that the implementation ignored. No human observation is
  asserted.
- **Correction:** `TeamHub` owns per-object ref gates and pending state for the
  Hub visit. `ReplyChoices`, `Acknowledgement` and `TaskRow` consume that state
  and retain the existing shared hook for outcomes. The parent gates survive
  tab remounts and retained toast Retries. They preserve offline
  refusal, failure reporting, rollback and Retry. Reply choices lock only that
  event; complete/reopen share a single gate for the task. Pending copy names
  the object. Home retains its post until acknowledgment confirms.
- **Functional acceptance:** unresolved writes expose pending state and block
  that object's duplicate/opposite action; an independent object still sends;
  refusal restores prior state; acknowledgment Retry targets the same post and
  success continues to the next post.
- **Human validation still needed:** Ask a player, "Reply to the team dinner and
  finish the travel waiver. Explain which changes have reached your coach."
  Observe their account of pending, confirmed and failed results without naming
  a control or coaching the response.

### Phone controls and profile rhythm were inconsistent

- **Area:** UI. **Friction:** Interaction and Interpretation. **Loop stages:**
  Act and Orient. **Severity:** Low.
- **Observation:** The stats filter's own phone CSS specified 40×40px. The
  pushed roster profile kept 14px gutters/12px gaps and a flat figures strip
  while the repaired list used 16px gutters/gaps and layered sheet material.
- **Correction:** The filter is 44×44px; the profile inherits the same spacing
  and figure material as its parent. No controls, policy rules or data fields
  were added, removed or renamed.
- **Acceptance:** the filter rectangle is 44×44px in WebKit at 375/390/430; the
  profile remains inside the viewport and preserves the original player identity
  and navigation. Color/depth preference follows the owner's supplied designs
  and is not treated as evidence of usability.

## Strengths retained

- Failed data reads remain distinct from empty results; figures do not invent
  zero values.
- Roster identity and actionable status remain beside the player.
- Statistics window-change copy explicitly names the figures still shown.
- The shared action hook retains offline feedback, error reporting and Retry.
- Owner-approved sheet gradients, highlights and layered shadows remain.

## Validation and remaining coverage

The first Hub deferred-write regression pass completed **139 tests** in one worker,
including independent event/task saves, duplicate prevention, rollback and
acknowledgment Retry. WebKit preview evidence and screenshot labels are recorded
in the corresponding page VERIFY files. These checks establish the tested local
behavior; they do not establish general human discoverability, physical Safari
performance or durable live-data outcomes. No critical failure is established in
this limited scope; untested behavior remains untested.

### Tab/remount and retained Retry follow-up

A scoped source review found that row-owned hook gates disappeared when a Hub
tab unmounted. Gates and displayed pending state now live with the Hub and are
keyed by event, post or task. Older Retry callbacks consult the same ref before
applying optimistic state. Busy contention is quiet, and acknowledgment rollback
reads its last confirmed ref. Added deferred regressions cover task/reply tab
return, shared Home/Announcements acknowledgment state, Retry during another
write for the same event, and stale acknowledgment Retry refusal after success.

The final Hub suite passed **144/144 tests**, exit 0, in 37.46 s with one
unit-dom worker. The scoped source review found no remaining blocker in these
tab/remount/Retry seams. This verifies mocked-write behavior; physical Safari,
intended-user understanding and production read-back remain unverified.
