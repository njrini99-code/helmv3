# Clubhouse smoothness audit — 2026-10-06

## Target and evidence boundary

The target is the new UI under `src/clubhouse`, including its shared shell,
controls, overlays and phone screens. The inspected source baseline is
`fbec48746` on main. Both `golf_clubhouse_ui` and
`golf_clubhouse_front_door` select Clubhouse in preview/development and are
configured false in production. This describes repository configuration,
not an observation of the currently served production commit.

The old `agent/clubhouse` checkout / PR #2102 is at `7dc31ad13`.
Its routine staggered reveal, universal press and abrupt modal dismissal
are different from the current implementation. PR #2111 merged on October 2;
the newer design-fidelity checkout shares the current repaired shell and
controls. Main also has subsequent Calendar, Classes and test changes.
Do not reintroduce fixes
for retired behavior or use the old checkout to certify the new UI.

This pass inventories source and documentation across all 15 page families,
and reproduces the appearance-store defect in DOM tests. It does not certify
frame rate, Safari gestures, VoiceOver, live mutations, production-build
navigation latency or overall release readiness. Each page's VERIFY remains
the owner of its runtime evidence; existing partial gates stay partial.

## Confirmed defect repaired: redundant appearance updates

**Priority: P1. Evidence: reproduced DOM regression, not device frame timing.**

Owner: `src/hooks/golf/use-appearance-preferences.ts`, consumed by
`src/clubhouse/lib/reduced-motion.ts`, the shell and preference controls.

Before this change, every consumer mount called `hydrateCacheOnce`, which
reread localStorage. Parsed preferences produced a fresh object, so the
reference comparison published an update even with identical values.
Existing consumers then rendered again. The same occurred on unchanged
storage events. The source scan found 27 Clubhouse files consuming either
the appearance hook or reduced-motion hook; this is a file count, not a
measurement of simultaneously mounted consumers.

Reproduction with saved preferences: the existing consumer rendered twice
to hydrate, then a third time when a second consumer mounted. After repair,
its render count stays at two. This proves removal of redundant rendering;
it does not establish a millisecond or frame-rate improvement.

The store now hydrates once after mount and retains snapshot identity when
values match. Changes within the tab and from other tabs still propagate.
Clearing localStorage restores defaults, including animation preference.
The server snapshot stays on defaults for hydration safety.

Regression owner:
`src/hooks/golf/__tests__/use-appearance-preferences.test.tsx`.

## Remaining source findings and profiling targets

### SM-02 — P1 / confirmed duration configuration

Owner: SettingsView.tsx, phone/SettingsPhone.tsx.

Both section switches use AnimatePresence wait mode, with a 260 ms exit followed
by a 260 ms entrance. The configured sequence is 520 ms. Film rapid section
changes and measure when the new section becomes usable before changing the
approved choreography.

### SM-03 — P1 / confirmed contract mismatch

Owner: Settings section transitions; Home LatestRound; RosterPeek; Toast;
OfflineBanner.

Reduced motion removes translations in several components, but their Framer
Motion transition duration remains 260 ms. Settings feedback also retains its
180 ms fade. CSS duration tokens do not control the JavaScript transition
objects. Verify both OS reduced motion and Settings Animations off against the
documented instant-motion contract, then make duration zero where required.

### SM-04 — P1 / profiling target

Owner: coachhelm/chat/Thread.tsx and model.ts.

Each streamed messages update rebuilds the turn model and renders the thread,
then may scroll the end into view. Smooth scrolling is explicitly requested when
sending, not on every streaming update. Profile a long conversation during
streaming before adding memoization, batching or virtualization.

### SM-05 — P1 / profiling target

Owner: shell.css, rounds-track.css, rounds-setup.css, stats.css, onboard.css.

Navigation and selected feature surfaces retain backdrop filters. Count visible
filtered layers while scrolling and opening overlays in Safari Timelines/Layers;
source declarations alone do not prove a paint bottleneck. Preserve approved
materials unless the trace identifies them as the cause.

### SM-06 — P1 / verification gap

Owner: Messages VERIFY.md, PAGE_PERFORMANCE.md, page VERIFY files.

Some evidence predates later changes. Messages' keyboard summary does not
distinguish desktop Enter-to-send from phone Return-to-newline. It still records
open focus, text-scaling, reduced-motion and device checks. Reconcile each item
with current code and dated evidence rather than treating docs current as
verification complete.

