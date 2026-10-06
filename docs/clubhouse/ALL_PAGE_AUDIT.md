# Clubhouse all-page release audit — 2026-10-06

The follow-up [popup audit](POPUP_AUDIT.md) inventories every concrete overlay
call site and records sizing, native-layer, keyboard and accessibility repairs.

Source baseline: main fbec48746; audit branch codex/clubhouse-smoothness-audit
includes appearance-store repair 8ee40606. This is the current implementation
behind golf_clubhouse_ui and golf_clubhouse_front_door: production defaults are
false, development and preview true. No flag or production setting changed.

The 15 manifests remain the page/action authority. This inventory records JSX
overlay and motion call sites under each implementation root, native form
controls, direct external imports, styles and mapped test files. It is source
evidence, not a claim that every state has been exercised. Names ending in
Sheet/Modal/Menu/Drawer, native dialog and PhoneScreen are candidates;
wrappers can appear twice, and indirect rendering is covered by the
shared-owner review. Stats shares one source root across P004/P005. Auth also
depends on src/clubhouse/screens/onboard and the auth handoff libraries.

Every page inherits the shared Clubhouse shell, custom controls and scoped CSS
tokens. Installed shadcn/Base UI packages do not make these controls
accessible or smooth automatically. Browser geometry and Axe scans use
synthetic development fixtures; they do not establish production performance
or physical iPhone behavior.

## Shared owners and confirmed findings

Modal uses native showModal, unique title IDs and useDialogLifetime. Closing
retains content, keeps the scroll lock until exit completes and restores
connected opener focus. Overlay locks are reference-counted and restore the
page position only on the same route. PhoneScreen makes covered screens inert
and acquires the same scroll lock; its normal transition uses the base token,
260ms, not the stale 220ms comment.

RouteFrame uses React ViewTransition with a crossfade, not the retired
staggered reveal. Reduced motion removes that transition; route/team keys
scope state, with Back/Forward scroll restoration. Source duration tokens are
configured behavior, not measured response time.

SM-01's stable appearance snapshots are repaired. SM-02's Settings exit wait
and SM-03's shared reduced-motion fades are repaired. SM-04's streaming scroll
is batched to a frame and uses explicit instant scrolling; the parser benchmark
did not expose a bottleneck. SM-05's paired paint probe did not reproduce frame
loss, so approved materials remain. See SMOOTHNESS_AUDIT.md for measured
before/after evidence and the physical-device verification still required.

The release remains unverified for physical iPhone keyboard, Safari frame
pacing, VoiceOver, authenticated durable writes, intended-user review and
current production-build measurements. Historical September/October evidence
is retained in dated sections; it must not be read as certification of this
dependency-upgraded commit.

## Evidence

All results use synthetic local development fixtures on the audited app source.

- Initial audit suites: 117 files, 3,092 tests pass, exit 0.
  Repair verification is recorded in the follow-up below.
- Existing state inventory: all 305 applicable width/state/opener cases
  rendered at 1280/390px with zero Axe violations and no document overflow.
  This includes 41 cases that open secondary controls. No known-rule
  exemptions were applied. Unsupported width-specific openers are excluded
  by the inventory itself; this is not every possible user interaction.
- WebKit 26.6: all 15 page families at 320/375/430/1280px, 60 renders,
  zero Axe violations and no horizontal document overflow. Visible native
  form fields in the 375/430px base renders use at least 16px text.
- WebKit onboarding: all 12 steps at 375/430px and 667px height, 24 renders,
  zero Axe violations and no horizontal document overflow. No account was
  created or credential submitted.
- WebKit overlay lifecycle at 390px: More, Stats filter and Roster invite
  release the body lock after Escape and restore opener focus. Stats retains
  300px scroll and Roster retains 148px; More's short fixture starts at 0.
  The two native dialogs focus inside their top-layer dialog; More uses its
  custom overlay. These three checks do not certify every popup.
- Before repair, Settings desktop timing, three trials each: normal motion
  mounts the new
  section at 281–290ms and settles at 550–562ms; OS reduced motion mounts
  at 277–308ms and settles at 497–531ms. This confirms SM-03 for this path.
  Development timing includes its runtime overhead; it is not production INP
  or device FPS. Current motion-off acceptance is recorded in the repair
  follow-up.
- Fifteen 430px full-page screenshots were inspected and recorded through
  clubhouse:shots. Shared material, hierarchy, wrapping and spacing were
  inspected; there was no automated pixel comparison to approved boards.
  Full-page captures include fixed chrome and the Next development indicator.
- The initial clubhouse:a11y CLI run was interrupted after a Stats tab
  destroyed its execution context during navigation. The bounded follow-up
  reused the complete CH_A11Y_PAGES inventory, recorded each result and
  refused document navigation outside preview routes; all 305 cases completed
  without missing openers or scan errors. Do not label the interrupted CLI
  run a pass. Raw logs/JSON are in .helm/runtime/all-page-audit (local).

Axe checks WCAG 2/2.1/2.2 A/AA tags. It does not prove full WCAG conformance,
VoiceOver reading order, gesture usability, keyboard behavior on a physical
iPhone or absence of animation hitches. No current production build, device
profile, real-session write or owner design acceptance was performed.

Screenshots are ignored; each page VERIFY log records its label. The audit
does not modify approved handoffs, contract numbers, held migrations or owner
decisions. The screenshot-log tool's ENOTDIR defect was reproduced by its
gallery/import regression, then repaired; eight focused tooling tests pass.
Knowledge mapping reports the script as outside semantic feature ownership,
with its operating contract documented in the Clubhouse README.

