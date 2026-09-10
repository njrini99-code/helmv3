# PR #1930 pre-land review — my own verification (not the subagents')

## Independently re-run on branch tip f36204936
- `npx tsc --noEmit` -> exit 0, clean.
- `npx vitest run src/components/fairway src/lib/calendar src/test/fairway src/test/lib/calendar src/test/api/calendar`
  -> 228 files, 1760 tests, ALL PASS (exit 0). Wider than the PR body's claimed 76 files / 654 tests;
     this run covers the non-calendar Fairway consumers (travel, rounds-*, coachhelm, documents, forms).
- GitHub required checks: all 6 green (CI aggregate, Review Gate aggregate, CodeQL Analyze x3,
  block-historical-edits). Branch is MERGEABLE but BEHIND main by 3 commits.

## Sentry "Snapshot Testing" FAILURE (non-required check) — RESOLVED as noise
Snapshot 796091, head f3620493 vs base a5ee89fb, 9 changed / 21 unchanged.
  golf-player-calendar-mobile      61.66%  <- expected, this PR's subject
  golf-player-calendar-desktop     31.88%  <- expected
  baseball-coach-calendar-desktop   1.88%  <- INVESTIGATED, see below
  public-baseball-login-mobile      0.19%
  golf-player-dashboard-mobile      0.05%
  public-baseball-login-desktop     0.05%
  golf-player-dashboard-desktop     0.02%
  golf-player-rounds-{desktop,mobile} 0%

VERDICT: every non-calendar diff is CAPTURE-TIME NON-DETERMINISM, not a regression.
Evidence:
- Login + dashboard masks isolate to the greeting line alone. src/lib/entry/greeting.ts:85-90 ->
  'Good evening.' for hour in [17,22), 'Welcome back.' for hour >=22 or <5.
  Base rendered 'Good evening.', head rendered 'Welcome back.' => base captured in the evening,
  head captured late night. Nothing in the diff touches greeting.ts.
- baseball-coach-calendar-desktop: base shows the week grid scrolled to now (1PM-7PM, green
  now-indicator visible); head shows it clamped to the top of the day grid (6AM-12PM, no
  now-indicator). Consistent with the same late-night capture: "now" falls before the grid's
  start hour so scroll-to-now clamps to 0. Diff mask contains only hour labels and row
  boundaries, i.e. a scroll offset, plus subpixel AA on the day-header row.
- Reachability check: AppShell's new `--fw-hub-subnav-offset` has exactly ONE consumer,
  src/components/fairway/pages/calendar/FairwayCalendarHero.tsx:157 (golf). Baseball's calendar
  shell (src/components/baseball/calendar/CalendarFairway.tsx:99-101) reads
  `--golf-mobile-header-offset` (unchanged by this diff) and `--baseball-hub-subnav-offset`.
  The baseball grid itself (BaseballCalendarWrapper -> PremiumCalendarClient) is not in the diff.

SEPARATE, PRE-EXISTING: the snapshot harness is time-of-day non-deterministic, so this check will
keep producing false failures on unrelated PRs. Worth raising as its own issue; NOT a blocker here
and NOT caused by this PR.

## Shared-kit surface (the PR's central claim)
79 files reference ModalShell, 58 render <Segmented>. The PR asserts default rendering is unchanged
for all of them. The 1760-test run plus the 21 unchanged snapshots are the empirical support.
Subagent dimension `shared-kit-neutrality` is auditing the code-level claim.

## Knowledge-registry gap (verified myself, `npm run knowledge:map`)
  src/components/fairway/app-shell/AppShell.tsx   -> impactedFeatures: []
  src/components/fairway/overlays/ModalShell.tsx  -> impactedFeatures: []
  src/components/fairway/controls/segmented.tsx   -> impactedFeatures: []
  src/components/fairway/pages/calendar/FairwayCalendar.tsx -> calendar_events  (mapped, control)
  src/lib/calendar/scheduling/evaluate.ts                   -> calendar_events  (mapped, control)
The PR body admits AppShell is unmapped; in fact the entire shared Fairway kit (app-shell,
overlays, controls) is unmapped, so the registry derives NO required checks for the three
highest-blast-radius files this PR touches. AGENTS.md: "If a file is unmapped, report or repair
the gap." Recommend repairing the registry (separate change), not blocking this PR on it.


# PR #1930 — verified findings (3-lens adversarial panel, 50 agents)

Confirmed 12 | Refuted 2 | 0 blockers


## [HIGH] src/components/fairway/pages/calendar/CalendarSchedulingDialog.tsx:70
**Scheduling dialog's error/loading fallback ignores the safe-area contract ModalShell delegates to it, on every date-window change**  
*dimension: design-system-a11y · panel 3/3 standing*