Motion's [AnimatePresence documentation](https://motion.dev/docs/react-animate-presence)
confirms that wait mode delays the entrance until exit completes. The 520 ms
above is derived from current source configuration, not a measured response time.

SM-03 applies to opacity timing too. Suppressing positional movement does not
make an animation instant, and an animation preference must not introduce
a delayed blank state. Existing PhoneScreen and dialog-lifetime paths already
use zero duration or immediate completion when reduced; retain those examples.

## Page-by-page source inventory

All 15 families have PAGE, DESIGN, CONTRACT, WIRING, VERIFY and CHANGELOG
documents and a catalog. Fourteen manifests record complete contracts; Auth
records partial. All record partial verification. Those are recorded statuses,
not new acceptance results from this pass.

The controls below are JSX use sites found under each manifest's implementation
root. They include wrapper components; several share Modal internally. They are
an audit entry list, not a count of unique runtime popups. Stats team/player
share a source root, and every page inherits the shell and shared primitives.
Catalog counts include retired rows where present and exclude shell contracts
inherited by a page. Semantic naming can create false positives: Selections
is qualifier content, not necessarily a popup.

### P001 Shell

Owners: Menu, Bell and TeamSwitch popovers, phone More, RouteFrame and
PhoneScreen. Catalog rows: 60.

Runtime emphasis: Crossfade, rapid navigation, scroll restoration, anchored
shell, focus, safe areas.

### P002 Home

Owners: Modal, RoundSheet, LatestRound. Catalog rows: 42.

Runtime emphasis: Round paging, skeleton geometry, loading/refresh distinction,
sheet size.

### P003 Roster

Owners: InviteModal, Menu, Modal, RequestsSheet, RosterPeek, PhoneScreen.
Catalog rows: 43.

Runtime emphasis: Peek replacement, long names, search typing, phone pushes,
focus return.

### P004 Stats team

Owners: FilterSheet, FocusAreaSheet, Modal; shared Stats root. Catalog rows: 49.

Runtime emphasis: Window changes, chart sizing, filter targets, skeleton
geometry.

### P005 Stats player

Owners: FilterSheet, FocusAreaSheet, Modal; shared Stats root. Catalog rows: 64.

Runtime emphasis: Profile/game panels, charts, expanded sections, phone
overflow.

### P006 Calendar

Owners: BusySheet, Menu, Modal, SubscribeSheet. Catalog rows: 61.

Runtime emphasis: Native date/time controls, editor validation, scrolling,
keyboard and save feedback.

### P007 Messages

Owners: AddMembersModal, DeleteMessageModal, EditMessageModal, LeaveGroupModal,
Menu, Modal, PhoneScreen. Catalog rows: 78.

Runtime emphasis: Thread anchoring, multiline input, keyboard, action sheet,
details pushes, long history.

### P008 Settings

Owners: FormSheet, ListSheet, ActionSheet, PickerSheet, ProfileSheet,
EmailSheet, PasswordSheet, GolfSheet, TeamSheet, ReminderSheet, Modal, Select.
Catalog rows: 97.

Runtime emphasis: Sequential section motion, nested dialogs, dirty dismiss, text
scaling, keyboard.

### P009 Qualifiers

Owners: Modal, PickDialog. Catalog rows: 87.

Runtime emphasis: Long entrant names, score tables, selection controls, nested
confirmations.

### P010 Team Hub

Owners: AssignSheet, ComposeSheet, ConfirmDelete, TripEditSheet, TripSheet,
Menu, Modal. Catalog rows: 68.

Runtime emphasis: Independent writes, pending state, rollback, editors above
keyboard.

### P011 Rounds

Owners: Course/shot/penalty/scorecard sheets, conflict/recovery dialogs,
discard/undo/unsaved confirmations, Modal. Catalog rows: 122.

Runtime emphasis: Rapid score input, durable save feedback, edit sheets,
interrupted actions, recovery.

### P012 Classes

Owners: Modal, Select, import flow. Catalog rows: 51.

Runtime emphasis: Long imported schedules, overlaps, form sizing, validation and
phone keyboard.

### P013 CoachHelm

Owners: HistoryDrawer, Menu, Modal, PhoneScreen. Catalog rows: 128.

Runtime emphasis: Stream rendering, scroll intent, history drawer,
evidence/approval controls.

### P014 Recruiting

