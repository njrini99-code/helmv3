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

## Findings and repair status

### SM-02 — P1 / repaired sequential delay

Owner: SettingsView.tsx, phone/SettingsPhone.tsx.

Before repair, both section switches used AnimatePresence wait mode, with a
260 ms exit followed
by a 260 ms entrance. The configured sequence is 520 ms. Fresh desktop WebKit
fixture trials mount the new section at 281–290 ms and settle at 550–562 ms
(three normal-motion trials). This is observable sequential delay, not a
physical-device frame-rate measurement.

### SM-03 — P1 / repaired contract mismatch

Owner: Settings section transitions; Home LatestRound; RosterPeek; Toast;
OfflineBanner.

Before repair, reduced motion removed translations in several components,
but their Framer
Motion transition duration remains 260 ms. Settings feedback also retains its
180 ms fade. CSS duration tokens do not control the JavaScript transition
objects. Three fresh OS reduced-motion WebKit trials of the desktop Settings
switch still mount at 277–308 ms and settle at 497–531 ms. This confirms the
instant-transition contract was not met in that path. Shared callers now pass
the reduced preference to chTween/chSwap, making
their duration zero. Settings has no outgoing wait; current evidence is below.

### SM-04 — streaming scroll repaired; parser bottleneck not reproduced

Owner: coachhelm/chat/Thread.tsx and model.ts.

Streaming follow-scroll is now scheduled once per browser frame and canceled
when superseded. It rechecks the reader position before scrolling instantly.
Reduced-motion sends also scroll instantly; normal sends remain smooth.
Regression tests reproduce the former synchronous calls and verify explicit
instant scrolling for reduced-motion sends. The pure parser benchmark below does not justify a model cache.

### SM-05 — paint bottleneck not reproduced in emulation

Owner: shell.css, rounds-track.css, rounds-setup.css, stats.css, onboard.css.

Navigation and selected feature surfaces retain backdrop filters. Count visible
filtered layers while scrolling and opening overlays in Safari Timelines/Layers;
source declarations alone do not prove a paint bottleneck. The paired probe
below found no frame loss in those fixtures, so approved materials remain.
A physical Safari trace is still needed for device-specific complaints.

### SM-06 — P1 / verification gap

Owner: Messages VERIFY.md, PAGE_PERFORMANCE.md, page VERIFY files.

The initial pass found stale Messages keyboard wording and historical gaps
listed as current. The all-page follow-up corrects desktop Enter versus phone
Return and dates old verification sections. All page docs now link current
source/browser evidence. Physical keyboard, text scaling, VoiceOver and device
frame pacing remain open; docs current does not mean release verified.

Motion's [AnimatePresence documentation](https://motion.dev/docs/react-animate-presence)
confirms that wait mode delays the entrance until exit completes. The 520 ms
above is derived from the pre-repair source configuration, not a measured response time.

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

## Initial source-pass verification (before the all-page browser follow-up)

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
running build and device trace; The repaired findings and remaining device checks are recorded below.

## October 6 all-page follow-up

[ALL_PAGE_AUDIT.md](ALL_PAGE_AUDIT.md) lists exact per-page overlay and motion
call sites, current package/style owners, fresh browser results and release
gaps. All six page docs, catalogs, checklists and phone specs now link that
evidence. Earlier measurements retain their original commit and scope.

## 2026-10-06 — Motion and streaming repairs

Settings replaces the sequential exit/entrance with immediate outgoing removal
and one 260ms incoming transition. OS reduced motion and Animations off use
zero-duration shared JavaScript transitions, including Home rounds, Roster
peek, Stats/segmented indicators, menus, team switch, offline notices, toasts
and Settings feedback. Approved normal-motion tokens and layouts are preserved.

CoachHelm schedules streaming follow-scroll once per browser frame, cancels
superseded work and respects the reader's position. It scrolls instantly while
streaming and when motion is disabled; sending otherwise retains smooth scroll.

Desktop WebKit fixture switches settled in 274–315ms normally (previously
550–562ms) and 45–48ms with OS reduced motion (previously 497–531ms), three
trials each. These include development overhead, not device FPS or production
INP. Before/after captures are logged on the affected page VERIFY records.

A paired Chromium 4x-CPU scroll probe covered Home, Stats, round Track, round
Setup and onboarding Account: 20 trials, 60 frames each, with filters enabled
and diagnostically disabled. Both had 16.7ms medians, 16.7–16.8ms p95 and zero
frames over 33ms. A pure buildTurns benchmark (200 messages, 100 trials) had
0.175ms median and 0.781ms p95. Neither supports a speculative glass removal
or parser cache. Physical Safari/iPhone traces, VoiceOver, keyboard and durable
writes remain release checks; the Mac is locked.

## Repair acceptance — 2026-10-06

All 3,100 tests in 118 Clubhouse/appearance files pass, along with 43 mapped
travel-action tests and the full TypeScript check (exit 0). Focused ESLint,
67 Clubhouse tooling tests and all 13 local Review Gate checks pass.

WebKit Settings acceptance covers desktop 1280px and phone 390px in normal,
OS reduced motion and stored Animations-off modes. After settling, exactly
one section remains, with no horizontal overflow. Rapid desktop Account →
Preferences selection leaves only Preferences. Phone pushes focus
ch-setm-title; its normal/reduced/off settled times were 290/32/28ms.
These are one trial per mode, with hydration warm-up; do not substitute them
for the separate three-trial before/after desktop range.

Twenty-nine initial/paired screenshots are recorded; seven repaired surface
captures were inspected for layout, spacing and clipping. The Roster capture
is the base roster, despite the helper's player-peek label; it does not prove
an open peek. Phone Notifications captures add section-state evidence below.

An overloaded overlapping typecheck/build/browser run was interrupted to
reduce memory pressure. An early raw-click probe did not switch sections in that run and is excluded
from acceptance. The final probe waits for a known hydrated section before
measuring. A transient outgoing desktop node exists until its zero-duration
exit is cleaned up; subsequent settled/rapid checks confirm only one section.

## Post-repair browser matrix — 2026-10-06

The complete CH_A11Y_PAGES inventory passes all 305 applicable state/opener
cases again after the motion/scroll repairs at 1280/390px, with zero Axe
violations, no horizontal document overflow and no gaps (exit 0). No known-rule
exemptions were applied. This is fixture evidence, not physical-device proof.

The generated World Model was stale in CI on the earlier audit commit.
Regeneration includes the new appearance-store ownership and test surface;
knowledge:world-model:check now passes against the current sources (exit 0).

## Final build — 2026-10-06

The production Next build passes (exit 0), including compilation, TypeScript
and route generation. It ran in an isolated archived source snapshot with the
current source repairs copied in, dummy local service settings and external
credentials blanked. The preview server was stopped first to avoid competing
for memory or sharing its build directory.

The snapshot has no Git metadata: the postbuild tsconfig helper reports that
it cannot inspect HEAD and leaves the snapshot file alone. It exits 0; the
real worktree tsconfig is unchanged. Existing Sentry/Tailwind deprecation and
class-ambiguity warnings remain outside this repair. Build success is not
production navigation/frame profiling or physical-device certification.