ModalShell's `presentation="workspace"` phone layout is full-bleed (`top:0`, `rounded-none`, no shell padding) and explicitly documents that the child owns safe-area insets: `src/components/fairway/overlays/ModalShell.tsx:242-244` — "Phone workspace: top 0 / bottom = keyboard; the safe-area padding is the child's job (its header pads env(safe-area-inset-top))." `SchedulingWorkspace.tsx` upholds this: its header pads `env(safe-area-inset-top,0px)` (line 673) and its footer pads `env(safe-area-inset-bottom,0px)` (line 981). But `CalendarSchedulingDialog` renders `SchedulingWorkspace` only when `snapshot` is non-null; whenever it is null it falls back to a second, sibling branch (`CalendarSchedulingDialog.tsx:70-74`) that is a bare `<div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">` with no `env(safe-area-inset-*)` padding at all — just a flat 16px (`p-4`) on phone. Its first content, the Back button + "Find a time" title (line 71), sits ~16px from the true top edge of a `top:0` full-bleed sheet. Per `useScheduleWindow`'s reducer (`src/hooks/golf/use-schedule-window.ts:89-93`), `snapshot` resets to `null` on *every* request-key change (i.e. every date jump inside the workspace, not just first mount), so this un-padded branch recurs throughout normal use, not only at initial open. The error sub-branch (line 72: `role="alert"` + "Try again") is the more serious case: it persists indefinitely until a retry succeeds, unlike the transient loading skeleton (line 73). ModalShell's own code comments (`ModalShell.tsx:295-305`) record a prior, materially identical incident for the `dialog` presentation — a modal rendered flush to `top:0` without accounting for the safe area and "the clock painted on top of the panel" on a notched iPhone (owner device report, 2026-08-26) — showing this exact failure mode has already bitten this codebase once and was fixed only for the other code path.

**Failure scenario.** On an iPhone with a notch/Dynamic Island, in the Capacitor app, open "Find a time" (or change the date while it's open) so `snapshot` is briefly or persistently null: the Back button and "Find a time" title render only ~16px below the true top edge of the full-bleed sheet, under the status bar/notch safe area (~47-59pt on affected devices) instead of below it. If the schedule fetch fails, this state is not transient — the `role="alert"` error message and "Try again" button stay obscured/cramped under the notch until the user successfully retries, with no way to dismiss other than closing the whole workspace.

**Evidence.** CalendarSchedulingDialog.tsx:70 `<div className="min-h-0 flex-1 overflow-auto p-4 md:p-6">` (no safe-area padding); line 71 Back button + title as first content; line 72 `role="alert"` error branch that persists until retry. ModalShell.tsx:242-244 comment: "the safe-area padding is the child's job (its header pads env(safe-area-inset-top))"; ModalShell.tsx:321-328 sets `top: 0` for workspace+phone. SchedulingWorkspace.tsx:673 and :981 show the correct pattern (`env(safe-area-inset-top,0px)` / `env(safe-area-inset-bottom,0px)`) that the fallback branch omits. use-schedule-window.ts:89-93: `current.key === key ? {...loading:true} : {key, snapshot:null, loading:true, error:null}` — snapshot nulls out on every key change, not just mount.


## [MEDIUM] src/components/fairway/pages/calendar/scheduling/SchedulingWorkspace.tsx:534
**Drag handle/band pointer handlers have no pointerId check, so a second touch on them mid-drag can hijack or truncate the gesture**  
*dimension: scheduling-workspace · panel 3/3 standing*

beginDrag (521-529), handlePointerMove (534-536), handlePointerUp (542-549) and cancelDrag (538-540) are the shared handlers wired to BOTH the slider handle (onPointerDown={handlePointerDown} at 763, onPointerMove/Up/Cancel at 764-766) and the band (onPointerDown={handleBandPointerDown} at 898, onPointerMove/Up/Cancel at 899-901). None of them compares event.pointerId to the pointer that started the gesture. `dragging` is a single boolean and `dragRef.current` (grabOffsetPx, frame, lastX) is a single shared record, not keyed by pointer id.

**Failure scenario.** User starts dragging the band with finger A (pointerId 1): beginDrag sets dragging=true, captures pointer 1, and records grabOffsetPx from finger A's contact point. While still down, finger B (e.g. a thumb resting near the wide band/handle on a phone) also touches the band, firing onPointerDown again: beginDrag runs a second time, overwriting dragRef.current.grabOffsetPx with finger B's offset and capturing pointer 2 on the same element — dragging stays true (already set). From here handlePointerMove feeds whichever finger last moved into dragRef.current.lastX regardless of which pointer sent it, so the band visibly jumps between the two contact points. If finger B lifts first, handlePointerUp does not check which pointer this is — it unconditionally computes `landed` from finger B's release position and calls endDrag(event.clientX), setting dragging=false and committing finger B's position as the final selected time, even though finger A is still physically down mid-drag. Finger A's subsequent pointermove is now ignored (`if (dragging)` is false) and its own pointerup is a no-op (`if (!dragging) return`), so the drag silently ends early on the wrong finger's position with no visible cause to the user.

**Evidence.** SchedulingWorkspace.tsx:521-529 `const beginDrag = (event, mode) => { ...; setDragging(true); event.currentTarget.setPointerCapture?.(event.pointerId); selectFromPointer(event.clientX); };` and :542-549 `const handlePointerUp = (event) => { if (!dragging) return; const landed = snappedStart(trackX(event.clientX) - dragRef.current.grabOffsetPx) ?? selectedStart; endDrag(event.clientX); fwHaptic(...); };` — no `event.pointerId` comparison anywhere in this cluster, contrasted with the lane-tap path (line 562: `tap.id !== event.pointerId`) which does check ids.


## [MEDIUM] src/components/fairway/pages/calendar/scheduling/SchedulingWorkspace.tsx:798
**Scheduling-workspace time-ruler slot touch target regressed from a compliant 56px to a non-compliant 32px tall hit area**  
*dimension: design-system-a11y · panel 3/3 standing*

The hour-ruler row is a real, keyboard/AT-exposed interactive control: `<PressTarget aria-label={`Choose ${formatTime(...)} start`} aria-pressed={selected} onClick={...}>` (lines 787-796) with `className` including `'relative h-8 w-full ...'` (line 798) — `h-8` = 32px tall. Its column width is fixed by the grid track at `[--slot-width:24px]` on mobile (line 748), unchanged from `main`. On `main` (`git show main:...SchedulingWorkspace.tsx:544-564`), the equivalent control was `<Button variant="ghost" size="md" className="relative min-h-14 w-full ...">` — `min-h-14` = 56px tall, at the same 24px width. So the mobile hit area shrank from 24x56px (1344px^2) to 24x32px (768px^2), a ~43% reduction, and now both dimensions sit well under the repo's own stated 44px WCAG 2.2 AA 2.5.8 touch-target convention, which this very PR applies elsewhere in the same file's sibling controls and cites explicitly in `segmented.tsx:81,130,133` ("44px touch-target minimum (WCAG 2.2 AA 2.5.8)") and enforces in `PopoverPanel.tsx:198-199` ("44px tap-target floor... was min-h-[36px], 8px short. Every PopoverPanel menu app-wide inherits the fix."). `PressTarget` itself (`src/components/fairway/controls/press-target.tsx`) renders a plain native button with no hit-slop/padding trick that would compensate for the smaller visual box, so this is a real shrink of the actual hit area, not just a visual one.

**Failure scenario.** On a 320-390px-wide phone with a touch (coarse) pointer, in the scheduling workspace's hour-ruler row, each 15-minute start-time slot is only 24px wide by 32px tall — below the repo's own 44px minimum on both axes, and 24px shorter than it was before this PR. A user with reduced dexterity or a larger finger has a materially smaller, harder-to-hit target for picking a start time than the ruler slots had prior to this change, and than comparable coarse-pointer targets elsewhere in the same PR (e.g. Segmented's `[@media(pointer:coarse)]:min-h-[44px]`, PopoverPanel's `min-h-11`).

**Evidence.** SchedulingWorkspace.tsx:748 `[--name-width:116px] [--slot-width:24px] md:[--name-width:120px] md:[--slot-width:40px]`; lines 787-799 PressTarget with `aria-label`, `aria-pressed`, `onClick`, and className `'relative h-8 w-full border-b border-border-subtle px-0 ...'`. `git show main:src/components/fairway/pages/calendar/scheduling/SchedulingWorkspace.tsx:544,564` shows the prior control: `className="grid min-w-max [--slot-width:24px] md:[--slot-width:32px]"` and `'relative min-h-14 w-full !rounded-none !border-0 border-b border-r border-border-subtle px-2 ...'` (min-h-14 = 56px). segmented.tsx:81 "meet the 44px touch-target minimum (WCAG 2.2 AA 2.5.8)"; PopoverPanel.tsx:198-199 "44px tap-target floor (WCAG 2.2 AA 2.5.8) — was min-h-[36px], 8px short."


## [MEDIUM] src/components/fairway/overlays/ModalShell.tsx:242
**ModalShell presentation="workspace" has zero test coverage anywhere**  
*dimension: test-quality · panel 2/3 standing*

ModalShellPresentation ('dialog'|'workspace') and the phone-vs-stage branching (workspace && workspacePhone at line 242-247, the divergent inline style block at lines 320-338, and the sm+ wide-stage class list at line 351) are brand-new in this diff. The ONLY caller that passes presentation="workspace" is CalendarSchedulingDialog.tsx:44. There is no CalendarSchedulingDialog test file at all (confirmed: no file matches `find src -iname '*CalendarSchedulingDialog*'` other than the source itself), and none of the three existing ModalShell test files (ModalShell.focus-restore.test.tsx, ModalShell.coarse-pointer-focus.test.tsx, ModalShell.select-focus.test.tsx) reference 'workspace' (grep confirms zero matches). SchedulingWorkspace.test.tsx renders <SchedulingWorkspace> directly, never through ModalShell, so it cannot exercise this branch either.

**Failure scenario.** Swap the ternary at ModalShell.tsx:320-338 (e.g. invert `workspace && workspacePhone`) or drop the `sm:h-[min(88dvh,900px)] sm:w-[calc(100vw-1rem)]` classes at line 351: the 'Find a time' workspace would render as a plain centered dialog on phones (losing the edge-to-edge fill) or lose its wide desktop stage sizing. Every test in the suite — including the broad run covering src/components/fairway — stays green because nothing ever mounts ModalShell with presentation="workspace".

**Evidence.** export type ModalShellPresentation = 'dialog' | 'workspace'; (ModalShell.tsx:75); `const workspace = presentation === 'workspace'; ... const workspacePhone = workspace && phone;` (ModalShell.tsx:242-247); consumed only via `presentation="workspace"` in CalendarSchedulingDialog.tsx:44 (git diff main...HEAD). `find src -iname '*CalendarSchedulingDialog*'` returns only the .tsx source; `grep -rln 'presentation=.\?workspace' src --include='*.test.ts*'` returns nothing.


## [MEDIUM] src/components/fairway/controls/segmented.tsx:91
**Segmented's new `quiet` prop has no assertion anywhere in the test suite**  
*dimension: test-quality · panel 3/3 standing*

`quiet` (segmented.tsx:91-97) drives three real behavioral branches: SegmentedPill's flat vs. lifted-thumb-with-dot rendering (segmented.tsx:218-229 vs 230-276), the track's `data-quiet`/transparent-border/no-inset-shadow styling (segmented.tsx:335-337), and is the only reason FairwayCalendarHero passes `quiet` to its view selector (FairwayCalendarHero.tsx:266). The pre-existing segmented.test.tsx was NOT touched by this diff and has zero references to 'quiet' (grep confirms). FairwayCalendarHero.test.tsx renders the real (unmocked) Segmented but its only assertion touching the view selector is `getByRole('radiogroup', { name: 'Calendar view' })` — nothing checks the quiet-specific rendering (no dot, flat pill, transparent border).

**Failure scenario.** Break the `quiet` conditional in SegmentedPill (e.g. always render the dot + PILL_SHADOW highlight regardless of `quiet`) or drop `data-quiet`/`border-transparent` from the track className: the calendar's view-switcher would silently regain the carved/dotted look this PR says it deliberately removed ('no carved inset shadow, no lifted thumb highlight, no indicator dot' — segmented.tsx:86-88), and no test in the repo would fail.

**Evidence.** `grep -n "quiet" src/components/fairway/controls/segmented.test.tsx` returns nothing. `quiet` consumed at FairwayCalendarHero.tsx:266 inside `<Segmented ... quiet aria-label="Calendar view" />`. FairwayCalendarHero.test.tsx's only view-selector assertion: `expect(screen.getByRole('radiogroup', { name: 'Calendar view' })).toBeInTheDocument();`


## [MEDIUM] src/components/fairway/pages/calendar/FairwayCalendar.tsx:247
**Month-scoped agenda window and empty-state period naming are untested**  
*dimension: test-quality · panel 2/3 standing*

This diff changes Agenda's fetch/render window from a fixed ±3-month span to exactly the focused month (`if (view === 'agenda') { return { start: startOfMonth(focusDate), end: endOfMonth(focusDate) }; }`) and wires a new `periodLabel` prop into FairwayAgendaView for both month (`format(focusDate, 'MMMM yyyy')`) and week (`` `the week of ${format(visibleWindow.start, 'MMMM d')}` ``) so an empty period names itself instead of saying generic 'Nothing upcoming'. There is no FairwayCalendar.tsx test file that exercises view-window computation (only the narrow, untouched FairwayCalendar.sortEventsStably.test.tsx exists). FairwayAgendaView.test.tsx — which does test empty/range behavior — was NOT touched by this diff and never passes `periodLabel`; grep confirms zero references to `periodLabel` anywhere under src/**/*.test.ts*.

**Failure scenario.** Revert the agenda branch back toward a multi-month window, introduce an off-by-one at startOfMonth/endOfMonth boundaries, or break the periodLabel wiring entirely (e.g. forget to pass it, or swap the month/week strings): a coach opening an empty month would see the wrong (or generic, unscoped) empty-state text, or the agenda would silently fetch/show events outside the month the title claims to show — and no test would fail.

**Evidence.** git diff main...HEAD FairwayCalendar.tsx: `- return { start: addMonths(focusDate, -3), end: addMonths(focusDate, 3) };` / `+ return { start: startOfMonth(focusDate), end: endOfMonth(focusDate) };` and `+ periodLabel={format(focusDate, 'MMMM yyyy')}` (agenda) / `+ periodLabel={`the week of ${format(visibleWindow.start, 'MMMM d')}`}` (week). `grep -rn periodLabel src --include='*.tsx' --include='*.ts'` shows only the 3 production-code sites, none in a test file.


## [MEDIUM] src/components/fairway/pages/calendar/FairwayAgendaView.tsx:77
**New "in N days" agenda heading cue (relativeDayCue) has no test**  
*dimension: test-quality · panel 2/3 standing*

`relativeDayCue` is entirely new in this diff (git diff shows the whole function added) and renders next to every day heading within the coming week. FairwayAgendaView.test.tsx exists but was NOT touched by this diff, and none of its tests pass a `nowRef` combined with buckets 2-6 days out or assert on 'in N days' / 'Yesterday' text; a repo-wide grep for 'relativeDayCue' or 'in \d days' inside test files returns nothing relevant.

**Failure scenario.** An off-by-one in the day-diff math (`Math.round((startOfDay(date) - startOfDay(nowRef)) / 86_400_000)`) — e.g. using floor instead of round, or comparing a zoned bucket date against a raw local nowRef across a DST transition — would mislabel a day 3 out as 'in 2 days' or silently drop the cue at the boundary (day 6/7), and nothing in the suite would catch it.

**Evidence.** function relativeDayCue(date: Date, nowRef?: Date): string | null { ... if (days >= 2 && days <= 6) return `in ${days} days`; ... } (new in this diff, FairwayAgendaView.tsx). `grep -rln "relativeDayCue\|in [0-9] days" src --include='*.test.ts*'` matches only unrelated files (class-semester-boundaries, FairwayAnnouncements.logic, overuse-rules).


## [MEDIUM] src/components/fairway/pages/calendar/CalendarSchedulingDialog.tsx:40
**CalendarSchedulingDialog's recheck/error-branch (acceptProposal reason mapping) has no test**  
*dimension: test-quality · panel 3/3 standing*

This diff replaces a single `allAvailable` check with a three-way `acceptProposal(...).reason` branch ('unverified' / 'nobody' / else) that produces different user-facing copy on the final server recheck before confirming a chosen time. No test file exists for CalendarSchedulingDialog.tsx at all (confirmed by `find` and by grepping test files for the component name) — SchedulingWorkspace.test.tsx and evaluate.test.ts each test only their own layer (the workspace's local UI state, and the pure evaluate/acceptProposal functions), never this component's async recheck-and-branch flow.

**Failure scenario.** Swap or drop one of the three reason branches (e.g. route 'nobody' through the same message as 'required_busy', or forget the `retry()` call on failure) and a real race — someone's availability changes between opening 'Find a time' and confirming — would show the wrong error copy, or fail to re-fetch, with no test noticing.

**Evidence.** git diff main...HEAD CalendarSchedulingDialog.tsx: `const acceptance = acceptProposal(evaluateSchedule(result.data, proposal)); if (!acceptance.ok) { setVerificationError(acceptance.reason === 'unverified' ? '...' : acceptance.reason === 'nobody' ? '...' : '...'); retry(); return; }`. `grep -rln "CalendarSchedulingDialog" src --include='*.test.ts*'` returns nothing.


## [MEDIUM] src/components/fairway/pages/calendar/FairwayMonthGrid.tsx:236
**Month grid renders two focusable, redundant day-select controls per cell below the sm breakpoint**  
*dimension: sweep · panel 3/3 standing*

Below `sm` (640px), each day cell in FairwayMonthGrid now renders TWO separate `PressTarget` (native `<button>`) elements that both call `onSelectDate(day)`: (1) a full-cell button at line 236-243 with className `absolute inset-0 z-0 ... sm:hidden` (visible + tabbable on phone, hidden+removed-from-tab-order at sm+), and (2) the day-number button at line 257-262 with className `... max-sm:sr-only sm:pointer-events-auto` (pointer-events:none and visually clipped via Tailwind's `sr-only` on phone, but NOT removed from the tab order or the accessibility tree — `sr-only` only clips visually, it doesn't set `display:none` or `tabindex=-1`, and `pointer-events-none` only blocks pointer/touch hit-testing, not keyboard Enter/Space activation on a native `<button>`). The comment at line 232-234 explicitly states the intent ('Phone: ONE day action... each viewport has exactly one day target'), but the code produces two independent, always-both-rendered tab stops per cell on phone widths, since `onSelectDate` is unconditionally supplied by both call sites in FairwayCalendar.tsx (lines ~1170 and ~1259). Before this PR there was exactly one `<Button>` per cell at every breakpoint; this diff is what introduces the duplication.

**Failure scenario.** On any viewport narrower than 640px (a phone, a resized/split-screen desktop browser, or a keyboard/switch-access user on an iPhone), Tab-ing through the 42-cell month grid produces 84 focus stops instead of 42: the visible full-cell button announces '{day}, N items', then a second, invisible, zero-perceptible-effect stop announces just '{day}' with no item count, before the next day's visible button. A screen-reader or keyboard-only user has to tab through twice as many controls to cross the grid, and the second stop for each day renders no visible focus ring (it is clipped to 1x1px), reading as a dead or broken tab stop.

**Evidence.** src/components/fairway/pages/calendar/FairwayMonthGrid.tsx:236-243 `{onSelectDate ? (<PressTarget onClick={() => onSelectDate(day)} aria-label={...items...} className="absolute inset-0 z-0 rounded-none focus-visible:ring-inset focus-visible:ring-offset-0 sm:hidden" />) : null}` and :257-262 `<PressTarget onClick={onSelectDate ? () => onSelectDate(day) : undefined} aria-label={dayLabel} ... className="group pointer-events-none relative z-10 flex h-11 min-h-[44px] w-11 min-w-[44px] ... max-sm:sr-only sm:pointer-events-auto" suppressHydrationWarning>`. Both call sites in FairwayCalendar.tsx (`onSelectDate={(d) => { setFocusDate(d); setView('day'); }}`) always pass a defined `onSelectDate`, so both buttons are always live below `sm`. Tailwind's `.sr-only` utility (no project override found in src/styles/*.css) only clips visually; it does not remove an element from the tab order, and `pointer-events-none` does not block native keyboard activation of a `<button>`.


## [MEDIUM] src/components/fairway/pages/calendar/FairwayCalendarHero.tsx:148
**Day-view prev/next controls are labeled "day" but actually jump 7 days**  
*dimension: sweep · panel 3/3 standing*

`stepLabel` maps `view === 'day'` to the literal string `'day'`, which feeds directly into the prev/next `IconButton` aria-labels at lines 273 and 276 (`Previous ${stepLabel}` / `Next ${stepLabel}`). But `FairwayCalendar.tsx`'s `navigate()` callback (~lines 849-862) only steps by a single day for `view === 'week'`... actually steps Month/Agenda by month and routes everything else (Day AND Week) through `setFocusDate((d) => addDays(d, dir * 7))` — a 7-day jump. This 7-day jump for Day view is intentional (confirmed via `FairwayDayStrip.tsx`'s documented `onSwipe` contract: "a horizontal swipe across the strip moves one week... the way a page turns", i.e. the day-strip itself is the single-day picker and prev/next page by week). So the behavior is by design, but the new `stepLabel` derivation asserts a granularity (day) that the button it labels does not honor.

**Failure scenario.** A screen-reader user on the Day view calendar (e.g. VoiceOver/NVDA) hears "Next day, button" and "Previous day, button". Activating either jumps the focus date forward/back by a full week, not one day. The user has no accessible way to know the button they just pressed moved them 7 days instead of 1, and repeated presses rapidly overshoot any date they were trying to reach by day-stepping — a functionally misleading accessible name for a keyboard/AT-only user, who cannot see the day-strip to infer the real step size the way a sighted/touch user can via the swipe gesture.

**Evidence.** FairwayCalendarHero.tsx:148: `const stepLabel = view === 'month' || view === 'agenda' ? 'month' : view === 'day' ? 'day' : 'week';`
FairwayCalendarHero.tsx:273,276: `aria-label={`Previous ${stepLabel}`}` / `aria-label={`Next ${stepLabel}`}`
FairwayCalendar.tsx (~849-862): `if (view === 'month' || view === 'agenda') { setFocusDate((d) => addMonths(d, dir)); } else { // Day/Week turn the page by a week (the day-strip is the picker).\n setFocusDate((d) => addDays(d, dir * 7)); }`


## [LOW] src/components/fairway/pages/calendar/scheduling/SchedulingWorkspace.tsx:561
**Lane tap-vs-pan detector uses one shared ref across every row, so an overlapping second touch silently drops a legitimate tap**  
*dimension: scheduling-workspace · panel 3/3 standing*

tapRef (line 554) is a single `{id,x,y}|null` ref owned by the whole SchedulingWorkspace instance, but handleLanePointerDown/Up/Cancel (554-568) are attached identically to EVERY participant row's lane div (839-841, inside `orderedParticipants.map`). handleLanePointerUp unconditionally nulls tapRef.current (line 561) before checking whether the id matches (line 562), so a mismatched pointerup destroys tracking data belonging to a still-pending, different pointer.

**Failure scenario.** Two touch points land on the timeline in quick succession before either lifts (e.g. a stray edge/palm touch while tapping a lane row, or two fingers briefly contacting two different rows): pointerdown id=2 sets tapRef={id:2,...}; pointerdown id=3 (different lane) overwrites tapRef to {id:3,...}. pointerup id=2 arrives: tap=tapRef.current (id=3's data) is read, tapRef.current is nulled, then `tap.id(3) !== event.pointerId(2)` correctly rejects placement for pointer 2 — but it has also discarded pointer 3's still-valid down record. When pointerup id=3 later arrives, tapRef.current is already null, so `!tap` short-circuits and placeAtPointer is never called for pointer 3 either, even though pointer 3's own down→up was a legitimate in-place tap. Net effect: a real tap produces no placement and no feedback.

**Evidence.** SchedulingWorkspace.tsx:559-565 `const handleLanePointerUp = (event) => { const tap = tapRef.current; tapRef.current = null; if (dragging || !tap || tap.id !== event.pointerId) return; if (Math.hypot(...) > TAP_SLOP_PX) return; placeAtPointer(event.clientX); };` combined with the same three handlers being passed to every row at 839-841 (`onPointerDown={handleLanePointerDown} onPointerUp={handleLanePointerUp} onPointerCancel={handleLanePointerCancel}` inside the `orderedParticipants.map` loop).


## [LOW] src/components/fairway/pages/calendar/scheduling/__tests__/SchedulingWorkspace.test.tsx:83
**Tautological self-referential assertion in SchedulingWorkspace.test.tsx pins nothing**  
*dimension: test-quality · panel 3/3 standing*

`expect(screen.getByTestId('scheduling-workspace')).toHaveAttribute('data-testid', 'scheduling-workspace')` checks the exact attribute value that `getByTestId` already used to locate the element — it can never fail regardless of what the component renders, so it contributes zero coverage. It sits harmlessly alongside real assertions in the same test, but is dead weight, not a behavior pin.

**Failure scenario.** No code change, however severe, could make this specific assertion fail (short of removing the testid entirely, which `getByTestId` on the line above would already catch first) — it should not be counted as verifying any part of 'the selected time, timeline, and accessible start controls in one workspace' claim the test's title makes.

**Evidence.** expect(screen.getByTestId('scheduling-workspace')).toHaveAttribute('data-testid', 'scheduling-workspace');



# Refuted by the panel


## src/lib/calendar/scheduling/evaluate.ts:53 — acceptProposal accepts a fully-busy proposal whenever an event has zero required participants
Refuted 3/3.

Code independently confirmed: evaluate.ts:53-58 acceptProposal has exactly the branch structure described, and requiredTotal===0 does make branch (3) vacuously false. However, applying the reachable lens: tracing every call site that constructs a ScheduleParticipant in shipped code (src/app/golf/actions/scheduling.ts:85 and src/components/fairway/pages/calendar/conflicts/ConflictDetail.tsx:90 -- confirmed the only two non-test constructors via `rg -n "required:"`) shows both hardcode `required: true` unconditionally for every participant, with no branch or data path that ever sets `required: false`. That means optionalTotal is always 0 in every live invocation reachable from a rendered route today -- not just that requiredTotal===0 is a rare edge case. I also checked the one place in the app that lets a user mark a person 'optional': usePeopleSelection.ts's setRequired/requiredIds, used by CalendarPeoplePicker in FairwayEventEditor.tsx and EventPeopleTimeFields.tsx (the event editor's attendee UI, per its own comment 'this state never leaves the browser'). ScheduleWindowRequest (scheduling-contracts.ts:59) has no requiredIds/optionalIds field at all, so that picker's required flag never reaches getScheduleWindowImpl or the ScheduleParticipant it builds. There is therefore no chain from any current UI action to a snapshot with requiredTotal===0 and optionalTotal>0 -- the reporter's own caveat is correct and, on inspection, actually understates the gap (it's not just 'no caller happens to do this yet', it's 'the only caller path structurally cannot produce a required:false participant without a future code change'). Per the reachable lens instruction ('If nothing renders this branch... it is refuted'), this is refuted for current risk. It is a legitimate latent gap in a pure function worth a one-line fix or comment before any future caller adds optional-only invites, but it is not a live defect in this PR's shipped behavior.


## src/components/fairway/pages/calendar/conflicts/ConflictDetail.tsx:128 — Conflict chart hour axis snaps to UTC hour boundaries, not the team's timezone hour boundaries
Refuted 3/3.

The arithmetic bug is real in isolation (chartRange snaps on raw UTC epoch ms, not per the timeZone prop), but it is not reachable in shipped code. ConflictDetail's only render path is ConflictCenter -> FairwayCalendar.tsx:1403 (Sheet), which is exclusively mounted under src/app/golf/(dashboard)/dashboard/calendar/page.tsx (grep confirms FairwayCalendar has zero non-golf importers). The `timeZone` prop it receives is `teamTimezone ?? DEFAULT_TIMEZONE` (FairwayCalendar.tsx:1377/1403). `DEFAULT_TIMEZONE` is 'America/New_York' (src/lib/calendar/timezone.ts:24), and `teamTimezone` is read from `golf_team_settings.timezone`, which the ONLY UI that writes it (FairwaySettingsGeneral.tsx:2248-2255, the team Timezone <Select>) restricts to exactly six options: America/New_York, America/Chicago, America/Denver, America/Los_Angeles, America/Anchorage, Pacific/Honolulu — every one a whole-hour-UTC-offset US zone, both standard and daylight time. There is no picker, API, or code path in this PR (or upstream of it) that lets a real user action set the golf team's timezone to a half/quarter-hour-offset zone like Asia/Kolkata, Asia/Kathmandu, or Australia/Adelaide, which is what the failure scenario requires. The bug is therefore latent/theoretical for this product surface, not reachable through any shipped user flow. (Reading ConflictDetail.tsx:121-134 confirms the finding's description of the code itself is accurate — the docblock's claim about zone-aware snapping is not literally true — but that gap only manifests for timezone values the product never lets a team have.)



# Coverage notes


- Reconciled `git diff --name-only main...HEAD` (56 files) against the six dimension briefs' apparent scope (shared-kit-neutrality → segmented.tsx/ModalShell.tsx/AppShell.tsx; accept-proposal → evaluate.ts/evaluate.test.ts/CalendarSchedulingDialog.tsx; scheduling-workspace → SchedulingWorkspace.tsx/SchedulingTaskBoard.tsx/its tests; removed-surfaces → CalendarSurfaces.module.css + its consumers; design-system-a11y → segmented/ModalShell/SchedulingWorkspace touch targets; test-quality → various test files). Files with real diff weight that no dimension plausibly opened in depth and that I read directly: memory/features/calendar-events.md (full diff), docs/generated/DOCUMENT_AUTHORITY_INVENTORY.md (trivial line-count bump, no finding), CalendarPersonDialog.tsx (full free/busy title-guard logic), FairwayCalendar.tsx (role-gating of primary action, respond row, conflict row, FairwayMonthGrid call sites), FairwayMonthGrid.tsx (full diff — this is where the finding came from), FairwayEventCard.tsx / eventPresentation.ts (consumers, no duplication vs FairwayAgendaView/FairwayMonthGrid), FairwayDayStrip.tsx/FairwayMonthOverview.tsx (confirmed both share the same `eventDaySpan` import, no duplicated date math), FairwayCalendarMemberRail.tsx and CalendarPeoplePicker.tsx (role/permission surface for the people list — no coach/player leak found, PressTarget swap is safe since it renders a native `<button>` preserving keyboard semantics under an overridden `role=\"option\"`), ConflictDetail.tsx (all three free-busy render sites correctly gate on `access === 'free_busy'`), EventPeopleSection.tsx (cosmetic only, RSVP data source unchanged), and a combined diff of attendance/*, availability/*, files/*, settings/*, class/* (all mechanical Tailwind class swaps consistent with the CSS-retirement contract; grepped the whole calendar tree for every retired class name — `paper`, `press`, `chrome`, `dock`, `ground`, `chipFloat`, `avatarChip`, `teamChip`, `buttonRow`, `well`, `float`, `selected`, `glow`, `check`, `attention`, `row`, `rowIcon`, `rise` — zero stale references and zero remaining definitions in CalendarSurfaces.module.css, corroborating removed-surfaces' 0 findings). Verified ModalShell.tsx's non-workspace (default) render path is byte-for-byte equivalent to main's prior geometry/className, confirming no non-calendar surface regressed, and verified `useMediaQuery` is called unconditionally with no hook-order hazard. Verified AppShell.tsx's 8-line change only adds a new CSS var, doesn't touch existing behavior. Confirmed the PR's two new 'use client' directives (FairwayMonthOverview.tsx, SchedulingTaskBoard.tsx) are on new files with no corresponding removal elsewhere — no server/client boundary regression. Did not find a reproducible cross-role data leak in the scheduling workspace, conflict center, or person dialog; the free/busy title redaction is enforced server-side (unchanged, out-of-diff scheduling.ts/use-schedule-window.ts) and every client render site I checked (CalendarPersonDialog, SchedulingWorkspace, ConflictDetail) degrades consistently when title/access indicate free-busy-only. Genuinely unchecked, for time-budget reasons: FairwayEventEditor.tsx and the editor/* subtree (EventEditorStages, EventEssentialsFields, EventPeopleTimeFields, EventRecurrenceFields, EventReviewReceipt, EventVerificationPanel, sectionChrome) beyond a title/import skim; FairwayCalendarHero.tsx's date-jump PopoverPanel keyboard/focus interaction in depth; FairwayEventDetailDrawer.tsx beyond its Sheet/safe-area imports (I did not read its full 392-line diff); FairwayDayStrip.tsx's drag/pan interaction; and I did not run any vitest file myself (relied on static reading plus the already-established tsc/CI/vitest-in-progress signals) since none of my questions turned on runtime behavior a targeted test run would settle faster than reading the render logic and CSS semantics directly.


