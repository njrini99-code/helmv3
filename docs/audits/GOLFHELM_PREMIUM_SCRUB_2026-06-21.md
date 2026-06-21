# GolfHelm Dashboard — Premium / Feature-Completeness Scrub (2026-06-21)

Harsh holistic scrub of **every live (Fairway) dashboard feature** against a professionally-engineered premium bar (`GOLFHELM_PREMIUM_SCRUB_CRITERIA_2026-06-21.md`). 37 deep agents (31 features + 6 holistic), each feature graded 1–4 and wired-traced end-to-end, worst findings adversarially verified (refute-by-default).

## Verdict

- **0/31 features are premium-ready.** The dashboard is broadly **Layer 2 (Complete)** — it *works*, but is one full layer below the **Layer 3 (Polished)** ship-bar nearly everywhere.
- **447 confirmed findings**: 57 critical · 127 high · 131 medium · 132 low. (3 refuted in verification.)
- The gap is **systemic, not random**: the same Layer-3 essentials are missing across most features — designed loading/empty/error states, keyboard/focus a11y, mobile parity, optimistic feedback + undo, and pagination honesty. That makes it *high-leverage* — shared-component fixes lift many features at once.

## Systemic theme clusters (fix these once → many features improve)

| Theme | Active findings | The fix |
|---|---:|---|
| **Empty states** (bare 'No data', no CTA) | 43 | one premium `EmptyState` (icon+message+primary CTA), adopted everywhere |
| **Loading states** (spinner-on-blank / missing route skeleton) | 37 | shape-matched skeletons + route `loading.tsx` for every data surface |
| **Focus / keyboard a11y** (cards not keyboard-operable, focus removed) | 28+9 | role/tabindex/Enter-Space on interactive cards, visible 2px focus ring (3:1), focus trap+restore in modals |
| **Mobile parity** (layouts break / touch targets <44px) | 19+ | responsive pass on every surface; ≥44px targets |
| **Error states** (failure masked as cheerful empty) | 16 | throw to route `error.tsx` or inline error+retry; never mask |
| **Optimistic feedback + undo** (no system-status on row actions) | 8+6 | pending/saved feedback + undo toast on triage/mutations |
| **Pagination honesty** (limit:100 truncation, no total) | 6 | disclose total / paginate / 'showing N of M' |
| **Contrast** (text/icon below 4.5:1) | 6 | token-level contrast fixes |

## Scorecard — features (sorted worst-first)

| Feature | Role | Layer | Premium? | Crit | High | Med | Low |
|---|---|:--:|:--:|:--:|:--:|:--:|:--:|
| Messaging | both | 2 | ❌ | 4 | 2 | 4 | 4 |
| Documents | both | 2 | ❌ | 4 | 2 | 3 | 5 |
| Coach Dashboard Home | coach | 2 | ❌ | 3 | 2 | 5 | 4 |
| Alerts / Signals | coach | 2 | ❌ | 3 | 4 | 5 | 2 |
| CoachHelm Intelligence Hub | coach | 2 | ❌ | 2 | 3 | 3 | 3 |
| Patterns | coach | 2 | ❌ | 2 | 3 | 4 | 3 |
| Insights | coach | 2 | ❌ | 2 | 3 | 4 | 4 |
| Coaching Intelligence Settings | coach | 2 | ❌ | 2 | 3 | 4 | 3 |
| Development Plans | coach | 2 | ❌ | 2 | 3 | 4 | 6 |
| Player Hub | player | 2 | ❌ | 2 | 5 | 5 | 3 |
| Announcements | both | 2 | ❌ | 2 | 5 | 4 | 3 |
| Tasks | both | 2 | ❌ | 2 | 3 | 3 | 4 |
| Travel | both | 2 | ❌ | 2 | 3 | 5 | 3 |
| Team Info | both | 2 | ❌ | 2 | 4 | 3 | 5 |
| Settings | both | 2 | ❌ | 2 | 5 | 4 | 3 |
| Player Profile + Genome | coach | 2 | ❌ | 1 | 4 | 3 | 4 |
| Player CoachHelm | player | 2 | ❌ | 1 | 6 | 3 | 6 |
| My Qualifiers | player | 2 | ❌ | 1 | 1 | 3 | 4 |
| Rounds list + Round Review + Recover | player | 2 | ❌ | 1 | 5 | 2 | 5 |
| Classes | player | 2 | ❌ | 1 | 3 | 5 | 6 |
| Calendar & Events | both | 2 | ❌ | 1 | 5 | 3 | 4 |
| Roster | both | 2 | ❌ | 1 | 2 | 2 | 5 |
| Qualifiers | both | 2 | ❌ | 1 | 3 | 4 | 5 |
| Personal Stats | both | 2 | ❌ | 1 | 2 | 4 | 4 |
| What's New | both | 2 | ❌ | 1 | 4 | 4 | 3 |
| Recruiting HQ | coach | 2 | ❌ | 0 | 3 | 2 | 7 |
| Team Stats | coach | 2 | ❌ | 0 | 7 | 4 | 3 |
| Round Entry / Continue / Tracking | player | 2 | ❌ | 0 | 4 | 4 | 4 |
| Course Library | both | 2 | ❌ | 0 | 5 | 3 | 4 |
| CoachHelm Analytics / Effectiveness | coach | 3 | ❌ | 2 | 2 | 4 | 3 |
| My Development | player | 3 | ❌ | 0 | 3 | 2 | 4 |