### Current state coverage by page

- P001: 5 state/opener renders; four WebKit base widths.
- P002: 10 state/opener renders; four WebKit base widths.
- P003: 15 state/opener renders; four WebKit base widths.
- P004: 24 state/opener renders; four WebKit base widths.
- P005: 26 state/opener renders; four WebKit base widths.
- P006: 20 state/opener renders; four WebKit base widths.
- P007: 26 state/opener renders; four WebKit base widths.
- P008: 16 state/opener renders; four WebKit base widths.
- P009: 53 state/opener renders; four WebKit base widths.
- P010: 16 state/opener renders; four WebKit base widths.
- P011: 36 state/opener renders; four WebKit base widths.
- P012: 12 state/opener renders; four WebKit base widths.
- P013: 20 state/opener renders; four WebKit base widths.
- P014: 26 state/opener renders; four WebKit base widths.
- P015: 0 state/opener renders; 24 onboarding renders and four base widths.

## P001 shell

Navigation crossfade, Back/Forward scroll restoration, Bell, More and team
switch.

Nested overlays must retain scroll and restore focus; check keyboard dismissal
and VoiceOver isolation.

Manifest: `config/clubhouse/pages/P001-shell.json`. Source root:
`src/clubhouse/shell`. 21 source files; 8 mapped actions; 6 overlay/control
call sites; 13 motion nodes. Native form/dialog nodes: 0. Verification remains
partial; contract status complete.

### P001 — Overlay and pushed-screen sites

- `BellSource.Provider`
  `src/clubhouse/shell/Bell.tsx:61`
- `Menu`
  `src/clubhouse/shell/Bell.tsx:218`
- `ToastProvider`
  `src/clubhouse/shell/ClubhouseFrame.tsx:66`
- `BrandTeamSwitch`
  `src/clubhouse/shell/Sidebar.tsx:52`
- `MoreTeamSwitch`
  `src/clubhouse/shell/TabBar.tsx:211`
- `Bell`
  `src/clubhouse/shell/TopBar.tsx:62`

### P001 — Motion owners

- `AnimatePresence`
  `src/clubhouse/shell/Bell.tsx:336`
- `m.div`
  `src/clubhouse/shell/Bell.tsx:338`
- `m.div`
  `src/clubhouse/shell/Bell.tsx:350`
- `m.div`
  `src/clubhouse/shell/Bell.tsx:389`
- `AnimatePresence`
  `src/clubhouse/shell/OfflineBanner.tsx:41`
- `m.div`
  `src/clubhouse/shell/OfflineBanner.tsx:43`
- `m.section`
  `src/clubhouse/shell/PhoneScreen.tsx:56`
- `ViewTransition`
  `src/clubhouse/shell/RouteFrame.tsx:76`
- `AnimatePresence`
  `src/clubhouse/shell/TabBar.tsx:165`
- `m.div`
  `src/clubhouse/shell/TabBar.tsx:168`
- `m.div`
  `src/clubhouse/shell/TabBar.tsx:177`
- `AnimatePresence`
  `src/clubhouse/shell/TeamSwitch.tsx:125`
- `m.div`
  `src/clubhouse/shell/TeamSwitch.tsx:127`

### P001 — Responsive styles and package dependencies

- `src/clubhouse/styles/shell.css`
Direct external imports: framer-motion, lucide-react, next/navigation, react,
react-dom, next/link. The style review indexes 72 media, animation,
transition, viewport, keyboard and backdrop declarations; these are inspection
targets, not automatic defects.

### P001 — Current test owners

- `src/clubhouse/__tests__/shell.test.tsx`
- `src/clubhouse/__tests__/native.test.tsx`
- `src/clubhouse/__tests__/team-switch.test.tsx`

## P002 home

Coach/player Home, latest-round expansion, round sheet and partial-data cards.

Check loading-to-content geometry, long names, team-timezone day labels and
latest-round expansion under reduced motion.

Manifest: `config/clubhouse/pages/P002-home.json`. Source root:
`src/clubhouse/screens/home`. 14 source files; 13 mapped actions; 2
overlay/control call sites; 2 motion nodes. Native form/dialog nodes: 0.
Verification remains partial; contract status complete.

### P002 — Overlay and pushed-screen sites

- `RoundSheet`
  `src/clubhouse/screens/home/HomePhone.tsx:95`
- `Modal`
  `src/clubhouse/screens/home/HomePhone.tsx:437`

### P002 — Motion owners

- `AnimatePresence`
  `src/clubhouse/screens/home/LatestRound.tsx:102`
- `m.div`
  `src/clubhouse/screens/home/LatestRound.tsx:103`

### P002 — Responsive styles and package dependencies

- `src/clubhouse/styles/home.css`
Direct external imports: lucide-react, react, next/navigation, next/link,
framer-motion. The style review indexes 10 media, animation, transition,
viewport, keyboard and backdrop declarations; these are inspection targets,
not automatic defects.

### P002 — Current test owners

- `src/clubhouse/__tests__/home.test.tsx`
- `src/clubhouse/__tests__/player-home.test.tsx`

## P003 roster

Roster cards/list, player peek, invite, requests and read-only player view.

Check profile push/pop, note blur save, approve/decline feedback and roster
refresh without losing scroll.