Owners: RecActionSheet, RecFormSheet, RecPickSheet, StageSheet, UploadDialog,
Menu, Modal, PhoneScreen. Catalog rows: 62.

Runtime emphasis: Nested edits, uploads, drawer/list sizing, focus and
dismissal.

### P015 Auth

Owners: GolfScene, welcome/sign-in transitions; forms rather than shared popup
use sites. Catalog rows: 46.

Runtime emphasis: Camera/loop paint, orientation, text readability, keyboard and
repeated submit.

## Existing shared behavior worth preserving

- RouteFrame's current entrance is an opacity crossfade, not the old stagger.
  It bypasses ViewTransition under reduced motion and scopes saved scroll to
  route and team. Trace the actual browser transition rather than replacing it
  with another animation library.
- Native dialogs use dialog-lifetime and overlay-scroll. The background lock
  is reference counted, content survives the exit, and focus returns without
  scrolling. Nested dismissal order is covered by existing tests.
- Current press feedback applies to bounded buttons or explicit opt-ins,
  releases from the computed current scale and releases a previous held press.
  Touch cancellation still needs physical-device evidence.
- Messages uses ResizeObserver to follow keyboard/composer/attachment geometry
  only when the reader was at the end; readers of earlier messages stay put.
- Auth scopes camera will-change to data-moving and pauses scene loops when
  hidden or reduced. Do not label that scoped hint as a permanent-layer defect.

## Runtime acceptance using existing page docs

For each page and both applicable roles, use its CONTRACT and numbered catalog
as the checklist. Cross-reference WIRING and UI_OWNERSHIP rather than creating
a competing contract registry. Record current commit, viewport, browser/device,
state, control and result in VERIFY. A source-only claim cannot pass a device gate.

1. Open each dialog, sheet, menu, drawer and pushed screen. Check its longest
   content, empty/loading/failed states, nested confirmation and rapid reversal.
2. At 375, 390, 430, the 820/821 breakpoint and desktop, measure visible bounds,
   overflow and touch hit areas. Test landscape, text scaling and keyboard-open
   layouts on iPhone; viewport emulation cannot certify those interactions.
3. Walk Tab, Shift+Tab, arrows, Enter and Escape. Check accessible names,
   dialog focus containment/restoration, inert covered screens, live feedback,
   VoiceOver alternatives to gestures and contrast. Run axe on opened overlays,
   not only closed default pages.
4. Test normal motion, OS reduced motion and device Animations off. Navigate
   rapidly, change filters repeatedly, dismiss during entrance and reopen during
   exit. Confirm new content remains usable and the shell does not replay.
5. In a production build, measure tap acknowledgement, useful content, long
   tasks, layout shift and frame delivery. Record cold/warm runs and data size.
   Compare the same journey before/after on the same device and build settings.
6. Exercise interrupted writes, offline, retry and ambiguous completion.
   Preserve entered data and distinguish pending, saved locally and synced.

Existing commands: clubhouse:check, clubhouse:a11y, clubhouse:perf and
clubhouse:shots. The perf harness requires a local Supabase stack, seeded team
and committed production-build snapshot. Do not substitute preview fixture
timings or development-server timings for authenticated release performance.

## Verification from this pass

- Before repair: the appearance regression suite failed 3 of 4 cases:
  redundant mount update, unchanged storage event, and storage-clear reset.
- After repair on refreshed main dependencies: 193 tests passed across appearance
  preferences, Clubhouse motion, Settings and notification routing.
  The existing jsdom suites emit unsupported scroll and
  navigation notices; they do not exercise native scrolling.
- Dependencies were installed with npm ci from the refreshed lockfile.
  Fast typecheck, scoped ESLint, knowledge checks, markdown ratchet and
  clubhouse:check passed. The latter includes 67 tooling tests.
- clubhouse:shots check found no local screenshot store; that is not a new
  visual verification result. A production build was not run for this client
  store and documentation change.
- No runtime browser or physical-device measurements are recorded in this
  pass. At inspection there was no local perf seed, snapshot build or server;
  the installed Playwright WebKit executable was absent. xcrun could not find
  devicectl, so physical-device tooling availability is unconfirmed.
- No production flags, deployment, database data or migrations changed.

The reproduced store defect is one concrete source of avoidable rendering.
The user's overall choppiness still needs correlation with their exact screen,
running build and device trace; SM-02 through SM-06 define the next checks.