- Reviewed the full three-dot diff (`git diff main...HEAD`) with priority on: FairwayCalendarHero.tsx (date-jump popover, weekRangeTitle, stepLabel/navigate wiring), FairwayCalendar.tsx (navigate callback, visibleWindow month-scoping, month view phone/desktop split), FairwayAgendaView.tsx (bucketEvents, relativeDayCue, formatDayLabel, empty-state periodLabel copy), FairwayMonthGrid.tsx, FairwayMonthOverview.tsx (new), eventPresentation.ts (new) and both its call sites, FairwayEventCard.tsx, ConflictDetail.tsx (chartRange/bandStyle/overlap chart, full file), ConflictRow.tsx, EventEditorStages.tsx, FairwayEventEditor.tsx footer/stage-gating, EventEssentialsFields.tsx, EventVerificationPanel.tsx (deriveVerificationState + isAttention/isConflicts chrome split), SchedulingTaskBoard.tsx (new), CalendarPersonDialog.tsx (largest diff — deep timezone/DST pass: timeInZone/dateKeyInZone/minuteInZone, placeIntervals, freeGaps, WeekStrip, DayTimeline, move()), FairwayDayStrip.tsx (swipe contract, eventsByDay), press-target.tsx, button.tsx (IconButton), ModalShell.tsx (default close-X), and evaluate.ts (acceptProposal — context only, its one known bug already reported/refuted by round 1, not re-litigated here).