Manifest: `config/clubhouse/pages/P003-roster.json`. Source root:
`src/clubhouse/screens/roster`. 13 source files; 14 mapped actions; 8
overlay/control call sites; 3 motion nodes. Native form/dialog nodes: 2.
Verification remains partial; contract status complete.

### P003 — Overlay and pushed-screen sites

- `InviteModal`
  `src/clubhouse/screens/roster/Roster.tsx:200`
- `Modal`
  `src/clubhouse/screens/roster/Roster.tsx:208`
- `Menu`
  `src/clubhouse/screens/roster/Roster.tsx:561`
- `Modal`
  `src/clubhouse/screens/roster/Roster.tsx:606`
- `PhoneScreen`
  `src/clubhouse/screens/roster/RosterPhone.tsx:194`
- `RequestsSheet`
  `src/clubhouse/screens/roster/RosterPhone.tsx:227`
- `Modal`
  `src/clubhouse/screens/roster/RosterPhone.tsx:349`
- `Modal`
  `src/clubhouse/screens/roster/RosterPhone.tsx:417`

### P003 — Motion owners

- `AnimatePresence`
  `src/clubhouse/screens/roster/RosterPeek.tsx:54`
- `m.aside`
  `src/clubhouse/screens/roster/RosterPeek.tsx:56`
- `AnimatePresence`
  `src/clubhouse/screens/roster/RosterPhone.tsx:192`

### P003 — Responsive styles and package dependencies

- `src/clubhouse/styles/roster.css`
Direct external imports: lucide-react, react, next/navigation, framer-motion,
next/link. The style review indexes 12 media, animation, transition, viewport,
keyboard and backdrop declarations; these are inspection targets, not
automatic defects.

### P003 — Current test owners

- `src/clubhouse/__tests__/roster.test.tsx`
- `src/clubhouse/__tests__/roster-player.test.tsx`

## P004 stats-team

Team Stats periods, comparisons, filters and focus-area sheets.

Check period-change layout stability, filter date controls, long course names
and empty/error/loading geometry.

Manifest: `config/clubhouse/pages/P004-stats-team.json`. Source root:
`src/clubhouse/screens/stats`. 21 source files; 5 mapped actions; 4
overlay/control call sites; 1 motion nodes. Native form/dialog nodes: 4.
Verification remains partial; contract status complete.

### P004 — Overlay and pushed-screen sites

- `FilterSheet`
  `src/clubhouse/screens/stats/StatsFilter.tsx:149`
- `Modal`
  `src/clubhouse/screens/stats/StatsFilter.tsx:277`
- `FocusAreaSheet`
  `src/clubhouse/screens/stats/StatsPlayer.tsx:156`
- `Modal`
  `src/clubhouse/screens/stats/StatsPlayer.tsx:635`

### P004 — Motion owners

- `m.span`
  `src/clubhouse/screens/stats/StatsPlayer.tsx:269`

### P004 — Responsive styles and package dependencies

- `src/clubhouse/styles/stats.css`
Direct external imports: lucide-react, react, next/navigation, next/link,
framer-motion. The style review indexes 31 media, animation, transition,
viewport, keyboard and backdrop declarations; these are inspection targets,
not automatic defects.

### P004 — Current test owners

- `src/clubhouse/__tests__/stats-team.test.tsx`

## P005 stats-player

Player Stats periods, development proposals and filters.

Check player context, chart resizing, proposal responses, keyboard filters and
loading geometry.

Manifest: `config/clubhouse/pages/P005-stats-player.json`. Source root:
`src/clubhouse/screens/stats`. 21 source files; 6 mapped actions; 4
overlay/control call sites; 1 motion nodes. Native form/dialog nodes: 4.
Verification remains partial; contract status complete.

### P005 — Overlay and pushed-screen sites

- `FilterSheet`
  `src/clubhouse/screens/stats/StatsFilter.tsx:149`
- `Modal`
  `src/clubhouse/screens/stats/StatsFilter.tsx:277`
- `FocusAreaSheet`
  `src/clubhouse/screens/stats/StatsPlayer.tsx:156`
- `Modal`
  `src/clubhouse/screens/stats/StatsPlayer.tsx:635`

### P005 — Motion owners

- `m.span`
  `src/clubhouse/screens/stats/StatsPlayer.tsx:269`

### P005 — Responsive styles and package dependencies

- `src/clubhouse/styles/stats.css`
Direct external imports: lucide-react, react, next/navigation, next/link,
framer-motion. The style review indexes 31 media, animation, transition,
viewport, keyboard and backdrop declarations; these are inspection targets,
not automatic defects.

### P005 — Current test owners

- `src/clubhouse/__tests__/stats-player.test.tsx`

## P006 calendar

Calendar month/week/day, editor, overlap, busy and subscribe sheets.

Check event sizing and collision layout, keyboard edit flows and Retry inside
the native dialog top layer.

Manifest: `config/clubhouse/pages/P006-calendar.json`. Source root:
`src/clubhouse/screens/calendar`. 10 source files; 21 mapped actions; 12
overlay/control call sites; 0 motion nodes. Native form/dialog nodes: 15.
Verification remains partial; contract status complete.

### P006 — Overlay and pushed-screen sites

- `SubscribeSheet`
  `src/clubhouse/screens/calendar/Calendar.tsx:407`
- `BusySheet`
  `src/clubhouse/screens/calendar/Calendar.tsx:409`
- `Modal`
  `src/clubhouse/screens/calendar/Calendar.tsx:457`
