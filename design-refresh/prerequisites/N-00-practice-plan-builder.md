# N-00 Practice (its own tab): plan builder, plan page, publish, print and share

> **Changelog v2 2026-10-25: redesigned from Nick's 10:36pm and 10:40pm asks.** This replaces v1 (kept at `archive/N-00-practice-plan-builder.v1.md`). What changed from v1:
> - **Practice is its own tab** for coaches and players (sidebar after Calendar, phone strip first pills), with nine routes under `/golf/dashboard/practice`. v1's plan pages under Calendar are gone; Calendar keeps a Plan row and a glyph.
> - **The builder follows Nick's order: Blocks, then Groups, then Drills, then Review**, as a step bar the coach can jump around in. Blocks are sequential and have five kinds (Team, Stations, Course, Own work, Break). v1's lanes-by-station board is replaced; stations now live inside a Stations block with a rotation grid that fills itself.
> - **Saved groups** (new table) and a **team drill bank** (new table `golf_team_drills`). A drill made inside a plan goes straight into the bank. The GolfHelm library stays read-only and gets "Copy to your bank".
> - **Templates from day one**: session, block and week templates, plus six starters shipped as code. v1 had session templates in slice 4.
> - **One plan page render** used for Review, the player view, the Documents preview, the share image and print.
> - **Publish replaces Share.** It freezes a version, files the plan in Team Hub > Documents > Practice plans (`golf_documents.practice_plan_id`; `file_url` becomes nullable under a CHECK), notifies the plan's players by push and bell, and posts a plan card in team chat. This is Nick's owner override of the prefill-only rule, for this one act (see "Owner override" below). v1's "edits go live" is replaced by Republish with "What changed", which tells only the players whose day changed. Take down tells the players once. The plan page shows Seen by.
> - **Print studio** redrawn after Nick's "doesn't really look good", then the whole plan document rebuilt the same day after "this looks vibe coded and shitty" and "just simple, modern, premium. apple level" (4.10, 4.14): one restrained, type-only system modelled on Apple's tech specs pages (a label column, hairlines, Instrument Sans, tabular numerals, ink only; Clubhouse green only for Now and your group in the player view). No monogram, day bar, figures, mix bar, timeline spine, chips, tags, tinted panels or patterns. The coach copy is two portrait US Letter pages (page 1 ends with the schedule; page 2 holds drills, Bring and Notes with writing lines), with a QR code to the live plan behind team sign-in and page x of y, nothing under 8.5pt; a landscape range board of only the rotation, readable at ten feet; two half-letter pocket cards per landscape sheet; a drills appendix with ink-only set-up diagrams. Save as PDF is the same print CSS. **Share** (team chat card, copy link for the team, a 1080 × 1350 share image in the same type, print or PDF). No public link.
> - **Kept from v1**: class-time arrivals, the Now and Next lines, the rain swap, make-ups, the recap prefill, the Home plan lines, the delete-count warning (open call 5) and the range board without arrivals (open call 4). Reshaped: the Run view's "Shift 5 min" is now a quick republish with "Tell players" off by default.
> - **Migrations**: nine held files in `20261026010000` to `20261026010800` (v1 had six with different contents). None of v1's SQL is applied anywhere, so v2 replaces it outright.
> - Full list: `changelog/N-00.md` (v2 section). Open, waiting on Nick: owner calls 1 to 6 from the design spec and 7 to 17 new in v2, each written to its default (section 12), and v1's calls 4 and 5, still standing.

Idea Book PR-01, PR-02, PR-03, PR-21, PR-27, PR-30, PR-31 (and PR-06 as a late slice), plus Nick's practice redesign asks of 2026-10-24 10:36pm and 10:40pm ET. Build plan, round two, v2, 2026-10-25.

| | |
|---|---|
| Status | Plan. Nothing built. Nine held migrations, none applied. |
| Source of truth | `practice-redesign/DESIGN_SPEC.md` (2026-10-25). Research: `practice-redesign/RESEARCH_CODE.md`, `practice-redesign/RESEARCH_WEB.md` |
| Migration block | `20261026010000` to `20261026010900` (uses `010000` to `010800`; `010900` free) |
| Catalog | page 17, `CH-17xxx` (checked free on all five refs and in every plan in `build-plans/` and `build-plans-2/`, section 4.18) |
| CSS prefix | `ch-pr` (practice) and `ch-plan` (the plan page, shared by every render) |
| Release flag | `golf_practice_plans` (kept from v1, purpose rewritten, section 0.5) |
| Owner | Nick |
| Refs read | `origin/main` f30a6d5 (M), `origin/phase2` 00d5b76 = PR 2361 (P), `refs/remotes/pr/2362` polls (PL), `refs/remotes/pr/2364` course page on phase2 (CP) |
| Depends on | **PR 2361 (phase2) merges first**: `FormSheet`, `useSheetDraft`, `DayCard`, `loadTeamZone`, `seasonStartDate(now, tz)`, the `--ch-type-*` roles. **PR 2362 (polls) before slice 3**: the plan card reads `kind` and `payload` on `golf_messages` through the select PL adds (`use-golf-messages.ts:636`), and copies its card pattern. PL's merge base is main, not phase2, so slice 3 rebases on whichever lands second. **PR 2364 (course page)**: edits `CH_REBUILT_PATTERNS` and adds a `PUSHED_BELOW` entry in the same file this plan edits (`nav.ts`); whichever lands second rebases. |
| Works with | **N-10 Documents** (`N-10-documents.md`): N-10 owns the Documents UI, `golf_document_pins`, `golf_document_opens` and folder create and rename. N-00 owns `golf_documents.practice_plan_id`, the `file_url` nullable CHECK, the two `golf_documents` policy changes and the null-safe shim (section 0.4, "Coordination with N-10"). |

Sources read for this plan (read only, `git show` and `git grep`): `src/clubhouse/shell/nav.ts`, `src/clubhouse/shell/Sidebar.tsx`, `src/clubhouse/shell/SectionStrip.tsx`, `src/clubhouse/shell/section-switch.tsx`, `src/clubhouse/shell/command/shortcuts.ts` and its test, `src/clubhouse/shell/command/commands.ts`, `src/clubhouse/shell/command/CommandLayer.tsx`, `src/clubhouse/shell/command/ShortcutsSheet.tsx`, `src/clubhouse/shell/Notices.tsx`, `src/clubhouse/data/shell.ts`, `src/clubhouse/data/calendar.ts`, `src/clubhouse/data/home.ts`, `src/clubhouse/data/hub.ts`, `src/clubhouse/data/season.ts`, `src/clubhouse/routes/calendar.tsx`, `src/clubhouse/screens/calendar/*` (`inspector.tsx`, `Calendar.tsx`, `CalendarPhone.tsx`, `views.tsx`, `editor.tsx`), `src/clubhouse/screens/home/*` (`DayCard.tsx`, `HomePhone.tsx`, `PlayerHome.tsx`, `PlayerHomePhone.tsx`, `Week.tsx`, `CoachAsks.tsx`), `src/clubhouse/screens/hub/TeamHub.tsx`, `src/clubhouse/screens/hub/parts.tsx`, `src/clubhouse/screens/messages/*` (PL), `src/clubhouse/screens/stats/BestCard.tsx`, `src/clubhouse/lib/motion.ts`, `src/clubhouse/lib/haptics.ts`, `src/clubhouse/lib/smooth-scroll.ts`, `src/clubhouse/lib/reduced-motion.ts`, `src/clubhouse/ui/*` (`Peek.tsx`, `FormSheet`, `States.tsx`, `Segmented`, `RefreshNotice.tsx`, `SectionBoundary.tsx`), `src/clubhouse/styles/tokens.css`, `src/app/golf/(dashboard)/dashboard/calendar/page.tsx`, CP `rounds/course/[key]/page.tsx`, `src/app/golf/actions/documents.ts`, `src/app/golf/actions/calendar-events.ts`, `src/app/golf/actions/announcements.ts`, `src/app/golf/actions/event-documents.ts`, PL `src/app/golf/actions/message-polls.ts`, `src/lib/notifications/push.ts`, `src/lib/notifications/in-app.ts`, `src/lib/notifications/types.ts`, `src/lib/notifications/golf-message-fanout.ts`, `src/app/golf/actions/unified-notifications-model.ts`, `supabase/schemas/golf/10_tables.sql`, `supabase/schemas/policies/golf.sql`, `supabase/schemas/functions/public.sql`, `supabase/schemas/triggers/golf.sql`, `supabase/migrations/HELD.md`, `supabase/migrations_archive/pre_20260527/20260422100001_drill_library_seed.sql`, `scripts/db/apply.mjs`, `scripts/clubhouse/check.mjs`, `docs/clubhouse/catalog/README.md`, `config/feature-flags.yml`, `package.json`.

---

## Owner override (read this first)

The standing rule (PREMIUM_PASS_AUDIT.md D2-7) is that a coach action reaches players only as a prefilled message the coach reads and sends. v1 followed it: Share sent nothing and offered "Message the team".

Nick overrode it for practice plans, in his own words on 2026-10-24 at 10:36pm ET: "all practice plans published should live in the coaches documents and players notified when its published."

So in v2, and only for these three presses, the app sends on the coach's behalf:
1. **Publish** notifies the players in the plan, and the coaches assigned in it.
2. **Republish** notifies only the players whose day changed. The coach can switch it off for that republish. Wording-only edits notify no one.
3. **Take down** notifies, once, the players who had the plan.