Verified by execution (Node.js): weekRangeTitle is correct across Dec 31/Jan 1, Feb month-end, and leap/non-leap year boundaries; relativeDayCue's day-difference arithmetic is correct and its "Yesterday" cue beside a full date heading is additive/informative, not contradictory, on a plain reading of the memory-doc contract — considered and deliberately not reported (advisor-reviewed and dropped: no wrong output, just a documentation-wording ambiguity). The EventVerificationPanel 'conflicts'-state chrome change was investigated and dropped after confirming the icon disc, headline color, and overlap rows still carry warning styling — only the outer card background/border softened, which is a deliberate consequence of the PR's own wash-retirement thesis, not a broken contract.

Ruled out as false positives before reporting: (1) FairwayMonthGrid.tsx's phone-only `sm:`-gated interactive cell markup is unreachable in production — its only call site (FairwayCalendar.tsx) wraps it in `hidden md:block`, confirmed via grep and default (unmodified) Tailwind breakpoints, so no real viewport triggers it. (2) FairwayEventEditor.tsx's restructured footer removing the flat "Cancel" button was checked against ModalShell.tsx's default `hideClose=false` — the close-X remains available, so this is a deliberate design change, not a missing-affordance bug.

Confirmed via grep that eventPresentation.ts's exports (`typeMeta`/`typeIcon`/`RSVP_PILL`) have no callers outside `src/components/fairway/pages/calendar/` — the only two call sites (FairwayEventCard.tsx, FairwayMonthGrid.tsx) were both read and their tone/label mappings check out; unrelated same-named `typeMeta`/`typeIcon` identifiers exist in `src/components/lifting/` but are distinct local variables in unrelated modules, not importers of this file.