- `Menu`
  `src/clubhouse/screens/calendar/Calendar.tsx:506`
- `Modal`
  `src/clubhouse/screens/calendar/editor.tsx:449`
- `Modal`
  `src/clubhouse/screens/calendar/editor.tsx:667`
- `Modal`
  `src/clubhouse/screens/calendar/editor.tsx:711`
- `Modal`
  `src/clubhouse/screens/calendar/editor.tsx:891`
- `Modal`
  `src/clubhouse/screens/calendar/extras.tsx:101`
- `Modal`
  `src/clubhouse/screens/calendar/extras.tsx:166`
- `Modal`
  `src/clubhouse/screens/calendar/extras.tsx:441`
- `Menu`
  `src/clubhouse/screens/calendar/inspector.tsx:397`

### P006 — Motion owners

No direct Framer/ViewTransition JSX; shared shell, dialog lifetime and CSS
still supply motion.

### P006 — Responsive styles and package dependencies

- `src/clubhouse/styles/calendar.css`
Direct external imports: lucide-react, next/navigation, react. The style
review indexes 22 media, animation, transition, viewport, keyboard and
backdrop declarations; these are inspection targets, not automatic defects.

### P006 — Current test owners

- `src/clubhouse/__tests__/calendar.test.tsx`

## P007 messages

Conversation rail, phone thread, growing composer, reply and group dialogs.

Check reader-position preservation, Return/newline versus desktop Enter,
keyboard height, long messages and draft retention.

Manifest: `config/clubhouse/pages/P007-messages.json`. Source root:
`src/clubhouse/screens/messages`. 12 source files; 18 mapped actions; 24
overlay/control call sites; 1 motion nodes. Native form/dialog nodes: 13.
Verification remains partial; contract status complete.

### P007 — Overlay and pushed-screen sites

- `PhoneScreen`
  `src/clubhouse/screens/messages/MessagesPhone.tsx:163`
- `PhoneScreen`
  `src/clubhouse/screens/messages/MessagesPhone.tsx:366`
- `Modal`
  `src/clubhouse/screens/messages/MessagesPhone.tsx:471`
- `SheetRow`
  `src/clubhouse/screens/messages/MessagesPhone.tsx:500`
- `SheetRow`
  `src/clubhouse/screens/messages/MessagesPhone.tsx:502`
- `SheetRow`
  `src/clubhouse/screens/messages/MessagesPhone.tsx:505`
- `SheetRow`
  `src/clubhouse/screens/messages/MessagesPhone.tsx:508`
- `EditMessageModal`
  `src/clubhouse/screens/messages/MessagesPhone.tsx:514`
- `DeleteMessageModal`
  `src/clubhouse/screens/messages/MessagesPhone.tsx:515`
- `PhoneScreen`
  `src/clubhouse/screens/messages/MessagesPhone.tsx:574`
- `LeaveGroupModal`
  `src/clubhouse/screens/messages/MessagesPhone.tsx:685`
- `AddMembersModal`
  `src/clubhouse/screens/messages/MessagesPhone.tsx:686`
- `PhoneScreen`
  `src/clubhouse/screens/messages/MessagesPhone.tsx:810`
- `PhoneScreen`
  `src/clubhouse/screens/messages/MessagesPhone.tsx:986`
- `Menu`
  `src/clubhouse/screens/messages/MessagesView.tsx:726`
- `EditMessageModal`
  `src/clubhouse/screens/messages/MessagesView.tsx:1371`
- `DeleteMessageModal`
  `src/clubhouse/screens/messages/MessagesView.tsx:1372`
- `Modal`
  `src/clubhouse/screens/messages/MessagesView.tsx:1385`
- `Modal`
  `src/clubhouse/screens/messages/MessagesView.tsx:1427`
- `Modal`
  `src/clubhouse/screens/messages/MessagesView.tsx:1463`
- `Modal`
  `src/clubhouse/screens/messages/MessagesView.tsx:1524`
- `LeaveGroupModal`
  `src/clubhouse/screens/messages/MessagesView.tsx:1707`
- `AddMembersModal`
  `src/clubhouse/screens/messages/MessagesView.tsx:1708`
- `Modal`
  `src/clubhouse/screens/messages/MessagesView.tsx:1910`

### P007 — Motion owners

- `AnimatePresence`
  `src/clubhouse/screens/messages/MessagesPhone.tsx:146`

### P007 — Responsive styles and package dependencies

- `src/clubhouse/styles/messages.css`
Direct external imports: next/navigation, react, lucide-react, next/link,
framer-motion. The style review indexes 18 media, animation, transition,
viewport, keyboard and backdrop declarations; these are inspection targets,
not automatic defects.

### P007 — Current test owners

- `src/clubhouse/__tests__/messages.test.tsx`

## P008 settings

Desktop section swaps, phone pushes, settings sheets and reorder list.

Check the single 260ms entrance without exit wait; verify instant reduced motion,
drag/scroll conflicts and pending saves.

Manifest: `config/clubhouse/pages/P008-settings.json`. Source root:
`src/clubhouse/screens/settings`. 26 source files; 29 mapped actions; 33
overlay/control call sites; 8 motion nodes. Native form/dialog nodes: 7.
Verification remains partial; contract status complete.

### P008 — Overlay and pushed-screen sites

- `Modal`
  `src/clubhouse/screens/settings/Account.tsx:292`
- `Modal`
  `src/clubhouse/screens/settings/CoachHelm.tsx:367`