Each is a press the coach makes in a sheet that names who will be told before anything sends. Delivery is push in the Events category (honouring each person's `push_events` switch and Quiet mode) and a bell row. Nothing else in the practice feature sends anything: no reminders, no rotation pings, no nudges. "Nudge" on Seen by stays a prefill the coach sends (P-01 grammar). The recap stays a prefill. The rule stands everywhere else in the app.

---

## 1. The feature

**One sentence.** Practice becomes a tab where a coach builds a practice plan in four steps (blocks of time, the groups, the drills, a review), publishes it, and every player gets a crafted plan page that says where to be, with whom, doing what, and to what standard, while the same page lives in Team Hub > Documents and prints for the range board.

**Why a college coach wants it.** Today the plan is a whiteboard, a spreadsheet printed at noon, or a group text sent at 1:50 PM. Three things make it hard, and the builder handles each in place:
- Players arrive in waves after class. The builder reads class schedules the app already holds and says, in words, who will miss which turn.
- Groups rotate through three or four stations. A Stations block fills its rotation grid itself, and the coach drags a chip to change it.
- The plan changes on the day: rain, a long warm-up, a moved tee time. The rain layout is one press away, and Republish tells only the players affected.

It also gives the coach things a whiteboard never could: a drill bank that grows as they plan, saved groups ("Travel five", "Freshmen"), templates including a whole week, and a print studio with a coach copy that looks like the plan page, a range board and pocket cards. Everything is deterministic. Nothing is suggested, ranked or written by AI.

**Why a player wants it.** One card on Practice and Home: "2:00 Warm-up, Range, everyone. 2:15 Putting green, Lag ladder, Group B." During practice the current stop is lit with "Rotate in 4 min". The drills used in published plans are there to practise alone. A player never sees a draft, a teammate's class times or a teammate's own-work line.

### 1.1 What the first release is (slices 1 to 5, section 13)

The production flag turns on only when slices 1 to 5 are built and the migrations are applied:
- the Practice tab for both roles: Practice home, the plan page, Drills, Groups, Templates
- the builder: Blocks, Groups, Drills, Review, on desktop (three panes) and phone (one column)
- session and block templates and the six starters; copy a past practice
- Publish, Republish with What changed, Take down, Seen by, the Documents filing and the team chat card
- the Calendar Plan row, the week and day glyph and the time-move confirm
- the Now and Next lines, the "Rotate in 4 min" chip, the Run view and the rain swap
- the print studio and Share

### 1.2 After the first release (slices 6 to 9)

- Week templates and applying a week (slice 6)
- Make-up practice (slice 7)
- Recap prefill (slice 8)
- Planned practice time against strokes lost on team Stats (slice 9, no migration, optional)

### 1.3 Decisions this plan takes (each non-obvious one is an owner call in section 12)

- **The draft is the coach's; players read frozen versions.** Saves never reach players. Publish freezes the plan into a version; players can only read the live version. This is what lets Republish say exactly what changed.
- **Groups belong to the plan, not to each block.** One set of groups A to F per plan, used by every Stations block and shown in one Groups section. A player is therefore in one group for the whole practice, which keeps "You: Group B" true all day (owner call 7).
- **Time follows the calendar.** Blocks store minutes, not clock times. The plan's clock comes from the practice event's live start. Editing the time in the builder asks before moving the calendar event (section 4.4). A time move made on Calendar after publishing is listed in What changed the next time the coach republishes, and the coach sees "Practice moved on the calendar. Republish to tell players." until then.
- **Own work lines are private.** Each player sees only their own line; the coach sees all. They are stored apart from the plan version, in a table with per-player RLS (owner call 11).
- **Team drills are coach-only.** Players see drills only as they were frozen into published plans, under "Team drills" on their Practice home (owner call 12).
- **Make-ups are never filed in Documents and never posted in chat.** Who missed practice is not for the whole team (owner call 9).
- **No player check-off at team practice**, as in v1: the coach runs the clock and attendance already exists. Only a make-up has "Mark done". Players logging drill results is later (spec owner call 6).
- **No drag on the phone for block edges**; steppers instead. Reorder on the phone is a long press (450ms, `PEEK_HOLD_MS`, `ui/Peek.tsx:37`) then drag, as the spec says.

### 1.4 Cut, and why

- **PR-20 Season blocks.** Week templates cover the repeating week without a second planning surface.
- **Facility TV board.** Needs a kiosk display and auth model the app doesn't have. The range board print covers it.
- **Rotation pings and Live Activities.** Pushes beyond the three owner-approved presses, plus native work. The "Rotate in 4 min" chip updates in the page.
- **CoachHelm writing plans (CO-18, Q-W5).** No new AI spend; the coach owns practice.
- **Weather-triggered rain swap.** No weather provider; the coach flips it.
- **Streaks, badges, completion percentages.** Banned guilt mechanics.
- **Public link.** Not in v1 (spec owner call 4). "Copy link" opens only for signed-in team members.
- **Photo upload on drills.** v2 takes a photo or video link (https). Upload needs a storage bucket and policy; later (owner call 8).

---

## 0. How it fits the app today

Everything below was read from code. M is `origin/main` f30a6d5, P is `origin/phase2` 00d5b76, PL is `pr/2362`, CP is `pr/2364`. Where P moves a line, both are given.

### 0.1 Screens it touches, before and after

**A. Navigation (P `src/clubhouse/shell/nav.ts`).**
- Before:
  - The icons imported at `:2-15` are ChartColumn, BrainCircuit, CalendarDays, ClipboardList, Flag, GraduationCap, House, MessageSquare, Settings, Trophy, Users. `Target` is not used.
  - The comment at `:31-37` says Practice was left out of the v2 sidebar on purpose.
  - Lists: `CH_NAV_COACH` `:38-50`, `CH_NAV_PLAYER` `:60-72`, `CH_PHONE_TABS` `:81-84` (coach `home, coachhelm, calendar, stats`; player `home, coachhelm, rounds, hub`).
  - Helpers: `phoneTabsFor` `:87`, `phoneSectionsFor` `:103-106` (filters by `isRebuilt`), `navFor` `:115`, `activeNavItem` `:137-145` (longest-prefix match), `CH_REBUILT_ROUTES` `:155-172`, `CH_REBUILT_CHILDREN` `:179-181`, `CH_REBUILT_PATTERNS` `:189-192`, `isRebuilt` `:218-223`, `ChPhonePushedTop` `:231-240`, `UUID` `:242`, `PUSHED_BELOW` `:247-260`, `phonePushedTop` `:288`, `phoneFullScreen` `:305`.
- After:
  - `import { Target } from 'lucide-react'`.
  - `{ id: 'practice', label: 'Practice', href: '/golf/dashboard/practice', icon: Target }` right after Calendar in both lists (no `section`, so it sits in the top group with Calendar).
  - The `:31-37` comment rewritten to say Practice returned as its own tab on the owner's ask of 2026-10-24.
  - `CH_PHONE_TABS` becomes coach `['home', 'coachhelm', 'calendar', 'practice', 'stats']` and player `['home', 'coachhelm', 'practice', 'rounds', 'hub']` (spec owner call 1).
  - `'/golf/dashboard/practice'` is added to both roles' `CH_REBUILT_ROUTES`.
  - `CH_REBUILT_CHILDREN['/golf/dashboard/practice']` is set to the regex in 0.2.
  - `PUSHED_BELOW` gains five entries (0.2).
  - Nothing is added to `CH_REBUILT_PATTERNS`. CP edits that list for the course route; this plan does not touch it, so the rebase is a plain merge.
- **Flag gate on the nav.** The nav lists are static, and nine places read them:
  - `Sidebar.tsx:45`, `SectionStrip.tsx:43`, `section-switch.tsx:95`
  - `command/commands.ts:79`, `command/CommandLayer.tsx:221`, `command/ShortcutsSheet.tsx:28`, `command/shortcuts.ts:58-114`
  - `nav.ts:87-145`, `Notices.tsx:167,179`

  The gate works like this:
  - `ChShellData` (`data/shell.ts:32`) gains `practiceOn: boolean`, set in `loadClubhouseShell` (`:122`) from `isFlagEnabled('golf_practice_plans')`.
  - The shell provides it in a small `ChNavGatesContext`.
  - `navFor(role, gates?)` and the helpers above take an optional `gates: { practice: boolean }`, defaulting to `{ practice: false }`, and drop the item when it is off. An unwired caller therefore hides Practice, which is the safe failure.
  - Each of the nine callers passes the context's gates.
  - `isRebuilt` is not gated. The routes redirect when the flag is off (0.5), so a stale link lands somewhere real.
- **Shortcuts (`command/shortcuts.ts:37-50`).** Add `practice: 'p'` to `PREFERRED` ('p' is free; without the line `navLetters` would pick 'p' anyway, but the owner's letters are written down). Cmd or Ctrl and 1 to 9 follow sidebar order (`DIGIT_SECTIONS` 9), so Practice takes 4 and pushes the rest down:
  - coach becomes home, coachhelm, calendar, practice, messages, hub, roster, stats, rounds. Qualifiers loses its digit and keeps G Q.
  - player becomes home, coachhelm, calendar, practice, messages, hub, roster, qualifiers, rounds. My stats loses its digit and keeps G S.
  - `shortcuts.test.ts:190-198` pins the old nine and must be updated, with a second case for the flag off (the old nine). Owner call 10.

**B. Practice tab (new).** Section 4. Routes in 0.2. Coach and player homes, the plan page, the builder, Drills, Groups, Templates, print studio and make-up.

**C. Calendar (P `src/clubhouse/screens/calendar/*`).**
- Before:
  - The event inspector `EventDetail` (`inspector.tsx:417`) draws: Copy link `:458`, `LinkedTrip` `:484`, the warnings `:489` and `:502`, `PlayerReply` `:514`, `EventFiles` `:578`, Edit event `:582`, `Attendance` `:661`.
  - The phone sheet shares it (`Calendar.tsx:805-807`); the desktop detail column is at `:959`.
  - In the views, `EventBlock` (`views.tsx:92-197`) draws a `ch-ev__warn` glyph for warnings; `AgendaView` is at `:480`; the phone `DayPage` is at `CalendarPhone.tsx:268`.
  - New events open with `initialNew` and `initialType` (`Calendar.tsx:410-446`, parsed by `parseNewType`, `data/calendar.ts:61`).
- After:
  - A **Plan row** in `EventDetail` for practice events, between `PlayerReply` and `EventFiles`:
    - "No plan yet" with "Build plan" (coach), or the plan state with "Open plan".
    - A published plan shows its glance (`PlanGlance size="card"`: title, facts line and the first schedule rows).
  - A **plan glyph** (lucide `Target`, 12px, `aria-label="Has a published plan"`) on practice `EventBlock`s, agenda rows and phone day rows with a published plan, drawn exactly where and how `ch-ev__warn` is drawn.
  - `?new=1&type=practice&then=practice` on the Calendar route returns to `/golf/dashboard/practice?new=1&event=<id>` after the create, so "New practice" in the New plan sheet uses the calendar's own event form (section 4.3).
  - The delete-count sentences on CH-6501 and CH-6506 (v1 4.16, kept, section 4.17).

**D. Home (P `src/clubhouse/screens/home/*`, `data/home.ts`).** v1's plan lines are kept, re-pointed at the new routes:
- Coach phone: one line in `DayCard`'s `EventCard` (`DayCard.tsx:59`, `:63`), fed by `phone.next` and `phone.today` (`HomePhone.tsx:132-134`). It reads "Plan published", "Plan draft" or "No plan yet" and links to `/golf/dashboard/practice/plan/[planId]` or the New plan sheet.
- Coach desktop: the same line on a practice row in the Week's Today agenda (`Week.tsx` `AgendaRow` `:111`).
- Player: inside Up next (`PlayerHome.tsx:54-77`, `DeskNext` `:112`; `PlayerHomePhone.tsx:59`, `:94`). It reads "First: 2:15 Putting green, Group B" before practice and "Now: Putting green until 2:35" during it, and links to the plan page.
- Home row order after `CoachAsks` (`CoachAsks.tsx:24`) stays as settled in v1: N-06 tee time, then N-00 `MakeupAsk`, then N-07 "Book a time".
- The plans read starts beside the replies read in `loadHomeWeek` (`home.ts:511`, the replies read at `:629-640` per v1). It adds no sequential round trip, and it is skipped when the flag is off.

**E. Team Hub > Documents (P `screens/hub/*`, `data/hub.ts`).** N-10 rebuilds the UI. What N-00 must make safe before N-10 lands is in 0.4 and section 8.6.

**F. Messages (PL `screens/messages/*`).** A plan card for `golf_messages.kind = 'practice'`, built the way PL builds `PollCard`:
- `MessagesView.tsx`: render at `:992`, `Bubble` `:867`, inbox `lastIsPoll` `:445`.
- `Messages.tsx:109`, `:393`; `model.ts:33`, `:52-53`; the select in `use-golf-messages.ts:636`.

No composer entry: the card is posted by Publish only. Section 4.13.

**G. Notifications (P `src/lib/notifications/*`).** One new push type `practice_plan` (TS only, `types.ts:5-23`), mapped to `push_events` in `pushDeliveryKeyFor` (`push.ts:40-72`), with a case in `generatePushPayload` (`push.ts:97`). Bell rows reuse `event_reminder` through `recordInAppNotification` (`in-app.ts:33-79`) with `data.kind = 'practice_plan'`. They are categorised as events by `categorizeNotificationRow` (`unified-notifications-model.ts:104`). No enum change.

### 0.2 Routes and entry points (no orphan screens)

| Route (all under `src/app/golf/(dashboard)/dashboard/practice/`) | Who | Screen | Phone top bar (`PUSHED_BELOW`) |
|---|---|---|---|
| `page.tsx` → `/golf/dashboard/practice` | both | Practice home (coach or player), with the New plan sheet on `?new=1` (and `&event=<id>`) | section root (no pushed bar) |
| `drills/page.tsx` → `/practice/drills` | coach; a player gets their Team drills list | Drill bank | section root, tab of Practice |
| `drills/[drillId]/page.tsx` → `/practice/drills/[drillId]` | coach (team drill or library drill); player only for a drill in a live version | Drill page | back "Drills", parent `/golf/dashboard/practice/drills` |
| `groups/page.tsx` → `/practice/groups` | coach (player: redirect to `/practice`) | Saved groups | section root, tab of Practice |
| `templates/page.tsx` → `/practice/templates` | coach (player: redirect) | Templates gallery | section root, tab of Practice |
| `plan/[planId]/page.tsx` → `/practice/plan/[planId]` | both | The plan page | back "Practice", parent `/golf/dashboard/practice` |
| `plan/[planId]/edit/page.tsx` → `/practice/plan/[planId]/edit` | coach | The builder | back "Plan", parent `/golf/dashboard/practice/plan/<id>`; `phoneFullScreen` true for a coach |
| `print/[planId]/page.tsx` → `/practice/print/[planId]` | coach | Print studio | back "Plan", parent the plan page |
| `makeup/[planId]/page.tsx` → `/practice/makeup/[planId]` (slice 7) | both | Make-up page | back "Practice", parent `/golf/dashboard/practice` |

The spec writes the home tabs as `?tab=`. This plan uses the child routes the brief lists (`/practice/drills`, `/practice/groups`, `/practice/templates`) and draws the Segmented as links. A tab is then a real address that survives reload and Back, and phone `PUSHED_BELOW` never treats it as pushed. `/practice?tab=drills` redirects to `/practice/drills` for anyone who types it.

`CH_REBUILT_CHILDREN` entry, one regex:

```ts
'/golf/dashboard/practice': /^\/golf\/dashboard\/practice\/(drills|groups|templates|drills\/[0-9a-f-]{36}|plan\/[0-9a-f-]{36}(\/edit)?|print\/[0-9a-f-]{36}|makeup\/[0-9a-f-]{36})$/i,
```

`PUSHED_BELOW` entries, after the qualifier ones and before rounds:

```ts
const PRACTICE = '/golf/dashboard/practice';
const PRACTICE_PLAN = new RegExp(`^(${PRACTICE}/plan/${UUID})$`, 'i');
const PRACTICE_EDIT = new RegExp(`^(${PRACTICE}/plan/${UUID})/edit$`, 'i');
const PRACTICE_PRINT = new RegExp(`^${PRACTICE}/print/(${UUID})$`, 'i');
// ...
{ path: PRACTICE_PLAN, top: () => ({ back: 'Practice', title: 'Plan', parent: PRACTICE }) },
{ path: PRACTICE_EDIT, top: (role, m) => (role === 'coach' ? { back: 'Plan', title: 'Edit plan', parent: m[1] } : null) },
{ path: new RegExp(`^${PRACTICE}/drills/${UUID}$`, 'i'), top: () => ({ back: 'Drills', title: 'Drill', parent: `${PRACTICE}/drills` }) },
{ path: PRACTICE_PRINT, top: (role, m) => (role === 'coach' ? { back: 'Plan', title: 'Print', parent: `${PRACTICE}/plan/${m[1]}` } : null) },
{ path: new RegExp(`^${PRACTICE}/makeup/${UUID}$`, 'i'), top: () => ({ back: 'Practice', title: 'Make-up', parent: PRACTICE }) },
```

`phoneFullScreen` (`nav.ts:305`) returns true for a coach on `PRACTICE_EDIT`, so the strip hides while building.

Every page draws its own `PhoneTop` in step with these (the shell draws the bar before the page arrives, CH-1402).

**Opened from Documents** (N-10's open item): the plan page accepts `?from=docs`. Its own `PhoneTop` then reads back "Documents" with parent `/golf/dashboard/team-hub?tab=docs&folder=practice-plans`, and the desktop back link does the same. `PUSHED_BELOW` matches on the path only, so the shell's first bar says "Practice" until the page arrives; the page's bar replaces it in the same frame the content paints. Any other `from` value is ignored.

**Entry points**:
- Practice tab: sidebar, phone strip, G P, Cmd or Ctrl 4.
- Home plan lines, coach and player.
- Calendar: the Plan row ("Build plan" or "Open plan") and the glyph.
- Team Hub > Documents: a plan card opens the plan page (N-10; the N-00 shim until then).
- The team chat plan card: "Open plan".
- Push and bell: the plan page deep link.
- Print: Review, the plan page and Documents (N-10's card menu) all open `/practice/print/[planId]`.
- Make-up (slice 7): Home's make-up row and the plan page's "Make-ups" for the coach.

**Every page's gate** follows `calendar/page.tsx` (P `:7` import, `:57` default export, `:65-66` the gate) and the Clubhouse-only model of CP `rounds/course/[key]/page.tsx`. When `!isClubhouseFor(await getGolfDashboardRole())` or the flag is off, it **redirects to `/golf/dashboard/calendar`**; CP calls `notFound()` instead. A redirect is used here because push and bell rows deep-link into these pages, and a person whose team left Clubhouse should land on something real, not a 404. Fairway has no Practice and gets no new UI. Each route has a `loading.tsx` that returns the Clubhouse skeleton (CH-17401 to CH-17404), as CP's does.

### 0.3 What it reuses (and must not duplicate)

| Need | Reuse | Where |
|---|---|---|
| Sheets and forms | `FormSheet`, `ListSheet`, `ActionSheet`, `useSheetDraft` | P `ui/` `:85`, `:155`, `:201`, `:270` |
| Tabs, steps | `Segmented` | P `ui/Segmented` `:31` |
| Menus | `Menu` (not DropMenu) | P `ui/` |
| Empty, notices, boundaries | `EmptyState` `States.tsx:37`, `InlineNotice` `Notices.tsx:18`, `RefreshNotice` `RefreshNotice.tsx:10`, `SectionBoundary` `SectionBoundary.tsx:42` | P |
| Motion | `CH_DUR` `motion.ts:20-26` (press .11, quick .18, base .26, release .28, reveal .52), `chTween` `:32`, `chFade` `:41`, `CH_SPRINGS` `:59-63` (smooth, settle, reveal), `chSpring` `:77`, `CH_ROUTE` `:135-140`, `CH_POP` `:143`, `chSwap` `:151` | P |
| Reduced motion | `useChReducedMotion` `reduced-motion.ts:29`, `useChMotionMode` `:44` | P |
| Haptics | `haptic(kind)` `haptics.ts:33` with `ChHaptic` `select / press / commit / success / warning / error` (`:21`), `hapticScrub` `:61`. The spec's "selection haptic" is `'select'`. | P |
| Long press | `PEEK_HOLD_MS` = 450 | P `ui/Peek.tsx:37` |
| Smooth scroll | `canvasLenis` `:23`, `chScrollIntoView` `:34`, `attachWheel` `:267` (and its `defaultPrevented` rule `:295`), `useSmoothWheelEverywhere` `:317`, `usePanelSmoothScroll` `:337` | P `lib/smooth-scroll.ts` |
| Clock | `useNow` `lib/use-now.ts:10`, `useChClock` `use-clock.tsx:51` | P |
| Team zone and season | `loadTeamZone` `season.ts:78`, `seasonStartDate` `:67`, `SEASON_DEFAULT_TZ` `:60` | P |
| Calendar data | `loadCalendar` `data/calendar.ts:129` (zone `:160`, `windowFor` `:114`) for RSVPs, classes and people on the plan's day | P |
| Event update | `updateGolfEvent` `calendar-events.ts:942` (the time-move confirm) | P |
| Message prefill | `messagesPrefillHref` `screens/messages/prefill.ts:49`, `messageCoachHref` (used at `inspector.tsx:66`, `:505`) | P |
| Team chat lookup | first `is_team_chat` conversation by `created_at` | P `home.ts:314-316` |
| Message card | `sendGolfPollImpl` pattern: participant check, insert as the user with `kind` and `payload`, 23505 retry, `withAdminObserved` | PL `message-polls.ts:40-105`, `:139` |
| Push | `sendPushNotification` `push.ts:287` (queue path, prefs and Quiet mode via `gatedDelivery` in `shouldSendPush` `:85-92`) | P |
| Bell | `recordInAppNotification` `in-app.ts:33-79` | P |
| Share image | `html2canvas` (`package.json:253`, dynamic import as `player-comparison.tsx:247-254`); `navigator.share({ files })` with download fallback as `BestCard.tsx:73-117`; `@capacitor/share` (`package.json:212`) | P |
| Names for players | `readGolfPlayerProfiles(supabase, { teamIds })` `src/lib/golf/player-profiles.ts:87` (v1) | P |
| Drills library | `golf_drills` (global, read-only; `drills_read_all_authenticated`, `policies/golf.sql:419`) | P `10_tables.sql:685-698` |

Not reused, on purpose:
- BaseballHelm's practice code. It is single-lane and auto-notifies.
- `golf_practice_sessions` (`10_tables.sql:1467`), which is TrackMan ingest.
- `golf_focus_area_practice_sessions`, a player's own log.
- `notifyGolfMessageRecipients` (`src/lib/notifications/golf-message-fanout.ts:32`). The publish card must not call it: Publish already notifies, and a second "Message from Coach" push for the same act would be a double notice (owner call 14).

### 0.4 Alongside current features

- **Event files with category `practice_plan`.** `saveTextDocumentImpl` (`documents.ts:418-525`) defaults a text document's category to `'practice_plan'` (`:470`), and coaches attach such files to events. These are untouched. They keep living in Documents as files. A published plan's Documents row is a different thing: it has `practice_plan_id` set and no file.
- **Documents readers when `file_url` can be null.** After 010400, a plan row has `file_url IS NULL`. Every current reader assumes a string:

  | Reader | Where (P) | Risk with a null `file_url` | N-00 change |
  |---|---|---|---|
  | `getDocumentsImpl` | `documents.ts:184` (`select('*')`), `getDocuments` `:232` | returns plan rows to Fairway and Clubhouse | none (the callers below handle them) |
  | `loadTeamHub` | `hub.ts:300`, calls `getDocuments` `:310`, folders `:331` | `folders()` `hub.ts:923` calls `fileKind(d.file_type, d.file_url)` `:928`, which would throw | shim: `folders()` accepts `file_url: string \| null`, and a row with `practice_plan_id` gets kind "Plan" and opens its plan page |
  | Team Hub open action | `TeamHub.tsx:262` (`hub.openDocument` with a signed URL), `parts.tsx` `Documents` `:652` | would sign a null path | shim: a plan row navigates to `/golf/dashboard/practice/plan/<id>` |
  | `getPreviewUrl` | `documents.ts` ~`:1120-1240` | already guards `legacyDoc?.file_url ?` | none |
  | Fairway documents page | `dashboard/documents/page.tsx` `DocumentRow` `:69`, query `:88-89` | Fairway list and download | add `.not('file_url', 'is', null)` |
  | Event attach picker | `event-documents.ts:69-73` (embed), Fairway `EventFilePicker`, Clubhouse `EventFiles` (`inspector.tsx:578`) | attaching a plan row to an event | add `.not('file_url', 'is', null)` to the picker list reads |
  | Announcements attach | `announcements.ts:319`, `:1117-1128` | attaching a plan row | add `.not('file_url', 'is', null)` |
  | Admin activity | `src/lib/admin/data/activity.ts:593` | reads titles only | none |

  The filter is `.not('file_url', 'is', null)`, not `.is('practice_plan_id', null)`. `file_url` exists before and after the migration, so the filter is safe to ship while the migration is held. The CHECK makes "no file" and "is a plan" the same thing.

  When the owner applies 010400 and regenerates `database.ts`, `file_url` becomes `string | null` and these readers' local types (`DocumentRow` `:74`, `FairwayDocuments.tsx:140`, `announcements.ts:1114`) need `string | null`. That is the same change as above, listed here so the type regeneration is not a surprise.
- **Polls (PL).** The plan card reuses PL's kind and payload path and adds a second card kind. Merge order is in the header.
- **Calendar delete paths.** Deleting a practice event cascades its plan, its versions, its lines, its opens and its Documents row. v1's open call 5 (warn with a count) stands; section 4.17.
- **Qualifiers.** A Course block may link to an existing qualifier (`golf_qualifiers`, `10_tables.sql:1593`, `team_id`). The link is a label and a deep link only. The plan never writes scores, entries or selections.
- **Focus areas.** Own work lines default from the player's top active focus area title (`golf_player_focus_areas`, `10_tables.sql:1277`: `title`, `status`, `priority`). Read only.
- **Coordination with N-10 (agreed with the N-10 thread on 2026-10-25):**
  1. N-00's 010400 adds `practice_plan_id uuid NULL REFERENCES golf_practice_plans(id) ON DELETE CASCADE`, the partial unique index `golf_documents_practice_plan_uniq`, drops NOT NULL on `file_url`, and adds `golf_documents_source_check ((file_url IS NOT NULL) <> (practice_plan_id IS NOT NULL))`.
  2. The upsert happens inside SQL `golf_practice_plan_publish` (010600), so filing is atomic with the freeze. Row values:
     - category `'practice_plan'`, folder `'Practice plans'`, title = plan title, description = the focus line
     - `is_public` true, `uploaded_by` = the first publisher (kept on republish)
     - `file_url`, `file_type`, `file_size` NULL
     - `version_count` = the published version, `updated_at` = now(), `is_test` from `golf_teams.is_test`

     Republish after a take-down sets `is_public` true again. Take down sets `is_public` false and keeps the row. Deleting the plan cascades the row.
  3. Routes as 0.2. The New plan entry is `/golf/dashboard/practice?new=1`.
  4. Take-down deep link: `/golf/dashboard/practice/plan/[planId]?takedown=1` opens the plan page with the Take down confirm (CH-17502) ready.
  5. Shared component and loader: `PlanGlance` in `src/clubhouse/screens/practice/PlanGlance.tsx` (props `{ glance: ChPlanGlance; size?: 'card' | 'page' }`), and `loadPlanGlances(supabase, planIds): Promise<Map<string, ChPlanGlance>>` in `src/clubhouse/data/practice-plan.ts`, which reads the live frozen version. N-10's preview cards render `PlanGlance size="card"`. `PlanGlance` draws a cut of the plan document (4.10): the eyebrow, the title, the facts line and the first schedule rows (time, block, place). It has no day strip. `card` shows the first rows that fit; `page` lists every block.
  6. The `20261026090000` block belongs to N-09. N-10 takes its own block.
  7. N-00 ships the null-safe shim above, so Documents never breaks while N-10 is unbuilt.
  8. For plan rows, N-10's card menu shows "Open plan", "Print", "Pin", "Move to folder" and, for coaches, "Take down" or "Publish". It does not show "Share with players", "Rename", "Download" or "Delete": visibility, title and deletion belong to the plan, and a plan has no file. N-00's 010400 lets a coach update a plan row only within its own team's plan (section 8.6), so a move to another folder works through N-10's normal update.

### 0.5 Flags and gates

- `golf_clubhouse_ui` and the `HELM_CLUBHOUSE_TEAMS` allowlist (`gate.ts`) gate every route through `isClubhouseFor`, as 0.2.
- The release flag `golf_practice_plans` in `config/feature-flags.yml` (shape of `golf_clubhouse_ui`, P `:862-889`), regenerated into `src/lib/flags/registry.generated.ts` by `npm run flags:generate`. v1's entry is replaced by:

```yaml
  - feature_id: golf_practice_plans
    owner: golf/clubhouse
    purpose: >-
      Clubhouse Practice tab (N-00 v2): the Practice section in the sidebar
      and phone strip, the plan builder, the plan page, publish (Documents
      filing, push and bell to the plan's players, the team chat plan card),
      the print studio and share, the Calendar Plan row and glyph, and the
      Home plan lines. Needs migrations 20261026010000 to 20261026010800
      (HELD.md).
    type: release
    status: active
    created_at: "2026-10-25"
    expires_at: null
    default: false
    environment:
      production: false
      preview: true
      development: true
    kill_switch_behavior: null
    cleanup_plan: >-
      Remove this flag and every isFlagEnabled('golf_practice_plans') check
      in one reviewed change, once production has run with it on for a full
      month with no practice-related errors in chLogServer. The tables, the
      pages and the nav item stay; only the gate goes. Turning production on
      first needs the nine migrations applied, npm run test:rls passing and
      slices 1 to 5 built (an owner step).
```

- `expires_at` stays null, as `golf_clubhouse_ui`'s does. A flag past `expires_at` evaluates false, which would switch Practice off on a date rather than by a decision.
- When the flag is off:
  - The nav item is hidden (0.1 A) and every practice route redirects to Calendar.
  - The Calendar Plan row and glyph, and the Home lines, render nothing; their reads are skipped.
  - No action runs: each one checks the flag first and returns `{ ok: false, code: 'off' }`.
  - The flag is read on the server and passed down as a boolean (`ChShellData.practiceOn`, and `plansOn` on the Calendar and Home routes as in v1).
- **Missing-table safety.** If the flag is on before the migrations are applied, a read error with PostgREST `PGRST205`, PostgREST `PGRST202` (missing function) or Postgres `42P01` or `42883` counts as "Practice unavailable":
  - the routes show CH-17201 with "Practice isn't set up yet for this team."
  - the nav item stays, but the page says so
  - `chLogServer` logs once per request
  - nothing crashes
- **Nothing is flipped by this plan.**

### 0.6 Data today vs new

| Data | Exists today | Used for |
|---|---|---|
| `golf_events` (practice type, `start_time`, `end_time`, `all_day`, `status`, `location`, `parent_event_id`) | yes (`10_tables.sql`) | the plan's anchor and clock |
| `golf_event_attendance` (RSVP and attendance) | yes | Who's here, make-ups |
| `golf_team_members` (active), `golf_players`, player profiles | yes | plan players and groups |
| `golf_team_coach_staff`, `golf_coaches.full_name` | yes | coaches on blocks and stations |
| class events from `golf_player_classes` | yes, where players entered classes | arrivals (coach only) |
| `golf_team_settings.timezone` | yes | every clock (TS `loadTeamZone`; SQL trims, falls back to America/New_York) |
| `golf_drills` (global) | table yes; seed `20260422100001` has 64 rows (approach 12, course_management 5, pressure 6, putting 15, scoring 6, short_game 10, tee 10); production row count unverified | the GolfHelm library |
| `golf_player_focus_areas` | yes | Own work defaults |
| `golf_qualifiers` | yes | Course block's "Counts as qualifying" link |
| `golf_documents` | yes (`:664-681`) | the plan's Documents row (gains `practice_plan_id`) |
| `golf_messages` (`kind` CHECK allows `'practice'`, `:1131`; payload required for non-text kinds, `:1132`) | yes | the plan card |
| `golf_practice_plans` | **new** (010000) | the plan and its draft body |
| `golf_practice_plan_versions` | **new** (010000) | frozen published versions |
| `golf_practice_plan_lines` | **new** (010000) | private own-work lines per version |
| `golf_practice_plan_opens` | **new** (010000) | Seen by |
| `golf_team_drills` | **new** (010100) | the drill bank |
| `golf_practice_groups` | **new** (010200) | saved groups |
| `golf_practice_templates` | **new** (010300) | session, block and week templates |

The spec's "63 drills" counts the seed's categories as 12 + 5 + 6 + 15 + 6 + 10 + 10 = 64. The plan's copy never states a count; it says "GolfHelm drills".

What teams with no data see:
- **No practices this week.** The This week strip shows seven "No practice" tiles, and CH-17301 offers "New practice", which opens the Calendar form.
- **No plans yet.** Up next shows the next practice with "No plan yet" and "Build plan".
- **No class schedules.** The arrivals card says "No class schedules for this day. Everyone can start at 2:00 PM."
- **Empty drill bank.** CH-17308 offers "New drill" and "Browse GolfHelm drills".
- **No saved groups.** CH-17309.
- **Only the head coach on staff.** Coach fields still show, with one option.

### 0.7 What the ideas assumed that is not in the app

- **A golf practice plan table.** None exists (0.6 lists the unrelated practice tables).
- **Team-owned drills.** None. `golf_drills` is global and has no write policy (`policies/golf.sql:419`), hence `golf_team_drills`.
- **A Documents row without a file.** `file_url` is NOT NULL today (`10_tables.sql:670`), hence 010400.
- **A push type for plans.** None. `practice_plan` is added to the TS union only, and the bell reuses the `event_reminder` enum value with a `data.kind` discriminator, as `recordInAppNotification` documents (`in-app.ts:33-79`).
- **A team chat card for practice.** The kind is allowed by the CHECK, but no code writes or renders it. PL's poll card is the pattern.
- **A tasks screen for make-ups.** Clubhouse has no tasks route. Make-ups live on the plan table and show on Home and Practice.
- **Photo storage for drills.** None suitable. Links only (owner call 8).
- **Qualifier rounds as score sources.** Out of scope. The link is a label.
- **Weather.** Cut.

---
## 2. Who uses it

| Person | Does | Never |
|---|---|---|
| Head coach and assistants (`is_golf_team_coach`, staff joined to `golf_coaches.user_id`) | builds, publishes, republishes, takes down, deletes plans; keeps the drill bank, saved groups and templates; prints and shares; sees arrivals, problems, Seen by and every own-work line | sends anything except by the three presses in "Owner override" |
| Player (`is_golf_team_player`, an active member) | reads the live version of published plans for their team, their own path, Now and Next, their own own-work line, the drills in published plans; marks a make-up done | sees drafts, unpublished edits, teammates' class times, teammates' own-work lines, other teams' plans, Seen by, the drill bank |
| A coach with a `golf_coaches` row but no staff row on the team | nothing (pgTAP case 3) | |
| Fairway users | nothing (no Practice, no new UI); plan rows never appear in Fairway's document lists (0.4) | |

Every read and write is checked in RLS or a definer function. The UI hiding a control is never the only guard.

## 3. Where it lives

- **Desktop sidebar**: Practice after Calendar, both roles, `Target` icon.
- **Phone section strip**: first pills coach Home, CoachHelm, Calendar, Practice, Stats; player Home, CoachHelm, Practice, Rounds, Hub. The rest follow in sidebar order, then Settings (`phoneSectionsFor`). `docs/clubhouse/phone/section-strip.md` names the first pills and needs the same edit (listed under "Needs another plan" in the changelog).
- **Pages**: 0.2.
- **Calendar**: the Plan row, the glyph, the time-move confirm, the delete-count sentences.
- **Home**: the plan lines and, in slice 7, the make-up row.
- **Team Hub > Documents > Practice plans**: every published event plan (N-10 draws it; N-00 files it).
- **Messages, team chat**: the plan card.
- **Notifications**: push (Events) and the bell, from the three presses only.

Files: `src/clubhouse/screens/practice/` (screens), `src/clubhouse/data/practice-plan.ts` and `src/clubhouse/data/practice-home.ts` (loaders), `src/clubhouse/routes/practice.tsx` (route components), `src/app/golf/actions/practice-plans.ts`, `practice-publish.ts`, `practice-library.ts` (server actions), `src/clubhouse/styles/practice.css` and `src/clubhouse/styles/plan.css`. The full list is in section 9.

---

## 4. Design, screen by screen

House rules for every screen in this section:
- Type: only `--ch-type-*` roles. Large titles use `--ch-type-large-title` (`tokens.css:326`), section heads `--ch-type-section` (`:332`). No raw font sizes; `look-feel-pass-css.test.ts` fails any.
- Edges: page side padding `--ch-page-x-phone` (`:394`) is 16px, and 20px from 414px (`@media (min-width:414px)` `:1167-1169`).
- Cards: hairline borders and soft fills. **No thick left-border accent cards anywhere**: group colour is a filled tint plus a 24px letter disc, never a stripe. That is the builder's rule; the plan document and its outputs (4.10, 4.14, 4.15) carry no group colour at all.
- Colour for state: dark mode never uses `--ch-accent` for text or rings; it uses `--ch-green-600` and `--ch-border-focus`. Selected rows use `--ch-bg-selected`, surfaces `--ch-bg-surface`, quiet fills `--ch-bg-subtle`.
- Copy: no emoji, no exclamation marks, sentence case, times in the team's zone on the team's clock (12-hour as the app shows it today).
- Numerals in times and minutes are tabular (`font-variant-numeric: tabular-nums`).
- Desktop scroll uses Lenis as today; panels that scroll on their own use `usePanelSmoothScroll`.

### 4.1 Coach, Practice home (`/golf/dashboard/practice`)

Desktop, one column, max-width 1200px, centred like CP's course page.

1. **Header.** "Practice" in the large title role. On the right, the primary button "New plan" (opens the New plan sheet, 4.3) and the secondary "Templates" (links to `/practice/templates`).
2. **This week.** Seven day tiles, Monday to Sunday of the team-zone week, from the calendar's practice events (`golf_events` with `event_type = 'practice'`, not cancelled):
   - Each tile shows the day ("Thu 29"), the time ("2:00 PM") and a state chip: "No plan", "Draft", "Published", "Updated" or "Done".
   - Two practices on one day show two lines in the tile.
   - A day without a practice reads "No practice" in `--ch-ink-500`.
   - Tapping a tile opens the plan page. With no plan it opens the New plan sheet on that event.
   - Under the strip, one line: "Team time this week: 14 h 30 scheduled". This is the sum of the lengths of the week's practice and qualifier events (timed, not cancelled), in the team zone. It makes no compliance claim and has no target (spec owner call 5). When the week has none, the line is omitted.
   - Arrows "Previous week" and "Next week" sit at the strip's right. "This week" returns.
3. **Up next.** The next practice's plan as a large card: `PlanGlance size="page"` (the document cut: eyebrow, title, facts line and the schedule rows, time, block and place; no strip, figures or mix bar), then the groups in plain text, one line each ("Group A Sofia, Maya, Lena"). Buttons "Open plan" and "Edit". With no plan: the practice's facts, "No plan yet" and the primary "Build plan".
4. **Segmented tabs**, drawn as links: Plans · Drills · Groups · Templates. Plans is this page; the others are `/practice/drills`, `/practice/groups` and `/practice/templates`, each drawing the same header and Segmented.
   - **Plans.** Three groups, in order:
     - Drafts, soonest first.
     - Published, by date, upcoming first.
     - Past, collapsed behind "Past plans (12)", newest first, 20 at a time with "Show more".

     Each row shows the date, the title, the time, a plain line of the first two blocks ("2:00 Warm-up · 2:15 Short game rotation"), the state chip and, for published plans, "Seen by 9 of 11". A published plan with edits not yet published adds "Edits not published" in `--ch-warning-600`.

Phone: the same order in one column. This week becomes a horizontally scrolling row of tiles, snapped, with today scrolled into view. The Segmented sits under Up next. "New plan" is in the top bar's trailing slot as a plus button labelled "New plan".

**Drills tab (`/practice/drills`).**
- Search at the top, then area chips: All, Putting, Short game, Bunker, Approach, Tee, Course, Fitness, Mental.
- Two sections: "Your drills" (the bank) and "GolfHelm drills" (the library, each with a small "GolfHelm" mark).
- A drill row shows the name, area, kind, minutes, players and a levels line ("Par 6 of 10 · Birdie 8 · Eagle 10").
- "New drill" opens the drill sheet (4.7). A row opens `/practice/drills/[drillId]`.
- The drill page shows every field. For a team drill it has "Edit", "Archive" (CH-17510) and "Used in 4 plans". For a library drill it has "Copy to your bank".

**Groups tab (`/practice/groups`).**
- Saved groups as cards: name, member avatars (up to 8, then "+3"), "8 players", "Used in 6 plans".
- "New group" opens a FormSheet: name, then a checklist of the active roster.
- A card opens the same sheet to edit, with "Delete group" (CH-17511). Deleting never changes plans that copied it.

**Templates tab (`/practice/templates`).** A gallery of cards. Each card shows a live mini preview (the same card as Documents: `PlanGlance size="card"`, the eyebrow, title, facts line and first schedule rows, built from the template body), the name and "Session · 3 h", "Block · 60 min" or "Week · 4 practices".
- Order: "From GolfHelm" (the six starters, 4.16) first, then "Your templates", filtered by a Segmented: Session · Block · Week.
- A card's menu: "Use", "Duplicate", "Rename", "Delete" (CH-17506). Starters have only "Use" and "Duplicate to your templates".

### 4.2 Player, Practice home

1. "Practice" large title.
2. **Today** (or the next practice with a published plan). Their own path card:
   - Line one: "Thursday, 2:00 to 5:00 PM, Lakeside range".
   - Then their stops, one per line, time in the margin: "2:00 Warm-up, Range, everyone" / "2:15 Putting green, Lag ladder, Group B" / "2:35 Short game area, Up and down, Group B" / "4:00 Own work: Wedges inside 100".
   - "Open plan" at the foot.
   - During practice the current stop is lit (`--ch-bg-selected` fill and a 2px `--ch-border-focus` ring, never a stripe). A chip "Rotate in 4 min" counts down from the turn's end, by the minute, using `useNow`. It sends nothing.
   - After practice the card reads "Ended" and "Today's plan had 6 blocks", then leaves Today the next day.
3. **This week**: day tiles as the coach's, published plans only. Days without a published plan read "No plan" (or "No practice").
4. **Past plans**: rows, newest first, 20 at a time.
5. **Team drills**: the drills used in the team's live published versions this season (season from `seasonStartDate`, 1 August in the team zone), read only. Each opens the drill as it was frozen.

With nothing published: CH-17302 "Your coach hasn't published a plan for this practice yet." A player in no group: CH-17305.

### 4.3 New plan sheet (coach, `?new=1`)

A FormSheet, two steps in one sheet.
1. **Pick the practice.** A list of this and next week's practice events without a plan: "Thu, Oct 29 · 2:00 to 5:00 PM · Lakeside range". At the end: "New practice", which goes to `/golf/dashboard/calendar?new=1&type=practice&then=practice`. Calendar's own event form opens there, and after a create it returns to `/golf/dashboard/practice?new=1&event=<id>` with that practice picked.
   - An all-day practice is listed but disabled with CH-17110 "Give this practice a start and end time to plan it."
   - With `&event=<id>` this step is skipped.
2. **Start from.** Three large choices:
   - **Blank**: one Team block "Warm-up", 15 min, at the practice's place.
   - **Template**: opens the gallery as a ListSheet (starters first).
   - **Copy a past practice**: the team's past plans, newest first, same series first. Copy keeps blocks, stations, drills and groups. It drops own-work lines and pairings, and keeps group members only if they are still active. Times follow the new practice's start, because blocks store minutes.

"Create plan" saves the first draft (`golf_practice_plan_save` with the event) and opens the builder on Blocks. If another coach created a plan for that practice in the meantime, the sheet opens theirs and says "Coach Lin already started a plan for this practice."

### 4.4 The builder, desktop frame (`/practice/plan/[planId]/edit`, width 821px and up)

Three panes, full height below the header:
- **Left, Library rail, 300px.** Tabs Drills · Groups · Templates. Search at the top, then area chips (Drills tab). Items drag onto the board. "New drill" is pinned at the bottom of Drills. The rail scrolls on its own (`usePanelSmoothScroll`).
- **Centre, the Board.** The timeline. Times down the left in 15-minute rules, labels every 30 minutes. Blocks stack top to bottom as cards across the width, each block's height proportional to its minutes (minimum 56px so a 5-minute Break stays tappable). A Stations block expands into its rotation grid (4.5).
- **Right, Inspector, 340px.** The fields of whatever is selected: block, station, drill or group. With nothing selected it shows "This practice":
  - title, focus line (0 to 140 characters), place, coaches
  - extra items to bring
  - the problems list
  - arrivals (coach only, class-aware)

  Switching the selection uses `CH_ROUTE` (6px rise in, 4px out, `chTween('base')`, `motion.ts:135-140`).

**Header** (sticky, two rows):
- Row one:
  - Back "Practice".
  - The editable title ("Thursday practice"; it defaults to the event title, 1 to 80 characters).
  - Chips for date, time and place, read from the event. The time chip opens a small sheet to edit start and end. Saving it asks CH-17509 "Also move Thursday practice to 2:30 PM on the calendar?" with "Move practice" (calls `updateGolfEvent(eventId, …)`, `calendar-events.ts:942`, for this event only) and "Cancel". If the event is part of a series, the description adds "Only this practice moves. The rest of the series stays." Because the plan's clock is the event, "Cancel" leaves both unchanged.
  - "Preview" (opens the plan page as players will see it, in a sheet) and the primary "Publish" ("Republish" once published with changes; disabled with a tip while there are errors).
- Row two:
  - The **step bar**: a Segmented of Blocks · Groups · Drills · Review. It is not a locked wizard. The step is saved on the plan (`step`), so reopening the plan opens where the coach left it.
  - The **time ribbon**, worded:
    - "2 h 50 of 3 h planned, 10 min open"
    - "3 h of 3 h planned"
    - "15 min over", in `--ch-warning-600` (5.67:1 light, 7.92:1 dark on surface)

    It is an `aria-live="polite"` region (CH-17803).
  - The **mix bar**: a thin three-part bar, Skill · Random · Pressure, with minutes beside it ("Skill 40 · Random 30 · Pressure 20"). Minutes come from drills: a Team block gives its length to its drill's kind; a Stations block gives each station's drill one turn's minutes (a player visits each station once in a full rotation). Course, Own work, Break and blocks without a drill are not counted, and the bar's label says "Drill time only".

**Autosave**: 800ms after the last change, through `savePracticePlan` with the plan's draft `version`. "Saved" or "Saving…" shows beside the title. On a stale save (another coach saved), CH-17505 offers "Load latest", plus "Keep mine" on desktop only (v1's rule). Offline, CH-17901; edits are kept in `sessionStorage` "in this tab" and saved on reconnect. Three failures in a row give CH-17001.

### 4.5 Step 1, Blocks

- **Adding.** "+ Add block" sits between any two blocks (a 24px hit row that shows on hover and on keyboard focus) and at the end. It opens a `Menu` of the five kinds, each with a one-line description:
  - **Team**: "Everyone together: warm-up, talk, lift, film."
  - **Stations**: "Groups rotate between stations."
  - **Course**: "Holes on the course, with pairings and tee times."
  - **Own work**: "Each player works on their own list."
  - **Break**: "Travel, water, moving between places."
- **Block card.** It shows:
  - the time range "2:15 to 3:15"
  - the name ("Short game rotation")
  - a kind glyph (lucide `Users` Team, `LayoutGrid` Stations, `Flag` Course, `User` Own work, `Coffee` Break)
  - the minutes
  - the place, or for Stations "3 stations · 3 groups · 20 min turns"

  The card fill is the kind tint (7.1). The edge is a 1px `--ch-ink-400` ring, the only edge that reaches 3:1 against the surface; the tints alone do not (7.1).
- **Length.** Drag the block's bottom edge, which snaps to 5 minutes:
  - each step ticks `haptic('select')`
  - the ribbon updates live
  - blocks below move with `chSpring('settle')` (`CH_SPRINGS`), instantly under Reduce Motion

  A Stations block's length is turns × turn minutes plus moves, so its edge changes the turn minutes (5-minute steps) instead. Keyboard: with the block focused, Shift+Down and Shift+Up change the length by 5 minutes.
- **Reorder.** Drag by the handle (a 24px grip at the card's left, inside the card). Times recompute from the practice start. Keyboard: Alt+Up and Alt+Down. CH-17802 announces "Short game rotation, now 2:30 to 3:30."
- **Block menu** ("…"): Duplicate, Save as block template, Move up, Move down, Delete (CH-17507).
- **Inspector by kind:**
  - **Team**: name, minutes (stepper, 5 to 360), place (menu, below), coach (optional), drill slot, note (0 to 280).
  - **Stations**:
    - stations (1 to 8, each a place, an optional coach, a drill slot and a note)
    - groups in this block (chips of the plan's groups; default all)
    - turn minutes (5 to 60, step 5), move minutes (0 to 10, default 2)
    - turns (default = number of stations)
    - the rotation grid
  - **Course**:
    - holes: "9 holes", "18 holes" or a range "Holes 10 to 14"
    - format: Stroke play, Scramble, Best ball, Worst ball, Match play
    - pairings with tee times: "Make pairings" deals the plan's players into fours by roster order; drag to change; the tee interval defaults to 10 min
    - optional "Counts as qualifying", a menu of the team's qualifiers by name ("Counts toward Fall qualifier"); a label and link only
  - **Own work**: minutes, place. Then one line per player (0 to 140 characters), prefilled from each player's top active focus area title (`golf_player_focus_areas`, `status = 'active'`, lowest `priority`, then oldest). Empty lines read "Own work" on the page. The inspector notes "Each player sees only their own line."
  - **Break**: minutes, place or "Travel to the course".
- **Places menu.** Putting green, Short game area, Range, Bunker, Course, Indoor bay, Gym, Film room, then "Your places": every other place name used in the team's last 20 plans, and "Add a place" (free text, 1 to 40). No new table: places live in plan bodies.
- **The rotation grid** (Stations):
  - Columns are stations, rows are turns with their start times ("2:15", "2:37", "2:59" with 20-minute turns and 2-minute moves).
  - Each cell holds a group chip: a filled tint with the group letter in a 24px disc, and the group name if it fits.
  - The grid fills itself: group g at turn t is at station (g + t) mod S, with groups and stations in their listed order. Turn 1 has group A at station 1, B at 2, C at 3; turn 2 has C at 1, A at 2, B at 3; and so on.
  - With fewer groups than stations, the spare cells read "Open".
  - Dragging a chip onto another cell swaps the two. The other chips move with a FLIP spring (`chSpring('smooth')`), instantly under Reduce Motion, and the drop ticks `haptic('commit')`.
  - Once the coach edits it, the grid is stored as an override; "Reset rotation" returns to the automatic one.
  - The grid is a real `<table>` with row and column headers (CH-17804). Keyboard: arrow keys move between cells, Space picks a chip up and Space drops it.

### 4.6 Step 2, Groups

- **Left: Who's here.** The practice's players: by default the active roster, with each player's RSVP from `loadCalendar` for the day ("Going", "Can't come", "No reply"). For the coach there is a class-arrival note: "Arrives 2:45, class until 2:30". It is worked out from the player's class events that day and the plan's arrival buffer (0 to 30 min, step 5, default 15). Players who said they can't come are listed last, dimmed (`--ch-ink-500`), with their reply. A checkbox "In this practice" removes a player from the plan's players.
- **Centre: group columns**, A, B, C, with "Add group" up to F.
  - Each column header shows the letter disc, the group name (editable, default "Group A"), the colour and "4 players".
  - Drag avatars between columns. Keyboard: focus an avatar, press 1 to 6 to move it to group A to F.
  - "Split evenly" opens a small sheet: the number of groups (2 to 6, default the number of stations in the first Stations block, else 3), then "Split" (CH-17508 confirms when groups already have players). It is deterministic:
    1. Order the players by roster order (last name, then first).
    2. Players whose arrival falls after the first turn's start go together into the last group.
    3. The rest are dealt round-robin into the groups, smallest group first, so sizes differ by at most one where the late group allows.
  - "Use a saved group" opens a ListSheet of saved groups; picking one fills the selected column with its active members and names the column after it.
  - "Save groups" stores the current columns as saved groups, each with its name (CH-17113 if a name is taken).
- **Problems inline**, under the column:
  - "Ava Chen arrives at 2:45. Group C starts at 2:15. Move Ava or start Group C on the second turn."
  - The fix "Start Group C on the second turn" leaves Group C's first cell empty ("Arriving") and adds one turn, so Group C still reaches every station. The block grows by one turn and the ribbon says so.
  - Other problems: a player in no group while a Stations block uses groups (CH-17105, a warning), and more groups in a block than stations (CH-17103, an error).
- Colours A to F are fixed by position (7.1). A group used in a Stations block shows its colour in the grid.

### 4.7 Step 3, Drills, and the drill bank

- Each station and each Team block has a drill slot, "Add drill". Selecting a slot filters the Library rail to the station's area: Putting green shows Putting first, Short game area shows Short game, Bunker shows Bunker, Range shows Approach and Tee, Course shows Course, Gym shows Fitness, Film room shows Mental.
- **Drop a drill on a station.** Its minutes show beside the turn. If the drill runs longer, the cell shows CH-17108 "Drill runs 25 min; turn is 20." That is a warning, never a block.
- **New drill.** A FormSheet with the drill fields:
  - name (1 to 80)
  - area (Putting, Short game, Bunker, Approach, Tee, Course, Fitness, Mental)
  - kind (Skill, Random, Pressure)
  - minutes (1 to 180)
  - players (Solo, Pairs, Group)
  - equipment (rows of item and quantity, up to 20)
  - set-up (0 to 1000)
  - goal (0 to 200, "8 of 10 inside 3 feet")
  - levels (Par, Birdie, Eagle targets, each 0 to 40)
  - scoring rows (label and points, up to 10)
  - tags (up to 10)
  - photo or video link (https, up to 500)
  - diagram (Auto, None, Rings, Gate, Ladder, Landing, Targets, shown as small thumbnails; drawn in the drills appendix and on the drill page, 4.14)

  Save adds the drill to the bank and to the slot at once, with the toast CH-17016 "Saved to your drill bank".
- **Editing later.** The bank's drill page edits the drill. Draft plans pick up the change. Published plans keep the drill as it was frozen at their last publish until they are republished. A drill change alone never notifies anyone, and What changed lists it only as wording (4.11).
- **GolfHelm drills** carry a "GolfHelm" mark. "Copy to your bank" makes an editable team copy (`copied_from_drill_id` set; toast CH-17017 "Copied to your bank"). Library categories map to areas like this (seed `20260422100001`):

  | Library `category` | Area on the copy | Kind on the copy |
  |---|---|---|
  | putting | Putting | Skill |
  | short_game | Short game | Skill |
  | approach | Approach | Skill |
  | tee | Tee | Skill |
  | course_management | Course | Random |
  | scoring | Course | Random |
  | pressure | Mental | Pressure |

  The coach can change both. Bunker and Fitness have no library drills; the rail says "No GolfHelm drills for Bunker yet." A library drill used directly in a plan (not copied) keeps its own `category` label on the page.
- **Archive, not delete.** A team drill can be archived (CH-17510). It leaves the bank's list. Drafts that use it keep working, and published plans keep their frozen copy.

### 4.8 Step 4, Review

The finished plan exactly as players, Documents and print show it: the plan page (4.10) rendered from the draft, through the same component. On top is a coach strip:
- **Problems.** Errors must be zero to publish; warnings are allowed. Each problem links to its block, group or cell.
- **The recipient line.**
  - First publish: "14 players and 2 coaches will be notified."
  - A republish: "3 players whose day changed will be notified."
  - Wording only: "Only wording changed. No one will be notified."
- **Buttons**: "Print" (opens the print studio), "Share" (4.15, published plans only; disabled with "Publish first to share" before) and the primary "Publish" or "Republish".

### 4.9 Coach phone builder (below 821px, and coarse-pointer tablets)

- One column. Under the top bar, the step bar as a Segmented (Blocks, Groups, Drills, Review), sticky. Under it, the ribbon line and the mix bar, compact.
- **Blocks.** A vertical list of block cards with "+ Add block" rows between them.
  - Tapping a card opens a FormSheet with the block's fields (4.5), with length as a stepper (- 5 min +); each step ticks `haptic('select')`.
  - There is no edge drag on the phone.
  - Reorder is a long press (450ms, `PEEK_HOLD_MS`), then drag on the document scroll. The lifted card scales to 1.02 with a `CH_POP` shadow. The list auto-scrolls near the edges. Drop ticks `haptic('commit')`.
- **Stations rotation**: a compact grid. Tapping a cell opens a ListSheet "Put in this cell" with the groups. Picking one swaps it with that group's cell in the same turn.
- **Groups**: horizontal group rows of avatars. Tapping an avatar opens an ActionSheet "Move Ava Chen to": Group A … F, "Out of this practice". "Split evenly" and "Use a saved group" sit at the top.
- **Drills**: "Add drill" opens the drill bank as a ListSheet with search and area chips, and "New drill" opens the drill FormSheet.
- **Review and Publish** as on desktop. Publish opens the same sheet (4.11).

### 4.10 The plan page (one render)

Rebuilt on 2026-10-25 after Nick said the generated plan "looks vibe coded and shitty" and asked for "just simple, modern, premium. apple level". The plan document is now one restrained system for the screen page, the printed coach copy, the range board, pocket cards, the drills appendix, the share image, the Documents thumbnails and the player view. The design page (`practice-plan-builder.preview.html`) draws it; the sample plan below is the design page's ("Tuesday practice").

`PlanPage` in `screens/practice/PlanPage.tsx` is the only renderer of a plan. It is used in five places:
- the coach's Review (from the draft)
- the player's view (from the live version)
- the Documents preview (`PlanGlance`, a cut of the same document: eyebrow, title, facts line and the first schedule rows)
- the share image (the same pieces in a 1080 × 1350 layout, 4.15)
- print (the same markup under print CSS, 4.14)

It must read like a typeset document, not a form or a dashboard.
- **Layout** follows Apple's tech specs pages: a left label column (Focus, Groups, Schedule, Drills, Bring, Notes), the content on the right, and a hairline above each section. Desktop: a centred sheet 880px wide, label column 160px, 32px gap. Phone: the label stacks above its content, with 22px side padding.
- **Type only.** Instrument Sans (the app font), tabular numerals, sentence case. Hierarchy comes from size, weight and three inks (ink-900, ink-600, ink-500), never from colour or boxes.
- **Not on the plan document**: small caps eyebrows, icons, tags or pills, coloured group chips or letter discs, tinted panels, cards inside cards, left-border accents, the team monogram coin, the proportional day strip, the three figures, the Skill · Random · Pressure mix bar and its legend, the timeline spine and nodes, kind tags, tinted rotation cells. The builder keeps its own mix bar, ribbon and tints (4.4, 4.9, 7.1); only the generated plan and its outputs dropped them.
- **Colour.** Ink only, on screen and on paper. The one accent, Clubhouse green (`--ch-green-600`), is used only in the player view, for Now and for the player's own group in the rotation. Dark mode uses the existing `--doc` surface tokens. Paper is always light.

1. **Masthead.**
   - The eyebrow "Lakeside University Golf · Practice plan" on the left and, on the coach's view, "Coach copy" on the right, both in muted ink at caption size.
   - The title "Tuesday practice" (56px on screen, from the large title role).
   - The deck "Tuesday, October 27 · 2:30 to 5:00 PM · Lakeside Golf Club".
   - The by-line "Coach Rivera and Coach Lin · Version 1, published Monday 9:14 PM". After a republish it reads "Version 2, updated Tuesday 1:02 PM · See what changed", where "See what changed" is a text button that opens the What changed list. The list carries the anchor `#changes`; a link to the plan page ending in `#changes` (the republish push and bell use it) opens the page with the list open and scrolled into view (N-10's open item).
   - Coach only, published event plans: "In Documents", plain text in the by-line, a link to `/golf/dashboard/team-hub?tab=docs&folder=practice-plans` (N-10 entry G).
   - Coach only: "Seen by 9 of 11", plain text in the by-line and the screen footer (P-01 grammar: "Seen by everyone", "Not seen yet"; on the plan document it is words only, with no glyph). Tapping it opens a ListSheet "Seen" and "Not yet", with "Message the ones who haven't", a prefill to those players through `messagesPrefillHref` that the coach sends.
2. **Focus.** The one sentence the coach wrote, on one line at 24px medium (17px on paper) with a balanced wrap (`text-wrap: balance`): "Lag putting and wedges inside 100 yards. Finish under pressure." Omitted when empty.
3. **Groups.** Three columns: "Group A", then the members comma-separated ("Sofia Ruiz, Maya Patel, Lena Brooks"). A name never breaks inside itself (`white-space: nowrap` per name). Groups D to F wrap to a second row of three. Coach only, under them: a **Late arrival** note, "Late arrival. Ava Chen has class until 2:45 and joins Group C at 3:05 on the putting green.", worked out at render time from class events and never stored. It replaces v2's separate Arrivals section.
4. **Your practice** (player viewer only). See "The player view" below.
5. **Schedule.** Each block is a row: the time column (the start, "2:45", then the length, "60 min", in muted ink), the title and a one-line description, and the place right-aligned in muted ink. Rows are separated by hairlines.
   - A **Stations** block holds its rotation table inline under the description. The columns are drills (the drill name, then the place and the coach in muted ink); the rows are turns with their times; each cell reads "Group A" with the letter bold. A "Par" row at the foot gives each drill's par on screen; page 1 of the coach copy drops it because page 2 lists Par, Birdie and Eagle.
   - A **Course** block gives holes and format in its description and lists the tee times in two columns ("3:50 Sofia and Maya"). A linked qualifier adds "Counts toward Fall qualifier" to the description.
   - **Own work**: a player sees "Own work: Wedges inside 100" (their line only, from `golf_practice_plan_lines`); the coach sees every player's line. The range board prints only "Own work".
   - A **Break** is one compact muted row: "Move to the 10th tee. Water at the cart barn" with "5 min" on the right.
6. **Drills.** Two columns. Each drill: the name, then "Putting green · 20 min" in muted ink, the description, then the levels "Par 6 of 10  Birdie 8  Eagle 10" (numbers in semibold, words in muted ink). A drill's photo or video link, when it has one, follows the description as a plain text link and opens in a new tab. Set-up diagrams and scoring rows are in the drills appendix (4.14).
7. **Bring.** Two columns of hairline rows: the item on the left, the count on the right ("Alignment sticks 6"). The list is merged from every drill use plus the plan's extra items, summed by name with case and spaces ignored. On the coach's screen each row is a checkbox for the coach's own use while setting up; a ticked row turns muted. Ticks are kept in `localStorage` per plan and never saved to the server.
8. **Notes.** The coach's notes as plain text. Omitted when empty. Paper adds ruled writing lines (4.14).
9. **Footer.** "Lakeside University Golf · Team Hub › Documents › Practice plans" on the left, a small QR code captioned "Live plan / team sign-in", and on the right "Seen by 7 of 9" on the coach's screen or "Page 1 of 2" on paper.

Coach-only on the coach's view (never in a version a player can read):
- **Late arrival** (item 3).
- **Problems.**
- **Make-ups**, after the practice (slice 7).

**The player view** (phone first; the desktop player view is the same column, centred):
- The eyebrow "Practice plan", the title, the deck ("Tue, Oct 27 · 2:30 to 5:00 PM", then the place) and the focus at 17px medium.
- A neutral segmented control in the iOS style, "Your practice | Everyone": a grey track, a white selected thumb (a grey thumb in dark mode), 32px tall. "Your practice" is selected first.
- **Your practice**: "Group B · with Nora and Jade", then their stops as rows: the time, the place in bold, then the drill with its coach ("Up and down 9 with Coach Rivera"). Breaks are muted rows. During practice the current row is labelled "Now" at its right, with its time and place in Clubhouse green, and the following row "Next" in muted ink. The Now and Next labels sit in an `aria-live="polite"` region (CH-17801) whose text reads "Now: Short game area with Coach Rivera, until 3:05 PM" and "Next: Range, 3:05 PM". Under the stops, "Bring" with the player's own line.
- **Everyone**: the full schedule as rows (time, block, place), the rotation table with the player's group letters in green and the others in muted ink, and the groups by first name ("A Sofia, Maya, Lena").

The plan page's actions:
- Coach, in the header: "Edit" (the builder), "Share" (4.15), "Print" (the print studio), and a "…" menu with Switch to rain plan or Back to main plan (4.12), Take down (published only), Delete plan (CH-17501).
- Player: "Share" is not offered. Players get no share or print in v1, since the plan is the team's.

A draft opened by a player's link: CH-17302. A taken-down plan: "Thursday's plan was taken down." A deleted plan: 404 inside the Clubhouse frame with "This plan was deleted."

Opening the plan page as a player calls `recordPracticePlanOpen(planId)` once per page view (definer `golf_practice_plan_record_open`, 8.8). It is best-effort, never awaited for paint, and failures are logged only.

### 4.11 Publish, Republish, Take down, Seen by

**The Publish sheet** (FormSheet, desktop and phone):
- Who is notified: a row of avatars and the count "14 players, 2 coaches". Tapping it shows the names.
- A toggle "Post in team chat" (on). It is hidden when the team has no team chat, and hidden on republish once a card exists (the card updates itself).
- The Documents line: "Files to Team Hub > Documents > Practice plans."
- The primary "Publish plan".

This press is the coach's act. Nothing sends before it.

**On Publish**, the server action `publishPracticePlan` (8.15):
1. Re-runs `validatePlan` on the saved draft. Any error returns `problems` and nothing else happens (CH-17115).
2. Calls `golf_practice_plan_publish`, which in one transaction:
   - freezes the version (v1, v2, …) with drill snapshots and without own-work lines
   - writes the own-work lines to `golf_practice_plan_lines`
   - moves the live marker
   - files or updates the Documents row
   - returns the recipients
3. In `after()`, once the transaction has committed:
   - pushes to each recipient: type `practice_plan`, Events category, honouring `push_events` and Quiet mode through `shouldSendPush`
   - writes bell rows: `event_reminder`, `data.kind = 'practice_plan'`, grouped by identical body

   A failure is logged (`chLogServer`, CH-17205-style, no visible copy) and never undoes the publish.
4. If "Post in team chat" is on and the plan has no card yet: inserts the card as the coach (4.13) and stores its id. If the insert fails, the publish stands and the toast CH-17014 offers "Post again".

Success toast CH-17019: "Published. 14 players and 2 coaches told." It is `haptic('success')`, with a `chSpring('settle')` check that draws in over `CH_DUR.reveal` (instant under Reduce Motion).

**Notification wording** (deterministic, from the frozen version):
- **First publish, a player:**
  - title "Practice plan for Thursday"
  - body "2:00 PM · You start on the putting green with Group B"
  - if their first stop is a Team block: "2:00 PM · You start with warm-up at the range"
  - if they are in the plan but in no group: "2:00 PM · Open the plan to see where you start"
- **First publish, an assigned coach:** title as above, body "2:00 PM · You're at the putting green" (their first assignment).
- **The day word.** It is the weekday ("Thursday") when the practice is within the next six days in the team zone, else "Thu, Nov 12".
- **Republish, an affected player:** title "Thursday's plan changed", body their first change ("Range moved to 3:20 PM"), plus " and 2 more" when there are more.
- **Take down, a player who had it:** title "Thursday's plan was taken down", body "Thu, Oct 29 · 2:00 PM".
- Deep link and bell action URL for all three: `/golf/dashboard/practice/plan/<planId>`.

**Republish and What changed.** `diffVersions(previousLive, nextDraft, ctx)` in `model.ts` compares the frozen previous version with the draft, both resolved to each player's path (`pathFor(body, playerId, eventStart)`: their stops with start, end, place, group, drill name and coach). It produces:
- **Player-facing changes**, worded:
  - "Practice starts at 2:30 PM"
  - "Range moved to 3:20 PM"
  - "Ava Chen moved to Group C"
  - "Lag ladder replaced by Gate drill at the putting green"
  - "Course block added at 4:00 PM"
  - "Break removed"
  - "Coach Patel now at the range"
  - "Switched to the rain plan"
  - "Your own work changed" (only to that player)
  - "You were added to Thursday's plan"
  - "You're no longer in Thursday's plan"
- **Wording-only changes**: title, focus, notes, a drill's set-up, goal, levels or scoring, a block's note. Listed as "Wording: notes edited", "Wording: Lag ladder's goal edited". They notify no one.

The **affected players** are those whose path differs (added and removed players included). The sheet lists the changes in words, then "Tell players" (on), with "3 players whose day changed will be notified" and their names on tap. Switched off, the line reads "No one will be notified." When only wording changed, the toggle is hidden and the line says "Only wording changed. No one will be notified." The list of changes is stored on the version (`changes`, up to 30 lines of 140 characters) for "see what changed".

**Take down** (plan page "…" menu, the builder's Publish menu, or the `?takedown=1` deep link), confirm CH-17502: "Take down Thursday's plan?" / "Players lose it, it leaves Documents for players, and the team chat card says Taken down. 14 players will be told once." / "Take down". It:
- returns the plan to Draft
- clears the live marker (players can no longer read any version)
- sets the Documents row's `is_public` false
- makes the card read "Taken down"
- notifies the players who had the live version, once

Publishing again works as a republish against the last version: What changed compares with it, and the notice wording is the first-publish wording for everyone, because they lost it.

**Seen by**: section 4.10 item 1. It counts the players in the live version whose highest opened version is the live version or later, so a republish resets it ("Seen by 0 of 11" right after republishing, "Seen by 3 of 11" as they open). The Practice home rows show the same count.

### 4.12 During practice: Now and Next, the Run view, the rain swap

- **Now and Next** for players (4.10 item 4 and the Practice home card). Times come from the event's live start plus block minutes. Moves between stations show as "Move to the short game area, 2:35 PM". `useNow` re-renders by the minute, and the line swaps with `CH_ROUTE` (CH-17603).
- **Run view (coach phone, during practice).** On the plan page, from 15 minutes before the start until the end, a coach sees a "Run" card at the top:
  - Now and Next for each group, in one row per group.
  - Two buttons, "Shift the rest 5 min later" and "5 min earlier". Each is a **quick republish** (CH-17512 confirm: "Move the rest of practice 5 min later?" / "Tell players" off by default / "Move"). It changes the current block's length by ±5 (which shifts every later block), saves, and republishes in one action. "Tell players" is off by default, because players watching the page see it update.
- **Rain swap.** The plan keeps an optional rain layout (`variants.rain`), made from the builder's "…" menu: "Make a rain plan" copies the main layout to start from. The plan page's "…" offers "Switch to rain plan" (CH-17503). The switch sets the active layout on the draft and opens the Republish sheet with "Switched to the rain plan" listed and "Tell players" on. "Back to main plan" works the same way. A plan with no rain layout hides both items.

Realtime (8.9): a player's open plan page refreshes when a new live version appears, and the coach's builder refreshes when another coach saves. A live refresh never lands mid-drag; it waits for the drop or Escape, as v1 specified.

### 4.13 Plan card in Messages (team chat)

- **Posted by Publish only**, as the coach (`golf_messages` insert with the user client, so `golf_messages_insert_v2`, `policies/golf.sql:789`, applies: the sender is the coach and a participant). The coach must be in the team chat. If they are not, the toggle reads "You're not in team chat" and is off.
  - `kind = 'practice'`
  - `payload = { "plan_id": "<uuid>", "v": 1 }`
  - `content` is the fallback text: "Practice plan: Thursday practice, Thu, Oct 29, 2:00 PM"
- **Live state, not edited payloads.** `golf_messages_update_v2` (`:793`) lets only the sender update a message, so a republish by another coach could not edit the card. The card stores only the plan id and renders state through `golf_practice_plan_cards(plan_ids)` (8.8):
  - Published
  - "Updated 1:02 PM"
  - "Taken down"
  - "Practice cancelled"
  - "This plan was deleted" when the function returns no row
- **Card layout:**
  - the kicker "Practice plan"
  - the title "Thursday practice"
  - the facts line "Thu, Oct 29 · 2:00 to 5:00 PM · Lakeside range"
  - a plain line of the first two blocks ("2:00 Warm-up · 2:15 Short game rotation"); no strip
  - for a player, "You: Group B, start on the putting green", from the live version they can read
  - "Open plan"

  It is a bubble-width card in `--ch-bg-surface` with a hairline border, no stripe.
- **One card per plan.** `chat_message_id` is stored on the plan (`golf_practice_plan_set_chat_message`, 8.8), and "Send to team chat" in Share offers it only when there is none or the stored message was deleted.
- **No message push for the card.** It does not call `notifyGolfMessageRecipients` (0.3). The publish notice is the one notice.
- **Inbox preview**: "Practice plan: Thursday practice" (beside PL's `lastIsPoll`, `MessagesView.tsx:445`; `Messages.tsx:109`).
- **Unknown payload version**, `v > 1`: the card shows the fallback text and "Open plan", as PL does for polls it can't draw.

### 4.14 Print studio (`/practice/print/[planId]`, coach)

Redrawn on 2026-10-25 after Nick said the printed plan "doesn't really look good", and rebuilt again the same day with the plan page (4.10) after "this looks vibe coded and shitty" and "just simple, modern, premium. apple level". The printed coach copy is the on-screen plan page laid out for paper, not a separate compressed sheet. Desktop: the pages as scaled sheets on the left (scrolling on their own) and the toggles on the right. Phone: the toggles first, then the pages one after another.

| Toggle | Default | Paper | What it is |
|---|---|---|---|
| Coach copy | on | US Letter **portrait**, `@page ch-plan-tall`, two pages for a normal plan | the plan page in print form (below) |
| Range board | on | US Letter **landscape**, `@page ch-plan-wide` | only the rotation, readable at ten feet |
| Pocket cards | off | two half-letter cards per **landscape** sheet with a dashed cut line, `@page ch-plan-wide` | one card per group |
| Drills appendix | off | portrait, `@page ch-plan-tall`, two columns of drills per page | each drill with a set-up diagram |
| Arrivals | on | coach copy only | the Late arrival note under Groups; off removes it (the range board never has it) |

There is no "Fit to one page": the coach copy flows onto more pages instead of shrinking, and nothing prints below 8.5pt (range board: 11.25pt, with the parts read from ten feet at 19.5pt and up).

**Coach copy** (816 × 1056 at 96dpi; each part is the plan page's own component with print styles, so screen and paper cannot drift; label column 92px, 20px gap):
- **Page 1**: the masthead (eyebrow "Lakeside University Golf · Practice plan" with "Coach copy" on the right, the title at 40px, the deck, the by-line with coaches and version), Focus (17px), Groups with the Late arrival note, and the whole Schedule with its rotation table (no Par row) and tee times. The schedule always finishes on page 1 for a normal plan; a long plan flows onto the next page, and a block never splits.
- **Page 2**: a running header "Tuesday practice · Tuesday, October 27" with "Coach copy" on the right, then Drills (two columns, with Par, Birdie and Eagle), Bring (two columns of hairline rows, name left, count right, no boxes), and Notes followed by ruled writing lines (at least five).
- **Footer** on every page: "Lakeside University Golf · Team Hub › Documents › Practice plans", a small QR code captioned "Live plan / team sign-in", and "Page 1 of 2". The code encodes `/golf/dashboard/practice/plan/<id>` on the app's origin; the route's gate is the only door, so the code shows nothing to anyone outside the team (owner call 17).
- **Own work** prints every player's line on the coach copy. A linked qualifier prints "Counts toward Fall qualifier" in the Course block's description.

Page breaks: a schedule row, a drill and a group column never split across pages (`break-inside: avoid`); a rotation table taller than a page breaks between turns and repeats its drill header row (`<thead>` repeats in print). The "Page x of y" footer uses CSS paged-media counters where the browser supports them in a running footer (Chromium); elsewhere the studio numbers pages itself from its own measured layout, which it already has for the preview, so the footer is right in Safari and Firefox too.

**Range board** (landscape, the sheet taped to the range): only the rotation. The eyebrow "Lakeside University Golf · Range board", the title "Short game rotation" and, on the right, "2:45 to 3:45" with the date under it. Then the table: one column per drill (the drill name at 26px, then "Putting green · Coach Lin"), one row per turn with the time and "Group A" at 56px ("Group" small and muted, the letter large), hairlines between rows. The footer reads "Twenty minute turns. Move one station right on the horn." on the left and "Then the 10th tee at 3:45" on the right, worded from the block's turn length and the next block. A plan with two Stations blocks prints one board per block. No arrivals, notes or own-work lines (owner call V1-4); Own work prints only as "Own work".

**Pocket cards** (two half-letter cards side by side on a landscape sheet, with a dashed cut line between them): one per group. Each card: the eyebrow "Group A · Sofia, Maya, Lena" with the short date on the right, the title, the deck (time and place), that group's stops as rows (time, place in bold, drill with its coach), a "Bring" line, and a footer with the QR code and "Live plan. Sign in with your team account; changes show there first." No colour band. A player in no group gets no card.

**Drills appendix** (portrait, two columns): the running header "Tuesday practice · Tuesday, October 27" with "Drills" on the right, then for each drill used: the name, "Putting green · 20 min", the set-up diagram between two hairlines, the description (set-up and goal), the scoring rows with hairlines between them (the result on the left, the points on the right: "Inside the circle 1 point"), and the levels "Par 6 of 10  Birdie 8  Eagle 10". The footer as on the coach copy.

**Set-up diagrams** are drawn in inline SVG from a preset, never uploaded and never generated by AI, and they draw in ink only: no tinted grounds, one light grey for surfaces, ink lines and marks. A team drill stores `diagram` (one of `auto`, `none`, `rings`, `gate`, `ladder`, `landing`, `targets`; migration 010100); `auto` picks by area: Putting is `rings` (a hole with three distance rings), Short game and Bunker are `landing` (a landing circle short of a flag), Approach is `targets` (three flags at stepped distances), Tee is `targets` drawn as a fairway corridor, Course, Fitness and Mental are `none`. The labels on the diagram are the drill's own numbers when its goal or levels name distances, otherwise none. Library drills use `auto`. The drill form's "Diagram" picker shows the presets as small thumbnails (4.7). The diagram is frozen into the published drill card with the rest of it.

**Colour, and black and white.** Every page is ink on white, so it prints the same on a colour printer and a black-and-white copier. There are no tints, group colours or patterns to adjust, and no `print-color-adjust` rule. The studio has no Colour or Black and white switch: colour would change nothing material (the design page's Ink switch is not built). Text is ink-900 on white (17.22:1), with ink-600 and ink-500 for secondary lines.

**Type on paper, without raw sizes.** `look-feel-pass-css.test.ts` (P `src/clubhouse/__tests__/look-feel-pass-css.test.ts`, "raw font-size and font-weight longhands only fall") fails any new raw `font-size`, so print sizes come from the existing roles. Every role is a multiple of `--ch-type-k` (`tokens.css:249`, one CSS px at the default size; 1 CSS px prints as 0.75pt). Under `@media print`, `.ch-plan-print` sets `--ch-type-k: 1px`, so the reader's Text Size never changes the paper. Where the design page's pixel size has no exact role, the nearest role at or above it is used.
- Coach copy, pocket cards and drills appendix: the largest display role for the title (the design page draws 40px, 30pt; pocket cards 30px), `--ch-type-title-3` for Focus (17px, 12.75pt), `--ch-type-14` for block titles and start times (10.5pt), `--ch-type-13` and `--ch-type-13-strong` for section labels, descriptions, groups, rotation cells, tee times, drills, Bring and Notes (9.75pt), and `--ch-type-12` as the smallest (9pt: lengths, places, the Late arrival note, the running header, the footer, the QR caption, scoring rows and diagram labels). The design page draws the QR caption at 11px and the pocket-card footer at 11.5px; the build sets both at `--ch-type-12` to keep the floor. `--ch-type-11` and `--ch-type-mono` (8.25pt) are never used inside `.ch-plan-print`.
- Range board: `.ch-plan-print--wide` sets `--ch-type-k: 2px` on the title and the rotation table, so roles print at twice their size: times and "Group A" 56px (42pt) from the 28 role, drill names 26px (19.5pt) from `--ch-type-13-strong`, the time range 30px from `--ch-type-15`, and the title from the nearest display role. The eyebrow, the date, places and coaches and the footer stay at 1px on `--ch-type-15` (15px, 11.25pt), the board's smallest. When the rotation does not fit one sheet at those sizes it continues on a second sheet; it never shrinks below them.

**Save as PDF.** "Print" (primary) calls `window.print()` and the page says "Choose Save as PDF in the print dialog to keep a copy." The PDF is the same print CSS; there is no server-side PDF. On iOS (Capacitor) the print button opens the system print sheet, whose share action saves a PDF.

**Print CSS.** `@media print` hides the Clubhouse shell, the toggles and every page whose toggle is off. Named pages: `@page ch-plan-tall { size: letter portrait; margin: 0.5in 0.5in 0.6in; }` and `@page ch-plan-wide { size: letter landscape; margin: 0.4in; }`, with `.ch-plan-print--tall { page: ch-plan-tall; }` and `.ch-plan-print--wide { page: ch-plan-wide; }`. Pocket cards are two cards side by side inside `ch-plan-wide`, each half the printable width, with the dashed cut line between them. Calendar's "Print week" (`Calendar.tsx:673`) is unchanged because these rules are scoped to `.ch-plan-print`.

**Opened from** Review, the plan page and Documents (N-10's card menu "Print").

### 4.15 Share (plan page "Share", published plans, coach)

An ActionSheet on the phone and a `Menu` on desktop:
- **"Send to team chat".** Posts the plan card if there is none (4.13). Otherwise the item reads "Already in team chat" and opens the conversation.
- **"Copy link".** Copies `/golf/dashboard/practice/plan/<id>` on the app's origin, then the toast CH-17018 "Link copied. Only your team can open it." The route's gate is the only door: a signed-out person goes to sign in, and anyone not on the team gets the redirect.
- **"Share image".** A PNG sized 1080 × 1350 in the plan document's type (4.10), ink on white: the eyebrow with the team name on the left and "Practice plan" on the right, the title at 116px, the deck, the Focus at 46px, then the day as rows separated by hairlines, one per block with breaks left out (time, block, place; five rows for the sample plan), and a foot "Full plan in Team Hub › Documents" on the left with the coaches on the right. No monogram, QR code, strip, figures or mix bar:
  - It never shows player names, arrivals or own-work lines.
  - Capture: `html2canvas` (dynamic import, as `player-comparison.tsx:247-254`) of an off-screen render of that layout (built from the plan page's masthead and schedule-row components) in light mode, at device pixel ratio 2.
  - Hand-off: `@capacitor/share` on native, `navigator.share({ files })` on the web where supported, else a download named "thursday-practice.png" (the `BestCard.tsx:92-117` pattern).
  - If it fails: CH-17011.
- **"Print or save as PDF"**: opens the print studio.
- **No public link** (spec owner call 4).

### 4.16 Templates and the six starters

- **Session template**: a whole plan body without a date. Groups are A/B/C placeholders with names and no players, or a pointer to a saved group. It has no coaches, no own-work lines, no pairing players and no qualifier link. The CHECK in 010300 enforces all of this.
- **Block template**: one block of any kind (same limits). Inserted from the Library rail's Templates tab or the "+ Add block" menu's "From a template".
- **Week template** (slice 6): Monday to Sunday, each day with a session template or nothing.
  - "Apply a week" picks a week, lists that week's practice events, and fills each with its day's session template as a Draft.
  - Days with no practice event say "No practice on Wednesday; skip or add one" (CH-17312). "Add one" uses the Calendar's event form with `then=practice`.
  - Practices that already have a plan are listed as "Has a plan; skipped".
  - Confirm CH-17513 "Fill 4 practices with drafts?". Nothing publishes on its own.
- **Saving.** "Save as template" (builder "…" menu) strips people and keeps structure. "Save as block template" is in the block menu.
- **Applying** a template to a plan that has blocks asks CH-17504 "Replace this plan with Short game rule of thirds?" / "The current blocks are replaced. Groups stay." / "Replace".
- **The six starters ("From GolfHelm")** are code constants in `src/clubhouse/screens/practice/starters.ts`, not rows. They are typed against `PlanBodyV2` and tested to pass `validatePlan` and the template CHECK's rules:
  1. **"Short game rule of thirds"** (3 h): putting, chipping and pitching, each as Skill, Random, then Pressure, in 20-minute blocks (nine Team blocks with Putting, Short game and Short game areas). From the John Carroll Golf Academy layout in `RESEARCH_WEB.md`.
  2. **"Three-station rotation"** (75 min): warm-up 15, then one Stations block with Putting green, Short game area and Range, three groups, 20-minute turns and no move time. Adapted from First Tee rotation stations at college length.
  3. **"Qualifier day"** (5 h 15): warm-up 30, a Course block of 18 holes stroke play with "Counts as qualifying" left for the coach to link, then a 15-minute debrief Team block.
  4. **"Tournament prep"** (3 h): warm-up 20; "Play the course on the range" (Team, Range, 50: simulate the next event's holes, one club per shot as the card says); short game to its green sizes (40); putting at its speed (40); Own work 30.
  5. **"Skills test"** (2 h): a combine-style Team block per area with point scoring. Lag putting uses the Keiser-style bands from `RESEARCH_WEB.md`: holed 3, inside 3 ft 2, 3 to 6 ft 1, 6 to 9 ft 0, beyond 9 ft minus 1.
  6. **"Class-day 75"** (75 min, for a 4:30 to 5:45 window): warm-up 10, two 25-minute stations, a 15-minute pressure finisher.

  Starter drills are written as plain block names and goals, not library drill references: the library's production rows are unverified (0.6). "Use" creates the draft; the coach then adds drills.

### 4.17 Calendar

- **Plan row** in the practice event's detail (desktop inspector and phone sheet), coach and player:
  - Coach, no plan: "No plan yet" and the primary "Build plan" (opens the New plan sheet on this event).
  - Coach, with a plan: the state ("Draft", "Published Thu 9:14 AM", "Updated Thu 1:02 PM", "Edits not published") and "Open plan".
  - A published plan also shows its glance (`PlanGlance size="card"`: title, facts line and the first schedule rows).
  - Player: only for a published plan, "Open plan" with their first stop "You start on the putting green at 2:15". Otherwise nothing.
  - A failed read gives CH-17207 "The practice plan didn't load." with "Try again".
- **Glyph.** Practices with a published plan get the `Target` glyph in week and day blocks, agenda rows and phone day rows, exactly where `ch-ev__warn` is drawn (`views.tsx:92-197`). The data is one read in parallel with `loadCalendar` (`data/calendar.ts:129`): the team's plans with `status = 'published'` joined to events in the window (8.14). The read is skipped when the flag is off.
- **Time move** from the builder: CH-17509 (4.4).
- **Deleting a practice that has a plan** (v1 open call 5, kept, default "warn with a count, then delete"). The cascade now also removes the versions, the lines, the opens and the Documents row. The three hard-delete paths, the count action `practicePlanDeleteCount({ eventId, scope })` and the added sentences on CH-6501 and CH-6506 are kept from v1:
  - CH-6501 (series scopes): "3 practice plans on these events are deleted too, and leave Documents." (one: "The practice plan on Thursday practice is deleted too, and leaves Documents.")
  - CH-6506 (Delete permanently): "Every reply and attendance record for it is erased, and its practice plan. This can't be undone."
  - Count failed or still loading: "Any practice plans on these events are deleted too."
  - Flag off: today's copy.
  - A cancelled practice (soft cancel) keeps its plan. The card reads "Practice cancelled". Publishing a plan on a cancelled practice is refused (`practice_plan_event_cancelled`, CH-17117).

### 4.18 States and copy table (catalog page 17)

Kinds: 0 toast, 1 validation, 2 didn't load, 3 empty, 4 loading, 5 confirm, 6 motion, 7 haptic, 8 a11y, 9 network (`docs/clubhouse/catalog/README.md:39-48`). Every code below is new. v1's CH-17 table is retired whole: none of its codes shipped, and numbers are reused here with new meanings only where the meaning carries over.

| Code | Kind | Where | Copy |
|---|---|---|---|
| CH-17001 | toast | autosave failed 3 times | "Couldn't save the plan" / "Your changes are kept in this tab. Try again." with "Try again" |
| CH-17002 | toast | publish failed | "Couldn't publish the plan" / "Nothing was sent. Try again." |
| CH-17003 | toast | republish failed | "Couldn't republish" / "Players still see the version from Thu 9:14 AM." |
| CH-17004 | toast | take down failed | "Couldn't take the plan down" / "Players can still see it. Try again." |
| CH-17005 | toast | template save failed | "Couldn't save the template" |
| CH-17006 | toast | drill save failed | "Couldn't save the drill" / "It wasn't added to the plan." |
| CH-17007 | toast | saved group save failed | "Couldn't save the groups" |
| CH-17008 | toast | delete plan failed | "Couldn't delete the plan" |
| CH-17009 | toast | make-up create failed | "Couldn't create the make-up" / "Nothing was sent." |
| CH-17010 | toast | mark done failed | "Couldn't mark it done" / "Try again." |
| CH-17011 | toast | share image failed | "Couldn't make the image" / "Try Print or save as PDF." |
| CH-17012 | toast | copy link failed | "Couldn't copy the link" |
| CH-17013 | toast | calendar move failed | "The practice didn't move" / "The calendar still says 2:00 PM. Try again from the plan's time." |
| CH-17014 | toast | chat card failed after publish | "Published. The plan card didn't post to team chat." with "Post again" |
| CH-17015 | toast | apply template or week failed | "Couldn't apply the template" |
| CH-17016 | toast (success) | new drill saved | "Saved to your drill bank" |
| CH-17017 | toast (success) | library drill copied | "Copied to your bank" |
| CH-17018 | toast (success) | link copied | "Link copied. Only your team can open it." |
| CH-17019 | toast (success) | published or republished | "Published. 14 players and 2 coaches told." / "Republished. 3 players told." / "Republished. No one was told." Event plans add the action "Filed in Documents", which opens `/golf/dashboard/team-hub?tab=docs&folder=practice-plans` (N-10 entry G); make-ups do not |
| CH-17020 | toast (success) | taken down | "Taken down. 14 players told." |
| CH-17101 | validation (error) | a group twice in one turn | "Group B is at two stations at 2:37 PM." |
| CH-17102 | validation (error) | a coach in two places | "Coach Lin is at two places at 2:59 PM." |
| CH-17103 | validation (error) | more groups than stations | "4 groups but 3 stations. Add a station or take a group out of this block." |
| CH-17104 | validation (error) | a group with no players used in a block | "Group D has no players." |
| CH-17105 | validation (warning) | player in no group while groups are used | "Sam Ortiz isn't in a group." |
| CH-17106 | validation (warning) | past the practice's end | "15 min past the end of practice (5:00 PM)." |
| CH-17107 | validation (warning) | arrival after a start | "Ava Chen arrives at 2:45. Group C starts at 2:15. Move Ava or start Group C on the second turn." |
| CH-17108 | validation (warning) | drill longer than its turn | "Drill runs 25 min; turn is 20." |
| CH-17109 | validation | limits | "A plan can have up to 40 blocks." / "…8 stations in a block." / "…6 groups." / "A plan can be up to 6 hours." |
| CH-17110 | validation | all-day practice | "Give this practice a start and end time to plan it." |
| CH-17111 | validation | template name | "Name the template." / "You already have a session template called Thursday rotation." |
| CH-17112 | validation | drill fields | "Name the drill." / "Minutes are 1 to 180." / "Use a link that starts with https." |
| CH-17113 | validation | saved group name | "Name the group." / "You already have a group called Freshmen." |
| CH-17114 | validation (error) | Course block holes | "Pick the holes for Course." |
| CH-17115 | validation | publish blocked | "Fix 2 problems to publish." |
| CH-17116 | validation (error) | empty plan | "Add a block to publish." |
| CH-17117 | validation | cancelled practice | "This practice was cancelled, so its plan can't be published." |
| CH-17201 | didn't load | plan or builder | "This plan didn't load" / "Your plan is safe. Try again." (missing tables: "Practice isn't set up yet for this team.") |
| CH-17202 | didn't load | roster | "The roster didn't load, so groups can't be edited. Try again." |
| CH-17203 | didn't load | classes | "Class schedules didn't load. Arrival times are unknown." |
| CH-17204 | didn't load | drill bank or library | "Drills didn't load." |
| CH-17205 | didn't load | Home plan line, notification fan-out | (no visible copy; logged) |
| CH-17206 | didn't load | Practice home week or plans | "This week didn't load." with "Try again" |
| CH-17207 | didn't load | Calendar Plan row | "The practice plan didn't load." with "Try again" |
| CH-17208 | didn't load | Seen by | (the line is omitted; logged) |
| CH-17209 | didn't load | templates | "Templates didn't load." |
| CH-17210 | didn't load | saved groups | "Saved groups didn't load." |
| CH-17211 | didn't load | plan card state in chat | the card shows its fallback text and "Open plan" |
| CH-17212 | didn't load | `PlanGlance` preview (Documents, cards) | a quiet tile "Practice plan" with the title |
| CH-17213 | didn't load | focus areas for Own work defaults | lines start empty; inspector notes "Focus areas didn't load." |
| CH-17214 | didn't load | qualifiers list | "Qualifiers didn't load." |
| CH-17301 | empty | coach, no practices this week | "No practices this week" / "Add one on the calendar, then plan it here." with "New practice" |
| CH-17302 | empty | player, nothing published | "Your coach hasn't published a plan for this practice yet." |
| CH-17303 | empty | no templates of your own | "No templates yet. Save a plan as a template from its menu." |
| CH-17304 | empty | drill search, no match | "No drills match." |
| CH-17305 | empty | player in no group | "You're not in a group for this practice." / "Ask your coach where to start." |
| CH-17306 | empty | no one missed | "Everyone was here." |
| CH-17307 | empty | Stats floor (slice 9) | "Planned practice time shows once there are 3 published plans and 3 rounds with strokes gained this season." |
| CH-17308 | empty | drill bank empty | "Your drill bank is empty" / "Make a drill, or copy one from GolfHelm drills." |
| CH-17309 | empty | no saved groups | "No saved groups yet" / "Make groups in a plan and save them, or start one here." |
| CH-17310 | empty | New plan sheet, no practices without a plan | "Every practice this week and next has a plan." with "New practice" |
| CH-17311 | empty | copy a past practice, none | "No earlier plans to copy." |
| CH-17312 | empty | week template day without practice | "No practice on Wednesday; skip or add one." |
| CH-17313 | empty | player Team drills, none | "Drills from published plans show here." |
| CH-17401 | loading | builder skeleton | (no copy; `aria-busy`, label "Loading the plan") |
| CH-17402 | loading | plan page skeleton | (as above, "Loading the plan") |
| CH-17403 | loading | Practice home skeleton | ("Loading practice") |
| CH-17404 | loading | print studio, measuring pages | ("Preparing pages") |
| CH-17501 | confirm | delete plan | "Delete this plan?" / "Players lose it, it leaves Documents, and the team chat card says it was deleted. This can't be undone." / "Delete plan" |
| CH-17502 | confirm | take down | "Take down Thursday's plan?" / "Players lose it, it leaves Documents for players, and the team chat card says Taken down. 14 players will be told once." / "Take down" |
| CH-17503 | confirm | switch to or from rain plan | "Switch Thursday practice to the rain plan?" / "You'll review what changed before players are told." / "Switch" |
| CH-17504 | confirm | replace with template or copy | "Replace this plan with Short game rule of thirds?" / "The current blocks are replaced. Groups stay." / "Replace" |
| CH-17505 | confirm | stale save | "This plan changed on another device" / "Coach Lin saved a newer version at 2:14 PM. Load it to keep editing." / "Load latest", and on desktop "Keep mine" (danger style) |
| CH-17506 | confirm | delete template | "Delete the template Thursday rotation?" / "Plans made from it are not changed." / "Delete template" |
| CH-17507 | confirm | delete block | "Delete Short game rotation?" / "Delete block" |
| CH-17508 | confirm | split evenly over existing groups | "Make new groups?" / "Players are moved out of the groups they're in now." / "Split" |
| CH-17509 | confirm | move the calendar event | "Also move Thursday practice to 2:30 PM on the calendar?" / (series: "Only this practice moves. The rest of the series stays.") / "Move practice" |
| CH-17510 | confirm | archive drill | "Archive Lag ladder?" / "It leaves your bank. Plans that use it keep it." / "Archive" |
| CH-17511 | confirm | delete saved group | "Delete the group Travel five?" / "Plans that used it keep their groups." / "Delete group" |
| CH-17512 | confirm | Run view shift | "Move the rest of practice 5 min later?" / toggle "Tell players" (off) / "Move" |
| CH-17513 | confirm | apply a week | "Fill 4 practices with drafts?" / "Nothing is published. Practices that have a plan are skipped." / "Fill" |
| CH-17601 | motion | block resize and reorder | (spec in 5) |
| CH-17602 | motion | group chip swap (FLIP) | (spec in 5) |
| CH-17603 | motion | Now line swap | (spec in 5) |
| CH-17604 | motion | publish success check | (spec in 5) |
| CH-17605 | motion | step change | (spec in 5) |
| CH-17701 | haptic | 5-minute ticks, phone steppers | `select` |
| CH-17702 | haptic | drop, reorder, swap, save template | `commit` |
| CH-17703 | haptic | publish, republish, take down, mark done | `success` |
| CH-17704 | haptic | publish blocked by problems | `warning` |
| CH-17801 | a11y | Now live region | "Now: Putting green with Coach Patel, until 2:35 PM." |
| CH-17802 | a11y | keyboard move and length announcements | "Short game rotation, now 2:30 to 3:30." |
| CH-17803 | a11y | time ribbon live text | "2 hours 50 of 3 hours planned, 10 minutes open." |
| CH-17804 | a11y | rotation grid as a table | caption "Short game rotation, 3 stations, 3 turns" |
| CH-17901 | network | builder offline | "You're offline. Changes are kept in this tab and save when you're back." |
| CH-17902 | network | player offline | "You're offline. This may be out of date." |

The code numbers stay unused by every other plan. Checked by `grep -rn 'CH-17[0-9]\{3\}'` over `build-plans/` and `build-plans-2/` (only N-00, v1 and v2) and by `git grep 'CH-17'` on M, P, PL, CP and `pr/2363`: no hits. Registering page 17 takes three changes together, or `npm run clubhouse:check` fails with "no page number for practice":
1. `practice: '17'` in `CATALOG_PAGE` (`scripts/clubhouse/check.mjs:289-305` on P, which stops at `auth: '15'`).
2. A new `docs/clubhouse/catalog/practice.md` (the file name is the page key).
3. A row "17 | Practice (coach and player)" in the page table of `docs/clubhouse/catalog/README.md` (`:20-35`), plus a `[practice](practice.md)` link in its Pages line.

Kinds 0 to 5 must be used in code and named by a test (`ENFORCED_KINDS`, `check.mjs:307`). Page 16 is 4.33's tournaments page; this plan does not add it.

### 4.19 Later slices: make-ups, recap, Stats

- **Make-up (slice 7).**
  - **Creating.** After a practice, the coach's plan page shows "Make-ups" with the players marked absent (from `golf_event_attendance`; empty: CH-17306). "Make a make-up" for one player opens a sheet. It has a due date, from today to 60 days on the team clock, and a solo body copied from the plan: that player's path, no groups, with each Stations block turned into stations done in order.
  - **Publishing.** Through the same Publish sheet, it notifies that one player (title "Make-up practice for Thursday", body "Due Fri, Nov 6 · 75 min"). It is never filed in Documents and never posted in chat (owner call 9).
  - **The player's side.** The player sees it on Home (`MakeupAsk`, row order as 0.1 D) and on Practice under Today, with "Mark done". The coach sees "Done Tue 4:10 PM".
  - **Data.** `golf_practice_makeup_create`, `golf_practice_makeup_complete` and `golf_practice_my_makeups` (8.10).
- **Recap (slice 8).** After practice, "Recap" on the coach's plan page opens a prefilled message to team chat that the coach edits and sends: "Thursday: 3 h, 6 blocks. Focus was lag putting and wedges inside 100. Next practice Mon 2:00 PM." It is a prefill through `messagesPrefillHref` and sends nothing on its own.
- **Planned practice time against strokes lost (slice 9, optional, no migration).** As v1 4.14, reading published versions instead of shared plans. The floor is CH-17307.

---

## 5. Motion and haptics

All motion uses the house presets and has a Reduce Motion path (`useChReducedMotion`, `reduced-motion.ts:29`). Under Reduce Motion, every movement below becomes an instant change or a `chFade` of `CH_DUR.quick`.

| Code | What moves | How | Reduce Motion |
|---|---|---|---|
| CH-17601 | block resize: the block and every block below | height and translate follow the pointer 1:1 while dragging. On release, the snapped value is reached with `chSpring('settle')` (`CH_SPRINGS`, `motion.ts:59-63`). Reorder: the lifted card follows the pointer; the others slide with `chSpring('smooth')`; the drop settles with `settle` | jump to place |
| CH-17602 | rotation grid chip swap | FLIP: measure, swap, invert, play with `chSpring('smooth')` | swap in place |
| CH-17603 | Now and Next lines | `CH_ROUTE` (6px rise in, 4px out, `chTween('base')`) | text swaps |
| CH-17604 | publish success | the sheet's button becomes a check drawn with `chSpring('settle')` over `CH_DUR.reveal` (.52s); the sheet closes with its own close motion | static check, then close |
| CH-17605 | step change in the builder | the centre pane cross-fades with `chSwap` (`:151`); the step bar's selected pill slides with `chSpring('smooth')` | instant |
| — | Practice home "Past plans" and Documents-style sections | the house 0fr to 1fr grid reveal over `CH_DUR.base` | instant |
| — | lifted card on phone reorder | scale 1.02, shadow `CH_POP` (`:143`) | no scale, shadow only |

Haptics (`haptic(kind)`, `haptics.ts:33`; kinds from `:21`):
- CH-17701 `select`: each 5-minute step of an edge drag or a stepper, and each cell crossed during a phone chip move (`hapticScrub` `:61` for continuous drags).
- CH-17702 `commit`: a drop, a reorder or a swap lands; a template or group is saved.
- CH-17703 `success`: publish, republish, take down, mark done.
- CH-17704 `warning`: Publish pressed with errors.

Haptics are silent where the platform has none (the web), as the module already handles.

Scrolling: desktop keeps Lenis (`canvasLenis`, `useSmoothWheelEverywhere`). The builder's three panes each scroll with `usePanelSmoothScroll`. A drag that nears a pane's top or bottom 48px auto-scrolls that pane at up to 12px per frame, proportional to depth, and stops on drop. The wheel handler respects `defaultPrevented` (`smooth-scroll.ts:295`), so a pane that scrolls itself is not double-scrolled. Selecting an off-screen item calls `chScrollIntoView` (`:34`).

## 6. Interaction

- **Pointer.** Edge drag and chip drag exist only for a fine pointer. A coarse pointer gets the phone patterns (steppers, sheets, long press reorder), whatever the width.
- **Keyboard (desktop builder).**
  - Tab moves through header, rail, board and inspector, in that order. Arrows move within the board (block to block) and the grid (cell to cell).
  - Block keys: Shift+Up and Shift+Down change length by 5 minutes; Alt+Up and Alt+Down reorder.
  - Space picks up and drops a chip. Escape cancels a drag, closes a sheet or clears the selection.
  - Cmd or Ctrl+Enter opens Publish.
  - The house G letters and Cmd or Ctrl digits still work outside text fields.
- **Touch.** Long press 450ms to lift on the phone; a tap elsewhere or a scroll before 450ms cancels.
- **Autosave and conflicts.** 4.4. One save at a time; edits during a save queue and coalesce.
- **Live refresh.** Paused during a drag and run once on drop or Escape (v1's rule, kept).
- **Leaving the builder** with an unsaved change offline: the stay-or-leave prompt is the browser's own `beforeunload`, and only while there are unsaved edits.

---

## 7. Accessibility

### 7.1 Contrast (WCAG 2.x relative luminance, computed from P `tokens.css`)

**Group colours.** New tokens `--ch-group-{a..f}` (the disc) and `--ch-group-{a..f}-tint` (the chip fill), defined in `tokens.css` beside the chart tokens (light `:118-134`; dark beside the dark palette). The letter in the disc is always white. They are used by the builder only (the Groups step, the board and the rotation grid). Since the 2026-10-25 rebuild the generated plan, its print, the share image and the thumbnails use no group colour (4.10).

| Group | Light disc / tint | White letter on disc | Ink-900 on tint | Disc on surface | Dark disc / tint | White letter on disc | Ink-900 `#ede7d8` on dark tint | Disc on dark surface |
|---|---|---|---|---|---|---|---|---|
| A | `#155a39` / `#eef5f0` | 8.22 | 15.55 | 7.88 | `#2f7a52` / `#16281d` | 5.22 | 12.56 | 3.17 |
| B | `#2d5c77` / `#e6eef3` | 7.22 | 14.67 | 6.92 | `#3a6d8a` / `#17222a` | 5.62 | 13.11 | 2.94 |
| C | `#8a5a0c` / `#faf0dc` | 5.92 | 15.22 | 5.67 | `#8a6420` / `#2e2414` | 5.35 | 12.35 | 3.09 |
| D | `#6a3d72` / `#f3ebf4` | 8.32 | 14.76 | 7.98 | `#7a4f83` / `#261d29` | 6.41 | 13.19 | 2.58 |
| E | `#9a4526` / `#f8ebe5` | 6.46 | 14.77 | 6.19 | `#9a5536` / `#2b1e19` | 5.64 | 13.07 | 2.93 |
| F | `#435466` / `#eaeef2` | 7.78 | 14.77 | 7.46 | `#56677a` / `#1d2329` | 5.81 | 12.85 | 2.85 |

Surfaces used: light `#fcfaf5`, dark `#1b201c`; ink-900 light `#1c1b18` (`tokens.css:32`), dark `#ede7d8` (`:782`).

- An ivory letter (`#ede7d8`) on the dark discs measures 4.23 to 5.2 (A 4.23, C 4.34, B 4.56), so the dark letter is white, never ink-900.
- A dark disc against the dark surface measures 2.58 to 3.17. The letter carries the meaning, so the disc itself is not a required non-text contrast. It still gets a 1px `--ch-ink-400` ring (dark `:786`) so it reads as a shape.
- Groups are never told apart by colour alone: the letter is always there. The plan document and its print carry no group colour or pattern; each rotation cell reads "Group A".

**Block kind tints** (block cards on the builder board; the plan document and its outputs no longer use them):

| Kind | Light tint | Ink-900 / Ink-500 on it | Dark tint | Ink-900 / Ink-500 on it |
|---|---|---|---|---|
| Team | `#ddebe1` | 13.98 / 5.41 | `#1f3a29` | 10.04 / 4.83 |
| Stations | `#e6eef3` | 14.67 / 5.68 | `#1c2a33` | 11.92 / 5.73 |
| Course | `#cbddcc` | 12.10 / 4.69 | `#24412f` | 9.09 / **4.37** |
| Own work | `#efe6d2` | 13.88 / 5.37 | `#2c2618` | 12.18 / 5.86 |
| Break | `#efece4` | 14.59 / 5.65 | `#262a26` | 11.81 / 5.68 |

Ink-500 light `#5f5c55` (`:36`), dark `#a8a193` (`:785`).

- **Dark Course is the one failure**: ink-500 on `#24412f` is 4.37. Secondary text on a dark Course tint uses `--ch-ink-600` (`#c7c0af`, `:784`) instead, which measures 6.19. The guard test pins it.
- Tint edges against the surface are too faint (1.13 to 1.36 light, 1.10 to 1.47 dark), and a light ink-400 ring measures only 2.39 to 2.9 against the tints themselves. So:
  - The plan document draws no tinted segments since the 2026-10-25 rebuild (4.10), so no meaning rests on a tint edge there.
  - Block cards on the Board get the 1px `--ch-ink-400` ring that v1 measured: 3.26 on surface, 3.04 on subtle light; 4.03 and 4.17 dark. Measured against the surface, not the tint.
  - The dark ink-400 ring measures 2.74 to 3.66 against the dark tints; what counts is the ring against the surface beside it.
- **Warnings**: `--ch-warning-600` text measures 5.67 (light) and 7.92 (dark) on the surface.
- **Selected**: `--ch-bg-selected` (light `:151`, dark `:846`) with a 2px `--ch-border-focus` ring (light `:228`, dark `:871`) for the lit stop. Never `--ch-accent` in dark.
- **Print**: black on white, 17.22.

The contrast guard test (`plan-contrast.test.ts`) computes every pair above from `tokens.css` and fails under 4.5 for text and 3 for the block ring.

### 7.2 Tap targets

44 × 44px minimum at default Text Size: block cards (the minimum 56px height covers a 5-minute Break), "+ Add block" rows (the hit area is 44px tall even though the visible line is 24px), grid cells, avatar chips, steppers, toggles, the step bar pills. Desktop-only drag handles are 24px but always have a keyboard path.

### 7.3 Text Size

All type uses the `--ch-type-*` roles, which scale with iPhone Text Size. At the largest sizes:
- The plan page's label column stacks above its content, and the schedule's time column wraps above each row.
- The rotation grid scrolls sideways inside its own container (with its headers sticky); the page itself never scrolls sideways.
- Day tiles reflow to two lines.
- The ribbon and mix bar stack.

### 7.4 Screen readers

- **Block cards**: "Short game rotation, Stations, 2:15 to 3:15 PM, 3 stations, 3 groups, 20 minute turns." The handle is a button "Move Short game rotation".
- **Grid**: a `<table>` with a caption (CH-17804); each cell reads "Group B, Putting green, 2:37 PM".
- **The plan document's schedule** is an ordered list with one item per block. Its rotation table has row and column headers, so a cell reads "Group B, Lag ladder, 3:05 PM".
- **Live regions**: Now and Next (CH-17801) and the ribbon (CH-17803), both polite. Keyboard moves are announced (CH-17802).
- **Seen by** has an accessible name: "Seen by 9 of 11 players, show names".
- **Group discs** carry the group name as text, not only the letter.

---
## 8. Data and database

Nine held migrations, `20261026010000` to `20261026010800`. Each file starts with the house STATUS line, carries `-- ROLLBACK:` and single-line `-- VERIFY:` lines, sets `lock_timeout`, has no BEGIN or COMMIT, revokes from `anon` and `authenticated` before granting, and sets `search_path = ''` on every function. No triggers anywhere; nothing touches round, hole or shot paths.

| File | What it does | Slice |
|---|---|---|
| `20261026010000_golf_practice_plans.sql` | `golf_practice_plans` (draft, coach-only), `golf_practice_plan_versions` (frozen, players read the live one), `golf_practice_plan_lines` (private own-work lines), `golf_practice_plan_opens` (Seen by) | 0 |
| `20261026010100_golf_team_drills.sql` | the drill bank, coach-only, archive instead of delete | 0 |
| `20261026010200_golf_practice_groups.sql` | saved groups, coach-only, members checked active on the team | 0 |
| `20261026010300_golf_practice_templates.sql` | session, block and week templates, no-people CHECK | 0 |
| `20261026010400_golf_documents_practice_plan.sql` | `golf_documents.practice_plan_id`, partial unique index, `file_url` nullable, source CHECK, two policy changes | 0 |
| `20261026010500_golf_practice_plan_save.sql` | `golf_practice_plan_check_body` (v2), `golf_practice_plan_save` | 0 |
| `20261026010600_golf_practice_plan_publish.sql` | public body, recipients, publish, take down, set variant, record open, cards, set chat message | 0 |
| `20261026010700_golf_practice_plans_realtime.sql` | plans and versions into `supabase_realtime` | 0 |
| `20261026010800_golf_practice_makeups.sql` | make-up create, complete, my make-ups | 0 (used in slice 7) |

All nine are written in slice 0 so the schema is reviewed once. The owner applies them together; the flag stays off until then.

### 8.1 The plan body (version 2, validated twice)

The draft body is one JSON document on the plan row. A save is one atomic, version-checked write; realtime is one row; templates are the same shape. TypeScript, in `src/clubhouse/screens/practice/model.ts`:

```ts
export type PlanArea = 'putting' | 'short_game' | 'bunker' | 'approach' | 'tee' | 'course' | 'fitness' | 'mental';
export type DrillKind = 'skill' | 'random' | 'pressure';
export type BlockKind = 'team' | 'stations' | 'course' | 'own' | 'break';
export interface DrillRef { src: 'team' | 'lib'; id: string }          // golf_team_drills.id or golf_drills.id

export interface PlanBodyV2 {
  v: 2;
  focus: string;                        // 0..140
  notes: string;                        // 0..2000
  place: string;                        // 0..80; defaults to the event's location
  arrivalBufferMin: 0 | 5 | 10 | 15 | 20 | 25 | 30; // default 15
  bring: Array<{ item: string; qty: number }>; // extra items, up to 20; item 1..40, qty 1..99
  players: string[];                    // golf_players.id in this practice, up to 60; a make-up has exactly one
  groups: Array<{ id: string; name: string; players: string[]; savedGroupId: string | null }>; // up to 6; letter and colour from position A..F
  variants: { main: PlanLayout; rain: PlanLayout | null };
}
export interface PlanLayout { blocks: PlanBlock[] }   // up to 40; sum of len <= 360

interface BlockBase { id: string; title: string; len: number; coach: string | null; note: string } // title 1..80; len 5..360, step 5; coach golf_coaches.id on staff; note 0..280
export type PlanBlock =
  | (BlockBase & { kind: 'team'; place: string; drill: DrillRef | null })
  | (BlockBase & { kind: 'break'; place: string })
  | (BlockBase & {
      kind: 'stations';
      stations: Array<{ id: string; place: string; coach: string | null; drill: DrillRef | null; note: string }>; // 1..8
      groupIds: string[];               // plan group ids, up to 6
      turnMin: number;                  // 5..60, step 5
      moveMin: number;                  // 0..10
      turns: number;                    // 1..8, default stations.length
      grid: string[][] | null;          // [turn][station] = group id or ''; null = the automatic rotation
    })
  | (BlockBase & {
      kind: 'course';
      holeFrom: number; holeTo: number; // 1..18, from <= to
      format: 'stroke' | 'scramble' | 'best_ball' | 'worst_ball' | 'match';
      pairings: Array<{ teeMin: number; players: string[] }>; // up to 20; teeMin minutes after the block starts
      qualifierId: string | null;       // golf_qualifiers.id on this team (a label and link only)
    })
  | (BlockBase & { kind: 'own'; place: string; lines: Record<string, string> }); // player id -> 0..140
```

- **Clock.** A block's start is the event start plus the sum of the lengths before it. A Stations block's `len` is `turns * turnMin + (turns - 1) * moveMin`; `validatePlan` checks this, SQL checks only ranges.
- **Parsing.** `parsePlanBody(json): PlanBodyV2 | null` is defensive. `v: 1` bodies never exist in production (v1 was never applied), so there is no upgrade path. An unknown `v` returns null and the page shows CH-17201 plus "This plan was saved in a newer format. Refresh the app."
- **Validation.** `validatePlan(body, ctx)` is shared by client and server action. It returns `{ errors, warnings }` with codes from 4.18:
  - Errors: CH-17101, 17102, 17103, 17104, 17114, 17116, and a Stations `len` that doesn't match its turns.
  - Warnings: CH-17105, 17106, 17107, 17108.

  Publish is refused while there are errors, and the server action re-runs `validatePlan` before calling SQL. SQL enforces structure, references and permissions, never scheduling rules.
- **Other model functions** (all pure, all unit tested): `autoGrid`, `pathFor(body, playerId, eventStart)`, `diffVersions(prev, next, ctx)`, `mixMinutes(body, drills)`, `bringList(body, drills)`, `splitEvenly(players, n, arrivals)`, `ribbon(body, eventMinutes)`.

### 8.2 Migration 20261026010000_golf_practice_plans.sql (HELD)

```sql
-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- N-00 v2 Practice, slice 0.
-- WHY: Practice plans as their own tab: the plan with its draft body (coaches only), frozen published versions (what players read), private own-work lines per version, and which version each player opened (Seen by).
-- WHO: Coaches of the team (public.is_golf_team_coach) read all four tables and delete plans. Players of the team (public.is_golf_team_player) read only the live version of an event plan, the live version of their own make-up, and their own lines in a live version. No INSERT or UPDATE grant to authenticated on any of the four: writes go through SECURITY DEFINER functions (010500, 010600, 010800).
-- ORDER: First of 20261026010000..20261026010800. Needs public.is_golf_team_coach and public.is_golf_team_player (functions/public.sql:6964, :7000) and public.golf_messages.
-- RISK: New tables only. No change to golf_events, golf_rounds, golf_holes or golf_shots. No triggers.
-- ROLLBACK: (roll back 010800, 010700, 010600, 010500 and 010400 first, newest first) DROP TABLE IF EXISTS public.golf_practice_plan_opens, public.golf_practice_plan_lines, public.golf_practice_plan_versions, public.golf_practice_plans CASCADE;
-- VERIFY: SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace = 'public'::regnamespace AND relname IN ('golf_practice_plans', 'golf_practice_plan_versions', 'golf_practice_plan_lines', 'golf_practice_plan_opens') AND relrowsecurity HAVING count(*) = 4;
-- VERIFY: SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename IN ('golf_practice_plans', 'golf_practice_plan_versions', 'golf_practice_plan_lines', 'golf_practice_plan_opens') HAVING count(*) = 5;
-- VERIFY: SELECT 1 WHERE NOT has_table_privilege('authenticated', 'public.golf_practice_plans', 'INSERT') AND NOT has_table_privilege('authenticated', 'public.golf_practice_plans', 'UPDATE') AND NOT has_table_privilege('authenticated', 'public.golf_practice_plan_versions', 'INSERT') AND NOT has_table_privilege('authenticated', 'public.golf_practice_plan_versions', 'UPDATE') AND NOT has_table_privilege('authenticated', 'public.golf_practice_plan_lines', 'INSERT') AND NOT has_table_privilege('authenticated', 'public.golf_practice_plan_opens', 'INSERT');
-- VERIFY: SELECT 1 FROM pg_catalog.pg_indexes WHERE schemaname = 'public' AND indexname IN ('golf_practice_plans_event_uniq', 'golf_practice_plan_versions_live_uniq') HAVING count(*) = 2;

SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.golf_practice_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.golf_teams(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'event',
  event_id uuid REFERENCES public.golf_events(id) ON DELETE CASCADE,
  for_player_id uuid REFERENCES public.golf_players(id) ON DELETE CASCADE,
  source_plan_id uuid REFERENCES public.golf_practice_plans(id) ON DELETE SET NULL,
  due_on date,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  step text NOT NULL DEFAULT 'blocks',
  active_variant text NOT NULL DEFAULT 'main',
  body jsonb NOT NULL,
  version integer NOT NULL DEFAULT 1,
  edited_after_publish boolean NOT NULL DEFAULT false,
  published_version integer,
  published_at timestamptz,
  first_published_at timestamptz,
  taken_down_at timestamptz,
  chat_message_id uuid REFERENCES public.golf_messages(id) ON DELETE SET NULL,
  completed_at timestamptz,
  created_by uuid NOT NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT golf_practice_plans_kind_check CHECK (kind IN ('event', 'makeup')),
  CONSTRAINT golf_practice_plans_status_check CHECK (status IN ('draft', 'published')),
  CONSTRAINT golf_practice_plans_step_check CHECK (step IN ('blocks', 'groups', 'drills', 'review')),
  CONSTRAINT golf_practice_plans_variant_check CHECK (active_variant IN ('main', 'rain')),
  CONSTRAINT golf_practice_plans_kind_shape CHECK (
    (kind = 'event' AND event_id IS NOT NULL AND for_player_id IS NULL AND due_on IS NULL AND completed_at IS NULL)
    OR (kind = 'makeup' AND event_id IS NULL AND for_player_id IS NOT NULL AND due_on IS NOT NULL AND chat_message_id IS NULL)
  ),
  CONSTRAINT golf_practice_plans_title_length CHECK (char_length(btrim(title)) BETWEEN 1 AND 80),
  CONSTRAINT golf_practice_plans_published_shape CHECK (status <> 'published' OR (published_version IS NOT NULL AND published_at IS NOT NULL)),
  CONSTRAINT golf_practice_plans_first_published CHECK ((published_version IS NULL) = (first_published_at IS NULL)),
  CONSTRAINT golf_practice_plans_body_object CHECK (jsonb_typeof(body) = 'object'),
  CONSTRAINT golf_practice_plans_body_size CHECK (octet_length(body::text) <= 196608),
  CONSTRAINT golf_practice_plans_version_positive CHECK (version >= 1 AND (published_version IS NULL OR published_version >= 1))
);

CREATE UNIQUE INDEX IF NOT EXISTS golf_practice_plans_event_uniq
  ON public.golf_practice_plans (event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS golf_practice_plans_team_kind_idx
  ON public.golf_practice_plans (team_id, kind, status);
CREATE INDEX IF NOT EXISTS golf_practice_plans_player_idx
  ON public.golf_practice_plans (for_player_id) WHERE for_player_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS golf_practice_plans_source_idx
  ON public.golf_practice_plans (source_plan_id) WHERE source_plan_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS golf_practice_plans_chat_idx
  ON public.golf_practice_plans (chat_message_id) WHERE chat_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.golf_practice_plan_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.golf_practice_plans(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.golf_teams(id) ON DELETE CASCADE,
  kind text NOT NULL,
  event_id uuid REFERENCES public.golf_events(id) ON DELETE CASCADE,
  for_player_id uuid REFERENCES public.golf_players(id) ON DELETE CASCADE,
  version integer NOT NULL,
  title text NOT NULL,
  body jsonb NOT NULL,
  changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  notified boolean NOT NULL DEFAULT true,
  is_live boolean NOT NULL DEFAULT false,
  published_by uuid NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT golf_practice_plan_versions_kind_check CHECK (kind IN ('event', 'makeup')),
  CONSTRAINT golf_practice_plan_versions_version_positive CHECK (version >= 1),
  CONSTRAINT golf_practice_plan_versions_body_object CHECK (jsonb_typeof(body) = 'object'),
  CONSTRAINT golf_practice_plan_versions_body_size CHECK (octet_length(body::text) <= 262144),
  CONSTRAINT golf_practice_plan_versions_changes_array CHECK (jsonb_typeof(changes) = 'array'),
  CONSTRAINT golf_practice_plan_versions_plan_version_uniq UNIQUE (plan_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS golf_practice_plan_versions_live_uniq
  ON public.golf_practice_plan_versions (plan_id) WHERE is_live;
CREATE INDEX IF NOT EXISTS golf_practice_plan_versions_team_live_idx
  ON public.golf_practice_plan_versions (team_id) WHERE is_live;
CREATE INDEX IF NOT EXISTS golf_practice_plan_versions_event_idx
  ON public.golf_practice_plan_versions (event_id) WHERE event_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS golf_practice_plan_versions_player_idx
  ON public.golf_practice_plan_versions (for_player_id) WHERE for_player_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.golf_practice_plan_lines (
  plan_id uuid NOT NULL,
  version integer NOT NULL,
  team_id uuid NOT NULL REFERENCES public.golf_teams(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.golf_players(id) ON DELETE CASCADE,
  block_id text NOT NULL,
  line text NOT NULL,
  CONSTRAINT golf_practice_plan_lines_pkey PRIMARY KEY (plan_id, version, player_id, block_id),
  CONSTRAINT golf_practice_plan_lines_version_fk FOREIGN KEY (plan_id, version)
    REFERENCES public.golf_practice_plan_versions (plan_id, version) ON DELETE CASCADE,
  CONSTRAINT golf_practice_plan_lines_line_length CHECK (char_length(btrim(line)) BETWEEN 1 AND 140),
  CONSTRAINT golf_practice_plan_lines_block_length CHECK (char_length(block_id) BETWEEN 1 AND 64)
);
CREATE INDEX IF NOT EXISTS golf_practice_plan_lines_player_idx
  ON public.golf_practice_plan_lines (player_id);

CREATE TABLE IF NOT EXISTS public.golf_practice_plan_opens (
  plan_id uuid NOT NULL REFERENCES public.golf_practice_plans(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.golf_players(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.golf_teams(id) ON DELETE CASCADE,
  version integer NOT NULL,
  first_opened_at timestamptz NOT NULL DEFAULT now(),
  last_opened_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT golf_practice_plan_opens_pkey PRIMARY KEY (plan_id, player_id),
  CONSTRAINT golf_practice_plan_opens_version_positive CHECK (version >= 1)
);
CREATE INDEX IF NOT EXISTS golf_practice_plan_opens_team_idx
  ON public.golf_practice_plan_opens (team_id);

ALTER TABLE public.golf_practice_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golf_practice_plan_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golf_practice_plan_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.golf_practice_plan_opens ENABLE ROW LEVEL SECURITY;

-- Plans hold the draft: coaches only. Players never read this table (they read versions).
DROP POLICY IF EXISTS golf_practice_plans_select ON public.golf_practice_plans;
CREATE POLICY golf_practice_plans_select ON public.golf_practice_plans
  FOR SELECT TO authenticated
  USING (public.is_golf_team_coach(team_id));

-- Any coach of the team may delete, the creator included.
DROP POLICY IF EXISTS golf_practice_plans_delete ON public.golf_practice_plans;
CREATE POLICY golf_practice_plans_delete ON public.golf_practice_plans
  FOR DELETE TO authenticated
  USING (public.is_golf_team_coach(team_id));

-- Versions: coaches read all; a player reads only the live version, of an event plan on their team or of their own make-up.
DROP POLICY IF EXISTS golf_practice_plan_versions_select ON public.golf_practice_plan_versions;
CREATE POLICY golf_practice_plan_versions_select ON public.golf_practice_plan_versions
  FOR SELECT TO authenticated
  USING (
    public.is_golf_team_coach(team_id)
    OR (is_live AND kind = 'event' AND public.is_golf_team_player(team_id))
    OR (
      is_live AND kind = 'makeup' AND public.is_golf_team_player(team_id)
      AND EXISTS (
        SELECT 1 FROM public.golf_players gp
        WHERE gp.id = golf_practice_plan_versions.for_player_id AND gp.user_id = (SELECT auth.uid())
      )
    )
  );

-- Own-work lines: coaches read all; a player reads only their own, and only in a live version.
DROP POLICY IF EXISTS golf_practice_plan_lines_select ON public.golf_practice_plan_lines;
CREATE POLICY golf_practice_plan_lines_select ON public.golf_practice_plan_lines
  FOR SELECT TO authenticated
  USING (
    public.is_golf_team_coach(team_id)
    OR (
      public.is_golf_team_player(team_id)
      AND EXISTS (
        SELECT 1 FROM public.golf_players gp
        WHERE gp.id = golf_practice_plan_lines.player_id AND gp.user_id = (SELECT auth.uid())
      )
      AND EXISTS (
        SELECT 1 FROM public.golf_practice_plan_versions v
        WHERE v.plan_id = golf_practice_plan_lines.plan_id AND v.version = golf_practice_plan_lines.version AND v.is_live
      )
    )
  );

-- Opens (Seen by): coaches only.
DROP POLICY IF EXISTS golf_practice_plan_opens_select ON public.golf_practice_plan_opens;
CREATE POLICY golf_practice_plan_opens_select ON public.golf_practice_plan_opens
  FOR SELECT TO authenticated
  USING (public.is_golf_team_coach(team_id));

REVOKE ALL ON public.golf_practice_plans FROM anon;
REVOKE ALL ON public.golf_practice_plans FROM authenticated;
REVOKE ALL ON public.golf_practice_plan_versions FROM anon;
REVOKE ALL ON public.golf_practice_plan_versions FROM authenticated;
REVOKE ALL ON public.golf_practice_plan_lines FROM anon;
REVOKE ALL ON public.golf_practice_plan_lines FROM authenticated;
REVOKE ALL ON public.golf_practice_plan_opens FROM anon;
REVOKE ALL ON public.golf_practice_plan_opens FROM authenticated;
GRANT SELECT, DELETE ON public.golf_practice_plans TO authenticated;
GRANT SELECT ON public.golf_practice_plan_versions TO authenticated;
GRANT SELECT ON public.golf_practice_plan_lines TO authenticated;
GRANT SELECT ON public.golf_practice_plan_opens TO authenticated;
GRANT ALL ON public.golf_practice_plans TO service_role;
GRANT ALL ON public.golf_practice_plan_versions TO service_role;
GRANT ALL ON public.golf_practice_plan_lines TO service_role;
GRANT ALL ON public.golf_practice_plan_opens TO service_role;
```

Why lines live in their own table: a version's body is readable by every player on the team, in the API and in Realtime payloads. Column privileges would not reliably hide a column from Realtime, so the private part is kept out of the version row altogether.

Why players never read `golf_practice_plans`: it holds the coach's working draft, including unpublished edits and every own-work line.

### 8.3 Migration 20261026010100_golf_team_drills.sql (HELD)

```sql
-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- N-00 v2 Practice, slice 0.
-- WHY: The team's own drill bank. A drill made inside a plan saves here; a GolfHelm library drill (public.golf_drills) can be copied here to edit. diagram names the set-up diagram preset drawn in the printed drills appendix (no uploads).
-- WHO: Coaches of the team (public.is_golf_team_coach) select, insert and update. No DELETE grant: drills are archived (archived_at) so drafts that use them keep saving. Players have no access; they see drills only as frozen into published versions.
-- ORDER: After 20261026010000 (independent of it; listed second so 010500 can check references).
-- RISK: New table only. No triggers.
-- ROLLBACK: (roll back 010600 and 010500 first) DROP TABLE IF EXISTS public.golf_team_drills CASCADE;
-- VERIFY: SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace = 'public'::regnamespace AND relname = 'golf_team_drills' AND relrowsecurity;
-- VERIFY: SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'golf_team_drills' HAVING count(*) = 3;
-- VERIFY: SELECT 1 WHERE NOT has_table_privilege('authenticated', 'public.golf_team_drills', 'DELETE') AND NOT has_table_privilege('authenticated', 'public.golf_team_drills', 'TRUNCATE') AND NOT has_table_privilege('anon', 'public.golf_team_drills', 'SELECT');

SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.golf_team_drills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.golf_teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  area text NOT NULL,
  kind text NOT NULL DEFAULT 'skill',
  minutes integer NOT NULL,
  players text NOT NULL DEFAULT 'solo',
  equipment jsonb NOT NULL DEFAULT '[]'::jsonb,
  setup text NOT NULL DEFAULT '',
  goal text NOT NULL DEFAULT '',
  scoring jsonb NOT NULL DEFAULT '[]'::jsonb,
  levels jsonb NOT NULL DEFAULT '{}'::jsonb,
  tags text[] NOT NULL DEFAULT '{}'::text[],
  media_url text,
  diagram text NOT NULL DEFAULT 'auto',
  copied_from_drill_id uuid REFERENCES public.golf_drills(id) ON DELETE SET NULL,
  archived_at timestamptz,
  created_by uuid NOT NULL,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT golf_team_drills_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  CONSTRAINT golf_team_drills_area_check CHECK (area IN ('putting', 'short_game', 'bunker', 'approach', 'tee', 'course', 'fitness', 'mental')),
  CONSTRAINT golf_team_drills_kind_check CHECK (kind IN ('skill', 'random', 'pressure')),
  CONSTRAINT golf_team_drills_minutes_range CHECK (minutes BETWEEN 1 AND 180),
  CONSTRAINT golf_team_drills_players_check CHECK (players IN ('solo', 'pairs', 'group')),
  -- Lengths are read only once the type is known (CASE): a CHECK's AND is not evaluated in a promised order.
  CONSTRAINT golf_team_drills_equipment_shape CHECK (
    CASE WHEN jsonb_typeof(equipment) = 'array'
         THEN jsonb_array_length(equipment) <= 20
              AND NOT jsonb_path_exists(equipment, 'lax $[*] ? (@.item.type() != "string" || @.qty.type() != "number")')
         ELSE false END
  ),
  CONSTRAINT golf_team_drills_text_lengths CHECK (char_length(setup) <= 1000 AND char_length(goal) <= 200),
  CONSTRAINT golf_team_drills_scoring_shape CHECK (
    CASE WHEN jsonb_typeof(scoring) = 'array'
         THEN jsonb_array_length(scoring) <= 10
              AND NOT jsonb_path_exists(scoring, 'lax $[*] ? (@.label.type() != "string" || @.points.type() != "number")')
         ELSE false END
  ),
  CONSTRAINT golf_team_drills_levels_shape CHECK (
    CASE WHEN jsonb_typeof(levels) = 'object'
         THEN (levels - 'par' - 'birdie' - 'eagle') = '{}'::jsonb
              AND NOT jsonb_path_exists(levels, 'lax $.* ? (@.type() != "string")')
         ELSE false END
  ),
  CONSTRAINT golf_team_drills_tags_count CHECK (cardinality(tags) <= 10),
  CONSTRAINT golf_team_drills_media_url CHECK (media_url IS NULL OR (media_url ~ '^https://[^\s]+$' AND char_length(media_url) <= 500)),
  CONSTRAINT golf_team_drills_diagram_check CHECK (diagram IN ('auto', 'none', 'rings', 'gate', 'ladder', 'landing', 'targets'))
);

CREATE UNIQUE INDEX IF NOT EXISTS golf_team_drills_team_name_uniq
  ON public.golf_team_drills (team_id, lower(btrim(name))) WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS golf_team_drills_team_area_idx
  ON public.golf_team_drills (team_id, area) WHERE archived_at IS NULL;

ALTER TABLE public.golf_team_drills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS golf_team_drills_select ON public.golf_team_drills;
CREATE POLICY golf_team_drills_select ON public.golf_team_drills
  FOR SELECT TO authenticated USING (public.is_golf_team_coach(team_id));

DROP POLICY IF EXISTS golf_team_drills_insert ON public.golf_team_drills;
CREATE POLICY golf_team_drills_insert ON public.golf_team_drills
  FOR INSERT TO authenticated
  WITH CHECK (public.is_golf_team_coach(team_id) AND created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS golf_team_drills_update ON public.golf_team_drills;
CREATE POLICY golf_team_drills_update ON public.golf_team_drills
  FOR UPDATE TO authenticated
  USING (public.is_golf_team_coach(team_id))
  WITH CHECK (public.is_golf_team_coach(team_id));

REVOKE ALL ON public.golf_team_drills FROM anon;
REVOKE ALL ON public.golf_team_drills FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.golf_team_drills TO authenticated;
GRANT ALL ON public.golf_team_drills TO service_role;
```

The actions set `updated_by` and `updated_at` on every update (no trigger). Moving a drill to another team needs coach rights on both (USING and WITH CHECK), as v1 accepted for templates.

### 8.4 Migration 20261026010200_golf_practice_groups.sql (HELD)

```sql
-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- N-00 v2 Practice, slice 0.
-- WHY: Saved groups a coach reuses across plans ("Travel five", "Freshmen"). A plan copies a saved group's members; it never links to it live.
-- WHO: Coaches of the team (public.is_golf_team_coach), all four commands. Every member must be an active member of the team, checked on insert and update. Players have no access.
-- ORDER: After 20261026010000.
-- RISK: New table and one helper function. No triggers.
-- ROLLBACK: DROP TABLE IF EXISTS public.golf_practice_groups CASCADE; DROP FUNCTION IF EXISTS public.golf_practice_players_on_team(uuid, uuid[]);
-- VERIFY: SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace = 'public'::regnamespace AND relname = 'golf_practice_groups' AND relrowsecurity;
-- VERIFY: SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'golf_practice_groups' HAVING count(*) = 4;
-- VERIFY: SELECT 1 FROM pg_catalog.pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = 'golf_practice_players_on_team' AND prosecdef AND 'search_path=""' = ANY (proconfig);
-- VERIFY: SELECT 1 WHERE NOT has_table_privilege('anon', 'public.golf_practice_groups', 'SELECT') AND NOT has_table_privilege('authenticated', 'public.golf_practice_groups', 'TRUNCATE');

SET lock_timeout = '3s';

-- True when the caller coaches p_team and every id is an active member of it. Used inside the policies below,
-- as the caller, so it reads golf_team_members with the same result whoever calls it.
CREATE OR REPLACE FUNCTION public.golf_practice_players_on_team(p_team uuid, p_players uuid[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT public.is_golf_team_coach(p_team)
     AND NOT EXISTS (
       SELECT 1 FROM pg_catalog.unnest(p_players) AS pid
       WHERE NOT EXISTS (
         SELECT 1 FROM public.golf_team_members m
         WHERE m.team_id = p_team AND m.player_id = pid AND m.status = 'active'::public.team_member_status
       )
     );
$$;

CREATE TABLE IF NOT EXISTS public.golf_practice_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.golf_teams(id) ON DELETE CASCADE,
  name text NOT NULL,
  player_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT golf_practice_groups_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 40),
  CONSTRAINT golf_practice_groups_size CHECK (cardinality(player_ids) <= 30)
);

CREATE UNIQUE INDEX IF NOT EXISTS golf_practice_groups_team_name_uniq
  ON public.golf_practice_groups (team_id, lower(btrim(name)));

ALTER TABLE public.golf_practice_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS golf_practice_groups_select ON public.golf_practice_groups;
CREATE POLICY golf_practice_groups_select ON public.golf_practice_groups
  FOR SELECT TO authenticated USING (public.is_golf_team_coach(team_id));

DROP POLICY IF EXISTS golf_practice_groups_insert ON public.golf_practice_groups;
CREATE POLICY golf_practice_groups_insert ON public.golf_practice_groups
  FOR INSERT TO authenticated
  WITH CHECK (created_by = (SELECT auth.uid()) AND public.golf_practice_players_on_team(team_id, player_ids));

DROP POLICY IF EXISTS golf_practice_groups_update ON public.golf_practice_groups;
CREATE POLICY golf_practice_groups_update ON public.golf_practice_groups
  FOR UPDATE TO authenticated
  USING (public.is_golf_team_coach(team_id))
  WITH CHECK (public.golf_practice_players_on_team(team_id, player_ids));

DROP POLICY IF EXISTS golf_practice_groups_delete ON public.golf_practice_groups;
CREATE POLICY golf_practice_groups_delete ON public.golf_practice_groups
  FOR DELETE TO authenticated USING (public.is_golf_team_coach(team_id));

REVOKE ALL ON FUNCTION public.golf_practice_players_on_team(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golf_practice_players_on_team(uuid, uuid[]) TO authenticated, service_role;
REVOKE ALL ON public.golf_practice_groups FROM anon;
REVOKE ALL ON public.golf_practice_groups FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.golf_practice_groups TO authenticated;
GRANT ALL ON public.golf_practice_groups TO service_role;
```

The helper must be executable by `authenticated` because policies run as the caller. It answers only for a team the caller coaches (false otherwise), so it cannot be used to probe another team's roster. A member who later leaves the team stays in the row; loaders drop anyone not active when a saved group is used, and an edit that keeps them fails the check, so the sheet drops them first.

### 8.5 Migration 20261026010300_golf_practice_templates.sql (HELD)

```sql
-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- N-00 v2 Practice, slice 0.
-- WHY: Session, block and week templates. A template never carries people: no players, no coaches, no own-work lines, no pairing players, no qualifier link.
-- WHO: Coaches of the team only (public.is_golf_team_coach), all four commands. Players have no access. The six starters are code constants, not rows.
-- ORDER: After 20261026010000.
-- RISK: New table only. No triggers.
-- ROLLBACK: DROP TABLE IF EXISTS public.golf_practice_templates CASCADE;
-- VERIFY: SELECT 1 FROM pg_catalog.pg_class WHERE relnamespace = 'public'::regnamespace AND relname = 'golf_practice_templates' AND relrowsecurity;
-- VERIFY: SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'golf_practice_templates' HAVING count(*) = 4;
-- VERIFY: SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.golf_practice_templates'::regclass AND conname = 'golf_practice_templates_no_people' AND convalidated;
-- VERIFY: SELECT 1 WHERE NOT has_table_privilege('authenticated', 'public.golf_practice_templates', 'TRUNCATE') AND NOT has_table_privilege('authenticated', 'public.golf_practice_templates', 'TRIGGER') AND NOT has_table_privilege('anon', 'public.golf_practice_templates', 'SELECT');

SET lock_timeout = '3s';

CREATE TABLE IF NOT EXISTS public.golf_practice_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.golf_teams(id) ON DELETE CASCADE,
  kind text NOT NULL,
  name text NOT NULL,
  body jsonb NOT NULL,
  minutes integer,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT golf_practice_templates_kind_check CHECK (kind IN ('session', 'block', 'week')),
  CONSTRAINT golf_practice_templates_name_length CHECK (char_length(btrim(name)) BETWEEN 1 AND 60),
  CONSTRAINT golf_practice_templates_minutes CHECK ((kind = 'week') = (minutes IS NULL) AND (minutes IS NULL OR minutes BETWEEN 5 AND 360)),
  CONSTRAINT golf_practice_templates_body_object CHECK (jsonb_typeof(body) = 'object' AND body ->> 'v' = '2'),
  CONSTRAINT golf_practice_templates_body_size CHECK (octet_length(body::text) <= 131072),
  CONSTRAINT golf_practice_templates_no_people CHECK (
    NOT jsonb_path_exists(body, 'lax $.players[*]')
    AND NOT jsonb_path_exists(body, 'lax $.groups[*].players[*]')
    AND NOT jsonb_path_exists(body, 'lax $.**.coach ? (@.type() == "string")')
    AND NOT jsonb_path_exists(body, 'lax $.**.lines.*')
    AND NOT jsonb_path_exists(body, 'lax $.**.pairings[*].players[*]')
    AND NOT jsonb_path_exists(body, 'lax $.**.qualifierId ? (@.type() == "string")')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS golf_practice_templates_team_kind_name_uniq
  ON public.golf_practice_templates (team_id, kind, lower(btrim(name)));

ALTER TABLE public.golf_practice_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS golf_practice_templates_select ON public.golf_practice_templates;
CREATE POLICY golf_practice_templates_select ON public.golf_practice_templates
  FOR SELECT TO authenticated USING (public.is_golf_team_coach(team_id));

DROP POLICY IF EXISTS golf_practice_templates_insert ON public.golf_practice_templates;
CREATE POLICY golf_practice_templates_insert ON public.golf_practice_templates
  FOR INSERT TO authenticated
  WITH CHECK (public.is_golf_team_coach(team_id) AND created_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS golf_practice_templates_update ON public.golf_practice_templates;
CREATE POLICY golf_practice_templates_update ON public.golf_practice_templates
  FOR UPDATE TO authenticated
  USING (public.is_golf_team_coach(team_id))
  WITH CHECK (public.is_golf_team_coach(team_id));

DROP POLICY IF EXISTS golf_practice_templates_delete ON public.golf_practice_templates;
CREATE POLICY golf_practice_templates_delete ON public.golf_practice_templates
  FOR DELETE TO authenticated USING (public.is_golf_team_coach(team_id));

REVOKE ALL ON public.golf_practice_templates FROM anon;
REVOKE ALL ON public.golf_practice_templates FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.golf_practice_templates TO authenticated;
GRANT ALL ON public.golf_practice_templates TO service_role;
```

Body shapes: a session template is a `PlanBodyV2` with empty players and groups without players; a block template is `{ v: 2, block: PlanBlock }`; a week template is `{ v: 2, days: { mon: templateId | null, …, sun } }`. They are written directly through RLS (plain CRUD) and parsed defensively on read. The `.**` accessor is Postgres's lax-mode wildcard, so the CHECK finds people at any depth.

### 8.6 Migration 20261026010400_golf_documents_practice_plan.sql (HELD)

```sql
-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- N-00 v2 Practice, slice 0. Agreed with N-10 (Documents): N-00 owns this column, its index, the file_url change and the CHECK.
-- WHY: Every published practice plan lives in Team Hub > Documents > Practice plans as a row with no file: practice_plan_id set, file_url NULL. Exactly one of the two is set on every row.
-- WHO: Unchanged select and delete policies. Insert: coaches may insert file rows only (practice_plan_id must be NULL); plan rows are written by public.golf_practice_plan_publish (010600, definer). Update: a coach may update a plan row only while it points at a plan of the same team.
-- ORDER: After 20261026010000 (references golf_practice_plans).
-- RISK: Medium-low. ALTER on an existing table (brief ACCESS EXCLUSIVE, lock_timeout 3s). Existing rows all have file_url NOT NULL and practice_plan_id NULL, so the CHECK validates. Readers that assume a string file_url are listed in the plan (0.4) and filter `file_url IS NOT NULL` before this is applied.
-- ROLLBACK: DROP POLICY IF EXISTS golf_documents_insert_coach ON public.golf_documents; CREATE POLICY golf_documents_insert_coach ON public.golf_documents FOR INSERT WITH CHECK (public.is_golf_team_coach(team_id)); DROP POLICY IF EXISTS golf_documents_update_coach ON public.golf_documents; CREATE POLICY golf_documents_update_coach ON public.golf_documents FOR UPDATE USING (public.is_golf_team_coach(team_id)) WITH CHECK (public.is_golf_team_coach(team_id)); ALTER TABLE public.golf_documents DROP CONSTRAINT IF EXISTS golf_documents_source_check; DELETE FROM public.golf_documents WHERE practice_plan_id IS NOT NULL; ALTER TABLE public.golf_documents ALTER COLUMN file_url SET NOT NULL; DROP INDEX IF EXISTS public.golf_documents_practice_plan_uniq; ALTER TABLE public.golf_documents DROP COLUMN IF EXISTS practice_plan_id;
-- VERIFY: SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.golf_documents'::regclass AND attname = 'file_url' AND NOT attnotnull;
-- VERIFY: SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid = 'public.golf_documents'::regclass AND attname = 'practice_plan_id' AND NOT attisdropped;
-- VERIFY: SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid = 'public.golf_documents'::regclass AND conname = 'golf_documents_source_check' AND convalidated;
-- VERIFY: SELECT 1 FROM pg_catalog.pg_indexes WHERE schemaname = 'public' AND tablename = 'golf_documents' AND indexname = 'golf_documents_practice_plan_uniq';
-- VERIFY: SELECT 1 FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'golf_documents' AND policyname IN ('golf_documents_insert_coach', 'golf_documents_update_coach') AND with_check LIKE '%practice_plan_id%' HAVING count(*) = 2;

SET lock_timeout = '3s';

ALTER TABLE public.golf_documents
  ADD COLUMN IF NOT EXISTS practice_plan_id uuid REFERENCES public.golf_practice_plans(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS golf_documents_practice_plan_uniq
  ON public.golf_documents (practice_plan_id) WHERE practice_plan_id IS NOT NULL;

ALTER TABLE public.golf_documents ALTER COLUMN file_url DROP NOT NULL;

ALTER TABLE public.golf_documents DROP CONSTRAINT IF EXISTS golf_documents_source_check;
ALTER TABLE public.golf_documents
  ADD CONSTRAINT golf_documents_source_check CHECK ((file_url IS NOT NULL) <> (practice_plan_id IS NOT NULL)) NOT VALID;
ALTER TABLE public.golf_documents VALIDATE CONSTRAINT golf_documents_source_check;

-- Coaches insert file rows only. A plan row is written by golf_practice_plan_publish (definer).
DROP POLICY IF EXISTS golf_documents_insert_coach ON public.golf_documents;
CREATE POLICY golf_documents_insert_coach ON public.golf_documents
  FOR INSERT
  WITH CHECK (public.is_golf_team_coach(team_id) AND practice_plan_id IS NULL);

-- A coach may update any row of the team; a plan row must keep pointing at a plan of the same team. The EXISTS runs as
-- the coach, whose RLS on golf_practice_plans shows only their own teams' plans.
DROP POLICY IF EXISTS golf_documents_update_coach ON public.golf_documents;
CREATE POLICY golf_documents_update_coach ON public.golf_documents
  FOR UPDATE
  USING (public.is_golf_team_coach(team_id))
  WITH CHECK (
    public.is_golf_team_coach(team_id)
    AND (
      practice_plan_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.golf_practice_plans p
        WHERE p.id = golf_documents.practice_plan_id AND p.team_id = golf_documents.team_id
      )
    )
  );
```

- The two policies are recreated exactly as today (`policies/golf.sql:633`, `:637`: no `TO` role, which means PUBLIC, as the originals) plus the new conditions.
- Players keep reading a plan row only when `is_public` is true (`golf_documents_select_team`, `:635`), which publish and take down set. The row is only a pointer: opening it goes to the plan page, where the version RLS decides again.
- A coach could flip a plan row's `is_public` by a direct update. That only changes whether the row is listed; a player still cannot read a version that isn't live. N-10 hides that toggle for plan rows (0.4 item 8).

### 8.7 Migration 20261026010500_golf_practice_plan_save.sql (HELD)

```sql
-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- N-00 v2 Practice, slice 0.
-- WHY: One atomic, version-checked save of a plan's draft (title, step, body), with team players, staff coaches, drills, groups and qualifiers checked on the server.
-- WHO: golf_practice_plan_save is callable by authenticated and checks public.is_golf_team_coach on the plan's team (staff joined to golf_coaches.user_id), never "has a golf_coaches row". golf_practice_plan_check_body is service_role only (called inside definer functions).
-- ORDER: After 20261026010000, 010100, 010200 and 010300.
-- RISK: Low. Functions only.
-- ROLLBACK: DROP FUNCTION IF EXISTS public.golf_practice_plan_save(uuid, uuid, integer, text, text, jsonb); DROP FUNCTION IF EXISTS public.golf_practice_plan_check_body(uuid, jsonb, boolean);
-- VERIFY: SELECT 1 FROM pg_catalog.pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('golf_practice_plan_save', 'golf_practice_plan_check_body') AND prosecdef AND 'search_path=""' = ANY (proconfig) HAVING count(*) = 2;
-- VERIFY: SELECT 1 WHERE NOT has_function_privilege('authenticated', 'public.golf_practice_plan_check_body(uuid, jsonb, boolean)', 'EXECUTE') AND NOT has_function_privilege('anon', 'public.golf_practice_plan_save(uuid, uuid, integer, text, text, jsonb)', 'EXECUTE') AND has_function_privilege('authenticated', 'public.golf_practice_plan_save(uuid, uuid, integer, text, text, jsonb)', 'EXECUTE');

SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.golf_practice_plan_check_body(p_team uuid, p_body jsonb, p_solo boolean)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_players jsonb;
  v_groups jsonb;
  v_layout jsonb;
  v_name text;
BEGIN
  -- A value's type is checked in its own statement before anything that raises on the wrong type reads it
  -- (jsonb_array_length, casts, jsonb_each): SQL does not promise left-to-right OR.
  IF p_body IS NULL OR pg_catalog.jsonb_typeof(p_body) <> 'object' OR (p_body ->> 'v') IS DISTINCT FROM '2' THEN
    RAISE EXCEPTION 'practice_plan_body_version';
  END IF;
  IF pg_catalog.octet_length(p_body::text) > 196608 THEN
    RAISE EXCEPTION 'practice_plan_body_size';
  END IF;

  -- Plan fields.
  IF pg_catalog.jsonb_typeof(p_body -> 'focus') IS DISTINCT FROM 'string'
     OR pg_catalog.jsonb_typeof(p_body -> 'notes') IS DISTINCT FROM 'string'
     OR pg_catalog.jsonb_typeof(p_body -> 'place') IS DISTINCT FROM 'string'
     OR pg_catalog.jsonb_typeof(p_body -> 'bring') IS DISTINCT FROM 'array'
     OR COALESCE(p_body ->> 'arrivalBufferMin', '') !~ '^(0|5|10|15|20|25|30)$' THEN
    RAISE EXCEPTION 'practice_plan_body_fields';
  END IF;
  IF pg_catalog.char_length(p_body ->> 'focus') > 140
     OR pg_catalog.char_length(p_body ->> 'notes') > 2000
     OR pg_catalog.char_length(p_body ->> 'place') > 80
     OR pg_catalog.jsonb_array_length(p_body -> 'bring') > 20
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_array_elements(p_body -> 'bring') i
       WHERE pg_catalog.char_length(COALESCE(i ->> 'item', '')) NOT BETWEEN 1 AND 40
          OR COALESCE(i ->> 'qty', '') !~ '^[1-9][0-9]?$'
     ) THEN
    RAISE EXCEPTION 'practice_plan_body_fields';
  END IF;

  -- Players and groups.
  v_players := p_body -> 'players';
  v_groups := p_body -> 'groups';
  IF pg_catalog.jsonb_typeof(v_players) IS DISTINCT FROM 'array' OR pg_catalog.jsonb_typeof(v_groups) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'practice_plan_groups';
  END IF;
  IF pg_catalog.jsonb_array_length(v_players) > 60 OR pg_catalog.jsonb_array_length(v_groups) > 6
     OR (p_solo AND (pg_catalog.jsonb_array_length(v_players) <> 1 OR pg_catalog.jsonb_array_length(v_groups) > 0)) THEN
    RAISE EXCEPTION 'practice_plan_groups';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_groups) g
    WHERE pg_catalog.jsonb_typeof(g) <> 'object'
       OR pg_catalog.jsonb_typeof(g -> 'id') IS DISTINCT FROM 'string'
       OR pg_catalog.char_length(COALESCE(g ->> 'name', '')) NOT BETWEEN 1 AND 40
       OR pg_catalog.jsonb_typeof(g -> 'players') IS DISTINCT FROM 'array'
  ) OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(v_groups) g GROUP BY g ->> 'id' HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'practice_plan_groups';
  END IF;
  -- Each player listed once; group members are plan players; a player is in at most one group.
  IF EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(v_players) pid GROUP BY pid HAVING count(*) > 1)
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_path_query(v_groups, 'lax $[*].players[*]') pid
       WHERE NOT (v_players @> pg_catalog.jsonb_build_array(pid))
     )
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_path_query(v_groups, 'lax $[*].players[*]') pid GROUP BY pid HAVING count(*) > 1
     ) THEN
    RAISE EXCEPTION 'practice_plan_group_player';
  END IF;
  -- Every plan player is an active member of this team (compared as text, so a malformed id is a refusal, not a cast error).
  IF EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements_text(v_players) pid
    WHERE NOT EXISTS (
      SELECT 1 FROM public.golf_team_members m
      WHERE m.team_id = p_team AND m.player_id::text = pid AND m.status = 'active'::public.team_member_status
    )
  ) THEN
    RAISE EXCEPTION 'practice_plan_player_not_on_team';
  END IF;

  -- Layouts.
  IF pg_catalog.jsonb_typeof(p_body -> 'variants') IS DISTINCT FROM 'object'
     OR pg_catalog.jsonb_typeof(p_body -> 'variants' -> 'main') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'practice_plan_layout';
  END IF;

  FOREACH v_name IN ARRAY ARRAY['main', 'rain'] LOOP
    v_layout := p_body -> 'variants' -> v_name;
    CONTINUE WHEN v_layout IS NULL OR pg_catalog.jsonb_typeof(v_layout) = 'null';
    IF pg_catalog.jsonb_typeof(v_layout) <> 'object' OR pg_catalog.jsonb_typeof(v_layout -> 'blocks') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'practice_plan_layout';
    END IF;
    IF pg_catalog.jsonb_array_length(v_layout -> 'blocks') > 40 THEN
      RAISE EXCEPTION 'practice_plan_layout';
    END IF;

    -- Fields every block has. len is matched as text first, so the casts below never see a non-integer.
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(v_layout -> 'blocks') b
      WHERE pg_catalog.jsonb_typeof(b) <> 'object'
         OR pg_catalog.jsonb_typeof(b -> 'id') IS DISTINCT FROM 'string'
         OR pg_catalog.char_length(b ->> 'id') > 64
         OR COALESCE(b ->> 'kind', '') NOT IN ('team', 'stations', 'course', 'own', 'break')
         OR pg_catalog.char_length(COALESCE(b ->> 'title', '')) NOT BETWEEN 1 AND 80
         OR COALESCE(b ->> 'len', '') !~ '^[1-9][0-9]{0,2}$'
         OR pg_catalog.char_length(COALESCE(b ->> 'note', '')) > 280
         OR COALESCE(pg_catalog.jsonb_typeof(b -> 'coach'), 'null') NOT IN ('string', 'null')
    ) OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(v_layout -> 'blocks') b GROUP BY b ->> 'id' HAVING count(*) > 1
    ) THEN
      RAISE EXCEPTION 'practice_plan_block';
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(v_layout -> 'blocks') b
      WHERE (b ->> 'len')::int % 5 <> 0 OR (b ->> 'len')::int NOT BETWEEN 5 AND 360
    ) OR (SELECT COALESCE(sum((b ->> 'len')::int), 0) FROM pg_catalog.jsonb_array_elements(v_layout -> 'blocks') b) > 360 THEN
      RAISE EXCEPTION 'practice_plan_block';
    END IF;

    -- Team, Break and Own work places.
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(v_layout -> 'blocks') b
      WHERE b ->> 'kind' IN ('team', 'break', 'own')
        AND (pg_catalog.jsonb_typeof(b -> 'place') IS DISTINCT FROM 'string' OR pg_catalog.char_length(b ->> 'place') > 40)
    ) THEN
      RAISE EXCEPTION 'practice_plan_block';
    END IF;

    -- Stations: shapes first, then lengths, then each station.
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(v_layout -> 'blocks') b
      WHERE b ->> 'kind' = 'stations' AND (
           pg_catalog.jsonb_typeof(b -> 'stations') IS DISTINCT FROM 'array'
        OR pg_catalog.jsonb_typeof(b -> 'groupIds') IS DISTINCT FROM 'array'
        OR COALESCE(b ->> 'turnMin', '') !~ '^(5|10|15|20|25|30|35|40|45|50|55|60)$'
        OR COALESCE(b ->> 'moveMin', '') !~ '^([0-9]|10)$'
        OR COALESCE(b ->> 'turns', '') !~ '^[1-8]$'
        OR COALESCE(pg_catalog.jsonb_typeof(b -> 'grid'), 'null') NOT IN ('array', 'null')
      )
    ) THEN
      RAISE EXCEPTION 'practice_plan_station';
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(v_layout -> 'blocks') b
      WHERE b ->> 'kind' = 'stations'
        AND (pg_catalog.jsonb_array_length(b -> 'stations') NOT BETWEEN 1 AND 8 OR pg_catalog.jsonb_array_length(b -> 'groupIds') > 6)
    ) OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_path_query(v_layout, 'lax $.blocks[*] ? (@.kind == "stations").stations[*]') s
      WHERE pg_catalog.jsonb_typeof(s) <> 'object'
         OR pg_catalog.jsonb_typeof(s -> 'id') IS DISTINCT FROM 'string'
         OR pg_catalog.char_length(COALESCE(s ->> 'place', '')) NOT BETWEEN 1 AND 40
         OR pg_catalog.char_length(COALESCE(s ->> 'note', '')) > 280
         OR COALESCE(pg_catalog.jsonb_typeof(s -> 'coach'), 'null') NOT IN ('string', 'null')
    ) THEN
      RAISE EXCEPTION 'practice_plan_station';
    END IF;
    -- Groups named in Stations blocks and in grid cells are this plan's groups ('' is an open cell); a solo body has none.
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_path_query(v_layout, 'lax $.blocks[*].groupIds[*]') gid
      WHERE p_solo OR NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(v_groups) g WHERE g -> 'id' = gid)
    ) OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_path_query(v_layout, 'lax $.blocks[*].grid[*][*]') cell
      WHERE cell <> '""'::jsonb AND NOT EXISTS (SELECT 1 FROM pg_catalog.jsonb_array_elements(v_groups) g WHERE g -> 'id' = cell)
    ) THEN
      RAISE EXCEPTION 'practice_plan_block_group';
    END IF;

    -- Course.
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(v_layout -> 'blocks') b
      WHERE b ->> 'kind' = 'course' AND (
           COALESCE(b ->> 'holeFrom', '') !~ '^([1-9]|1[0-8])$'
        OR COALESCE(b ->> 'holeTo', '') !~ '^([1-9]|1[0-8])$'
        OR COALESCE(b ->> 'format', '') NOT IN ('stroke', 'scramble', 'best_ball', 'worst_ball', 'match')
        OR pg_catalog.jsonb_typeof(b -> 'pairings') IS DISTINCT FROM 'array'
        OR COALESCE(pg_catalog.jsonb_typeof(b -> 'qualifierId'), 'null') NOT IN ('string', 'null')
      )
    ) THEN
      RAISE EXCEPTION 'practice_plan_course';
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(v_layout -> 'blocks') b
      WHERE b ->> 'kind' = 'course'
        AND ((b ->> 'holeTo')::int < (b ->> 'holeFrom')::int OR pg_catalog.jsonb_array_length(b -> 'pairings') > 20)
    ) OR EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_path_query(v_layout, 'lax $.blocks[*] ? (@.kind == "course").pairings[*]') pr
      WHERE pg_catalog.jsonb_typeof(pr) <> 'object'
         OR COALESCE(pr ->> 'teeMin', '') !~ '^[0-9]{1,3}$'
         OR pg_catalog.jsonb_typeof(pr -> 'players') IS DISTINCT FROM 'array'
    ) THEN
      RAISE EXCEPTION 'practice_plan_course';
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_path_query(v_layout, 'lax $.blocks[*].pairings[*].players[*]') pid
      WHERE NOT (v_players @> pg_catalog.jsonb_build_array(pid))
    ) THEN
      RAISE EXCEPTION 'practice_plan_group_player';
    END IF;
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_path_query(v_layout, 'lax $.blocks[*].qualifierId ? (@.type() == "string")') q
      WHERE NOT EXISTS (SELECT 1 FROM public.golf_qualifiers gq WHERE gq.id::text = (q #>> '{}') AND gq.team_id = p_team)
    ) THEN
      RAISE EXCEPTION 'practice_plan_qualifier';
    END IF;

    -- Own work: lines is an object of plan player id -> string of up to 140 characters.
    IF EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_array_elements(v_layout -> 'blocks') b
      WHERE b ->> 'kind' = 'own' AND pg_catalog.jsonb_typeof(b -> 'lines') IS DISTINCT FROM 'object'
    ) THEN
      RAISE EXCEPTION 'practice_plan_own';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM pg_catalog.jsonb_path_query(v_layout, 'lax $.blocks[*] ? (@.kind == "own")') b,
           pg_catalog.jsonb_each(b -> 'lines') l
      WHERE pg_catalog.jsonb_typeof(l.value) <> 'string'
         OR pg_catalog.char_length(l.value #>> '{}') > 140
         OR NOT (v_players @> pg_catalog.jsonb_build_array(l.key))
    ) THEN
      RAISE EXCEPTION 'practice_plan_own';
    END IF;

    -- Coaches (on blocks and on stations) are on this team's staff.
    IF EXISTS (
      SELECT 1 FROM (
        SELECT c FROM pg_catalog.jsonb_path_query(v_layout, 'lax $.blocks[*].coach ? (@.type() == "string")') c
        UNION ALL
        SELECT c FROM pg_catalog.jsonb_path_query(v_layout, 'lax $.blocks[*].stations[*].coach ? (@.type() == "string")') c
      ) cs
      WHERE NOT EXISTS (
        SELECT 1 FROM public.golf_team_coach_staff s
        WHERE s.team_id = p_team AND s.coach_id::text = (cs.c #>> '{}')
      )
    ) THEN
      RAISE EXCEPTION 'practice_plan_coach_not_on_staff';
    END IF;

    -- Drills: a team drill of this team (archived ones too) or a GolfHelm library drill.
    IF EXISTS (
      SELECT 1 FROM (
        SELECT d FROM pg_catalog.jsonb_path_query(v_layout, 'lax $.blocks[*].drill ? (@.type() != "null")') d
        UNION ALL
        SELECT d FROM pg_catalog.jsonb_path_query(v_layout, 'lax $.blocks[*].stations[*].drill ? (@.type() != "null")') d
      ) refs
      WHERE pg_catalog.jsonb_typeof(refs.d) <> 'object'
         OR NOT (CASE refs.d ->> 'src'
                   WHEN 'team' THEN EXISTS (SELECT 1 FROM public.golf_team_drills t WHERE t.id::text = (refs.d ->> 'id') AND t.team_id = p_team)
                   WHEN 'lib' THEN EXISTS (SELECT 1 FROM public.golf_drills g WHERE g.id::text = (refs.d ->> 'id'))
                   ELSE false END)
    ) THEN
      RAISE EXCEPTION 'practice_plan_drill';
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.golf_practice_plan_save(
  p_event_id uuid,
  p_plan_id uuid,
  p_expected_version integer,
  p_title text,
  p_step text,
  p_body jsonb
)
RETURNS TABLE (plan_id uuid, plan_version integer, plan_updated_at timestamptz)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_team uuid;
  v_type text;
  v_all_day boolean;
  v_event_title text;
  v_title text;
  v_plan public.golf_practice_plans%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'practice_plan_forbidden' USING ERRCODE = '42501';
  END IF;
  IF (p_event_id IS NULL) = (p_plan_id IS NULL) THEN
    RAISE EXCEPTION 'practice_plan_target';
  END IF;
  IF p_step IS NOT NULL AND p_step NOT IN ('blocks', 'groups', 'drills', 'review') THEN
    RAISE EXCEPTION 'practice_plan_step';
  END IF;
  v_title := NULLIF(pg_catalog.btrim(COALESCE(p_title, '')), '');
  IF v_title IS NOT NULL AND pg_catalog.char_length(v_title) > 80 THEN
    RAISE EXCEPTION 'practice_plan_title';
  END IF;

  IF p_plan_id IS NOT NULL THEN
    -- Update an existing plan (event plan or make-up) by id.
    SELECT * INTO v_plan FROM public.golf_practice_plans p WHERE p.id = p_plan_id FOR UPDATE;
    IF NOT FOUND OR NOT public.is_golf_team_coach(v_plan.team_id) THEN
      RAISE EXCEPTION 'practice_plan_forbidden' USING ERRCODE = '42501';
    END IF;
    IF p_expected_version IS NULL OR p_expected_version IS DISTINCT FROM v_plan.version THEN
      RAISE EXCEPTION 'practice_plan_stale';
    END IF;
    PERFORM public.golf_practice_plan_check_body(v_plan.team_id, p_body, v_plan.kind = 'makeup');
    IF v_plan.kind = 'makeup' AND (p_body -> 'players') IS DISTINCT FROM pg_catalog.jsonb_build_array(v_plan.for_player_id::text) THEN
      RAISE EXCEPTION 'practice_plan_groups';
    END IF;
    IF v_plan.active_variant = 'rain' AND pg_catalog.jsonb_typeof(p_body -> 'variants' -> 'rain') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'practice_plan_rain_active';
    END IF;
    UPDATE public.golf_practice_plans p
       SET body = p_body,
           title = COALESCE(v_title, p.title),
           step = COALESCE(p_step, p.step),
           edited_after_publish = p.edited_after_publish
             OR (p.status = 'published' AND (p.body IS DISTINCT FROM p_body OR p.title IS DISTINCT FROM COALESCE(v_title, p.title))),
           version = p.version + 1,
           updated_by = v_uid,
           updated_at = pg_catalog.now()
     WHERE p.id = v_plan.id
     RETURNING * INTO v_plan;
    RETURN QUERY SELECT v_plan.id, v_plan.version, v_plan.updated_at;
    RETURN;
  END IF;

  -- By event: create the plan on first save, or update it.
  SELECT e.team_id, e.event_type, COALESCE(e.all_day, false), e.title
    INTO v_team, v_type, v_all_day, v_event_title
    FROM public.golf_events e WHERE e.id = p_event_id;
  IF v_team IS NULL OR NOT public.is_golf_team_coach(v_team) THEN
    RAISE EXCEPTION 'practice_plan_forbidden' USING ERRCODE = '42501';
  END IF;
  IF v_type IS DISTINCT FROM 'practice' THEN
    RAISE EXCEPTION 'practice_plan_not_practice';
  END IF;
  IF v_all_day THEN
    RAISE EXCEPTION 'practice_plan_all_day';
  END IF;
  PERFORM public.golf_practice_plan_check_body(v_team, p_body, false);

  SELECT * INTO v_plan FROM public.golf_practice_plans p WHERE p.event_id = p_event_id FOR UPDATE;
  IF NOT FOUND THEN
    -- A first save says "no plan yet" with a NULL version; any other version means the caller is out of date.
    IF p_expected_version IS NOT NULL THEN
      RAISE EXCEPTION 'practice_plan_stale';
    END IF;
    INSERT INTO public.golf_practice_plans (team_id, kind, event_id, title, step, body, created_by, updated_by)
    VALUES (v_team, 'event', p_event_id, COALESCE(v_title, pg_catalog.left(pg_catalog.btrim(v_event_title), 80)),
            COALESCE(p_step, 'blocks'), p_body, v_uid, v_uid)
    ON CONFLICT (event_id) WHERE event_id IS NOT NULL DO NOTHING
    RETURNING * INTO v_plan;
    IF v_plan.id IS NULL THEN
      -- Another coach created it between our read and insert.
      RAISE EXCEPTION 'practice_plan_stale';
    END IF;
    RETURN QUERY SELECT v_plan.id, v_plan.version, v_plan.updated_at;
    RETURN;
  END IF;

  -- An existing plan is never written through the event path: the client always saves an existing plan by id.
  RAISE EXCEPTION 'practice_plan_stale';
END;
$$;

REVOKE ALL ON FUNCTION public.golf_practice_plan_check_body(uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.golf_practice_plan_check_body(uuid, jsonb, boolean) TO service_role;
REVOKE ALL ON FUNCTION public.golf_practice_plan_save(uuid, uuid, integer, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golf_practice_plan_save(uuid, uuid, integer, text, text, jsonb) TO authenticated, service_role;
```

Notes:
- Error messages are stable tokens. The action maps them by `error.message`. The SQLSTATE is the plpgsql default (`P0001`) except forbidden (`42501`).
- A malformed uuid inside a reference is compared as text and so is a named refusal. A malformed `len`, `turnMin`, `holeFrom` and so on is refused by its pattern before any cast. The client never sends either: it parses with `parsePlanBody` first.
- A save of a published plan sets `edited_after_publish`, which drives "Edits not published" and "Republish". It never reaches players.
- An event title longer than 80 characters is cut for the plan's default title (`left(…, 80)`), so the title CHECK never refuses a first save.

### 8.8 Migration 20261026010600_golf_practice_plan_publish.sql (HELD)

```sql
-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- N-00 v2 Practice, slice 0. The owner's override of 2026-10-24 ("players notified when its published"): this file freezes and files; the server action sends the notices after it commits.
-- WHY: Publish freezes the draft into a version (with drill snapshots, without own-work lines), stores the lines privately, moves the live marker and files the plan in golf_documents, atomically; take down reverses visibility; set_variant switches main and rain on the draft; record_open feeds Seen by; cards serves the team chat card's live state; set_chat_message records the card once.
-- WHO: publish, take_down, set_variant and set_chat_message check public.is_golf_team_coach on the plan's team. record_open acts only for a player who can read the live version. cards answers only for plans of a team the caller coaches or plays on. public_body and recipients are service_role only.
-- ORDER: After 20261026010500 (uses golf_practice_plan_check_body) and 20261026010400 (writes golf_documents.practice_plan_id).
-- RISK: Low. Functions only. Writes golf_documents only through the one partial unique index on practice_plan_id.
-- ROLLBACK: DROP FUNCTION IF EXISTS public.golf_practice_plan_set_chat_message(uuid, uuid); DROP FUNCTION IF EXISTS public.golf_practice_plan_cards(uuid[]); DROP FUNCTION IF EXISTS public.golf_practice_plan_record_open(uuid); DROP FUNCTION IF EXISTS public.golf_practice_plan_set_variant(uuid, integer, text); DROP FUNCTION IF EXISTS public.golf_practice_plan_take_down(uuid, integer); DROP FUNCTION IF EXISTS public.golf_practice_plan_publish(uuid, integer, jsonb, boolean); DROP FUNCTION IF EXISTS public.golf_practice_plan_recipients(uuid, jsonb, uuid); DROP FUNCTION IF EXISTS public.golf_practice_plan_public_body(jsonb, text);
-- VERIFY: SELECT 1 FROM pg_catalog.pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('golf_practice_plan_public_body', 'golf_practice_plan_recipients', 'golf_practice_plan_publish', 'golf_practice_plan_take_down', 'golf_practice_plan_set_variant', 'golf_practice_plan_record_open', 'golf_practice_plan_cards', 'golf_practice_plan_set_chat_message') AND 'search_path=""' = ANY (proconfig) HAVING count(*) = 8;
-- VERIFY: SELECT 1 WHERE NOT has_function_privilege('authenticated', 'public.golf_practice_plan_public_body(jsonb, text)', 'EXECUTE') AND NOT has_function_privilege('authenticated', 'public.golf_practice_plan_recipients(uuid, jsonb, uuid)', 'EXECUTE') AND has_function_privilege('authenticated', 'public.golf_practice_plan_publish(uuid, integer, jsonb, boolean)', 'EXECUTE') AND NOT has_function_privilege('anon', 'public.golf_practice_plan_publish(uuid, integer, jsonb, boolean)', 'EXECUTE') AND NOT has_function_privilege('anon', 'public.golf_practice_plan_cards(uuid[])', 'EXECUTE');

SET lock_timeout = '3s';

-- The body players may read: plan fields and the active layout's blocks, with every Own work block's lines removed.
CREATE OR REPLACE FUNCTION public.golf_practice_plan_public_body(p_body jsonb, p_variant text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  -- fixed 4 Nov wiring: also drops any 'why' or 'coach_why' key, so a CoachHelm Why line can never reach a version players read.
  SELECT (p_body - 'variants' - 'why' - 'coach_why') || pg_catalog.jsonb_build_object(
    'variant', p_variant,
    'blocks', COALESCE((
      SELECT pg_catalog.jsonb_agg(CASE WHEN b.value ->> 'kind' = 'own' THEN b.value - 'lines' ELSE b.value END ORDER BY b.ord)
      FROM pg_catalog.jsonb_array_elements(p_body -> 'variants' -> p_variant -> 'blocks') WITH ORDINALITY AS b(value, ord)
    ), '[]'::jsonb)
  );
$$;

-- Who a publish tells: the plan's players who are active members with an account, and the staff coaches assigned in
-- its blocks or stations, never the caller. p_flat is a public body (players and blocks at the top level).
CREATE OR REPLACE FUNCTION public.golf_practice_plan_recipients(p_team uuid, p_flat jsonb, p_exclude uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(pg_catalog.jsonb_agg(r.x ORDER BY r.x ->> 'role', r.x ->> 'user_id'), '[]'::jsonb)
  FROM (
    SELECT pg_catalog.jsonb_build_object('role', 'player', 'player_id', gp.id, 'user_id', gp.user_id) AS x
      FROM pg_catalog.jsonb_array_elements_text(COALESCE(p_flat -> 'players', '[]'::jsonb)) pid
      JOIN public.golf_players gp ON gp.id::text = pid
      JOIN public.golf_team_members m
        ON m.player_id = gp.id AND m.team_id = p_team AND m.status = 'active'::public.team_member_status
     WHERE gp.user_id IS NOT NULL AND gp.user_id IS DISTINCT FROM p_exclude
    UNION
    SELECT pg_catalog.jsonb_build_object('role', 'coach', 'coach_id', gc.id, 'user_id', gc.user_id)
      FROM (
        SELECT c #>> '{}' AS cid FROM pg_catalog.jsonb_path_query(p_flat, 'lax $.blocks[*].coach ? (@.type() == "string")') c
        UNION
        SELECT c #>> '{}' FROM pg_catalog.jsonb_path_query(p_flat, 'lax $.blocks[*].stations[*].coach ? (@.type() == "string")') c
      ) cs
      JOIN public.golf_team_coach_staff s ON s.coach_id::text = cs.cid AND s.team_id = p_team
      JOIN public.golf_coaches gc ON gc.id = s.coach_id
     WHERE gc.user_id IS NOT NULL AND gc.user_id IS DISTINCT FROM p_exclude
  ) r;
$$;

CREATE OR REPLACE FUNCTION public.golf_practice_plan_publish(
  p_plan_id uuid,
  p_expected_version integer,
  p_changes jsonb,
  p_notified boolean
)
RETURNS TABLE (published_version integer, published_at timestamptz, document_id uuid, first_publish boolean, recipients jsonb)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_now timestamptz := pg_catalog.now();
  v_plan public.golf_practice_plans%ROWTYPE;
  v_event public.golf_events%ROWTYPE;
  v_layout jsonb;
  v_public jsonb;
  v_drills jsonb;
  v_next integer;
  v_first boolean;
  v_doc uuid;
  v_is_test boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'practice_plan_forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_plan FROM public.golf_practice_plans p WHERE p.id = p_plan_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_golf_team_coach(v_plan.team_id) THEN
    RAISE EXCEPTION 'practice_plan_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_expected_version IS NULL OR p_expected_version IS DISTINCT FROM v_plan.version THEN
    RAISE EXCEPTION 'practice_plan_stale';
  END IF;
  IF p_changes IS NULL OR pg_catalog.jsonb_typeof(p_changes) <> 'array' THEN
    RAISE EXCEPTION 'practice_plan_changes';
  END IF;
  IF pg_catalog.jsonb_array_length(p_changes) > 30 OR EXISTS (
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_changes) c
    WHERE pg_catalog.jsonb_typeof(c) <> 'string' OR pg_catalog.char_length(c #>> '{}') NOT BETWEEN 1 AND 140
  ) THEN
    RAISE EXCEPTION 'practice_plan_changes';
  END IF;

  PERFORM public.golf_practice_plan_check_body(v_plan.team_id, v_plan.body, v_plan.kind = 'makeup');
  v_layout := v_plan.body -> 'variants' -> v_plan.active_variant;
  IF pg_catalog.jsonb_typeof(v_layout) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'practice_plan_empty';
  END IF;
  IF pg_catalog.jsonb_array_length(v_layout -> 'blocks') = 0 THEN
    RAISE EXCEPTION 'practice_plan_empty';
  END IF;

  IF v_plan.kind = 'event' THEN
    SELECT * INTO v_event FROM public.golf_events e WHERE e.id = v_plan.event_id;
    IF v_event.status = 'cancelled' THEN
      RAISE EXCEPTION 'practice_plan_event_cancelled';
    END IF;
    IF COALESCE(v_event.all_day, false) THEN
      RAISE EXCEPTION 'practice_plan_all_day';
    END IF;
  END IF;

  -- Freeze each drill the active layout uses, as it is now ("src:id" -> card).
  WITH refs AS (
    SELECT DISTINCT x.r ->> 'src' AS src, x.r ->> 'id' AS id
    FROM (
      SELECT r FROM pg_catalog.jsonb_path_query(v_layout, 'lax $.blocks[*].drill ? (@.type() == "object")') r
      UNION ALL
      SELECT r FROM pg_catalog.jsonb_path_query(v_layout, 'lax $.blocks[*].stations[*].drill ? (@.type() == "object")') r
    ) x
  )
  SELECT COALESCE(pg_catalog.jsonb_object_agg(refs.src || ':' || refs.id, c.card), '{}'::jsonb)
    INTO v_drills
    FROM refs
    CROSS JOIN LATERAL (
      SELECT pg_catalog.jsonb_build_object(
               'src', 'team', 'name', t.name, 'area', t.area, 'kind', t.kind, 'minutes', t.minutes,
               'players', t.players, 'equipment', t.equipment, 'setup', t.setup, 'goal', t.goal,
               'scoring', t.scoring, 'levels', t.levels, 'tags', pg_catalog.to_jsonb(t.tags), 'mediaUrl', t.media_url,
               'diagram', t.diagram) AS card
        FROM public.golf_team_drills t
       WHERE refs.src = 'team' AND t.id::text = refs.id AND t.team_id = v_plan.team_id
      UNION ALL
      SELECT pg_catalog.jsonb_build_object(
               'src', 'lib', 'name', g.title, 'category', g.category, 'minutes', g.duration_min,
               'setup', g.description, 'tags', pg_catalog.to_jsonb(g.tags), 'mediaUrl', g.video_url,
               'diagram', 'auto') AS card
        FROM public.golf_drills g
       WHERE refs.src = 'lib' AND g.id::text = refs.id
    ) c;

  v_public := public.golf_practice_plan_public_body(v_plan.body, v_plan.active_variant)
    || pg_catalog.jsonb_build_object(
         'title', v_plan.title,
         'drills', v_drills,
         'eventStart', v_event.start_time,
         'eventEnd', v_event.end_time,
         'eventLocation', v_event.location,
         'dueOn', v_plan.due_on
       );

  v_next := COALESCE(v_plan.published_version, 0) + 1;
  v_first := v_plan.first_published_at IS NULL;

  UPDATE public.golf_practice_plan_versions v SET is_live = false WHERE v.plan_id = v_plan.id AND v.is_live;
  INSERT INTO public.golf_practice_plan_versions
    (plan_id, team_id, kind, event_id, for_player_id, version, title, body, changes, notified, is_live, published_by, published_at)
  VALUES
    (v_plan.id, v_plan.team_id, v_plan.kind, v_plan.event_id, v_plan.for_player_id, v_next, v_plan.title, v_public,
     p_changes, COALESCE(p_notified, true), true, v_uid, v_now);

  -- Own-work lines, private to each player (check_body proved every key is an active plan player).
  INSERT INTO public.golf_practice_plan_lines (plan_id, version, team_id, player_id, block_id, line)
  SELECT v_plan.id, v_next, v_plan.team_id, l.key::uuid, b ->> 'id', pg_catalog.btrim(l.value #>> '{}')
    FROM pg_catalog.jsonb_path_query(v_layout, 'lax $.blocks[*] ? (@.kind == "own")') b
   CROSS JOIN LATERAL pg_catalog.jsonb_each(b -> 'lines') l
   WHERE pg_catalog.char_length(pg_catalog.btrim(l.value #>> '{}')) > 0;

  UPDATE public.golf_practice_plans p
     SET status = 'published',
         published_version = v_next,
         published_at = v_now,
         first_published_at = COALESCE(p.first_published_at, v_now),
         taken_down_at = NULL,
         edited_after_publish = false,
         version = p.version + 1,
         updated_by = v_uid,
         updated_at = v_now
   WHERE p.id = v_plan.id
   RETURNING * INTO v_plan;

  -- File the event plan in Documents (one row per plan). Folder and uploader are kept on republish.
  IF v_plan.kind = 'event' THEN
    SELECT t.is_test INTO v_is_test FROM public.golf_teams t WHERE t.id = v_plan.team_id;
    INSERT INTO public.golf_documents AS d
      (team_id, uploaded_by, title, description, file_url, file_type, file_size, category, is_public, folder,
       version_count, updated_at, practice_plan_id, is_test)
    VALUES
      (v_plan.team_id, v_uid, v_plan.title, NULLIF(v_plan.body ->> 'focus', ''), NULL, NULL, NULL, 'practice_plan', true,
       'Practice plans', v_next, v_now, v_plan.id, COALESCE(v_is_test, false))
    ON CONFLICT (practice_plan_id) WHERE practice_plan_id IS NOT NULL
    DO UPDATE SET title = EXCLUDED.title,
                  description = EXCLUDED.description,
                  is_public = true,
                  version_count = EXCLUDED.version_count,
                  updated_at = EXCLUDED.updated_at
    RETURNING d.id INTO v_doc;
  END IF;

  RETURN QUERY
    SELECT v_next, v_now, v_doc, v_first, public.golf_practice_plan_recipients(v_plan.team_id, v_public, v_uid);
END;
$$;

CREATE OR REPLACE FUNCTION public.golf_practice_plan_take_down(p_plan_id uuid, p_expected_version integer)
RETURNS TABLE (plan_version integer, recipients jsonb)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_plan public.golf_practice_plans%ROWTYPE;
  v_live public.golf_practice_plan_versions%ROWTYPE;
BEGIN
  SELECT * INTO v_plan FROM public.golf_practice_plans p WHERE p.id = p_plan_id FOR UPDATE;
  IF v_uid IS NULL OR NOT FOUND OR NOT public.is_golf_team_coach(v_plan.team_id) THEN
    RAISE EXCEPTION 'practice_plan_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_expected_version IS NULL OR p_expected_version IS DISTINCT FROM v_plan.version THEN
    RAISE EXCEPTION 'practice_plan_stale';
  END IF;
  IF v_plan.status <> 'published' THEN
    RAISE EXCEPTION 'practice_plan_not_published';
  END IF;
  SELECT * INTO v_live FROM public.golf_practice_plan_versions v WHERE v.plan_id = v_plan.id AND v.is_live;
  UPDATE public.golf_practice_plan_versions v SET is_live = false WHERE v.plan_id = v_plan.id AND v.is_live;
  UPDATE public.golf_practice_plans p
     SET status = 'draft', taken_down_at = pg_catalog.now(), version = p.version + 1,
         updated_by = v_uid, updated_at = pg_catalog.now()
   WHERE p.id = v_plan.id
   RETURNING * INTO v_plan;
  UPDATE public.golf_documents d SET is_public = false, updated_at = pg_catalog.now() WHERE d.practice_plan_id = v_plan.id;
  RETURN QUERY
    SELECT v_plan.version,
           CASE WHEN v_live.id IS NULL THEN '[]'::jsonb
                ELSE public.golf_practice_plan_recipients(v_plan.team_id, v_live.body, v_uid) END;
END;
$$;

CREATE OR REPLACE FUNCTION public.golf_practice_plan_set_variant(p_plan_id uuid, p_expected_version integer, p_variant text)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan public.golf_practice_plans%ROWTYPE;
BEGIN
  IF p_variant IS NULL OR p_variant NOT IN ('main', 'rain') THEN
    RAISE EXCEPTION 'practice_plan_variant';
  END IF;
  SELECT * INTO v_plan FROM public.golf_practice_plans p WHERE p.id = p_plan_id FOR UPDATE;
  IF NOT FOUND OR NOT public.is_golf_team_coach(v_plan.team_id) THEN
    RAISE EXCEPTION 'practice_plan_forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_expected_version IS NULL OR p_expected_version IS DISTINCT FROM v_plan.version THEN
    RAISE EXCEPTION 'practice_plan_stale';
  END IF;
  IF p_variant = 'rain' AND pg_catalog.jsonb_typeof(v_plan.body -> 'variants' -> 'rain') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'practice_plan_no_rain_layout';
  END IF;
  UPDATE public.golf_practice_plans p
     SET active_variant = p_variant,
         edited_after_publish = p.edited_after_publish OR (p.status = 'published' AND p.active_variant IS DISTINCT FROM p_variant),
         version = p.version + 1,
         updated_by = (SELECT auth.uid()),
         updated_at = pg_catalog.now()
   WHERE p.id = v_plan.id
   RETURNING * INTO v_plan;
  RETURN v_plan.version;
END;
$$;

-- Seen by: a player who can read the live version records the highest version they opened. Anyone else is a no-op.
CREATE OR REPLACE FUNCTION public.golf_practice_plan_record_open(p_plan_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_live public.golf_practice_plan_versions%ROWTYPE;
  v_player uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;
  SELECT * INTO v_live FROM public.golf_practice_plan_versions v WHERE v.plan_id = p_plan_id AND v.is_live;
  IF NOT FOUND THEN
    RETURN;
  END IF;
  SELECT gp.id INTO v_player
    FROM public.golf_players gp
    JOIN public.golf_team_members m
      ON m.player_id = gp.id AND m.team_id = v_live.team_id AND m.status = 'active'::public.team_member_status
   WHERE gp.user_id = v_uid
   LIMIT 1;
  IF v_player IS NULL OR (v_live.kind = 'makeup' AND v_live.for_player_id IS DISTINCT FROM v_player) THEN
    RETURN;
  END IF;
  INSERT INTO public.golf_practice_plan_opens AS o (plan_id, player_id, team_id, version, first_opened_at, last_opened_at)
  VALUES (p_plan_id, v_player, v_live.team_id, v_live.version, pg_catalog.now(), pg_catalog.now())
  ON CONFLICT (plan_id, player_id)
  DO UPDATE SET version = GREATEST(o.version, EXCLUDED.version), last_opened_at = EXCLUDED.last_opened_at;
END;
$$;

-- The team chat card's live state. No row for a plan that was never published, was deleted, or is on another team.
CREATE OR REPLACE FUNCTION public.golf_practice_plan_cards(p_plan_ids uuid[])
RETURNS TABLE (
  plan_id uuid, state text, title text, live_version integer, published_at timestamptz,
  event_start timestamptz, event_end timestamptz, event_location text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id,
         CASE WHEN e.status = 'cancelled' THEN 'cancelled'
              WHEN p.status = 'published' AND p.published_version > 1 THEN 'updated'
              WHEN p.status = 'published' THEN 'published'
              ELSE 'taken_down' END,
         p.title,
         CASE WHEN p.status = 'published' THEN p.published_version END,
         p.published_at,
         e.start_time,
         e.end_time,
         e.location
    FROM public.golf_practice_plans p
    JOIN public.golf_events e ON e.id = p.event_id
   WHERE p.id = ANY (p_plan_ids[1:50])
     AND p.kind = 'event'
     AND p.first_published_at IS NOT NULL
     AND (public.is_golf_team_coach(p.team_id) OR public.is_golf_team_player(p.team_id));
$$;

-- Record the team chat card once. The message must be the caller's own practice card for this plan, in this team's team chat.
CREATE OR REPLACE FUNCTION public.golf_practice_plan_set_chat_message(p_plan_id uuid, p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_plan public.golf_practice_plans%ROWTYPE;
BEGIN
  SELECT * INTO v_plan FROM public.golf_practice_plans p WHERE p.id = p_plan_id FOR UPDATE;
  IF v_uid IS NULL OR NOT FOUND OR v_plan.kind <> 'event' OR NOT public.is_golf_team_coach(v_plan.team_id) THEN
    RAISE EXCEPTION 'practice_plan_forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1
      FROM public.golf_messages m
      JOIN public.golf_conversations c ON c.id = m.conversation_id
     WHERE m.id = p_message_id
       AND m.sender_id = v_uid
       AND m.kind = 'practice'
       AND m.payload ->> 'plan_id' = p_plan_id::text
       AND c.team_id = v_plan.team_id
       AND c.is_team_chat
  ) THEN
    RAISE EXCEPTION 'practice_plan_card';
  END IF;
  UPDATE public.golf_practice_plans p SET chat_message_id = p_message_id WHERE p.id = v_plan.id;
END;
$$;

REVOKE ALL ON FUNCTION public.golf_practice_plan_public_body(jsonb, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.golf_practice_plan_public_body(jsonb, text) TO service_role;
REVOKE ALL ON FUNCTION public.golf_practice_plan_recipients(uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.golf_practice_plan_recipients(uuid, jsonb, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.golf_practice_plan_publish(uuid, integer, jsonb, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golf_practice_plan_publish(uuid, integer, jsonb, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.golf_practice_plan_take_down(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golf_practice_plan_take_down(uuid, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.golf_practice_plan_set_variant(uuid, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golf_practice_plan_set_variant(uuid, integer, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.golf_practice_plan_record_open(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golf_practice_plan_record_open(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.golf_practice_plan_cards(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golf_practice_plan_cards(uuid[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.golf_practice_plan_set_chat_message(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golf_practice_plan_set_chat_message(uuid, uuid) TO authenticated, service_role;
```

Notes:
- `public_body` is IMMUTABLE and not a definer (it reads nothing), so the first VERIFY checks only `search_path` on all eight. The `prosecdef` check is left off that VERIFY for this reason.
- Publish and take down return the recipients; they send nothing. The server action sends after commit (8.15). Because sends happen in `after()`, a crash between commit and send loses notices but never the publish. That failure is logged under CH-17205.
- `set_chat_message` does not bump the draft version, so recording the card never makes an open builder stale.
- `cards` takes at most 50 ids (`p_plan_ids[1:50]`): a thread page never shows more cards than that.

### 8.9 Migration 20261026010700_golf_practice_plans_realtime.sql (HELD)

```sql
-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- N-00 v2 Practice, slice 0.
-- WHY: The builder refreshes when another coach saves (golf_practice_plans), and a player's open plan page refreshes when a new live version appears (golf_practice_plan_versions). Realtime applies each table's RLS, so players receive only live versions and never drafts. Lines and opens are not published.
-- WHO: n/a (publication membership).
-- ORDER: After 20261026010000.
-- RISK: Low (RLS applies to realtime).
-- ROLLBACK: ALTER PUBLICATION supabase_realtime DROP TABLE public.golf_practice_plan_versions; ALTER PUBLICATION supabase_realtime DROP TABLE public.golf_practice_plans;
-- VERIFY: SELECT 1 FROM pg_catalog.pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename IN ('golf_practice_plans', 'golf_practice_plan_versions') HAVING count(*) = 2;

SET lock_timeout = '3s';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'golf_practice_plans'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.golf_practice_plans;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'golf_practice_plan_versions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.golf_practice_plan_versions;
  END IF;
END;
$$;
```

This follows `20260908160000_golf_message_reactions_access.sql:86-88`. When a coach takes a plan down, a player's open page receives no event (they can no longer see the row it changed). It updates on the next refresh, pull or visibility change, and the take-down notice reaches them anyway.

### 8.10 Migration 20261026010800_golf_practice_makeups.sql (HELD)

```sql
-- STATUS: WRITTEN, NOT APPLIED (HOLD, see HELD.md).
-- N-00 v2 Practice, slice 7.
-- WHY: A coach makes a solo make-up from an event plan for one player who missed; it is published like any plan (one player told) and never filed in Documents or posted in chat; the player marks it done.
-- WHO: Create: public.is_golf_team_coach on the source plan's team, for an active player of that team. Complete: that player (golf_players.user_id = auth.uid(), active member, plan published) or a coach of the team. My make-ups: the calling player's own published make-ups only.
-- ORDER: After 20261026010500 (uses golf_practice_plan_check_body) and 20261026010600.
-- RISK: Low. Functions only.
-- ROLLBACK: DROP FUNCTION IF EXISTS public.golf_practice_my_makeups(uuid); DROP FUNCTION IF EXISTS public.golf_practice_makeup_complete(uuid, boolean); DROP FUNCTION IF EXISTS public.golf_practice_makeup_create(uuid, uuid, date, text, jsonb);
-- VERIFY: SELECT 1 FROM pg_catalog.pg_proc WHERE pronamespace = 'public'::regnamespace AND proname IN ('golf_practice_makeup_create', 'golf_practice_makeup_complete', 'golf_practice_my_makeups') AND prosecdef AND 'search_path=""' = ANY (proconfig) HAVING count(*) = 3;
-- VERIFY: SELECT 1 WHERE NOT has_function_privilege('anon', 'public.golf_practice_makeup_create(uuid, uuid, date, text, jsonb)', 'EXECUTE') AND NOT has_function_privilege('anon', 'public.golf_practice_makeup_complete(uuid, boolean)', 'EXECUTE') AND NOT has_function_privilege('anon', 'public.golf_practice_my_makeups(uuid)', 'EXECUTE');

SET lock_timeout = '3s';

CREATE OR REPLACE FUNCTION public.golf_practice_makeup_create(
  p_source_plan_id uuid,
  p_player_id uuid,
  p_due_on date,
  p_title text,
  p_body jsonb
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_src public.golf_practice_plans%ROWTYPE;
  v_tz text;
  v_today date;
  v_title text := NULLIF(pg_catalog.btrim(COALESCE(p_title, '')), '');
  v_id uuid;
BEGIN
  SELECT * INTO v_src FROM public.golf_practice_plans p WHERE p.id = p_source_plan_id;
  IF v_uid IS NULL OR NOT FOUND OR v_src.kind <> 'event' OR NOT public.is_golf_team_coach(v_src.team_id) THEN
    RAISE EXCEPTION 'practice_plan_forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.golf_team_members m
    WHERE m.team_id = v_src.team_id AND m.player_id = p_player_id AND m.status = 'active'::public.team_member_status
  ) THEN
    RAISE EXCEPTION 'practice_plan_player_not_on_team';
  END IF;
  IF v_title IS NULL OR pg_catalog.char_length(v_title) > 80 THEN
    RAISE EXCEPTION 'practice_plan_title';
  END IF;
  -- "Today" on the team clock: golf_team_settings.timezone, trimmed, falling back to America/New_York when it is
  -- missing, empty or not a zone Postgres knows (the shared rule; never golf_teams.timezone, never the server clock).
  SELECT NULLIF(pg_catalog.btrim(ts.timezone), '') INTO v_tz
    FROM public.golf_team_settings ts WHERE ts.team_id = v_src.team_id;
  v_tz := COALESCE(v_tz, 'America/New_York');
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = v_tz) THEN
    v_tz := 'America/New_York';
  END IF;
  v_today := (pg_catalog.now() AT TIME ZONE v_tz)::date;
  IF p_due_on IS NULL OR p_due_on < v_today OR p_due_on > v_today + 60 THEN
    RAISE EXCEPTION 'practice_makeup_due';
  END IF;
  PERFORM public.golf_practice_plan_check_body(v_src.team_id, p_body, true);
  IF (p_body -> 'players') IS DISTINCT FROM pg_catalog.jsonb_build_array(p_player_id::text) THEN
    RAISE EXCEPTION 'practice_plan_groups';
  END IF;

  INSERT INTO public.golf_practice_plans (team_id, kind, for_player_id, source_plan_id, due_on, title, body, created_by, updated_by)
  VALUES (v_src.team_id, 'makeup', p_player_id, v_src.id, p_due_on, v_title, p_body, v_uid, v_uid)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.golf_practice_makeup_complete(p_plan_id uuid, p_done boolean)
RETURNS timestamptz
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_plan public.golf_practice_plans%ROWTYPE;
  v_is_player boolean;
BEGIN
  SELECT * INTO v_plan FROM public.golf_practice_plans p WHERE p.id = p_plan_id FOR UPDATE;
  IF NOT FOUND OR v_plan.kind <> 'makeup' THEN
    RAISE EXCEPTION 'practice_plan_forbidden' USING ERRCODE = '42501';
  END IF;
  v_is_player := v_plan.status = 'published'
    AND public.is_golf_team_player(v_plan.team_id)
    AND EXISTS (SELECT 1 FROM public.golf_players gp WHERE gp.id = v_plan.for_player_id AND gp.user_id = (SELECT auth.uid()));
  IF NOT v_is_player AND NOT public.is_golf_team_coach(v_plan.team_id) THEN
    RAISE EXCEPTION 'practice_plan_forbidden' USING ERRCODE = '42501';
  END IF;
  -- Only completed_at changes; the draft version is left alone so a coach's open builder never goes stale.
  UPDATE public.golf_practice_plans p
     SET completed_at = CASE WHEN p_done THEN COALESCE(p.completed_at, pg_catalog.now()) ELSE NULL END,
         updated_at = pg_catalog.now()
   WHERE p.id = v_plan.id
   RETURNING * INTO v_plan;
  RETURN v_plan.completed_at;
END;
$$;

-- The calling player's own published make-ups on a team, soonest due first.
CREATE OR REPLACE FUNCTION public.golf_practice_my_makeups(p_team uuid)
RETURNS TABLE (plan_id uuid, title text, due_on date, completed_at timestamptz, live_version integer, minutes integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.id, p.title, p.due_on, p.completed_at, v.version,
         (SELECT COALESCE(sum((b ->> 'len')::int), 0)::int FROM pg_catalog.jsonb_array_elements(v.body -> 'blocks') b)
    FROM public.golf_practice_plans p
    JOIN public.golf_practice_plan_versions v ON v.plan_id = p.id AND v.is_live
    JOIN public.golf_players gp ON gp.id = p.for_player_id
   WHERE p.kind = 'makeup'
     AND p.team_id = p_team
     AND p.status = 'published'
     AND gp.user_id = (SELECT auth.uid())
     AND public.is_golf_team_player(p_team)
   ORDER BY p.due_on, p.id
   LIMIT 20;
$$;

REVOKE ALL ON FUNCTION public.golf_practice_makeup_create(uuid, uuid, date, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golf_practice_makeup_create(uuid, uuid, date, text, jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.golf_practice_makeup_complete(uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golf_practice_makeup_complete(uuid, boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.golf_practice_my_makeups(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.golf_practice_my_makeups(uuid) TO authenticated, service_role;
```

A make-up is edited by a coach through `golf_practice_plan_save(NULL, plan_id, version, title, step, body)`, which checks the body as solo and its one player. It is published through `golf_practice_plan_publish`, which files nothing in Documents for a make-up and returns only that player (and any coach assigned in it) as recipients.

### 8.11 HELD.md rows (add one row per file, in the register table at `supabase/migrations/HELD.md:153`)

Each row follows the file's own rule (`HELD.md`, "Adding a row"): it says what would go wrong if the file were applied early, not just that it is held.

| migration | status | why | decided |
| --- | --- | --- | --- |
| `20261026010000_golf_practice_plans.sql` | **HOLD** | N-00 v2 Practice, slice 0. New tables only (plans, versions, lines, opens). Held until the Practice tab code merges behind `golf_practice_plans`. Applied alone it is harmless but orphaned: the tables sit empty, and the type regeneration that follows would add tables no code reads yet. Apply 010000 to 010800 in order, in one window, then regenerate `database.types.ts`. | 2026-10-25, N-00 v2 |
| `20261026010100_golf_team_drills.sql` | **HOLD** | N-00 v2, slice 0. Team drill bank (coach-only; no DELETE grant, archive instead). Same reason as 010000. Needs `golf_drills` (seeded, 64 rows in the seed file) for the copy FK. | 2026-10-25, N-00 v2 |
| `20261026010200_golf_practice_groups.sql` | **HOLD** | N-00 v2, slice 0. Saved groups plus the definer `golf_practice_players_on_team`. Same reason as 010000. | 2026-10-25, N-00 v2 |
| `20261026010300_golf_practice_templates.sql` | **HOLD** | N-00 v2, slice 0. Session, block and week templates with a no-people CHECK. Same reason as 010000. The CHECK uses the jsonpath `.**` accessor; verify it compiles on the production Postgres version on a branch first (it is supported since PostgreSQL 12). | 2026-10-25, N-00 v2 |
| `20261026010400_golf_documents_practice_plan.sql` | **HOLD** | N-00 v2, slice 0. Touches a live table: adds `golf_documents.practice_plan_id`, drops NOT NULL on `file_url`, adds a source CHECK and recreates the coach insert and update policies. **Do not apply before** every `golf_documents` reader filters `file_url IS NOT NULL` (0.4; N-10 item 1). Applied before that, the first published plan files a row with no file, and the current Documents screens, the event attachment picker and the signed-URL helpers would show a broken file or throw on it. Apply only after the N-00 slice 3 PR and the N-10 shim are both on main. | 2026-10-25, N-00 v2 with N-10 |
| `20261026010500_golf_practice_plan_save.sql` | **HOLD** | N-00 v2, slice 0. Body check and save (definer). Needs 010000 to 010300. Applied before the code, nothing calls it. | 2026-10-25, N-00 v2 |
| `20261026010600_golf_practice_plan_publish.sql` | **HOLD** | N-00 v2, slice 0. Publish, take down, rain switch, Seen by, chat card state. Writes `golf_documents` plan rows, so it carries 010400's precondition: never apply before the Documents readers are filtered. | 2026-10-25, N-00 v2 |
| `20261026010700_golf_practice_plans_realtime.sql` | **HOLD** | N-00 v2, slice 0. Adds `golf_practice_plans` and `golf_practice_plan_versions` to `supabase_realtime`. Harmless alone (RLS applies to Realtime) but pointless before the tables have readers. | 2026-10-25, N-00 v2 |
| `20261026010800_golf_practice_makeups.sql` | **HOLD** | N-00 v2, slice 7 (after the first release). Make-up create, complete and list. Applying with the rest is safe (functions only, flag-gated UI), but it is held with the block so the ledger stays in order. | 2026-10-25, N-00 v2 |

When the owner applies the block, each row moves to the house "APPLIED date, hold discharged" form (see `20260929200000` at `HELD.md:182`), with the VERIFY results quoted.

### 8.12 pgTAP: `supabase/tests/rls/golf_practice_plans.sql`

WRITTEN, NOT RUN where it was authored (no Supabase stack). Run it with `npm run test:rls` on a stack with 010000 to 010800 applied, before the owner applies them anywhere else. The fixture follows `golf_shot_detail_visibility.sql:60-150`: rows inserted as the test owner (which bypasses RLS), then each case runs as `authenticated` with `request.jwt.claims` set. Ids are fixed (`…e17xxx`) so cases can name rows. The first saved plan's id is set to a fixed value straight after it is created, before anything references it.

```sql
-- N-00 v2 Practice (20261026010000..20261026010800): who can write, read and publish practice plans,
-- that drafts and own-work lines stay private, that Documents rows follow publish and take down,
-- and that the drill bank, saved groups, templates and make-ups keep their rules.
-- WRITTEN, NOT RUN where it was authored (no Supabase stack): run with npm run test:rls before applying.
BEGIN;
\ir _helpers.sql
SELECT plan(91);

-- Fixture ----------------------------------------------------------------------------------------
-- Team X (org 1): head coach H, assistant A, players P1 and P2. Team Y (org 1): head coach U, player Q.
DO $$
DECLARE
  u_h uuid := '00000000-0000-0000-0000-000000e17101'; u_a uuid := '00000000-0000-0000-0000-000000e17102';
  u_u uuid := '00000000-0000-0000-0000-000000e17103'; u_p1 uuid := '00000000-0000-0000-0000-000000e17104';
  u_p2 uuid := '00000000-0000-0000-0000-000000e17105'; u_q uuid := '00000000-0000-0000-0000-000000e17106';
  c_h uuid := '00000000-0000-0000-0000-000000e17201'; c_a uuid := '00000000-0000-0000-0000-000000e17202';
  c_u uuid := '00000000-0000-0000-0000-000000e17203';
  p_1 uuid := '00000000-0000-0000-0000-000000e17301'; p_2 uuid := '00000000-0000-0000-0000-000000e17302';
  p_q uuid := '00000000-0000-0000-0000-000000e17303';
  o_1 uuid := '00000000-0000-0000-0000-000000e17401';
  t_x uuid := '00000000-0000-0000-0000-000000e17411'; t_y uuid := '00000000-0000-0000-0000-000000e17412';
BEGIN
  INSERT INTO auth.users (id, email, role) VALUES
    (u_h, 'practice-h@helm.test', 'authenticated'), (u_a, 'practice-a@helm.test', 'authenticated'),
    (u_u, 'practice-u@helm.test', 'authenticated'), (u_p1, 'practice-p1@helm.test', 'authenticated'),
    (u_p2, 'practice-p2@helm.test', 'authenticated'), (u_q, 'practice-q@helm.test', 'authenticated')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.users (id, email, role) VALUES
    (u_h, 'practice-h@helm.test', 'coach'), (u_a, 'practice-a@helm.test', 'coach'),
    (u_u, 'practice-u@helm.test', 'coach'), (u_p1, 'practice-p1@helm.test', 'player'),
    (u_p2, 'practice-p2@helm.test', 'player'), (u_q, 'practice-q@helm.test', 'player')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.organizations (id, name, type) VALUES (o_1, 'pgtap-practice-org', 'college') ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_coaches (id, user_id, organization_id) VALUES
    (c_h, u_h, o_1), (c_a, u_a, o_1), (c_u, u_u, o_1) ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_players (id, user_id) VALUES (p_1, u_p1), (p_2, u_p2), (p_q, u_q) ON CONFLICT DO NOTHING;
  -- golf_teams_org_gender_uidx is UNIQUE (organization_id, gender): the two teams differ on gender.
  INSERT INTO public.golf_teams (id, name, join_code, organization_id, gender) VALUES
    (t_x, 'pgtap-practice-X', 'PGPRX1', o_1, 'mens'), (t_y, 'pgtap-practice-Y', 'PGPRY1', o_1, 'womens')
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_coach_staff (team_id, coach_id, role, is_primary) VALUES
    (t_x, c_h, 'head_coach', true), (t_x, c_a, 'assistant_coach', false), (t_y, c_u, 'head_coach', true)
  ON CONFLICT DO NOTHING;
  INSERT INTO public.golf_team_members (team_id, player_id, status) VALUES
    (t_x, p_1, 'active'), (t_x, p_2, 'active'), (t_y, p_q, 'active') ON CONFLICT DO NOTHING;
  -- A trimmed zone that Postgres knows: the make-up due-date check must trim before it looks it up.
  INSERT INTO public.golf_team_settings (team_id, timezone) VALUES (t_x, '  Pacific/Honolulu  ');
  INSERT INTO public.golf_events (id, team_id, created_by, title, event_type, location, start_time, end_time, all_day) VALUES
    ('00000000-0000-0000-0000-000000e17501', t_x, u_h, 'Thursday practice', 'practice', 'Lakeside range',
      now() + interval '2 days', now() + interval '2 days 3 hours', false),
    ('00000000-0000-0000-0000-000000e17502', t_x, u_h, 'Range day', 'practice', NULL,
      now() + interval '3 days', NULL, true),
    ('00000000-0000-0000-0000-000000e17503', t_x, u_h, 'Team meeting', 'meeting', NULL,
      now() + interval '4 days', now() + interval '4 days 1 hour', false);
  INSERT INTO public.golf_conversations (id, team_id, is_team_chat, title, created_by) VALUES
    ('00000000-0000-0000-0000-000000e17601', t_x, true, 'Team X', u_h);
  INSERT INTO public.golf_conversation_participants (conversation_id, user_id) VALUES
    ('00000000-0000-0000-0000-000000e17601', u_h), ('00000000-0000-0000-0000-000000e17601', u_a),
    ('00000000-0000-0000-0000-000000e17601', u_p1), ('00000000-0000-0000-0000-000000e17601', u_p2);
  INSERT INTO public.golf_team_drills (id, team_id, name, area, minutes, created_by) VALUES
    ('00000000-0000-0000-0000-000000e17801', t_x, 'Ladder 3-6-9', 'putting', 20, u_h);
END;
$$;

-- Bodies used by the cases (readable by the test roles).
CREATE TEMP TABLE fx (k text PRIMARY KEY, j jsonb NOT NULL);
GRANT SELECT ON fx TO authenticated, anon;
INSERT INTO fx (k, j) VALUES
('ok', '{"v":2,"focus":"","notes":"","place":"","arrivalBufferMin":15,"bring":[],
  "players":["00000000-0000-0000-0000-000000e17301","00000000-0000-0000-0000-000000e17302"],"groups":[],
  "variants":{"main":{"blocks":[
    {"id":"b1","kind":"team","title":"Putting ladder","len":30,"coach":"00000000-0000-0000-0000-000000e17201","note":"","place":"Green",
     "drill":{"src":"team","id":"00000000-0000-0000-0000-000000e17801"}},
    {"id":"b2","kind":"own","title":"Own work","len":30,"coach":null,"note":"","place":"Range",
     "lines":{"00000000-0000-0000-0000-000000e17301":"Wedges 50 to 90"}}]},"rain":null}}'),
('ok2', '{"v":2,"focus":"Wedges","notes":"","place":"","arrivalBufferMin":15,"bring":[],
  "players":["00000000-0000-0000-0000-000000e17301","00000000-0000-0000-0000-000000e17302"],"groups":[],
  "variants":{"main":{"blocks":[
    {"id":"b1","kind":"team","title":"Putting ladder","len":40,"coach":"00000000-0000-0000-0000-000000e17201","note":"","place":"Green",
     "drill":{"src":"team","id":"00000000-0000-0000-0000-000000e17801"}},
    {"id":"b2","kind":"own","title":"Own work","len":30,"coach":null,"note":"","place":"Range",
     "lines":{"00000000-0000-0000-0000-000000e17301":"Wedges 50 to 90"}}]},"rain":null}}'),
('other_team_player', '{"v":2,"focus":"","notes":"","place":"","arrivalBufferMin":15,"bring":[],
  "players":["00000000-0000-0000-0000-000000e17303"],"groups":[],
  "variants":{"main":{"blocks":[{"id":"b1","kind":"team","title":"Warm up","len":20,"coach":null,"note":"","place":"","drill":null}]},"rain":null}}'),
('other_team_coach', '{"v":2,"focus":"","notes":"","place":"","arrivalBufferMin":15,"bring":[],"players":[],"groups":[],
  "variants":{"main":{"blocks":[{"id":"b1","kind":"team","title":"Warm up","len":20,"coach":"00000000-0000-0000-0000-000000e17203","note":"","place":"","drill":null}]},"rain":null}}'),
('v1', '{"v":1,"blocks":[]}'),
('bad_len', '{"v":2,"focus":"","notes":"","place":"","arrivalBufferMin":15,"bring":[],"players":[],"groups":[],
  "variants":{"main":{"blocks":[{"id":"b1","kind":"team","title":"Warm up","len":"abc","coach":null,"note":"","place":"","drill":null}]},"rain":null}}'),
('empty', '{"v":2,"focus":"","notes":"","place":"","arrivalBufferMin":15,"bring":[],"players":[],"groups":[],
  "variants":{"main":{"blocks":[]},"rain":null}}'),
('solo_p2', '{"v":2,"focus":"Missed Thursday","notes":"","place":"","arrivalBufferMin":0,"bring":[],
  "players":["00000000-0000-0000-0000-000000e17302"],"groups":[],
  "variants":{"main":{"blocks":[{"id":"m1","kind":"team","title":"Putting ladder","len":30,"coach":null,"note":"","place":"Green","drill":null}]},"rain":null}}'),
('tpl_ok', '{"v":2,"focus":"","notes":"","place":"","arrivalBufferMin":15,"bring":[],"players":[],"groups":[],
  "variants":{"main":{"blocks":[{"id":"b1","kind":"team","title":"Warm up","len":20,"coach":null,"note":"","place":"","drill":null}]},"rain":null}}'),
('tpl_people', '{"v":2,"players":["00000000-0000-0000-0000-000000e17301"],"groups":[],"variants":{"main":{"blocks":[]},"rain":null}}'),
('tpl_coach', '{"v":2,"players":[],"groups":[],"variants":{"main":{"blocks":[{"id":"b1","kind":"team","title":"Warm up","len":20,
  "coach":"00000000-0000-0000-0000-000000e17201","note":"","place":"","drill":null}]},"rain":null}}');

-- 1. Save: create, version check, refusals -------------------------------------------------------
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17101","role":"authenticated"}';
SELECT lives_ok($$SELECT public.golf_practice_plan_save('00000000-0000-0000-0000-000000e17501', NULL, NULL, NULL, 'blocks',
  (SELECT j FROM fx WHERE k = 'ok'))$$, 'a head coach creates the plan for a practice event on first save');
RESET role;
UPDATE public.golf_practice_plans SET id = '00000000-0000-0000-0000-000000e17701'
  WHERE event_id = '00000000-0000-0000-0000-000000e17501';
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17101","role":"authenticated"}';
SELECT is((SELECT version FROM public.golf_practice_plans WHERE id = '00000000-0000-0000-0000-000000e17701'), 1,
  'a new plan starts at version 1');
SELECT is((SELECT title FROM public.golf_practice_plans WHERE id = '00000000-0000-0000-0000-000000e17701'), 'Thursday practice',
  'a new plan takes the event title');
SELECT throws_ok($$SELECT public.golf_practice_plan_save(NULL, '00000000-0000-0000-0000-000000e17701', 5, NULL, NULL,
  (SELECT j FROM fx WHERE k = 'ok'))$$, 'P0001', 'practice_plan_stale', 'a save with an old version is refused');
SELECT throws_ok($$SELECT public.golf_practice_plan_save('00000000-0000-0000-0000-000000e17501', NULL, NULL, NULL, NULL,
  (SELECT j FROM fx WHERE k = 'ok'))$$, 'P0001', 'practice_plan_stale', 'a second first-save on the same event is refused');
SELECT lives_ok($$SELECT public.golf_practice_plan_save(NULL, '00000000-0000-0000-0000-000000e17701', 1, NULL, 'groups',
  (SELECT j FROM fx WHERE k = 'ok'))$$, 'a save with the current version succeeds');
SELECT throws_ok($$SELECT public.golf_practice_plan_save('00000000-0000-0000-0000-000000e17502', NULL, NULL, NULL, NULL,
  (SELECT j FROM fx WHERE k = 'ok'))$$, 'P0001', 'practice_plan_all_day', 'an all-day practice cannot hold a plan');
SELECT throws_ok($$SELECT public.golf_practice_plan_save('00000000-0000-0000-0000-000000e17503', NULL, NULL, NULL, NULL,
  (SELECT j FROM fx WHERE k = 'ok'))$$, 'P0001', 'practice_plan_not_practice', 'only a practice event can hold a plan');
SELECT throws_ok($$SELECT public.golf_practice_plan_save(NULL, '00000000-0000-0000-0000-000000e17701', 2, NULL, NULL,
  (SELECT j FROM fx WHERE k = 'other_team_player'))$$, 'P0001', 'practice_plan_player_not_on_team', 'a player from another team is refused');
SELECT throws_ok($$SELECT public.golf_practice_plan_save(NULL, '00000000-0000-0000-0000-000000e17701', 2, NULL, NULL,
  (SELECT j FROM fx WHERE k = 'other_team_coach'))$$, 'P0001', 'practice_plan_coach_not_on_staff', 'a coach not on the staff is refused');
SELECT throws_ok($$SELECT public.golf_practice_plan_save(NULL, '00000000-0000-0000-0000-000000e17701', 2, NULL, NULL,
  (SELECT j FROM fx WHERE k = 'v1'))$$, 'P0001', 'practice_plan_body_version', 'a body that is not version 2 is refused');
SELECT throws_ok($$SELECT public.golf_practice_plan_save(NULL, '00000000-0000-0000-0000-000000e17701', 2, NULL, NULL,
  (SELECT j FROM fx WHERE k = 'bad_len'))$$, 'P0001', 'practice_plan_block', 'a block length that is not a whole number is refused before any cast');
SELECT throws_ok($$INSERT INTO public.golf_practice_plans (team_id, event_id, title, body, created_by)
  VALUES ('00000000-0000-0000-0000-000000e17411', '00000000-0000-0000-0000-000000e17503', 'x', '{}', '00000000-0000-0000-0000-000000e17101')$$,
  '42501', NULL, 'a coach cannot insert a plan directly');

-- 2. Assistant rights, other-team coach ----------------------------------------------------------
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17102","role":"authenticated"}';
SELECT lives_ok($$SELECT public.golf_practice_plan_save(NULL, '00000000-0000-0000-0000-000000e17701', 2, NULL, 'drills',
  (SELECT j FROM fx WHERE k = 'ok'))$$, 'an assistant coach edits the plan (owner call 15: any coach of the team)');
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17103","role":"authenticated"}';
SELECT throws_ok($$SELECT public.golf_practice_plan_save(NULL, '00000000-0000-0000-0000-000000e17701', 3, NULL, NULL,
  (SELECT j FROM fx WHERE k = 'ok'))$$, '42501', 'practice_plan_forbidden', 'a coach of another team cannot save it');
SELECT is((SELECT count(*)::int FROM public.golf_practice_plans WHERE id = '00000000-0000-0000-0000-000000e17701'), 0,
  'a coach of another team cannot read it');
SELECT throws_ok($$SELECT * FROM public.golf_practice_plan_publish('00000000-0000-0000-0000-000000e17701', 3, '[]', true)$$,
  '42501', 'practice_plan_forbidden', 'a coach of another team cannot publish it');

-- 3. Before publish, players see nothing ---------------------------------------------------------
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17104","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_practice_plans), 0, 'a player never reads the plans table (drafts)');
SELECT is((SELECT count(*)::int FROM public.golf_practice_plan_versions), 0, 'a player reads no version before publish');
SELECT throws_ok($$SELECT public.golf_practice_plan_save(NULL, '00000000-0000-0000-0000-000000e17701', 3, NULL, NULL,
  (SELECT j FROM fx WHERE k = 'ok'))$$, '42501', 'practice_plan_forbidden', 'a player cannot save a plan');

-- 4. Publish -------------------------------------------------------------------------------------
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17101","role":"authenticated"}';
SELECT throws_ok($$SELECT * FROM public.golf_practice_plan_publish('00000000-0000-0000-0000-000000e17701', 3, '{"x":1}', true)$$,
  'P0001', 'practice_plan_changes', 'the changes list must be an array');
SELECT is((SELECT published_version FROM public.golf_practice_plan_publish('00000000-0000-0000-0000-000000e17701', 3, '[]', true)), 1,
  'the first publish makes version 1');
SELECT is((SELECT status || ':' || version FROM public.golf_practice_plans WHERE id = '00000000-0000-0000-0000-000000e17701'),
  'published:4', 'publish marks the plan published and bumps the draft version');
SELECT is((SELECT count(*)::int FROM public.golf_documents
  WHERE practice_plan_id = '00000000-0000-0000-0000-000000e17701' AND file_url IS NULL AND is_public
    AND uploaded_by = '00000000-0000-0000-0000-000000e17101' AND folder = 'Practice plans'), 1,
  'publish files one public plan row in Documents, with no file');

-- 4b. Recipients (service-role helper, asserted as the test owner) -------------------------------
RESET role;
SELECT is(jsonb_array_length(public.golf_practice_plan_recipients('00000000-0000-0000-0000-000000e17411',
  public.golf_practice_plan_public_body((SELECT j FROM fx WHERE k = 'ok'), 'main'), '00000000-0000-0000-0000-000000e17101')), 2,
  'a publish by H tells the two players and not H, though H is assigned to a block');
SELECT ok(public.golf_practice_plan_recipients('00000000-0000-0000-0000-000000e17411',
  public.golf_practice_plan_public_body((SELECT j FROM fx WHERE k = 'ok'), 'main'), '00000000-0000-0000-0000-000000e17102')
  @> '[{"role":"coach","user_id":"00000000-0000-0000-0000-000000e17101"}]'::jsonb,
  'a publish by the assistant tells H, who is assigned to a block (owner call 13)');
SELECT ok(NOT jsonb_path_exists(public.golf_practice_plan_public_body((SELECT j FROM fx WHERE k = 'ok'), 'main'), 'lax $.**.lines'),
  'the public body carries no own-work lines');
SELECT ok(NOT has_function_privilege('authenticated', 'public.golf_practice_plan_recipients(uuid, jsonb, uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.golf_practice_plan_check_body(uuid, jsonb, boolean)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.golf_practice_plan_public_body(jsonb, text)', 'EXECUTE'),
  'the three helper functions are not callable by signed-in users');

-- 5. What players read after publish -------------------------------------------------------------
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17104","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_practice_plan_versions
  WHERE plan_id = '00000000-0000-0000-0000-000000e17701' AND is_live), 1, 'a player reads the live version');
SELECT ok((SELECT NOT jsonb_path_exists(body, 'lax $.**.lines') AND body -> 'drills' ? 'team:00000000-0000-0000-0000-000000e17801'
  FROM public.golf_practice_plan_versions WHERE plan_id = '00000000-0000-0000-0000-000000e17701' AND is_live),
  'the live version has no own-work lines and carries the frozen drill card');
SELECT is((SELECT line FROM public.golf_practice_plan_lines WHERE plan_id = '00000000-0000-0000-0000-000000e17701'),
  'Wedges 50 to 90', 'a player reads their own own-work line');
SELECT is((SELECT count(*)::int FROM public.golf_documents WHERE practice_plan_id = '00000000-0000-0000-0000-000000e17701'), 1,
  'a player sees the plan row in Documents while it is public');
SELECT is((SELECT state FROM public.golf_practice_plan_cards(ARRAY['00000000-0000-0000-0000-000000e17701']::uuid[])),
  'published', 'the chat card reads Published');
SELECT lives_ok($$SELECT public.golf_practice_plan_record_open('00000000-0000-0000-0000-000000e17701')$$, 'a player records an open');
SELECT lives_ok($$SELECT public.golf_practice_plan_record_open('00000000-0000-0000-0000-000000e17701')$$,
  'recording an open twice is harmless');
SELECT throws_ok($$INSERT INTO public.golf_practice_plan_opens (plan_id, player_id, team_id, version)
  VALUES ('00000000-0000-0000-0000-000000e17701', '00000000-0000-0000-0000-000000e17302', '00000000-0000-0000-0000-000000e17411', 1)$$,
  '42501', NULL, 'a player cannot write an open directly');
SELECT throws_ok($$UPDATE public.golf_practice_plan_versions SET title = 'x' WHERE plan_id = '00000000-0000-0000-0000-000000e17701'$$,
  '42501', NULL, 'a player cannot change a version');
SELECT throws_ok($$DELETE FROM public.golf_practice_plan_lines$$, '42501', NULL, 'a player cannot delete lines');

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17105","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_practice_plan_lines), 0, 'another player cannot read P1''s own-work line');
SELECT is((SELECT count(*)::int FROM public.golf_practice_plan_opens), 0, 'a player cannot read Seen by');

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17106","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_practice_plan_versions), 0, 'a player on another team reads no version');
SELECT is((SELECT count(*)::int FROM public.golf_practice_plan_cards(ARRAY['00000000-0000-0000-0000-000000e17701']::uuid[])), 0,
  'a player on another team gets no card state');
SELECT lives_ok($$SELECT public.golf_practice_plan_record_open('00000000-0000-0000-0000-000000e17701')$$,
  'an open by someone who cannot read the plan is a quiet no-op');

SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17101","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_practice_plan_opens WHERE plan_id = '00000000-0000-0000-0000-000000e17701'), 1,
  'the coach sees one open: P1 once, and nothing from the other team''s player');

-- 6. Chat card -----------------------------------------------------------------------------------
RESET role;
INSERT INTO public.golf_messages (id, conversation_id, sender_id, content, kind, payload) VALUES
  ('00000000-0000-0000-0000-000000e17602', '00000000-0000-0000-0000-000000e17601', '00000000-0000-0000-0000-000000e17101',
    'Practice plan: Thursday practice', 'practice', '{"plan_id":"00000000-0000-0000-0000-000000e17701","v":1}'),
  ('00000000-0000-0000-0000-000000e17603', '00000000-0000-0000-0000-000000e17601', '00000000-0000-0000-0000-000000e17101',
    'See you at 2', 'text', NULL);
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17101","role":"authenticated"}';
SELECT throws_ok($$SELECT public.golf_practice_plan_set_chat_message('00000000-0000-0000-0000-000000e17701', '00000000-0000-0000-0000-000000e17603')$$,
  'P0001', 'practice_plan_card', 'only a practice card for this plan can be recorded');
SELECT lives_ok($$SELECT public.golf_practice_plan_set_chat_message('00000000-0000-0000-0000-000000e17701', '00000000-0000-0000-0000-000000e17602')$$,
  'the publishing coach records the card');
SELECT is((SELECT version FROM public.golf_practice_plans WHERE id = '00000000-0000-0000-0000-000000e17701'), 4,
  'recording the card does not bump the draft version');

-- 7. Republish by the assistant ------------------------------------------------------------------
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17102","role":"authenticated"}';
SELECT lives_ok($$SELECT public.golf_practice_plan_save(NULL, '00000000-0000-0000-0000-000000e17701', 4, NULL, NULL,
  (SELECT j FROM fx WHERE k = 'ok2'))$$, 'an edit after publish saves');
SELECT ok((SELECT edited_after_publish FROM public.golf_practice_plans WHERE id = '00000000-0000-0000-0000-000000e17701'),
  'an edit after publish is flagged as not yet published');
SELECT is((SELECT published_version FROM public.golf_practice_plan_publish('00000000-0000-0000-0000-000000e17701', 5,
  '[{"kind":"block_time","block":"b1"}]', true)), 2, 'republish makes version 2');
SELECT is((SELECT count(*)::int FROM public.golf_practice_plan_versions WHERE plan_id = '00000000-0000-0000-0000-000000e17701' AND is_live), 1,
  'exactly one version is live after republish');
SELECT is((SELECT uploaded_by FROM public.golf_documents WHERE practice_plan_id = '00000000-0000-0000-0000-000000e17701'),
  '00000000-0000-0000-0000-000000e17101'::uuid, 'republish keeps the Documents row''s uploader and its single row');
SELECT is((SELECT state FROM public.golf_practice_plan_cards(ARRAY['00000000-0000-0000-0000-000000e17701']::uuid[])),
  'updated', 'the chat card reads Updated');

-- 8. Rain switch and cancelled event -------------------------------------------------------------
SELECT throws_ok($$SELECT public.golf_practice_plan_set_variant('00000000-0000-0000-0000-000000e17701', 6, 'rain')$$,
  'P0001', 'practice_plan_no_rain_layout', 'a plan with no rain layout cannot switch to it');
SELECT throws_ok($$SELECT public.golf_practice_plan_set_variant('00000000-0000-0000-0000-000000e17701', 6, 'snow')$$,
  'P0001', 'practice_plan_variant', 'only main and rain are layouts');
RESET role;
UPDATE public.golf_events SET status = 'cancelled' WHERE id = '00000000-0000-0000-0000-000000e17501';
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17101","role":"authenticated"}';
SELECT throws_ok($$SELECT * FROM public.golf_practice_plan_publish('00000000-0000-0000-0000-000000e17701', 6, '[]', true)$$,
  'P0001', 'practice_plan_event_cancelled', 'a cancelled practice cannot be published');
SELECT is((SELECT state FROM public.golf_practice_plan_cards(ARRAY['00000000-0000-0000-0000-000000e17701']::uuid[])),
  'cancelled', 'the chat card reads Practice cancelled');
RESET role;
UPDATE public.golf_events SET status = 'scheduled' WHERE id = '00000000-0000-0000-0000-000000e17501';

-- 9. Take down -----------------------------------------------------------------------------------
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17101","role":"authenticated"}';
SELECT throws_ok($$SELECT * FROM public.golf_practice_plan_take_down('00000000-0000-0000-0000-000000e17701', 5)$$,
  'P0001', 'practice_plan_stale', 'take down checks the version');
SELECT is((SELECT jsonb_array_length(recipients) FROM public.golf_practice_plan_take_down('00000000-0000-0000-0000-000000e17701', 6)), 2,
  'take down returns the live version''s players to tell');
SELECT is((SELECT count(*)::int FROM public.golf_documents
  WHERE practice_plan_id = '00000000-0000-0000-0000-000000e17701' AND NOT is_public), 1, 'take down hides the Documents row');
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17104","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_practice_plan_versions), 0, 'after take down a player reads no version');
SELECT is((SELECT count(*)::int FROM public.golf_practice_plan_lines), 0, 'after take down a player reads no own-work line');
SELECT is((SELECT count(*)::int FROM public.golf_documents WHERE practice_plan_id = '00000000-0000-0000-0000-000000e17701'), 0,
  'after take down a player no longer sees the Documents row');
SELECT is((SELECT state FROM public.golf_practice_plan_cards(ARRAY['00000000-0000-0000-0000-000000e17701']::uuid[])),
  'taken_down', 'the chat card reads Taken down');

-- 10. Documents policies and CHECK ---------------------------------------------------------------
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17101","role":"authenticated"}';
SELECT throws_ok($$INSERT INTO public.golf_documents (team_id, uploaded_by, title, file_url, practice_plan_id)
  VALUES ('00000000-0000-0000-0000-000000e17411', '00000000-0000-0000-0000-000000e17101', 'x', NULL, '00000000-0000-0000-0000-000000e17701')$$,
  '42501', NULL, 'a coach cannot insert a plan row in Documents directly');
SELECT lives_ok($$INSERT INTO public.golf_documents (team_id, uploaded_by, title, file_url)
  VALUES ('00000000-0000-0000-0000-000000e17411', '00000000-0000-0000-0000-000000e17101', 'Range rules', 'https://example.test/rules.pdf')$$,
  'a coach still uploads an ordinary file row');
RESET role;
SELECT throws_ok($$INSERT INTO public.golf_documents (team_id, title, file_url) VALUES ('00000000-0000-0000-0000-000000e17411', 'x', NULL)$$,
  '23514', NULL, 'a Documents row needs a file or a plan (source CHECK)');
SELECT throws_ok($$INSERT INTO public.golf_documents (team_id, title, file_url, practice_plan_id)
  VALUES ('00000000-0000-0000-0000-000000e17411', 'x', 'https://example.test/a.pdf', '00000000-0000-0000-0000-000000e17701')$$,
  '23514', NULL, 'a Documents row cannot have both');

-- 11. Drill bank ---------------------------------------------------------------------------------
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17101","role":"authenticated"}';
SELECT throws_ok($$INSERT INTO public.golf_team_drills (team_id, name, area, minutes, created_by)
  VALUES ('00000000-0000-0000-0000-000000e17411', ' ladder 3-6-9 ', 'putting', 15, '00000000-0000-0000-0000-000000e17101')$$,
  '23505', NULL, 'drill names are unique per team among unarchived drills, ignoring case and spaces');
SELECT throws_ok($$INSERT INTO public.golf_team_drills (team_id, name, area, minutes, created_by, media_url)
  VALUES ('00000000-0000-0000-0000-000000e17411', 'Gate drill', 'putting', 15, '00000000-0000-0000-0000-000000e17101', 'http://example.test/v')$$,
  '23514', NULL, 'a drill media link must be https');
SELECT throws_ok($$INSERT INTO public.golf_team_drills (team_id, name, area, minutes, created_by, diagram)
  VALUES ('00000000-0000-0000-0000-000000e17411', 'Spiral', 'putting', 15, '00000000-0000-0000-0000-000000e17101', 'spiral')$$,
  '23514', NULL, 'a drill diagram is one of the presets');
SELECT throws_ok($$DELETE FROM public.golf_team_drills WHERE id = '00000000-0000-0000-0000-000000e17801'$$,
  '42501', NULL, 'drills are archived, never deleted');
SELECT lives_ok($$UPDATE public.golf_team_drills SET archived_at = now() WHERE id = '00000000-0000-0000-0000-000000e17801'$$,
  'a coach archives a drill');
SELECT lives_ok($$INSERT INTO public.golf_team_drills (team_id, name, area, minutes, created_by)
  VALUES ('00000000-0000-0000-0000-000000e17411', 'Ladder 3-6-9', 'putting', 15, '00000000-0000-0000-0000-000000e17101')$$,
  'an archived name can be used again');
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17104","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_team_drills), 0, 'players do not read the team drill bank (owner call 12)');

-- 12. Saved groups and templates -----------------------------------------------------------------
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17101","role":"authenticated"}';
SELECT throws_ok($$INSERT INTO public.golf_practice_groups (team_id, name, player_ids, created_by)
  VALUES ('00000000-0000-0000-0000-000000e17411', 'Short game', ARRAY['00000000-0000-0000-0000-000000e17303']::uuid[], '00000000-0000-0000-0000-000000e17101')$$,
  '42501', NULL, 'a saved group holds only this team''s players');
SELECT lives_ok($$INSERT INTO public.golf_practice_groups (team_id, name, player_ids, created_by)
  VALUES ('00000000-0000-0000-0000-000000e17411', 'Short game', ARRAY['00000000-0000-0000-0000-000000e17301']::uuid[], '00000000-0000-0000-0000-000000e17101')$$,
  'a coach saves a group of their players');
SELECT lives_ok($$INSERT INTO public.golf_practice_templates (team_id, kind, name, body, minutes, created_by)
  VALUES ('00000000-0000-0000-0000-000000e17411', 'session', 'Tuesday standard', (SELECT j FROM fx WHERE k = 'tpl_ok'), 20, '00000000-0000-0000-0000-000000e17101')$$,
  'a coach saves a session template with no people in it');
SELECT throws_ok($$INSERT INTO public.golf_practice_templates (team_id, kind, name, body, minutes, created_by)
  VALUES ('00000000-0000-0000-0000-000000e17411', 'session', 'With players', (SELECT j FROM fx WHERE k = 'tpl_people'), 20, '00000000-0000-0000-0000-000000e17101')$$,
  '23514', NULL, 'a template cannot hold players');
SELECT throws_ok($$INSERT INTO public.golf_practice_templates (team_id, kind, name, body, minutes, created_by)
  VALUES ('00000000-0000-0000-0000-000000e17411', 'block', 'With coach', (SELECT j FROM fx WHERE k = 'tpl_coach'), 20, '00000000-0000-0000-0000-000000e17101')$$,
  '23514', NULL, 'a template cannot hold an assigned coach');

-- 13. Make-ups -----------------------------------------------------------------------------------
SELECT throws_ok($$SELECT public.golf_practice_makeup_create('00000000-0000-0000-0000-000000e17701', '00000000-0000-0000-0000-000000e17302',
  ((now() AT TIME ZONE 'Pacific/Honolulu')::date - 1), 'Make-up', (SELECT j FROM fx WHERE k = 'solo_p2'))$$,
  'P0001', 'practice_makeup_due', 'a make-up cannot be due before today on the team clock (trimmed zone)');
SELECT lives_ok($$SELECT public.golf_practice_makeup_create('00000000-0000-0000-0000-000000e17701', '00000000-0000-0000-0000-000000e17302',
  ((now() AT TIME ZONE 'Pacific/Honolulu')::date + 2), 'Make-up: putting', (SELECT j FROM fx WHERE k = 'solo_p2'))$$,
  'a coach makes a make-up for one player of the team');
RESET role;
UPDATE public.golf_practice_plans SET id = '00000000-0000-0000-0000-000000e17702' WHERE kind = 'makeup'
  AND for_player_id = '00000000-0000-0000-0000-000000e17302';
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17101","role":"authenticated"}';
SELECT is((SELECT document_id FROM public.golf_practice_plan_publish('00000000-0000-0000-0000-000000e17702', 1, '[]', true)), NULL::uuid,
  'publishing a make-up files nothing in Documents (owner call 9)');
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17104","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_practice_plan_versions WHERE plan_id = '00000000-0000-0000-0000-000000e17702'), 0,
  'another player cannot read someone''s make-up');
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17105","role":"authenticated"}';
SELECT is((SELECT count(*)::int FROM public.golf_practice_my_makeups('00000000-0000-0000-0000-000000e17411')), 1,
  'the player sees their own make-up');
SELECT isnt((SELECT public.golf_practice_makeup_complete('00000000-0000-0000-0000-000000e17702', true)), NULL::timestamptz,
  'the player marks their make-up done');

-- 14. Anon, cascades, publication ----------------------------------------------------------------
RESET role;
SET LOCAL role TO anon;
SELECT throws_ok($$SELECT count(*) FROM public.golf_practice_plan_versions$$, '42501', NULL, 'anon cannot read versions');
RESET role;
SELECT is((SELECT count(*)::int FROM pg_catalog.pg_publication_tables WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public' AND tablename IN ('golf_practice_plans', 'golf_practice_plan_versions', 'golf_practice_plan_lines', 'golf_practice_plan_opens')), 2,
  'plans and versions are in Realtime; lines and opens are not');
SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub":"00000000-0000-0000-0000-000000e17102","role":"authenticated"}';
SELECT lives_ok($$DELETE FROM public.golf_practice_plans WHERE id = '00000000-0000-0000-0000-000000e17701'$$,
  'any coach of the team may delete a plan');
RESET role;
SELECT is((SELECT count(*)::int FROM public.golf_practice_plan_versions WHERE plan_id = '00000000-0000-0000-0000-000000e17701')
  + (SELECT count(*)::int FROM public.golf_practice_plan_lines WHERE plan_id = '00000000-0000-0000-0000-000000e17701')
  + (SELECT count(*)::int FROM public.golf_practice_plan_opens WHERE plan_id = '00000000-0000-0000-0000-000000e17701')
  + (SELECT count(*)::int FROM public.golf_documents WHERE practice_plan_id = '00000000-0000-0000-0000-000000e17701'), 0,
  'deleting a plan removes its versions, lines, opens and Documents row');
SELECT is((SELECT source_plan_id FROM public.golf_practice_plans WHERE id = '00000000-0000-0000-0000-000000e17702'), NULL::uuid,
  'a make-up outlives the plan it was made from');

SELECT * FROM finish();
ROLLBACK;
```

Notes on the cases:
- `plan(91)` counts the assertions above. A case added or removed must change it, since a miscount fails the suite.
- The `ok` body puts H on block 1, so the publish-by-H case proves the caller is never told about their own publish, and the publish-by-assistant case proves an assigned coach is told (owner call 13).
- The drill bank cases include the diagram preset CHECK added for the print redesign (4.14).
- Case 13's dates use the zone the fixture stored with spaces around it, so the case fails if the function stops trimming. The America/New_York fallback is covered by the unit test of the action's date helper (11.1), which shares the rule.
- `anon` has no grant on any of the four tables, so a read is a privilege error (42501), not an empty result.

### 8.13 Schema mirror (same PR as the migrations)

The repository keeps a declarative mirror of the database under `supabase/schemas/`. Each held migration's objects go in the same files the dump would put them in, so the mirror matches the database the moment the block is applied:

| object | file |
| --- | --- |
| the six new tables (`golf_practice_plans`, `_versions`, `_lines`, `_opens`, `golf_team_drills`, `golf_practice_groups`, `golf_practice_templates`) and `golf_documents.practice_plan_id`, `file_url` nullable | `supabase/schemas/golf/10_tables.sql` |
| primary keys, uniques, FKs and CHECKs, including `golf_documents_source_check` | `supabase/schemas/golf/20_constraints.sql` |
| indexes, including the partial uniques | `supabase/schemas/golf/30_indexes.sql` |
| table grants | `supabase/schemas/golf/95_grants.sql` |
| RLS policies, and the two recreated `golf_documents` policies | `supabase/schemas/policies/golf.sql` (the originals are at `:633` and `:637`) |
| `ENABLE ROW LEVEL SECURITY` | `supabase/schemas/policies/rls_enable.sql` |
| the 17 functions | `supabase/schemas/functions/public.sql` |
| function grants | `supabase/schemas/functions/95_grants.sql` |
| table comments (one line each, from the WHY lines) | `supabase/schemas/golf/90_comments.sql` |

The mirror is hand-written in the dump's quoting style. It is regenerated from the database when the block is applied, and the diff must be empty apart from whitespace.

**Typecheck while held.** `src/types/database.types.ts` is generated from production, so it has none of the new tables or functions until the block is applied, and `golf_documents.file_url` stays typed `string`. The code must compile in both states:
- `src/lib/golf/practice-db.ts` declares local row types (`PracticePlanRow`, `PracticePlanVersionRow`, `PracticeLineRow`, `PracticeOpenRow`, `TeamDrillRow`, `PracticeGroupRow`, `PracticeTemplateRow`) that match the SQL above, and one helper, `practiceTables(supabase)`, which returns the client cast once to a typed shape for those tables. No other file casts.
- RPC calls use the house pattern for functions missing from the generated types (`player-profiles.ts:60-63`): the function name and arguments are passed `as never` and the result is parsed with a local guard.
- Documents readers compare `file_url` against null even though the type says `string`, which compiles in both states (0.4).
- After the block is applied and types are regenerated, a follow-up PR deletes the local row types and the cast. It is listed in the changelog's "Needs another plan".

### 8.14 Loaders (server, read-only)

All loaders run on the server with the user's client (RLS applies). Each returns a typed model and never throws for "no rows". Each treats the missing-table and missing-function errors of 0.5 (`PGRST205`, `PGRST202`, `42P01`, `42883`) as "Practice unavailable" and returns `{ unavailable: true }`: the practice routes show CH-17201 with "Practice isn't set up yet for this team.", and Calendar, Home and the chat card render nothing. A flag turned on before the block is applied therefore never crashes a page.

| loader | file | reads | returns |
| --- | --- | --- | --- |
| `loadPracticeHome(teamId, role)` | `src/clubhouse/data/practice-home.ts` | practice events in the team-zone week (the calendar's query, `data/calendar.ts:129`), plans for those events, live versions, own-lines count (player), opens count (coach), templates count | the week strip, the next practice, drafts with "Edits not published", make-ups due (player) |
| `loadPracticePlan(planId, viewer)` | `src/clubhouse/data/practice-plan.ts` | coach: the plan row, its live version, its versions list (for What changed), opens joined to roster names, saved groups, staff; player: the live version and their own lines | `PlanPageModel`: body, clock anchor, `pathFor` for the viewer, Seen by (coach), state chips |
| `loadPlanGlances(eventIds)` | `src/clubhouse/data/practice-plan.ts` | live versions of up to 50 event ids (coach: plan rows too, for drafts) | per event: glance data (title, facts line, block rows with start, title and place), state (none, draft, published, edits not published) |
| `loadCalendarPlanStates(teamId, from, to)` | `src/clubhouse/data/calendar.ts` (added beside the event query) | the same, keyed by event id, for the visible calendar range | the glyph and the Plan row state (4.17) |
| Home additions | `src/clubhouse/data/home.ts` | `loadPlanGlances` for today's and tomorrow's practices | the Now/Next card source (4.12) |
| `loadDrillBank(teamId, filters)` | `src/clubhouse/data/practice-library.ts` | team drills (coach) and `golf_drills` (everyone signed in), mapped to the plan areas (4.7) | one list with `src` on each row |

The chat card does not use a loader. `Messages.tsx:109` already batches structured-message reads per page; the card batch calls `golf_practice_plan_cards` once per page with the plan ids on screen.

### 8.15 Server actions

Three new files under `src/app/golf/actions/`, each `'use server'`, with every export wrapped in `withAdminObserved` (`src/lib/admin/observed-action.ts`, Impl plus delegator, as `message-polls.ts:136-137`). The global coverage tripwire (`src/lib/admin/__tests__/coverage-contract.foundation.test.ts:205-226`) discovers new files under `src/app/golf/actions/**` by itself and fails on any unwrapped export, so this is enforced, not optional.

**Feature registry.** Add a GolfHelm feature to `src/lib/admin/feature-registry.ts`:
- `FeatureKey` gains `'practice_plans'` (the GolfHelm comment count goes from 24 to 25).
- Entry: `{ key: 'practice_plans', label: 'Practice plans', app: 'golfhelm', actions: { 'src/app/golf/actions/practice-plans.ts': 'ALL', 'src/app/golf/actions/practice-publish.ts': 'ALL', 'src/app/golf/actions/practice-library.ts': 'ALL' }, primaryTable: 'golf_practice_plans', heartbeatTable: null, tier: 'med', seasonalEmpty: true, healthSignal: 'Saves and publishes succeed; push fan-out errors logged under CH-17205.' }`.
- `heartbeatTable` is null while the block is held, because `src/test/lib/admin/feature-registry-heartbeats.test.ts:80-95` fails on a heartbeat table missing from the generated types. The type-regeneration PR sets it to `golf_practice_plan_versions` (a publish is the signal that matters).
- `src/lib/admin/__tests__/feature-registry.test.ts:254-256` asserts 87 entries; it becomes 88. The "total manifest size stays above its floor" test needs no edit (it is a floor).

**`practice-plans.ts`** (feature `practice_plans`):

| action | does | errors (4.18) |
| --- | --- | --- |
| `savePracticePlan({ eventId?, planId?, expectedVersion, title?, step?, body })` | parses and runs `validatePlan` (errors refuse, warnings pass), then rpc `golf_practice_plan_save`; returns `{ planId, version, updatedAt }` | stale: the CH-17505 dialog; all-day: CH-17110; limits: CH-17109; anything else (forbidden or a body token): CH-17001 after three tries, with the token logged |
| `setPracticePlanVariant({ planId, expectedVersion, variant })` | rpc `golf_practice_plan_set_variant`, after the CH-17503 confirm; then opens the Republish sheet | stale: CH-17505; failure: CH-17001 |
| `deletePracticePlan({ planId })` | after the CH-17501 confirm, reads the live version's recipients, deletes the row under RLS (the cascade removes versions, lines, opens and the Documents row), then, if it was published, sends the take-down notice to those recipients in `after()` | CH-17008 |
| `practicePlanDeleteCount({ eventIds })` | for the Calendar's delete confirms CH-6501 and CH-6506 (4.17): how many of these events have a plan, and how many are published | none (the sentence is left off if the count fails) |
| `listCopyablePlans({ teamId })` | the 20 most recent plans of the team, for "Copy a past plan" | none |
| `createMakeup({ sourcePlanId, playerId, dueOn, title, body })`, `completeMakeup({ planId, done })` | rpc wrappers (slice 7) | CH-17009, CH-17010 |
| `recordPracticePlanOpen({ planId })` | rpc `golf_practice_plan_record_open`, called once per page view by the player page after paint; never awaited by the render | none (silent) |

**`practice-publish.ts`** (feature `practice_plans`):

| action | does |
| --- | --- |
| `publishPracticePlan({ planId, expectedVersion, changes, notify, postToChat })` | re-reads the draft, re-runs `validatePlan` and refuses on errors; computes `changes` on the server with `diffVersions(liveBody, draftBody)` (the client's list is only a preview); calls rpc `golf_practice_plan_publish(planId, expectedVersion, changes, notify)`; on first publish with `postToChat`, posts the card (below); then schedules the fan-out in `after()`; revalidates `/golf/dashboard/practice`, the plan page, the calendar and `/golf/dashboard/documents` |
| `takeDownPracticePlan({ planId, expectedVersion })` | rpc `golf_practice_plan_take_down`; fan-out of the take-down notice in `after()` |
| `postPlanCard({ planId })` | finds the team chat (the team's first `is_team_chat` conversation by `created_at`, the rule `data/home.ts:315` already uses on phase2); refuses with "You're not in team chat" if the coach is not a participant; inserts the message with the user client (`kind 'practice'`, `payload { plan_id, v: 1 }`, fallback `content`), then rpc `golf_practice_plan_set_chat_message`. It does **not** call `notifyGolfMessageRecipients` (`golf-message-fanout.ts:32`): the publish notice already reached the players (owner call 14) |

Publish errors map to: problems found by `validatePlan`, CH-17115 (with CH-17116 for an empty plan); `practice_plan_all_day`, CH-17110; `practice_plan_event_cancelled`, CH-17117; stale, the CH-17505 dialog; anything else, CH-17002 (first publish) or CH-17003 (republish). Take down failure is CH-17004. A card that fails to post after a good publish is CH-17014 with "Post again", which calls `postPlanCard` alone. Success is CH-17019 or CH-17020, with the counts taken from `recipients`.

**The fan-out** (inside `after()`, never blocking the response):
- **Who.** The `recipients` array the RPC returned. A republish with "Tell players" off, or with only wording changes (`diffVersions` says `wordingOnly`), sends nothing. A republish with "Only affected players" on filters recipients to the player ids `diffVersions` reports as affected, plus assigned coaches whose blocks changed.
- **Push.** `src/lib/notifications/types.ts` gains the type `'practice_plan'`. `push.ts` gains:
  - a `pushDeliveryKeyFor` case (`push.ts:40-72`) mapping `practice_plan` to the existing `push_events` delivery key, so the player's "Events" push switch governs it;
  - a `generatePushPayload` case (`push.ts:97`) building the title and body from 4.11's wording, with `url` set to the plan page;
  - one `sendBulkPushNotification(type, userIds, data)` call (`push.ts:585`), which sends per user through `sendPushNotification` (`push.ts:287`, queued when the Helm queue is on) and returns `{ sent, failed }`. A non-zero `failed` is logged with `logServerError` (`src/lib/server-error-logger.ts:825`) under CH-17205; one failure never stops the rest.
- **Bell.** One `recordInAppNotification` call (`in-app.ts:33-79`) with every recipient's user id, `type: 'event_reminder'`, the title and body of 4.11, `actionUrl` the plan page, and `data: { kind: 'practice_plan', plan_id, version, action: 'published' | 'updated' | 'taken_down' }`. `categorizeNotificationRow` (`src/app/golf/actions/unified-notifications-model.ts:104-119`) already files an `event_reminder` row with no other tag under Events, so the bell needs no code change. Reusing an enum value keeps the `notifications.type` enum (`public.notification_type`) unchanged, so there is no migration. The helper is best-effort by contract (it logs and swallows), which matches a fan-out that must never fail the publish.
- **No double sends.** `after()` runs once and Next.js does not retry it. A fan-out lost to a crash is logged, never replayed, so nobody gets the same notice twice. The published plan is still on Practice, Home and the calendar for anyone who missed the notice.

**`practice-library.ts`** (feature `practice_plans`): drill bank CRUD (`createTeamDrill`, `updateTeamDrill`, `archiveTeamDrill`, `restoreTeamDrill`, `copyLibraryDrill`), saved groups (`saveGroup`, `renameGroup`, `deleteGroup`), templates (`saveTemplate`, `renameTemplate`, `deleteTemplate`, `applyWeekTemplate` in slice 6). Each writes with the user client under RLS, sets `updated_by` and `updated_at`, and maps `23505` to the "name in use" copy and `23514` to the field error in 4.18.

**Error mapping.** One table in `src/lib/golf/practice-errors.ts` maps every SQL token in 8.7 to 8.10 to a catalog code and its copy. A unit test asserts that every `RAISE EXCEPTION '…'` token in the migration files has a row, by reading the files, so a new token cannot ship unmapped.

---

## 9. Files

### 9.1 New

**Routes** (all under `src/app/golf/(dashboard)/dashboard/practice/`, each with a `loading.tsx` returning the Clubhouse skeleton, CH-17401 to 17404, and each gated as 0.2):
- `page.tsx`, `drills/page.tsx`, `drills/[drillId]/page.tsx`, `groups/page.tsx`, `templates/page.tsx`
- `plan/[planId]/page.tsx`, `plan/[planId]/edit/page.tsx`, `print/[planId]/page.tsx`, `makeup/[planId]/page.tsx` (slice 7)

**Route composition:** `src/clubhouse/routes/practice.tsx` (reads role, team, zone and the flag, calls the loaders, picks the coach or player screen; the shape of `routes/calendar.tsx`).

**Screens** (`src/clubhouse/screens/practice/`):

| file | what |
| --- | --- |
| `model.ts` | `PlanBodyV2` types, `parsePlanBody`, `validatePlan`, `autoGrid`, `pathFor`, `diffVersions`, `mixMinutes`, `bringList`, `splitEvenly`, `ribbon` (8.1). Pure, no React |
| `starters.ts` | the six starters as `PlanBodyV2` layouts with no people (4.16) |
| `PracticeHome.tsx`, `PlayerPracticeHome.tsx` | 4.1, 4.2 |
| `NewPlanSheet.tsx` | 4.3 (`FormSheet`) |
| `Builder.tsx`, `BuilderPhone.tsx` | the frame: header, step `Segmented`, ribbon, mix bar, autosave status, three panes or one column (4.4, 4.9) |
| `StepBlocks.tsx`, `BlockCard.tsx`, `BlockInspector.tsx`, `RotationGrid.tsx` | 4.5 |
| `StepGroups.tsx`, `GroupChip.tsx` | 4.6 |
| `StepDrills.tsx`, `DrillBank.tsx`, `DrillForm.tsx`, `DrillPage.tsx` | 4.7 |
| `StepReview.tsx` | 4.8 |
| `TimeRibbon.tsx`, `MixBar.tsx` | the live total and the skill, random and pressure mix |
| `PlanPage.tsx`, `PlanGlance.tsx`, `NowNext.tsx`, `RunView.tsx` | 4.10, 4.12; `PlanGlance` is shared with N-10 (0.4 item 5) |
| `PublishSheet.tsx`, `WhatChanged.tsx`, `SeenBy.tsx` | 4.11 |
| `PrintStudio.tsx`, `PrintPages.tsx`, `PrintMasthead.tsx`, `RangeBoard.tsx`, `PocketCards.tsx`, `DrillsAppendix.tsx` | 4.14; `PrintMasthead` is shared with the share image |
| `DrillDiagram.tsx` | the seven set-up diagram presets as inline SVG (4.14), also on the drill page and the drill form's picker |
| `PlanQr.tsx` | the QR code as inline SVG from the `qrcode` package (owner call 17) |
| `ShareSheet.tsx` | 4.15 |
| `Templates.tsx`, `SavedGroups.tsx` | 4.16, 4.6 |
| `MakeupPage.tsx`, `MakeupAsk.tsx` | 4.19 (slice 7) |
| `use-autosave.ts`, `use-plan-live.ts` | debounced version-checked saves with the offline queue; the Realtime subscription that waits for a drop before applying |

**Messages card:** `src/clubhouse/screens/messages/PlanCard.tsx` (4.13).

**Data:** `src/clubhouse/data/practice-home.ts`, `src/clubhouse/data/practice-plan.ts`, `src/clubhouse/data/practice-library.ts` (8.14).

**Actions:** `src/app/golf/actions/practice-plans.ts`, `practice-publish.ts`, `practice-library.ts` (8.15).

**Shared helpers:** `src/lib/golf/practice-db.ts` (row types and `practiceTables`, 8.13), `src/lib/golf/practice-errors.ts` (SQL token to catalog code), `src/lib/golf/practice-fanout.ts` (the push and bell send, called from `after()`).

**Styles:** `src/clubhouse/styles/practice.css` (screens), `src/clubhouse/styles/plan.css` (the plan page and print; `@page ch-plan-wide` and `ch-plan-tall`).

**Database:** the nine migrations `supabase/migrations/20261026010000_…` to `20261026010800_…` (8.2 to 8.10) and `supabase/tests/rls/golf_practice_plans.sql` (8.12).

**Docs:** `docs/clubhouse/catalog/practice.md` (catalog page 17).

### 9.2 Changed

| file | change | section |
| --- | --- | --- |
| `src/clubhouse/shell/nav.ts` | Practice item, phone tabs, rebuilt routes and children, five `PUSHED_BELOW` entries, `phoneFullScreen`, gates argument | 0.1 A, 0.2 |
| `Sidebar.tsx`, `SectionStrip.tsx`, `section-switch.tsx`, `command/commands.ts`, `command/CommandLayer.tsx`, `command/ShortcutsSheet.tsx`, `command/shortcuts.ts`, `Notices.tsx` | pass the nav gates | 0.1 A |
| `command/shortcuts.ts` and `shortcuts.test.ts` | `practice: 'p'`; digit order; test for both flag states | 0.1 A |
| `src/clubhouse/data/shell.ts` | `practiceOn` | 0.1 A |
| `src/clubhouse/screens/calendar/inspector.tsx`, `views.tsx`, `Calendar.tsx`, `CalendarPhone.tsx`, `src/clubhouse/data/calendar.ts` | Plan row, glyph, `then=practice` return, delete-count sentences, `loadCalendarPlanStates` | 0.1 C, 4.17 |
| `src/clubhouse/screens/home/DayCard.tsx`, `Week.tsx`, `PlayerHome.tsx`, `PlayerHomePhone.tsx`, `src/clubhouse/data/home.ts` | plan lines; `MakeupAsk` in slice 7 | 0.1 D |
| `src/clubhouse/data/hub.ts`, `src/clubhouse/screens/hub/TeamHub.tsx`, `parts.tsx` | the null-safe Documents shim | 0.4 |
| `src/app/golf/(dashboard)/dashboard/documents/page.tsx`, `src/app/golf/actions/event-documents.ts`, `src/app/golf/actions/announcements.ts`, Fairway `EventFilePicker` | `.not('file_url', 'is', null)` on list reads | 0.4 |
| `src/clubhouse/screens/messages/MessagesView.tsx`, `Messages.tsx`, `model.ts`, `src/hooks/golf/use-golf-messages.ts` | render `kind 'practice'`; inbox preview "Practice plan" | 0.1 F, 4.13 |
| `src/lib/notifications/types.ts`, `push.ts` | `practice_plan` type, delivery key, payload | 0.1 G, 8.15 |
| `src/lib/admin/feature-registry.ts`, `src/lib/admin/__tests__/feature-registry.test.ts` | `practice_plans` feature; 87 to 88 | 8.15 |
| `config/feature-flags.yml`, `src/lib/flags/registry.generated.ts` | the flag | 0.5 |
| `package.json`, `package-lock.json` | add `qrcode@1.5.4` (MIT, no network; owner call 17) | 4.14 |
| `scripts/clubhouse/check.mjs`, `docs/clubhouse/catalog/README.md` | catalog page 17 | 4.18 |
| `supabase/migrations/HELD.md` | nine rows | 8.11 |
| `supabase/schemas/golf/10_tables.sql`, `20_constraints.sql`, `30_indexes.sql`, `90_comments.sql`, `95_grants.sql`, `supabase/schemas/policies/golf.sql`, `rls_enable.sql`, `supabase/schemas/functions/public.sql`, `95_grants.sql` | the mirror | 8.13 |

Not changed: `golf_events`, `golf_rounds`, `golf_holes`, `golf_shots`, any trigger, `golf_messages` constraints (`'practice'` is already in `golf_messages_kind_check`, `10_tables.sql:1131`), the `notification_type` enum, BaseballHelm.

---

## 10. Edge cases

| Case | What happens |
| --- | --- |
| Two coaches edit at once | Every save carries the version. The second save gets `practice_plan_stale` and the CH-17505 dialog ("Load latest", or "Keep mine" on desktop, which reloads and re-applies the local body as a new save). A Realtime update for the builder waits for the drop or Escape before it lands. |
| A second coach creates the plan for the same event at the same moment | The unique index and `ON CONFLICT DO NOTHING` make one win; the other gets stale and loads the winner's plan. |
| Autosave offline | Changes stay in the tab (CH-17901), retried with backoff when back online; after three failures CH-17001. Publish is disabled offline. |
| The event's time moves on Calendar after publish | The clock follows the event at once for the coach and, on the next read, for players (the version stores `eventStart` for What changed only; the page uses the event's live time). The builder shows "Practice moved on the calendar. Republish to tell players." and What changed lists the move (1.3). |
| The event becomes all-day | Saves still work by plan id; Publish is refused with CH-17110. |
| The event is cancelled | Publish is refused (CH-17117); the live version stays readable; the card reads "Practice cancelled". |
| The event is deleted | The plan, versions, lines, opens and the Documents row cascade (owner call V1-5 warns with a count first). The chat card reads "This plan was deleted". A push or bell link to it lands on Practice home with CH-17302-style empty copy. |
| The event's type changes away from practice | The plan stays and is still reachable by id; the Calendar Plan row hides (it shows only on practice events). A new plan cannot be started on that event. |
| A recurring practice series | Each occurrence is its own event and gets its own plan. "Copy a past practice" and week templates fill the rest. The time-move confirm says only this practice moves (CH-17509 series copy) because `updateGolfEvent` updates one row (`calendar-events.ts:942`; to verify, see Uncertain in the report). |
| A player leaves the team after publish | `is_golf_team_player` turns false: they lose the version, their lines and the Documents row. They stay in the draft body until the next save, which refuses them (`practice_plan_player_not_on_team`); the builder shows them struck through with "No longer on the team" and drops them on the next edit, then asks for a republish. |
| A player joins after publish | Not in the plan; their plan page shows "Everyone" with CH-17305. The Groups step lists them as not in a group (CH-17105 warning). |
| A coach leaves the staff | The next save is refused with `practice_plan_coach_not_on_staff`; the builder marks their blocks "Coach no longer on staff" and clears the assignment on the next edit. Published versions keep the name as frozen text. |
| A team drill is archived | Drafts keep the reference (check_body accepts archived drills of the team); the bank hides it; published versions keep the frozen card. Restoring it is one tap on the drill page. |
| A library drill is removed from `golf_drills` | The draft's next save is refused (`practice_plan_drill`); the builder shows the drill as missing with "Pick another". Frozen cards in published versions are unaffected. |
| Plan limits | 40 blocks, 8 stations, 6 groups, 60 players, 6 hours, 192 KB body: CH-17109 before the server sees it; SQL refuses the same limits. |
| Stations `len` out of step with turns | `validatePlan` refuses (8.1); SQL checks only ranges. |
| Rain layout active and the coach deletes the rain layout | The save is refused (`practice_plan_rain_active`); the menu offers "Back to main plan" first. |
| Take down while a player has the page open | Realtime sends nothing (RLS hides the row), so the page updates on the next refresh, focus or pull; the take-down notice reaches them anyway (8.9). |
| Republish with only wording changes | `diffVersions` reports wording only; no one is told; the toast says "Republished. No one was told." |
| Publish succeeds but the chat card fails | Publish stands; CH-17014 with "Post again". |
| Publish succeeds but push fails | Publish stands; the failure is logged (CH-17205). The bell row is written separately, best-effort. |
| The coach is not in team chat | The chat toggle reads "You're not in team chat" and is off. |
| The team has more than one team chat | The first by `created_at` is used, as Home does (`data/home.ts:315`). |
| A teammate's classes | Arrival warnings name the player and the time but never the class, on screen and in print page 2 (owner call V1-4). |
| Team zone missing or bad | The team zone falls back to America/New_York (`season.ts:60`); make-up due dates use the same rule in SQL (8.10). |
| Daylight saving change inside a practice | Block starts are minutes from the event's start instant, formatted in the team zone, so an evening across a change still reads correctly. |
| Text Size at the largest setting | The builder's three panes collapse to the phone layout below 821px of available width; the rotation grid scrolls inside its own box and never the page (7.3). |
| Flag turned off with a builder open | The next action returns `{ ok: false, code: 'off' }` and the page shows CH-17201 with the not-set-up copy on reload; drafts are kept. |
| Team leaves Clubhouse | Routes redirect to Calendar (0.2); Fairway has no Practice UI; published Documents rows stay listed in Fairway's Documents with the reader filter hiding them (they have no file). |
| A deep link to someone else's make-up | The version RLS returns nothing; the page shows CH-17302. |

---

## 11. Tests

### 11.1 Unit (vitest)

- `src/clubhouse/screens/practice/model.test.ts`:
  - `parsePlanBody`: a good body, each wrong type, unknown `v`, extra keys ignored.
  - `validatePlan`: each error and warning code in 4.18 (17101 to 17108, 17114, 17116) with the exact copy, and a Stations `len` mismatch.
  - `autoGrid`: group g at station (g + t) mod S for S from 1 to 8 and groups from 1 to 6, with open cells when groups are fewer than stations; never a group twice in a turn.
  - `pathFor`: a player's stops in order with clock times from a given start, across a daylight saving change, and "Everyone" for a player in no group.
  - `diffVersions`: block added, removed, moved, length changed, coach changed, drill changed, group membership changed, rain switch, event time moved; `wordingOnly` for focus and note edits only; the affected-player set for each.
  - `splitEvenly`: sizes differ by at most one; players with the latest arrivals spread across groups; deterministic for the same input.
  - `mixMinutes`, `bringList` (equipment merged, quantities summed, extras added), `ribbon`.
- `starters.test.ts`: each of the six starters parses, validates with no errors on a 3-hour practice, and has no people (the same rule as the template CHECK).
- `src/lib/golf/practice-errors.test.ts`: every `RAISE EXCEPTION '…'` token in the nine migration files has a row (reads the files).
- `src/clubhouse/shell/nav.test.ts`: `navFor(role)` hides Practice by default; `navFor(role, { practice: true })` shows it after Calendar; phone tabs for both roles in both states.
- `src/clubhouse/shell/command/shortcuts.test.ts` (`:190-198` updated): the nine digits for each role with Practice on (0.1 A) and the old nine with it off; `G P` opens Practice.
- `src/lib/golf/practice-fanout.test.ts`: recipients filtered for "Only affected players"; wording-only sends nothing; one call each to `sendBulkPushNotification` and `recordInAppNotification` with the right title, body, url and `data.kind`.
- `src/lib/notifications/push.test.ts` (existing file, new cases): `practice_plan` maps to `push_events`; the payload deep-links to the plan page.
- `src/lib/admin/__tests__/feature-registry.test.ts`: 88 entries.
- `src/clubhouse/styles/plan-contrast.test.ts`: the computed pairs in 7.1 (kind tints and group tints with ink-900 and ink-500, light and dark) stay at or above 4.5:1, read from `tokens.css`.
- `scripts/clubhouse/check.mjs` (run in CI): catalog page 17 registered; kinds 0 to 5 used in code and named by a test.

### 11.2 Component (vitest and Testing Library)

- `Builder.test.tsx`: step switching keeps edits; autosave sends the version; stale opens CH-17505; offline shows CH-17901.
- `StepBlocks.test.tsx`: 5-minute snap with the `select` haptic; Alt+Up and Alt+Down reorder with the CH-17802 announcement; a Stations block fills its grid.
- `RotationGrid.test.tsx`: arrow keys move between cells; Space picks up and drops a chip; a swap keeps each group once per turn; reduced motion skips the FLIP.
- `StepGroups.test.tsx`: Split evenly asks CH-17508 when groups exist; a saved group applies.
- `StepDrills.test.tsx`: a new drill shows "Saved to your drill bank"; a library copy shows "Copied to your bank".
- `PublishSheet.test.tsx`: first publish counts players and coaches; republish lists What changed and defaults to affected players; wording only says no one will be told; the chat toggle is off when the coach is not in team chat.
- `PlanPage.test.tsx`: sections render in the label column in order (Focus, Groups, Schedule, Drills, Bring, Notes), each label a heading; no day strip, figures, mix bar, kind tags or group chips render; rotation cells read "Group A"; the Late arrival note shows only on the coach's view; the player view opens on "Your practice" with only their own line, and "Everyone" shows the full schedule; the coach view shows Seen by and In Documents as text in the by-line; Now and Next labels during practice, with Now in `--ch-green-600`; Bring ticks persist in `localStorage` and send nothing; take-down deep link opens CH-17502.
- `PlanPrint.test.tsx`: the coach copy renders the masthead (eyebrow with "Coach copy", title, deck, by-line with coaches and version) with no monogram; Focus; Groups with the Late arrival note only when the Arrivals toggle is on; the whole schedule on page 1, with rotation cells reading "Group A" and no Par row, so page 1 ends with the schedule for the sample plan; page 2 opens with the running header and holds Drills, two-column Bring and Notes with writing lines; the footer with the QR caption and "Page x of y"; no day bar, timeline spine, kind tags, group chips, tinted panels or patterns anywhere; the range board holds only the rotation (drill columns, turn rows, "Group A" cells) and no arrivals, notes or own-work lines; pocket cards are one per group, two per landscape sheet, with no colour band; the drills appendix draws the preset `auto` resolves to for each area, in ink only (no fill other than ink, white and the one surface grey).
- `plan-print-css.test.ts`: reads `plan.css` and asserts `--ch-type-k: 1px` on `.ch-plan-print` and `2px` on the range board's title and rotation table under `@media print`; no `--ch-type-11` or `--ch-type-mono` inside `.ch-plan-print`, nothing below `--ch-type-15` inside the range board, and no `print-color-adjust` rule; no raw `font-size` (the house ratchet already enforces it); the two named `@page` rules; and every print rule scoped under `.ch-plan-print` (so Calendar's "Print week" cannot change).
- `PlanCard.test.tsx`: each state from `golf_practice_plan_cards`, and the deleted fallback.
- `calendar-plan-row.test.tsx`: Build plan or Open plan by role and state; the glyph appears only with a published plan.
- `calendar-delete-plans.test.tsx`: CH-6501 and CH-6506 name the plan count.
- `documents-shim.test.tsx`: a row with `file_url` null and `practice_plan_id` set renders as "Plan" and opens the plan page; nothing calls a signed URL for it.

### 11.3 Database

`supabase/tests/rls/golf_practice_plans.sql` (8.12, 91 assertions), run with `npm run test:rls` on a stack with the nine migrations. It must pass before the owner applies the block.

### 11.4 Manual, on device (before the flag turns on)

- iPhone (Capacitor): phone builder, long-press reorder (450ms), steppers, the Run view, share image through `@capacitor/share`, print to PDF from the share sheet.
- iPad in both orientations: the desktop builder at 821px and up, drag with a finger, the grid.
- Desktop Safari, Chrome and Firefox: the coach copy across two and three pages (no block, panel or card split; grid header repeated; correct page x of y), the range board read from ten feet, pocket cards cut to size, a black-and-white copier run, and Save as PDF matching the paper.
- Scan the QR code with a phone signed in to the team (opens the plan) and signed out (goes to sign in).
- VoiceOver: the grid table, the live regions (CH-17801, 17803), the step `Segmented`.

---

## 12. Owner calls (each with a default; the plan is written to the default)

From the design spec (`practice-redesign/DESIGN_SPEC.md`, "Owner calls"):

1. **Nav.** Practice after Calendar in both sidebars; phone first pills coach Home, CoachHelm, Calendar, Practice, Stats; player Home, CoachHelm, Practice, Rounds, Hub. Default: yes.
2. **Published plans in Documents are visible to players.** Default: yes (`is_public` true on publish, false on take down).
3. **Republish tells only the players whose day changed, and the coach can switch it off.** Default: yes ("Only affected players" on, "Tell players" on).
4. **Public link for people outside the team.** Default: not in v1. "Copy link" works for signed-in team members only.
5. **"Team time this week" line for coaches.** Default: on, worded as scheduled time ("14 h 30 scheduled"), with no compliance claim.
6. **Players logging drill results.** Default: later, not in v1.

Kept from v1 (its open calls 4 and 5, which the spec says still stand):

- **V1-4. Arrival times on the range-board print page.** Default: version A, no arrival times or reasons on page 2; arrivals print on page 1 only, marked "Coach copy".
- **V1-5. Deleting a practice that has a plan.** Default: version A, warn with a count on CH-6501 and CH-6506, then cascade.

New in v2:

7. **Groups belong to the plan, not to each block.** Default: one set A to F per plan, used by every Stations block. Why: "You: Group B" stays true all day, and one Groups step is simpler than groups per block. Cost: a coach who wants different groupings for two rotations makes a second plan block with a different station set, or splits groups. Reversible later by adding per-block group overrides to the body without a migration.
8. **Drill media is a link, not an upload.** Default: an https photo or video link. Upload needs a bucket and storage policy; later.
9. **Make-ups are never filed in Documents and never posted in chat.** Default: yes. Who missed practice is not for the whole team.
10. **Shortcut letter `p` and the digit shift.** Default: `G P` for Practice and Cmd or Ctrl 4, which moves Messages to 5 and drops the ninth item's digit (coach Qualifiers, player My stats; both keep their `G` letters). Alternative: put Practice at the end of the digit order so no existing digit moves; the sidebar order would then differ from the digit order.
11. **Own-work lines are private to each player.** Default: yes (own table, per-player RLS). The coach sees all.
12. **The team drill bank is coach-only.** Default: yes. Players see drills only as frozen into published plans, under "Team drills".
13. **Publish also tells the coaches assigned in the plan.** Default: yes, never the coach who pressed Publish.
14. **The team chat card does not send its own message push.** Default: yes. The publish notice already went out; a second "Message from Coach" push for the same act would be a double notice.
15. **Every coach on the team's staff, assistants included, can build, publish, republish, take down and delete.** Default: yes (`is_golf_team_coach`, as v1). Alternative: head coach only for Publish and Delete (`is_golf_team_head_coach`), at the cost of the assistant who runs Tuesday's practice not being able to publish it.
16. **Release flag `golf_practice_plans`.** Default: production off until the nine migrations are applied, pgTAP passes and slices 1 to 5 are built.
17. **A QR code on the printed coach copy, and the `qrcode` package to draw it.** Default: yes. The code holds only the plan page's address, which opens only for signed-in team members; it is drawn on the device as SVG (no image service). It adds one small MIT dependency (`qrcode@1.5.4`). Alternative: print the short address only.

Settled and not reopened: CoachHelm does not write plans (Q-W5); no AI anywhere in Practice; no pushes beyond Publish, Republish and Take down (the owner override at the top).

---

## 13. Build order (thin slices)

Every slice is behind `golf_practice_plans` and `golf_clubhouse_ui`. Slices 1 to 5 are the first release (1.1). The owner turns the flag on in production only after the block is applied and slice 5 is merged.

**Slice 0: migrations written, flag, catalog. No user-visible change.**
- The nine held migrations, HELD.md rows, pgTAP, the schema mirror (8.2 to 8.13).
- `model.ts` and `starters.ts` with their unit tests.
- `practice-db.ts`, `practice-errors.ts` and its token test.
- The flag (0.5) and `npm run flags:generate`.
- Catalog page 17 registered (4.18).
- `feature-registry.ts` entry (8.15).
- Ships safely: nothing routes to it, and nothing reads the new tables.

**Slice 1: the tab and the first builder step.**
- Nav item, phone tabs, shortcuts, the nav gates through the nine callers (0.1 A), `ChShellData.practiceOn`.
- Routes `page.tsx`, `plan/[planId]/page.tsx` (coach draft view) and `plan/[planId]/edit/page.tsx`, with gates and `loading.tsx`.
- Coach and player Practice homes (player: empty states only until slice 3).
- New plan sheet, including "New practice" through the calendar form and "Copy a past practice".
- Builder frame (desktop and phone), step 1 Blocks with all five kinds, the rotation grid, ribbon, mix bar, autosave and stale handling.
- Session templates and the six starters.
- `savePracticePlan`, `listCopyablePlans`, template actions.

**Slice 2: Groups and Drills.**
- Step 2 Groups with Split evenly and saved groups (`/practice/groups`).
- Step 3 Drills, the drill bank and drill page (`/practice/drills`, `/practice/drills/[drillId]`), library copy.
- Block templates.
- `practice-library.ts`.

**Slice 3: Review, publish and everywhere it shows.** Needs PR 2362 merged first (header).
- Step 4 Review; the plan page for both roles in the 4.10 document layout (label column sections, no day strip, mix bar or chips); Your practice first.
- Publish, Take down, Seen by (`recordPracticePlanOpen`).
- The Documents reader filters and the null-safe shim (0.4) land in this PR, before 010400 can be applied.
- Push and bell fan-out; `types.ts` and `push.ts` edits.
- The team chat card (`PlanCard`, `postPlanCard`).
- Calendar Plan row, glyph, time-move confirm, delete-count sentences.
- Home plan lines.
- Delete plan.

**Slice 4: Republish and the day of practice.**
- Republish with What changed and "Only affected players".
- Now and Next lines, "Rotate in 4 min", the Run view and its shift.
- The rain layout and the switch.
- `use-plan-live.ts` for players and coaches.

**Slice 5: Print and share.**
- Print studio (`/practice/print/[planId]`): the two-page portrait coach copy in the plan page's document layout (page 1 ends with the schedule), the landscape range board of the rotation only, pocket cards two per landscape sheet, the drills appendix with ink-only set-up diagrams; no day bar, chips or patterns; Save as PDF from the print dialog.
- Share: copy link, the share image in the plan document's type (4.15).

**After the first release:**
- **Slice 6:** week templates and applying a week (CH-17513).
- **Slice 7:** make-ups (`/practice/makeup/[planId]`, `MakeupAsk` on Home after N-06's tee-time row and before N-07's "Book a time"). Uses 010800.
- **Slice 8:** recap prefill (a prefilled team message after practice; nothing sends on its own).
- **Slice 9:** planned practice time against strokes lost on team Stats (optional, no migration), shown only above the floors in CH-17307.

**Apply order for the owner:** the nine files in timestamp order in one window, after the slice 3 PR is on main (010400 and 010600 need the Documents reader filters), then `npm run test:rls`, then type regeneration, then the follow-up PR that drops the local row types (8.13) and sets the heartbeat table (8.15).

---

## Research: what is taken from each

Full notes: `practice-redesign/RESEARCH_WEB.md` and `RESEARCH_CODE.md`. The main finding: no Division I or II program publishes a full team plan with stations and rotations, so the format is ours to set; concrete layouts come from academies, high schools and First Tee.

| Source | What it shows | Taken | Not taken |
| --- | --- | --- | --- |
| John Carroll Golf Academy "Rule of Thirds" plan (https://static1.squarespace.com/static/59e510d912abd96b910bcbde/t/59fca642e2c48381d571a5d1/1509729869204/Practice_Plan.pdf) | Category, time, activity tables; 20-minute blocks; technique, variation, competition per area | A starter built on it; the skill, random, pressure mix bar | The blank self-log sheet (players logging is later, spec call 6) |
| First Tee rotation stations (https://firsttee.org/wp-content/uploads/2016/07/NSPLessonPlan-RotationStations.pdf) | Groups of 5 to 6, three stations, fixed-order rotations, equipment list at the top | Stations block with a self-filling grid in fixed order; the bring list at the top of the plan page | Youth-length turns; our default turn is 20 minutes |
| First Tee Indiana game cards (https://firstteeindiana.org/wp-content/uploads/sites/70/2019/04/Chipping-Games.pdf) | Objective, supplies, set-up, how to play, scoring, Par, Birdie, Eagle levels | The drill fields: goal, equipment, setup, scoring, levels | Diagrams (a later drill-page addition) |
| Plainville HS off-season plan (https://sites.google.com/plainvilleschools.org/phs-girls-golf/off-season-plan) | Putting, chipping and range blocks whose minutes add up past the session | The live time ribbon and "past the end" warning (CH-17106) | |
| NFHS high school practice guide (https://nfhs.org/stories/running-a-successful-high-school-golf-practice) | A focus per day; pairing strong with newer players; captains set up stations | The plan focus line; saved groups such as mentor pairs | |
| Keiser University coaches manual (https://keisergolfcenter.com/wp-content/uploads/2025/05/High-School-Coaches-Manual.pdf) | Skills tests with point bands | Scoring rows on drills | A skills-test tracker (out of scope) |
| Adam Young short game plan (https://www.adamyounggolf.com/wp-content/uploads/2021/08/Short-Game-Practice-Plan.pdf) | Practice phases and scored games | Drill kinds (skill, random, pressure) | |
| Golf Digest practice games (https://www.golfdigest.com/story/the-15-best-golf-practice-games) | Named games (Par 18, Gate Crasher, Clock) | Seed names in the starters | |
| HoopsGeek, PracticePlanner, Practice Planner Baseball, football period scripts (RESEARCH_WEB.md, "Tool patterns") | Segment timelines, import from old plans, stations inside a block, time rows by position group | Copy a past practice; import a block; the rotation grid's turns-by-stations table | A share link with no account (spec call 4) |
| CoachNow, Sideline XPS, Sport Session Planner | Templates as bundles, read receipts, clone public drills into my library | Templates, Seen by, "Copy to your bank" | Timed release |
| Teamworks | Academics beside team commitments, countable hours | Class-aware arrivals; the scheduled-time line (spec call 5) | Compliance claims |
| Structured, Sunsama | Vertical timeline, colour per block, planned against actual | Block kinds with tints, the ribbon | Planned against actual (later) |
| BaseballHelm in this repo | Single-lane rail, 5-minute snap, publish notifies | 5-minute snap and keyboard moves | Single lane; auto-notify on every save; the non-atomic replace |

Annoyances the research named, and where the plan answers them: wasted print space (4.14 lays the plan out for paper and flows onto more pages instead of shrinking), drill data lost when added to a plan (frozen cards on publish), totals that don't add up (the ribbon), notification spam and no "what changed" on republish (4.11).

---

## Departs from the handoff

- **Practice is its own tab.** The handoff said "Practice plans: no Clubhouse screen" and v1 hung the plan off Calendar; the owner asked on 2026-10-24 for a tab (the owner override at the top).
- **Publish notifies.** D2-7 in the premium pass audit bans pushes from plan edits. The owner's ask overrides it for exactly three presses (Publish, Republish, Take down). `PREMIUM_PASS_AUDIT` needs a note recording the exception (changelog, "Needs another plan").
- **Child routes instead of `?tab=`.** The spec writes the home tabs as `?tab=`; this plan uses `/practice/drills`, `/practice/groups` and `/practice/templates` so each tab survives reload and Back, and redirects `?tab=` (0.2).
- **A drill page route.** `/practice/drills/[drillId]` is added; the spec opens a drill in a sheet only. The page is what a player reaches from a frozen drill and what a link opens.
- **A make-up route.** `/practice/makeup/[planId]` (slice 7).
- **No team monogram on the plan document.** The first print redraw on 2026-10-25 added one; the rebuild later that day ("this looks vibe coded and shitty", "just simple, modern, premium. apple level") drops it with the rest of the decoration (crest and monogram are also on the owner's "Not building" list), so the plan page, print and share image carry the team name in the eyebrow only. This also matches the announcements screen's rule of no crest or monogram (owner D3-2, `screens/messages/announcements.tsx:197`).
- **No "Fit to one page".** v1 and the spec's first print draft scaled the sheet to fit; v2 flows onto more pages instead, so nothing prints below 8.5pt (range board: 21pt).
- **"Selection haptic"** in the spec is the existing `'select'` kind (`haptics.ts:21`).
- **The drill library has 64 rows in the seed, not 63** (`supabase/migrations_archive/pre_20260527/20260422100001_drill_library_seed.sql`). Production rows were not counted (database read-only and not queried for this plan).
- **v1's model is replaced, not extended.** v1 stored one shared body that players read directly; v2 freezes versions for players and keeps the draft coach-only. v1 was never applied, so there is no data to move.

## Wiring, 4 Nov 2026

Checked against helmv3 `main` 03d9087 (1 Nov), read only. Scope (owner, 4 Nov): only the parts the practice-plan, Ask and Quick chat lanes call. Everything else in this plan (home, week strip, templates gallery, groups tab, Run view, rain, print studio, share image, make-ups, recap, Stats) is **not in this build: minimum prerequisites only**; build it as written when its own slice is scheduled.

**Where the SQL lives.** The nine held migrations `20261026010000` to `20261026010800` exist only as the fenced SQL blocks in 8.2 to 8.10 of this file. No `.sql` file for them is in the package or in the repo (`supabase/migrations/` on 03d9087 ends at `20261028140800`; `HELD.md` has no row for them). Slice 0 copies each block byte for byte into `supabase/migrations/<name>.sql` and adds the 8.11 rows to the register (`HELD.md:155`, "The register"; was cited as :153). One block changed this pass: `golf_practice_plan_public_body` in 8.8 now also drops `why` and `coach_why`. The practice-plan lane adds one held file that extends these tables: `../practice-plan/held-migrations/20261104090000_golf_practice_plan_coach_why_and_draft_row.sql` (coach-only `golf_practice_plans.coach_why`, and `golf_practice_plan_file_draft`, which files a draft as a coach-only Documents row in any folder). Apply it after 010600.

| Element or action | Reads | Writes or calls | Who and RLS | Validation | Success | Failure and rollback | Sync | Notification | Flag | Until held migration runs |
|---|---|---|---|---|---|---|---|---|---|---|
| The practice event (event first) | `golf_events` (`event_type = 'practice'`, `all_day`, `status`, `start_time`, `end_time`, `location`), team zone `loadTeamZone` (`data/season.ts:87`) | Missing event: today's Calendar create (`createGolfEvent`, `src/app/golf/actions/calendar-events.ts:537`, the event confirm of TASK_FIELDS §5.1) before any save | coach; existing `golf_events` policies | all-day refused `practice_plan_all_day` (CH-17110); cancelled refused at publish (CH-17117); not a practice `practice_plan_not_practice` | Save turns on once the event id exists | event create fails: nothing saved, the plan stays in the client | the save names the event id | none | `golf_practice_plans` | today's Calendar only |
| Plan save (builder autosave, Ask Save draft, Quick chat save) | `golf_practice_plans` (coach-only SELECT, `golf_practice_plans_select`, 010000) | `rpc('golf_practice_plan_save', {p_event_id, p_plan_id, p_expected_version, p_title, p_step, p_body})` (010500), then on a first save `rpc('golf_practice_plan_file_draft', {p_plan_id, p_version, p_folder, p_why})` (lane 20261104090000) | coach only: definer checks `is_golf_team_coach`; no INSERT or UPDATE grant on the table | `validatePlan` client and server; SQL `check_body` (sizes, refs, drill ids in `golf_team_drills` or `golf_drills`) | new `version` returned; autosave line "Saved" | `practice_plan_stale` gives CH-17505; other tokens map to CH-171xx; offline keeps the body in `sessionStorage` (CH-17901) | every save carries `version`; 010700 realtime on `golf_practice_plans` for the other coach | none | `golf_practice_plans` (and `coachhelm_practice_plans_v1` for Ask and Quick chat) | Save inert: "Comes with the Practice tab" (PGRST202 or 42883 counts as unavailable, 0.5) |
| Drill bank (one bank) | `golf_team_drills` (010100, team, `archived_at` null) then `golf_drills` (baseline `20260527000000_prod_public_baseline.sql:9472`, SELECT-only policy `drills_read_all_authenticated`, `policies/golf.sql:419`) | `createTeamDrill`, `copyLibraryDrill`, `updateTeamDrill`, `archiveTeamDrill`, `restoreTeamDrill` in `src/app/golf/actions/practice-library.ts` (new, 8.15) | coach; 010100 policies | 8.3 CHECKs | toast CH-17016; the slot takes the new id | refusal keeps the sheet open with the reason | refetch on sheet open | none | `golf_practice_plans` | `golf_drills` only; New drill inert "Drill bank comes with the Practice tab" |
| Publish | plan row, recipients from `golf_practice_plan_recipients` (010600, service role only) | `rpc('golf_practice_plan_publish', {p_plan_id, p_expected_version, p_changes, p_notified})` inside `publishPracticePlan(planId, {notify: 'now' | 'defer'})` in `practice-publish.ts` (new) | coach only (definer check) | `validatePlan` errors block; `practice_plan_empty`, `_stale`, `_event_cancelled`, `_all_day` | returns version, `document_id`, `recipients`; the row keeps its folder (ON CONFLICT does not touch `folder`) | any raise: nothing frozen, nothing filed | 010700 realtime on versions | `notify: 'now'` (builder): fan-out from the action's `after()`; `'defer'`: the caller's deferred send after 8s (practice-plan 02 §7.3) | both | Publish inert |
| Take down, and Undo inside 8s | live version | `rpc('golf_practice_plan_take_down', {p_plan_id, p_expected_version})` | coach only | `practice_plan_not_published` | status back to `draft`, Documents row `is_public false` | stale: reload | realtime | Take down: every recipient once; Undo: nobody (`notify: false`) | both | inert |
| Push and bell row | recipients | `src/lib/golf/practice-fanout.ts` (new): `recordInAppNotification({type: 'event_reminder', data: {kind: 'practice_plan', plan_id, v: 1}, actionUrl: '/golf/dashboard/practice/plan/<id>'})` (`in-app.ts:33`) and `sendBulkPushNotification('practice_plan', …)` (`push.ts:641`), one call of each per distinct body | service role inside the helpers; recipients came from the definer | at most 8 bodies | the bell row files under Events (`categorizeNotificationRow`, `unified-notifications-model.ts:104`, `event_reminder` gives `events`) | best effort; failures logged, the publish stands | bell reads on its own refresh | push respects `push_events` and Quiet mode only once `push.ts` gains the two cases below; class holds apply (`holdOrPass`, `class-hold.ts:76`); the bell row has no per-user switch today (same as every `event_reminder` row) | both | none sent |

Gaps closed (engineering calls):
1. `practice_plan` is not a push type today (`types.ts:5`). Slice 3 adds it to the union, `case 'practice_plan': return 'push_events'` in `pushDeliveryKeyFor` (`push.ts:43`), and a `generatePushPayload` case (`push.ts:100`) that uses the caller's `title`, `body` and `/golf/...` `url`. "Added to the TS union only" (0.7) was not enough: the `default` branch sends regardless of the Events switch and links to the app root.
2. `sendBulkPushNotification` and `recordInAppNotification` take one payload for all ids, so the fan-out groups recipients by their copy.
3. Drafts in Documents: 010400's insert policy blocks a coach insert of a plan row, so the draft row comes from `golf_practice_plan_file_draft` (lane file above). 010500 is unchanged.
4. Players and Why lines: `golf_practice_plan_versions` is readable by every team player (8.2). CoachHelm's Why lines live in `golf_practice_plans.coach_why` (coach-only table) and are never in the body; `public_body` strips both keys as a second guard.
5. Shot tracking: nothing here reads or writes `golf_rounds`, `golf_holes` or `golf_shots`.

Citations that moved (this plan was read against f30a6d5; now 03d9087):

| Was | Now |
|---|---|
| `functions/public.sql:6964` (`is_golf_team_coach`), `:7000` (`is_golf_team_player`) | `:7345`, `:7381` |
| `10_tables.sql:664-681` (`golf_documents`), `:670` (`file_url NOT NULL`) | `:683-701`, `:689` |
| `10_tables.sql:1131` (`golf_messages` kind CHECK), `:1132` (payload) | `:1152`, `:1153` |
| `HELD.md:153` register | `HELD.md:155` |
| PR 2361, 2362 dependencies | merged on main: `FormSheet`, `useSheetDraft` (`ui/FormSheet.tsx:270`), `DayCard`, `loadTeamZone`, `seasonStartDate` (`season.ts:68`) and `message-polls.ts` exist |