Not fully reviewed due to time/scope, in descending priority if a further pass is warranted: EventReviewReceipt.tsx (only the cosmetic diff hunk was read; isMoveOnlyChange/buildChangeSummary logic and its `changes` prop were not traced), FairwayEventDetailDrawer.tsx (392 changed lines; not checked against the memory doc's "class events show titleless busy blocks" / "row icons are bare emerald glyphs" contract), FairwayCalendarMemberRail.tsx (386 changed lines, not reviewed), EventPeopleSection.tsx, sectionChrome.tsx (new, only referenced not read), EventRecurrenceFields.tsx, EventFilePicker.tsx/EventFilesSection.tsx, CalendarPeoplePicker.tsx, class/CalendarClassDetail.tsx, ClassOccurrenceStatus.tsx, attendance/availability/settings subdirectories, AppShell.tsx, and most of SchedulingWorkspace.tsx (1004 lines) beyond the areas round 1 already flagged. Did not run any test files (per instructions, only single targeted vitest files are permitted and none were needed to confirm these two findings, both verified by static reading plus standalone Node.js arithmetic reproduction). Did not re-verify or re-report any of the eleven round-1 findings supplied in the task, nor the already-refuted acceptProposal zero-required bug.


# Fixes applied on this branch (post-review)

Four confirmed defects fixed; the remaining eight confirmed findings are follow-up work.

1. **HIGH `CalendarSchedulingDialog.tsx:70`** — the loading/error fallback branch now pads
   `env(safe-area-inset-top/bottom)` below `sm`, matching the contract ModalShell's
   `presentation="workspace"` delegates to its child and that `SchedulingWorkspace` already
   honors at :673/:981. Scoped `max-sm:` because ModalShell only goes full-bleed under
   `(max-width: 639.98px)`.
2. **`SchedulingWorkspace.tsx:798`** — hour-ruler slots take `[@media(pointer:coarse)]:min-h-[44px]`.
   Keeps the intentional compact 32px ruler for a mouse while restoring the touch hit area that
   regressed from main's `min-h-14` (56px). Same idiom as `segmented.tsx` / `PopoverPanel.tsx`.
   Safe for layout: the selection lens spans `gridRow: 3 / span N`, so growing row 2 does not move it.
3. **`FairwayMonthGrid.tsx:257`** — `max-sm:sr-only` -> `max-sm:hidden`, removing the duplicate
   day-number tab stop below `sm`. `sr-only` is `position:absolute`, so this is layout-neutral;
   the phone-visible date is the separate `aria-hidden` span below. Code now matches the
   comment at :232-234 ("each viewport has exactly one day target").
4. **`FairwayCalendarHero.tsx:148`** — `stepLabel` for Day view is now `'week'`, matching
   `FairwayCalendar.tsx:861` (`addDays(d, dir * 7)` for both Day and Week, by design).

## Verification after the fixes
- `npx tsc --noEmit` -> exit 0
- `npx eslint --max-warnings=0` on all four changed files -> exit 0
- Wide vitest baseline re-run (see below)

## Deliberately NOT done here
- Rebase onto main (branch is 3 commits behind) — belongs immediately before landing.
- Registry repair for the unmapped shared kit — separate change, would widen this PR's scope.
- The six missing-coverage findings and the two multi-touch `pointerId` gaps.