- `Modal`
  `src/clubhouse/screens/settings/Golf.tsx:75`
- `Modal`
  `src/clubhouse/screens/settings/Notifications.tsx:186`
- `Modal`
  `src/clubhouse/screens/settings/SettingsView.tsx:204`
- `Modal`
  `src/clubhouse/screens/settings/Team.tsx:122`
- `Modal`
  `src/clubhouse/screens/settings/parts.tsx:221`
- `ActionSheet`
  `src/clubhouse/screens/settings/phone/AccountPhone.tsx:65`
- `FormSheet`
  `src/clubhouse/screens/settings/phone/AccountPhone.tsx:82`
- `FormSheet`
  `src/clubhouse/screens/settings/phone/AccountPhone.tsx:130`
- `FormSheet`
  `src/clubhouse/screens/settings/phone/AccountPhone.tsx:213`
- `FormSheet`
  `src/clubhouse/screens/settings/phone/AccountPhone.tsx:266`
- `ActionSheet`
  `src/clubhouse/screens/settings/phone/CoachHelmPhone.tsx:207`
- `GolfSheet`
  `src/clubhouse/screens/settings/phone/GolfPhone.tsx:38`
- `FormSheet`
  `src/clubhouse/screens/settings/phone/GolfPhone.tsx:50`
- `ActionSheet`
  `src/clubhouse/screens/settings/phone/GolfPhone.tsx:97`
- `FormSheet`
  `src/clubhouse/screens/settings/phone/GolfPhone.tsx:131`
- `ListSheet`
  `src/clubhouse/screens/settings/phone/NotificationsPhone.tsx:85`
- `ListSheet`
  `src/clubhouse/screens/settings/phone/NotificationsPhone.tsx:171`
- `ProfileSheet`
  `src/clubhouse/screens/settings/phone/SettingsPhone.tsx:147`
- `EmailSheet`
  `src/clubhouse/screens/settings/phone/SettingsPhone.tsx:148`
- `PasswordSheet`
  `src/clubhouse/screens/settings/phone/SettingsPhone.tsx:149`
- `ActionSheet`
  `src/clubhouse/screens/settings/phone/TeamPhone.tsx:84`
- `TeamSheet`
  `src/clubhouse/screens/settings/phone/TeamPhone.tsx:142`
- `FormSheet`
  `src/clubhouse/screens/settings/phone/TeamPhone.tsx:158`
- `ReminderSheet`
  `src/clubhouse/screens/settings/phone/TeamPhone.tsx:250`
- `FormSheet`
  `src/clubhouse/screens/settings/phone/TeamPhone.tsx:279`
- `dialog`
  `src/clubhouse/screens/settings/phone/sheets.tsx:97`
- `ActionSheet`
  `src/clubhouse/screens/settings/phone/sheets.tsx:129`
- `dialog`
  `src/clubhouse/screens/settings/phone/sheets.tsx:171`
- `ListSheet`
  `src/clubhouse/screens/settings/phone/sheets.tsx:209`
- `dialog`
  `src/clubhouse/screens/settings/phone/sheets.tsx:262`
- `PickerSheet`
  `src/clubhouse/screens/settings/phone/ui.tsx:142`

### P008 — Motion owners

- `AnimatePresence`
  `src/clubhouse/screens/settings/SettingsView.tsx:181`
- `m.div`
  `src/clubhouse/screens/settings/SettingsView.tsx:182`
- `AnimatePresence`
  `src/clubhouse/screens/settings/parts.tsx:144`
- `m.span`
  `src/clubhouse/screens/settings/parts.tsx:146`
- `m.span`
  `src/clubhouse/screens/settings/parts.tsx:150`
- `m.span`
  `src/clubhouse/screens/settings/parts.tsx:155`
- `AnimatePresence`
  `src/clubhouse/screens/settings/phone/SettingsPhone.tsx:109`
- `m.div`
  `src/clubhouse/screens/settings/phone/SettingsPhone.tsx:110`

### P008 — Responsive styles and package dependencies

- `src/clubhouse/styles/settings.css`
Direct external imports: lucide-react, react, next/navigation, framer-motion,
@sentry/nextjs. The style review indexes 18 media, animation, transition,
viewport, keyboard and backdrop declarations; these are inspection targets,
not automatic defects.

### P008 — Current test owners

- `src/clubhouse/__tests__/settings.test.tsx`
- `src/clubhouse/__tests__/settings-server.test.tsx`

## P009 qualifiers

Qualifier list/detail/create/edit, selections and live standings.

Check streamed placeholder geometry, round-course pickers, standings updates
and Back/Forward scroll restoration.

Manifest: `config/clubhouse/pages/P009-qualifiers.json`. Source root:
`src/clubhouse/screens/qualifiers`. 15 source files; 12 mapped actions; 10
overlay/control call sites; 0 motion nodes. Native form/dialog nodes: 12.
Verification remains partial; contract status complete.

### P009 — Overlay and pushed-screen sites

- `Modal`
  `src/clubhouse/screens/qualifiers/CoursePicker.tsx:108`
- `Modal`
  `src/clubhouse/screens/qualifiers/QualifierDetail.tsx:114`
- `Modal`
  `src/clubhouse/screens/qualifiers/QualifierDetailPhone.tsx:149`
- `Modal`
  `src/clubhouse/screens/qualifiers/QualifierDetailPhone.tsx:344`
- `Modal`
  `src/clubhouse/screens/qualifiers/QualifierForm.tsx:471`