## Scorecard — holistic dimensions

| Dimension | Layer | Crit | High | Med | Low |
|---|:--:|:--:|:--:|:--:|:--:|
| global-a11y | 2 | 3 | 3 | 3 | 1 |
| navigation-ia | 2 | 2 | 3 | 3 | 1 |
| global-states | 2 | 2 | 4 | 3 | 1 |
| integration | 2 | 2 | 3 | 3 | 1 |
| design-system | 3 | 0 | 3 | 4 | 1 |
| performance-scale | 2 | 0 | 2 | 3 | 1 |

## All 57 CRITICAL findings (verified)


**Alerts / Signals**
- Bulk-action bar + bulk Acknowledge/Resolve/Dismiss — `src/components/fairway/pages/coachhelm/FairwayCoachHelmSignals.tsx:315,1142,1038-1065` · Add a real selection affordance: a checkbox per InsightCard (and a select-all in the toolbar) that calls a toggleSelected(id) which adds/removes from selectedId
- InsightCard click-to-open-panel (keyboard) — `src/components/fairway/cards-insight/InsightCard.tsx:243-245,398-408` · Add onKeyDown to the interactive card that fires the click handler on Enter/Space (e.key==='Enter'||e.key===' ') with preventDefault on Space, OR render the car
- Per-row triage actions (Acknowledge/Dismiss/Focus area) inside interactive card — `src/components/fairway/pages/coachhelm/FairwayCoachHelmSignals.tsx:880-908,946-961` · Wrap action handlers to e.stopPropagation() (or render the card's clickable surface as a sibling/overlay rather than the whole article), and stop nesting button

**Announcements**
- Page data fetch — announcements list — `src/app/golf/(dashboard)/dashboard/announcements/page.tsx:82` · Branch on announcementsResult.success. On !success, render an error state (InlineNotice tone='danger' or a Surface error block) with the action's error message 
- Loading skeleton — `src/app/golf/(dashboard)/dashboard/announcements/loading.tsx:8 + src/components/ui/skeleton.tsx:1018` · Replace loading.tsx with a Fairway skeleton: matte Surface card placeholders matching FairwayCoach/PlayerAnnouncementCard's collapsed layout, a non-sticky ViewH

**Calendar & Events**
- Coach Week/Month view (legacy PremiumCalendarClient embedded under Fairway shell) — `src/components/fairway/pages/calendar/FairwayCalendar.tsx:843-862` · Either build a native FairwayWeekGrid/FairwayMonthGrid for coaches (the player branch already proves this works) and retire the legacy grid on this route, OR ad

**Classes**
- All four modals + ConfirmDialog (the interactive core) — `src/app/golf/(dashboard)/dashboard/classes/page.tsx:447-512` · Re-skin the five overlays onto Fairway primitives (Fairway Drawer/Sheet, Button, Input, Chip, tokens text-text-primary/border-border-subtle/bg-surface/accent-*)

**Coach Dashboard Home**
- Loading state (route skeleton) — `src/app/golf/(dashboard)/dashboard/loading.tsx:1-5 -> src/components/ui/skeleton.tsx:1081-1160` · Build a Fairway-specific dashboard skeleton (or co-locate `loading.tsx` shape with FairwayCoachDashboard): max-w-[1200px], ViewHeader skeleton, Window toolbar, 
- Error handling (data fetch failure) — `src/app/golf/(dashboard)/dashboard/page.tsx:104-119` · Do not catch-to-empty on a real fetch failure. Let the error propagate to the route error.tsx boundary (which offers retry), OR render an explicit InlineNotice 
- Join-request alert banner — `src/components/golf/roster/JoinRequestAlert.tsx:89-112` · Render join requests through a Fairway primitive — e.g. InlineNotice tone='warning' (or an InsightCard variant='default' priority='high') with the existing 'Rev

**CoachHelm Analytics / Effectiveness**
- SSR loader-failure error state — `src/app/golf/(dashboard)/dashboard/analytics/coachhelm/page.tsx:98-107` · Give the SSR error path a real recovery: pass an `action` to InlineNotice with a button (e.g. a client 'Try again' that router.refresh()s, or render this throug
- CoachHelm sub-nav (primary navigation on this surface) — `src/components/fairway/pages/coachhelm/CoachHelmSubNav.tsx:275-312` · Drop role="tablist"/role="presentation". The element is already wrapped in <nav aria-label>; render a plain <ul>/<li> of links and keep aria-current="page" on t

**CoachHelm Intelligence Hub**
- Deep analysis engine (IntelligenceCommandCenter) — design-system consistency — `src/components/golf/coachhelm/v2/IntelligenceCommandCenter.tsx:78-132, 187, 252, 1472-1520, 1780-1811` · Reskin the demoted deep-analysis section to Fairway primitives (InstrumentPanel/Readout/EmptyState/Button + text-text-*, surface-*, fw-success/fw-warning, font-
- getTeamOverview — error masked as empty team — `src/app/golf/actions/team-category-insights.ts:340-351` · Split the branches: on membersError return { success:false, error:'Failed to load team members' } so the Brief shows its InlineNotice 'Couldn’t refresh the team

**Coaching Intelligence Settings**
- Coach philosophy load/save error handling — `src/components/fairway/pages/settings/FairwaySettingsCoachingIntelligence.tsx:133` · Destructure `error` from the hook and render a real error state (InlineNotice tone=danger + a Retry that re-runs the fetch) when error && !loading && !philosoph
- Bubble Zone threshold slider — `src/components/fairway/pages/settings/FairwaySettingsCoachingIntelligence.tsx:298` · Either wire bubble_zone_range into the bubble-player detection logic (it pairs naturally with alert_bubble_player) or hide/remove the Bubble Zone slider the sam

**Development Plans**
- Loading state (route skeleton) — `src/app/golf/(dashboard)/dashboard/development/loading.tsx:4 + src/components/ui/skeleton.tsx:1710-1749` · Author a Fairway-shaped skeleton that mirrors PlayersGridView: a header instrument-cluster block, the segmented + primary-button header actions, and a DataTable
- ?player= deep link (scoped landing) — `src/components/fairway/pages/coachhelm/PlayersGridView.tsx:258-261, 704-751` · When initialSelectedPlayerId is present, initialize view='areas' (e.g. `useState<'grid'|'areas'>(initialSelectedPlayerId ? 'areas' : 'grid')`) so the deep link 

**Documents**
- Upload document → preview/download — `src/app/golf/actions/documents.ts:880-893` · Stop reconstructing storage_path from the URL. Pass the real storagePath ('golf-documents/{teamId}/{fileName}') from uploadGolfDocument through to createGolfDoc
- Upload new version (coach card menu) — `src/app/golf/actions/documents.ts:447-468` · Include file_url in every golf_document_versions insert (uploadNewVersion, createDocument, revertToVersion) — derive it via getPublicUrl(storagePath) as createG
- Version history → Revert to version — `src/components/golf/documents/VersionHistory.tsx:57` · Pass the version's UUID (version.id) to revertToVersion, or change revertToVersion to look up by version_number (.eq('version_number', n)). Keep the parameter n
- Player preview/download access (card + footer affordances) — `src/components/fairway/pages/documents/FairwayDocuments.tsx:1429-1434,1568` · Make the card a real button (as="button" with an accessible label) OR add role/tabIndex/onKeyDown(Enter/Space) to open preview; add group-focus-within:opacity-1

**Insights**
- Bulk actions (Acknowledge / Resolve / Dismiss / floating selection bar) — `src/components/fairway/pages/coachhelm/FairwayCoachHelmSignals.tsx:315,1038-1065,1142-1144` · Add a real selection affordance: give InsightCard a `selected`/`onSelectToggle` prop (a checkbox in the lead column) wired to setSelectedIds, plus a select-all 
- Category deep-link from FairwayBrief (?category=tee) — `src/app/golf/(dashboard)/dashboard/insights/page.tsx:58-70; src/components/fairway/pages/coachhelm/FairwayCoachHelmSignals.tsx:283,308` · In the redesign branch of page.tsx, pass the deep-link through as `category` (the key the live component reads) — e.g. keep `category` as-is or merge into a `ca

**Messaging**
- New message modal (primary CTA flow) — `src/components/golf/messages/GolfNewMessageModal.tsx:13-17,258-328` · Re-skin the New message picker onto Fairway primitives (fairway/overlays Sheet/Dialog + fairway/controls Button/Avatar/Badge + fairway/feedback EmptyState + fw 
- Team broadcast / group-create modal (coach-only secondary CTA) — `src/components/golf/messages/GolfTeamBroadcastModal.tsx:5-19,233-399` · Re-skin to Fairway tokens (fw-danger-bg, surface-tint, accent-*, Fraunces) and Fairway overlay primitives. Mirror the AskWorkspace overlay pattern so the broadc
- Conversation rail — data fetch failure — `src/hooks/golf/use-golf-messages.ts:564-574` · Return an `error` state from useGolfConversations and render a Fairway error state in the rail ('Couldn’t load conversations' + Retry that calls refetch). Same 
- Thread pane — message fetch failure — `src/hooks/golf/use-golf-messages.ts:91-99` · Capture the query error, expose it from the hook, and render a thread error state with Retry. Distinguish 'truly empty thread' from 'failed to load this thread'

**My Qualifiers**
- Page-level data fetch / error state — `src/app/golf/(dashboard)/dashboard/my-qualifiers/page.tsx:78-86` · Distinguish failure from emptiness: pass a dataError flag (or throw to trigger the route error.tsx) when entriesError is set, and render a distinct error state 

**Patterns**
- Pattern card — open detail panel (keyboard) — `src/components/fairway/cards-insight/InsightCard.tsx:243-245,397-408` · Add an onKeyDown handler that calls the click handler on Enter and Space (and preventDefault on Space), or render the interactive surface as a real <button>/wra
- Pattern card — action buttons vs card click target — `src/components/fairway/pages/coachhelm/FairwayCoachHelmSignals.tsx:842-919,958-960` · Do not make the whole card role=button while it also hosts action buttons. Either (a) make only a non-action region (overline/title) the open-detail trigger, or

**Personal Stats**
- Error state (all data fetches) — `src/components/fairway/pages/coachhelm/FairwayStatsCockpit.tsx:370-377` · Make the loaders signal failure distinctly from emptiness (e.g. getDetailedStats returns {ok:false} on caught error, or the leak/standing {success:false,error} 

**Player CoachHelm**
- Overview · loading state — `src/app/golf/(dashboard)/dashboard/coachhelm/loading.tsx:167-249` · Replace with a Fairway-native skeleton (fairwayScope bg-canvas, max-w-[1200px], ViewHeader + sub-nav placeholder + InstrumentCluster-shaped blocks) matching the

**Player Hub**
- Mark-task-complete (optimistic write) — `src/components/fairway/pages/hub/FairwayPlayerHub.tsx:353-366` · On !result.success, surface the typed error via useToast (showToast(result.error ?? 'Could not complete that task — try again', 'error')) before/after reverting
- RSVP (Going / Maybe / Can't go) optimistic write — `src/components/fairway/pages/hub/FairwayPlayerHub.tsx:381-393` · Toast result.error on failure (and ideally pass a richer onRSVP signature returning the result so RSVPRow can show inline state). This is the single highest-val

**Player Profile + Genome**
- Player Insight — zero-rounds profile (composite + standing + verdict) — `src/components/fairway/pages/coachhelm/FairwayPlayerInsight.tsx:603,621-625,278-285` · Add a zero-data branch: when rounds.length===0 (or compositeRating is a synthetic default), render an honest empty state ('No rounds recorded yet — invite the p

**Qualifiers**
- Selection workspace — Coach pick Remove button — `src/components/fairway/pages/qualifiers/FairwayQualifyingWorkspace.tsx:394-403` · Gate the destructive removal behind a confirmation (Fairway AlertDialog / overlay) or provide an undo toast (sonner action) that re-invokes setQualifierCoachPic

**Roster**
- Coach roster card · Avg Score stat — `src/app/golf/(dashboard)/dashboard/roster/page.tsx:290-294` · Paginate this query past the PostgREST 1000-row hard cap (use the project's fetchAllRowsResult / .order('id').range(...) helper) OR aggregate per-player server-

**Rounds list + Round Review + Recover**
- Round Review engine page (/rounds/[id]/review) — `src/app/golf/(dashboard)/dashboard/rounds/[id]/review/page.tsx:533-548, 660-698, 870-885` · Build a FairwayRoundReview surface (ViewHeader + Fairway primitives) behind isRedesignEnabled() exactly as the Detail/Library/Recover pages do, wrapping the roo

**Settings**
- All text inputs (Personal info, Email, Password, Player golf details, Team settings, Invite) — label association — `src/components/fairway/pages/settings/FairwaySettingsGeneral.tsx:148-154, 594-598, 666-671, 718-732, 1304-1332, 1460-1494` · Associate every label with its control: either pass `label=` into a label-aware Fairway field wrapper, or give each Input an id and render FieldLabel as <label 
- Notifications page — bulk actions (Reset defaults / Mute push / Mute email) — `src/components/fairway/pages/settings/FairwaySettingsNotifications.tsx:139-155` · Add a single server action that sets the entire prefs object atomically (one read-modify-write), and have Reset/Mute call it once. Do not fan out N parallel sin

**Tasks**
- Task list data fetch (error state) — `src/app/golf/(dashboard)/dashboard/tasks/page.tsx:68` · Destructure `error` from useTaskRealtime, pass it to FairwayTasks as a prop, and render an InlineNotice tone="danger" with a 'Try again' action wired to refetch
- Player 'Mark complete' button — `src/app/golf/(dashboard)/dashboard/tasks/page.tsx:145` · Check the result: on !success show fairwayToast.error(result.error ?? 'Could not mark complete.'); on success show fairwayToast.success('Marked complete.'). Mir

**Team Info**
- Team Hub — Tasks tab (mark complete) — `src/components/fairway/pages/team-hub/FairwayTeamHub.tsx:383-410` · On `!result.success`, after reverting, call fairwayToast.error(result.error || 'Could not mark task complete. Please try again.'). Mirror the legacy hub's optim
- Team Settings — edit team (Save changes) — `src/components/fairway/pages/team/FairwayTeamSettings.tsx:320-329` · Add `disabled={!teamName.trim()}` to the Save button AND a guard in handleUpdateTeam (toast 'Team name is required'). Defensively, reject empty trimmed names in

**Travel**
- Expenses → Add/Edit Expense → Receipt upload — `src/components/golf/travel/ExpenseForm.tsx:134-139` · On submit, when receiptFile is set, call uploadExpenseReceipt(receiptFile, teamId, expense?.id) and use the returned url as receipt_url before create/update; su
- Expenses tab (reused legacy ExpenseSummary/ExpenseList/ExpenseForm) — `src/components/golf/travel/ExpenseSummary.tsx:23-30,116,131,190,226,324-350` · Re-skin the expense components to Fairway tokens (text-text-*, bg-surface/surface-sunken, accent-*, fw-warning/fw-danger, StatusPill for paid-by, no emoji) OR b

**What's New**
- Loading skeleton — `src/app/golf/(dashboard)/dashboard/whats-new/loading.tsx:5-12` · Make loading.tsx redesign-aware: when isRedesignEnabled(), render a Fairway skeleton matching FairwayWhatsNew (max-w-[720px], bg-canvas, ViewHeader-shaped block

**holistic:global-a11y**
- Primary CTA contrast (Button variant=primary) — `src/components/fairway/controls/button.tsx:61` · Darken the green for filled buttons to ~accent-600/700 (oklch ~0.49-0.52L → ~4.5:1+ with cream text), or bump text-on-accent to pure white AND darken green. acc
- Form control focus ring alpha (Input/Switch/Checkbox/RadioGroup/Combobox) — `src/components/fairway/forms/styles.ts:55` · Use the solid border-focus token (full-opacity accent-500) for focus rings, matching the controls' fwFocusRing (ring-border-focus, no alpha). Drop the /70. Even
- Page inputs: invisible / sub-3:1 focus on bare title & search fields — `src/components/fairway/pages/calendar/FairwayEventEditor.tsx:595` · Give each standalone transparent input a real focus indicator: either add focus-visible:ring-2 focus-visible:ring-border-focus to the input, or wrap it in a con

**holistic:global-states**
- Error state masked as empty — server route catch-to-empty — `src/app/golf/(dashboard)/dashboard/rounds/page.tsx:128` · Do not catch-to-empty in the data path. Let the fetch throw so error.tsx (which already exists with title/message/retry/home) handles it, OR distinguish a real 
- Dashboard home fabricates zeroed stats on DB failure (data lie) — `src/app/golf/(dashboard)/dashboard/page.tsx:107` · Remove the fabricated-zero fallback. Re-throw so the route's error.tsx fires (it already exists), or branch to a true error surface. Per the rubric, never rende

**holistic:integration**
- Command palette deep-links (find-and-act) — `src/components/golf/CommandPalette.tsx:272` · Either (a) consume ?playerId= on the roster page to auto-open/scroll-to/highlight that player (and the Fairway FairwayCoachRoster), or (b) repoint the palette t
- Command palette deep-links (recent insights) — `src/components/golf/CommandPalette.tsx:308` · Add an `id` param to InsightsPageProps and have InsightsPageContent select/scroll-to/highlight that insight (or open its detail), mirroring how ?category is fol

**holistic:navigation-ia**
- Command Palette — Players deep-link — `src/components/golf/CommandPalette.tsx:272` · Either (a) make the roster route consume ?playerId= and scroll-to + highlight (or open the player drawer/profile) that card, or (b) repoint the palette Players 
- Command Palette — Recent insights deep-link — `src/components/golf/CommandPalette.tsx:308` · Thread ?id= through the insights page into FairwayCoachHelmSignals and seed `openRowId` from it on mount (then strip the param), so the palette result opens the

## Full detail
Every finding (450 rows incl. medium/low + refuted) with file:line, evidence, recommendation, layer, and verdict is in `_premium_scrub_2026-06-21/FINDINGS.csv`.