- `Modal`
  `src/clubhouse/screens/qualifiers/QualifierSelection.tsx:387`
- `Modal`
  `src/clubhouse/screens/qualifiers/QualifierSelection.tsx:411`
- `Modal`
  `src/clubhouse/screens/qualifiers/QualifierSelection.tsx:435`
- `PickDialog`
  `src/clubhouse/screens/qualifiers/QualifierSelection.tsx:461`
- `Modal`
  `src/clubhouse/screens/qualifiers/QualifierSelection.tsx:593`

### P009 — Motion owners

No direct Framer/ViewTransition JSX; shared shell, dialog lifetime and CSS
still supply motion.

### P009 — Responsive styles and package dependencies

- `src/clubhouse/styles/qualifiers.css`
Direct external imports: lucide-react, react, next/navigation, next/link. The
style review indexes 12 media, animation, transition, viewport, keyboard and
backdrop declarations; these are inspection targets, not automatic defects.

### P009 — Current test owners

- `src/clubhouse/__tests__/qualifiers.test.tsx`
- `src/app/golf/actions/__tests__/qualifier-setup.test.ts`
- `src/app/golf/actions/__tests__/qualifying-coach-gate.test.ts`
- `src/app/golf/actions/__tests__/golf-qualifier-manual-close.test.ts`

## P010 hub

Hub tabs, compose, assignment, trip, document and confirmation sheets.

Check pending operations across tab remounts, partial data, audience pickers
and dialog-hosted Retry.

Manifest: `config/clubhouse/pages/P010-hub.json`. Source root:
`src/clubhouse/screens/hub`. 7 source files; 11 mapped actions; 14
overlay/control call sites; 0 motion nodes. Native form/dialog nodes: 10.
Verification remains partial; contract status complete.

### P010 — Overlay and pushed-screen sites

- `ComposeSheet`
  `src/clubhouse/screens/hub/TeamHub.tsx:456`
- `ComposeSheet`
  `src/clubhouse/screens/hub/TeamHub.tsx:457`
- `TripSheet`
  `src/clubhouse/screens/hub/TeamHub.tsx:467`
- `TripEditSheet`
  `src/clubhouse/screens/hub/TeamHub.tsx:468`
- `AssignSheet`
  `src/clubhouse/screens/hub/TeamHub.tsx:469`
- `Menu`
  `src/clubhouse/screens/hub/parts.tsx:200`
- `Menu`
  `src/clubhouse/screens/hub/parts.tsx:267`
- `Menu`
  `src/clubhouse/screens/hub/parts.tsx:471`
- `Menu`
  `src/clubhouse/screens/hub/parts.tsx:583`
- `Modal`
  `src/clubhouse/screens/hub/sheets.tsx:298`
- `Modal`
  `src/clubhouse/screens/hub/sheets.tsx:533`
- `Modal`
  `src/clubhouse/screens/hub/sheets.tsx:752`
- `Modal`
  `src/clubhouse/screens/hub/sheets.tsx:820`
- `Modal`
  `src/clubhouse/screens/hub/trip-edit.tsx:103`

### P010 — Motion owners

No direct Framer/ViewTransition JSX; shared shell, dialog lifetime and CSS
still supply motion.

### P010 — Responsive styles and package dependencies

- `src/clubhouse/styles/hub.css`
Direct external imports: lucide-react, next/navigation, react, next/link. The
style review indexes 4 media, animation, transition, viewport, keyboard and
backdrop declarations; these are inspection targets, not automatic defects.

### P010 — Current test owners

- `src/clubhouse/__tests__/hub.test.tsx`

## P011 rounds

Round library/setup/tracking/review, scorecard and recovery/discard sheets.

Check narrow shot controls, nested sheets, keyboard entry, offline
checkpoints, save/continue and lost-response recovery.

Manifest: `config/clubhouse/pages/P011-rounds.json`. Source root:
`src/clubhouse/screens/rounds`. 37 source files; 7 mapped actions; 25
overlay/control call sites; 0 motion nodes. Native form/dialog nodes: 12.
Verification remains partial; contract status complete.

### P011 — Overlay and pushed-screen sites

- `Modal`
  `src/clubhouse/screens/rounds/RoundsLibrary.tsx:268`
- `QualifierRoundSheet`
  `src/clubhouse/screens/rounds/entry/ContinueRound.tsx:94`
- `Modal`
  `src/clubhouse/screens/rounds/entry/InProgressConflictDialog.tsx:93`
- `InProgressConflictDialog`
  `src/clubhouse/screens/rounds/entry/NewRound.tsx:193`
- `Modal`
  `src/clubhouse/screens/rounds/entry/QualifierRoundSheet.tsx:45`
- `Modal`
  `src/clubhouse/screens/rounds/entry/RecoveryDialog.tsx:96`
- `ExitSheet`
  `src/clubhouse/screens/rounds/entry/RoundRuntime.tsx:298`
- `ScorecardSheet`
  `src/clubhouse/screens/rounds/entry/RoundRuntime.tsx:310`
- `RoundCompleteSheet`
  `src/clubhouse/screens/rounds/entry/RoundRuntime.tsx:311`
- `SaveAsPracticeSheet`
  `src/clubhouse/screens/rounds/entry/RoundRuntime.tsx:336`
- `RecoveryDialog`
  `src/clubhouse/screens/rounds/entry/RoundRuntime.tsx:376`
- `Modal`
  `src/clubhouse/screens/rounds/entry/SaveAsPracticeSheet.tsx:85`
- `Modal`
  `src/clubhouse/screens/rounds/recover/RoundRecover.tsx:273`
- `Modal`
  `src/clubhouse/screens/rounds/setup/AddCourseSheet.tsx:87`
- `Modal`
  `src/clubhouse/screens/rounds/setup/CoursePicker.tsx:58`
- `AddCourseSheet`
  `src/clubhouse/screens/rounds/setup/RoundSetup.tsx:408`
- `UnsavedSheet`
  `src/clubhouse/screens/rounds/track/RoundTracking.tsx:223`
- `PenaltySheet`
  `src/clubhouse/screens/rounds/track/RoundTracking.tsx:224`
- `EditShotSheet`
  `src/clubhouse/screens/rounds/track/RoundTracking.tsx:238`
- `Modal`
  `src/clubhouse/screens/rounds/track/round-sheets.tsx:92`
- `Modal`
  `src/clubhouse/screens/rounds/track/round-sheets.tsx:137`
- `Modal`
  `src/clubhouse/screens/rounds/track/round-sheets.tsx:245`
- `Modal`
  `src/clubhouse/screens/rounds/track/sheets.tsx:81`
- `Modal`
  `src/clubhouse/screens/rounds/track/sheets.tsx:130`
- `Modal`
  `src/clubhouse/screens/rounds/track/sheets.tsx:213`

### P011 — Motion owners

No direct Framer/ViewTransition JSX; shared shell, dialog lifetime and CSS
still supply motion.

### P011 — Responsive styles and package dependencies

- `src/clubhouse/styles/rounds.css`
Direct external imports: react, next/link, next/navigation, lucide-react. The
style review indexes 6 media, animation, transition, viewport, keyboard and
backdrop declarations; these are inspection targets, not automatic defects.

### P011 — Current test owners

- `src/clubhouse/__tests__/rounds.test.tsx`
- `src/clubhouse/__tests__/round-review.test.tsx`
- `src/clubhouse/__tests__/round-tracking.test.tsx`
- `src/clubhouse/__tests__/round-setup.test.tsx`
- `src/clubhouse/__tests__/round-entry.test.tsx`
- `src/clubhouse/__tests__/round-entry-wiring.test.tsx`
- `src/clubhouse/__tests__/round-entry-continue.test.tsx`
- `src/clubhouse/__tests__/round-entry-routes.test.tsx`
- `src/lib/golf/__tests__/shot-entry-rules.test.ts`

## P012 classes

Classes list, class editor, import review and schedule synchronization.

Check narrow day/time controls, long class names, import warnings, partial
imports and calendar-sync refusal.

Manifest: `config/clubhouse/pages/P012-classes.json`. Source root:
`src/clubhouse/screens/classes`. 10 source files; 6 mapped actions; 6
overlay/control call sites; 0 motion nodes. Native form/dialog nodes: 11.
Verification remains partial; contract status complete.

### P012 — Overlay and pushed-screen sites

- `Modal`
  `src/clubhouse/screens/classes/ClassDetail.tsx:72`
- `Modal`
  `src/clubhouse/screens/classes/ClassForm.tsx:133`
- `Modal`
  `src/clubhouse/screens/classes/ClassForm.tsx:313`
- `Modal`
  `src/clubhouse/screens/classes/ClassesView.tsx:438`
- `Modal`
  `src/clubhouse/screens/classes/ClassesView.tsx:463`
- `Modal`
  `src/clubhouse/screens/classes/ImportSchedule.tsx:163`

### P012 — Motion owners

No direct Framer/ViewTransition JSX; shared shell, dialog lifetime and CSS
still supply motion.

### P012 — Responsive styles and package dependencies

- `src/clubhouse/styles/classes.css`
Direct external imports: lucide-react, react, next/navigation. The style
review indexes 9 media, animation, transition, viewport, keyboard and backdrop
declarations; these are inspection targets, not automatic defects.

### P012 — Current test owners

- `src/clubhouse/__tests__/classes.test.tsx`

## P013 coachhelm

Coach/player boards, streaming Ask, history drawer and proposed focus.

Profile render and scroll work during streaming; check drawer focus, player
context and proposal feedback.

Manifest: `config/clubhouse/pages/P013-coachhelm.json`. Source root:
`src/clubhouse/screens/coachhelm`. 28 source files; 4 mapped actions; 8
overlay/control call sites; 1 motion nodes. Native form/dialog nodes: 3.
Verification remains partial; contract status complete.

### P013 — Overlay and pushed-screen sites

- `HistoryDrawer`
  `src/clubhouse/screens/coachhelm/chat/Ask.tsx:321`
- `Modal`
  `src/clubhouse/screens/coachhelm/chat/Ask.tsx:322`
- `Menu`
  `src/clubhouse/screens/coachhelm/chat/Composer.tsx:202`
- `Menu`
  `src/clubhouse/screens/coachhelm/chat/Composer.tsx:266`
- `Modal`
  `src/clubhouse/screens/coachhelm/chat/Composer.tsx:319`
- `Modal`
  `src/clubhouse/screens/coachhelm/chat/EvidencePanel.tsx:40`
- `dialog`
  `src/clubhouse/screens/coachhelm/chat/History.tsx:143`
- `PhoneScreen`
  `src/clubhouse/screens/coachhelm/views/DeepDive.tsx:502`

### P013 — Motion owners

- `AnimatePresence`
  `src/clubhouse/screens/coachhelm/views/DeepDive.tsx:500`

### P013 — Responsive styles and package dependencies

- `src/clubhouse/styles/coachhelm.css`
Direct external imports: react, lucide-react, next/link, ai, next/navigation,
framer-motion. The style review indexes 10 media, animation, transition,
viewport, keyboard and backdrop declarations; these are inspection targets,
not automatic defects.

### P013 — Current test owners

- `src/clubhouse/__tests__/coachhelm.test.tsx`

## P014 recruiting

Recruiting list/detail, stage picker, forms and document upload.

Check keyboard-open forms, long prospect names, stage drag/tap, pending
uploads and refused file recovery.

Manifest: `config/clubhouse/pages/P014-recruiting.json`. Source root:
`src/clubhouse/screens/recruiting`. 14 source files; 9 mapped actions; 14
overlay/control call sites; 1 motion nodes. Native form/dialog nodes: 7.
Verification remains partial; contract status complete.

### P014 — Overlay and pushed-screen sites

- `UploadDialog`
  `src/clubhouse/screens/recruiting/Documents.tsx:311`
- `Modal`
  `src/clubhouse/screens/recruiting/Documents.tsx:321`
- `Modal`
  `src/clubhouse/screens/recruiting/Documents.tsx:373`
- `RecFormSheet`
  `src/clubhouse/screens/recruiting/ProspectForm.tsx:153`
- `Modal`
  `src/clubhouse/screens/recruiting/ProspectForm.tsx:159`
- `dialog`
  `src/clubhouse/screens/recruiting/RecSheet.tsx:67`
- `dialog`
  `src/clubhouse/screens/recruiting/RecSheet.tsx:115`
- `dialog`
  `src/clubhouse/screens/recruiting/RecSheet.tsx:161`
- `Menu`
  `src/clubhouse/screens/recruiting/RecruitingPhone.tsx:80`
- `PhoneScreen`
  `src/clubhouse/screens/recruiting/RecruitingPhone.tsx:116`
- `StageSheet`
  `src/clubhouse/screens/recruiting/RecruitingPhone.tsx:133`
- `RecPickSheet`
  `src/clubhouse/screens/recruiting/RecruitingPhone.tsx:197`
- `RecActionSheet`
  `src/clubhouse/screens/recruiting/RecruitingView.tsx:309`
- `Modal`
  `src/clubhouse/screens/recruiting/RecruitingView.tsx:320`

### P014 — Motion owners

- `AnimatePresence`
  `src/clubhouse/screens/recruiting/RecruitingPhone.tsx:114`

### P014 — Responsive styles and package dependencies

- `src/clubhouse/styles/recruiting.css`
Direct external imports: lucide-react, react, framer-motion, next/navigation.
The style review indexes 16 media, animation, transition, viewport, keyboard
and backdrop declarations; these are inspection targets, not automatic
defects.

### P014 — Current test owners

- `src/clubhouse/__tests__/recruiting.test.tsx`

## P015 auth

Sign-in course scene, welcome, onboarding and dashboard handoff.

Check shortest phone heights, credential zoom/autocomplete, reduced-motion
camera and no blank handoff frames.

Manifest: `config/clubhouse/pages/P015-auth.json`. Source root:
`src/clubhouse/screens/auth`. 16 source files; 3 mapped actions; 0
overlay/control call sites; 11 motion nodes. Native form/dialog nodes: 2.
Verification remains partial; contract status partial.

### P015 — Overlay and pushed-screen sites

No directly named overlay nodes under this root; inspect shared shell and
auth/onboarding handoff separately.

### P015 — Motion owners

- `m.li`
  `src/clubhouse/screens/auth/Welcome.tsx:41`
- `m.div`
  `src/clubhouse/screens/auth/Welcome.tsx:54`
- `m.main`
  `src/clubhouse/screens/auth/Welcome.tsx:154`
- `m.div`
  `src/clubhouse/screens/auth/Welcome.tsx:159`
- `m.div`
  `src/clubhouse/screens/auth/Welcome.tsx:160`
- `m.div`
  `src/clubhouse/screens/auth/Welcome.tsx:166`
- `m.span`
  `src/clubhouse/screens/auth/Welcome.tsx:167`
- `m.span`
  `src/clubhouse/screens/auth/Welcome.tsx:171`
- `m.span`
  `src/clubhouse/screens/auth/Welcome.tsx:176`
- `m.div`
  `src/clubhouse/screens/auth/Welcome.tsx:183`
- `m.span`
  `src/clubhouse/screens/auth/Welcome.tsx:210`

### P015 — Responsive styles and package dependencies

- `src/clubhouse/styles/auth.css`
Direct external imports: framer-motion, react, lucide-react, next/dynamic,
next/link, next/navigation. The style review indexes 33 media, animation,
transition, viewport, keyboard and backdrop declarations; these are inspection
targets, not automatic defects.

### P015 — Current test owners

- `src/clubhouse/__tests__/auth.test.tsx`
- `src/clubhouse/__tests__/auth-logic.test.ts`
- `src/clubhouse/__tests__/auth-server.test.tsx`
- `src/clubhouse/__tests__/auth-scene.test.tsx`

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

## Premium follow-up, October 6

[PREMIUM_AUDIT.md](PREMIUM_AUDIT.md) extends this inventory with the owner’s
material/composition rubric, independent visual and deterministic assessments,
383 current development-fixture renders and focused keyboard/motion repairs.
Automated coverage and visual approval remain separate; no release gate moved.
