# P008 — Settings: changelog

## 2026-10-08 — phone: the priority ranker on dnd-kit

The phone's priority ranker (`phone/Reorder.tsx`) runs on `@dnd-kit/sortable`
instead of a hand-rolled drag. What a coach feels is the same: touch and hold a
row 250ms (a finger that drifts 8px first is scrolling), drag it, a selection
tick for each place it passes, and one save when it is let go; a failed save
still puts it back (CH-8022). The rows now slide out of the lifted row's way
(base, the ease-out) instead of jumping, and each shows the rank it would take.
The lifted row is the drag overlay, the one elevated object (the overlay depth
token, rising over quick and falling away over release as it settles); the place
it left is a soft recess. With reduced motion or Animations off nothing lifts or
slides: the rows swap at once.

Keyboard and VoiceOver: the handle's up and down arrows still move a row one
place and save each move. New: space (or Enter) picks the row up, the arrows
carry it a place at a time with a tick and the place spoken in the ranker's own
live region, space puts it down (saved once) and Escape puts it back. A mouse or
pen holds the same way as a finger. Not verified on a device: the hold against
the page's scroll in WebKit, and the drop's settle.

## 2026-10-08 — premium pass: send a test push, feel it, text size (P008-C3, C1; findings #1, #2, #4)

- C3: once push is on for this device, "Send a test" sits beside Push on this device (desktop) or as a row under it (phone). It calls `POST /api/push-subscriptions/test` (D1-6), which sends a fixed "Test from Clubhouse" to the caller's own subscriptions only and removes dead ones, limited to 3 a minute. Done: "Test sent"; failures say why (CH-8029).
- C1, type: every Settings type size is in `--ch-type-k` steps, so Settings follows Dynamic Type and a larger root size (a 130% root measured 31px → 40.3px on the title). It is pixel-identical at the default size.
- C1: Preferences gains "Feel it", which plays the haptic you chose, and a Text size row ("Automatic", native app only) saying that the phone's text size setting applies.
- #1: on the phone, the weekly team email is in an Email group, not under This device.
- #2: Quiet mode comes first on the phone, as on desktop.
- #4: the desktop matrix's Push column carries "Off on this device" while push is off here; the phone notes it under Email and push.

## 2026-10-08 — dark: Clubhouse at night

Settings follows GolfHelm's dark theme ("Clubhouse at night"), including the new Appearance control. The rail's selection is a light-green wash with the light text green; the team code and rank numbers lift off the ground; the phone's portrait coin and pills keep a filled green with ivory type; the phone switch uses the switch tokens (ivory thumb, never the dark ivory ramp); the action sheet's card and scrim are dark. Light mode is unchanged.

## 2026-10-08 — phone: Mobile clubhouse pass

Phone Settings now follows the owner's "Mobile clubhouse pass" board, as phone
Coach Home does (no stacked white cards):

- the large title under the engraved double rule, in the 31px bold sans in
  forest ink; a section's brief (Notifications, CoachHelm's save status) sits
  10px under it;
- who you are is a flush row with the portrait set in the Ledger's ring;
- every group is a flush section under the double rule with a 19px heading,
  its rows on soft seams (58px, bold labels, engraved icon tiles) and its
  footnote flush to the edge; rows, the identity row and Sign out press with
  the Ledger's tint;
- Help and legal has a heading; Sign out, Delete account and Leave team are
  red rows at the section's edge, not white cards;
- Team's invite code is the screen's one green feature card, with Share in the
  chip's place and New code in its foot;
- a section that didn't load keeps its group heading, with the notice under it;
  the no-team empty sits on the parchment without a card;
- the loading list draws the title, who you are and the sections in the live
  list's classes, so nothing moves when it arrives.

A section now pushes (CH-8609): it slides in from the right over the list,
which fades under it, and Back slides it off the same way (260ms; instant with
reduced motion, and after an iOS back-swipe that already drew the pop). The
sheets and action sheets are unchanged.

## 2026-10-08 — One notice when a section's reads fail together; action rows read as actions

In Team, Notifications and Golf, with more than one read failed the section says
so once at its top, naming the parts, with one Try again that reads the page
again (the shell's CH-1209); each part keeps only its title under its heading.
One failed read keeps its own notice and Try again (states audit b6). On the
phone, action and link rows with no value or chevron (Create invite, Report a
problem, Privacy policy, Terms of service, Try again) take the green of a value
that opens something, so they no longer read as labels missing their control;
Sign out and Leave team stay red. Every line the page writes, its toasts
included, takes the curly apostrophe (b8, held by `copy-apostrophes.test.ts`).

## 2026-10-08 — A failed read keeps its heading; copy

On desktop a section whose read fails keeps its heading and caption with the
notice under it, instead of the notice replacing the whole section (Profile,
Email and push, CoachHelm updates, Team details, Invite players, Scoring and
format, Event reminders, Golf details, Team, CoachHelm). Notice and empty
titles drop their trailing period and take the curly apostrophe ("Your profile
didn’t load", "You aren’t on a team yet"); "Check maya@…" loses its period.

## 2026-10-08 — Server-action imports follow the golf.ts split

```text
PR/commit:      #2176, agent/phase-7
Design package: none
Contract IDs:   none changed
Data impact:    none
Held items:     none
```

The screen's imports and test mocks now point at the files that own the server
actions (team-management.ts) after `golf.ts`, `insights.ts` and `admin-data.ts` were split
by domain. No behavior change.

## 2026-10-07 — Sections press with a tint

A section in the rail and a link row now deepen their tint over the press beat
(`--ch-ledger-row-press`); buttons keep the shell's 6px press. CH-8607 says so
instead of claiming every control shrinks.

## 2026-10-07 — The Ledger: sections on the canvas

On desktop each settings card is now a section on the framed canvas, in the
shared Section's geometry: the title in the 19px heavy sans in forest ink over
an engraved rule, its caption under it, and the rows flush to the section's
edge on soft seams. The save bar is a flush row under a soft rule (status on
the left, Save on the right) instead of a darker footer. Sections sit 44px
apart and run to the page head's right edge. The notification table's labels
and switches align to the section edge: its header has no filled band, a row's
hover tint reaches 12px past the edge, and the seams are drawn inset to it.
Fields, switches, segments, sliders, notices and the section rail keep their
own material. The loading shape uses the same classes and flattens with the
page; the head holds its place on load (WebKit 1440 and 1000). Phone is
unchanged.

## 2026-10-07 — Phone large title in the serif

On the phone, the Settings large title and the section titles (Account,
Notifications and the rest) were a heavy 34px sans, while every other phone page
title is set in the display serif. They are now 38px Instrument Serif.

## 2026-10-07 — Serif title

The Settings title is set in the display serif, as on every Clubhouse page.

## 2026-10-06 — Smooth scroll and materials

Returning to the top on a section change lands instantly through the canvas
scroller, so the shared wheel easing never animates a page switch.

## 2026-10-06 — Premium interaction corrections

```text
PR/commit:      #2155, codex/clubhouse-smoothness-audit
Design package: existing Clubhouse focus and motion owners
Contract IDs:   existing keyboard and reduced-motion behavior
Data impact:    none
Held items:     physical iPhone and complete manual release acceptance
```

Keyboard Move up/down alternatives reveal in their own row on focus.
Ordinary assistive descriptions remain hidden; the visible reorder handle and
its arrow-key path remain available.

See [premium audit](../../PREMIUM_AUDIT.md) for focused evidence and limits.

## 2026-10-06 — Phone popup sizing corrections

Form/list sheets initially focus their labelled heading. Reading destinations do not draw a green control box; buttons retain keyboard focus indicators.

```text
PR/commit:      #2155, codex/clubhouse-smoothness-audit
Design package: approved phone bars and action-sheet layout
Contract IDs:   existing phone form/list/action-sheet contracts
Data impact:    none; CSS overflow and sizing only
Held items:     physical Safari/iPhone keyboard and VoiceOver acceptance
```

Form bars reserve Cancel/Save space and wrap long titles. List/picker titles
wrap within the panel. Tall action-sheet descriptions scroll on short screens
without compressing the actions. Dirty/busy guards and preference behavior are
preserved. See [popup evidence](../../POPUP_AUDIT.md).

<!-- clubhouse:release-audit:start -->
## 2026-10-06 — Smoothness repair

Desktop and phone sections enter immediately without an outgoing wait,
using one normal 260ms entrance. Reduced motion and Animations off use zero
duration. Inline validation/save feedback follows the same preference.

See [repair evidence](../../SMOOTHNESS_AUDIT.md).
Normal styling and approved handoffs remain unchanged. Physical-device
verification and durable writes are still pending.

## 2026-10-06 — Whole-app release audit

Reconciled page purpose, design acceptance, contract status, wiring and
verification against the current flagged implementation. Indexed 29 mapped
actions and 33 overlay/control call sites in the [all-page
audit](../../ALL_PAGE_AUDIT.md#p008-settings). Approved handoffs and contract
IDs are preserved; runtime gaps stay explicit.
<!-- clubhouse:release-audit:end -->

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification log and decisions).

## 2026-10-06 — Motion import path moves to `motion/react`

```text
PR/commit:      #2153 (agent/deps-ui-upgrade)
Design package: none; no visual or behavior change
Contract IDs:   none
Data impact:    none
Held items:     none
```

Dependency upgrade only. `framer-motion` 13 is replaced by the `motion` 14
package, so this page's animation imports change from `framer-motion` to
`motion/react`. The animation API, durations, curves and reduced-motion gating
are unchanged; Motion 14 only removed internal compatibility APIs this tree
never used.

## 2026-10-02 — End obsolete autosave feedback

Instant settings and queued CoachHelm saves use the shared request-lifetime
notice helper. CH-1902 and its pending timer end on settlement, screen unmount,
or team-scope change. Stale A → B → A callbacks cannot revive old feedback;
old cleanup preserves new-scope notices. Feedback cancellation does not cancel
writes or queues and does not alter busy guards, rollback, Retry or quiet
success behavior. The 5-second threshold and default 4-second confirmations /
8-second errors are unchanged. Two focused Settings cases confirm cleanup
after independent notification and CoachHelm saves. The shared verification
set has 21 unique passing cases: 11 Toast and 10 page/action cases. No later
optimized-build or browser result is claimed by this entry.

## 2026-10-02 — Keep narrow desktop sections in view

```text
PR/commit:      codex/clubhouse-design-fidelity (pending)
Design package: existing horizontal desktop section rail
Contract IDs:   existing section navigation and responsive layout; none added
Data impact:    none; local scroll and keyboard focus only
Held items:     physical Safari and VoiceOver validation
```

Focused and selected sections now reveal themselves inside the horizontal rail
at narrow desktop widths, including after resize. The rail scrolls immediately
on its own horizontal axis, leaving the form and page scroll alone. A guarded
next-frame reveal handles WebKit's native focus alignment; rapid focus changes
and unmount cancel the old reveal. Two regression cases and fresh 821px WebKit
keyboard/reduced-motion checks passed; exact results are in VERIFY.md.

## 2026-10-02 — Phone sheet dismissal preserves the page and edit context

```text
PR/commit:      codex/clubhouse-design-fidelity (pending)
Design package: approved boards; bars and dismissal policy unchanged
Contract IDs:   CH-8509, CH-8806
Data impact:    none; client dialog/scroll/focus/gesture lifecycle only
Held items:     physical iPhone keyboard and gesture validation
```

Form, list and destructive action sheets now share the native dialog lifetime:
background lock and content remain until exit finishes, nested confirmation
releases only its own lock, and focus returns without scrolling. Dirty
confirmation and in-flight save guards remain in force.

Keyboard viewport sizing keeps the form header and Save above the keyboard; body
cards keep their row height and scroll instead of compressing. Nested action
sheets also stay above the keyboard and can scroll when space is short.

Targeted checks: 351 tests pass across the final focused runs; scoped ESLint and
diff check exit 0. Runtime evidence is recorded in this page's VERIFY entry.

## 2026-10-01 — Coaching staff in Settings → Team; distance unit in Preferences (swap audit §14 D1, D7)

```text
PR/commit:      agent/swap-audit (#2111): 322ca7cfd, b0864c387, 4e3b87d44, 667d9292d
Design package: none (desktop cards and phone groups in the approved grammar; phone sign-off Q-133)
Contract IDs:   CH-8026, CH-8027, CH-8028, CH-8213
Actions:        settings.staff (invite code, approve, decline), settings.distanceUnit
Data impact:    reuses createStaffInvite, list/approve/declinePendingAssistantCoach, listTeamCoachingStaff; the unit is the device preference golf_distance_unit_pref
Held items:     none
```

- **Issue.** A head coach with Clubhouse on could not mint a staff code or
  approve an assistant; the distance unit the shot screen reads could not be
  set.
- **Fix.** Coaching staff, Assistant coach requests and Staff invitations in
  Team (desktop and phone); Yards or Meters in Preferences. Hints read
  "Motion, haptics and units" (rail) and "Motion, units" (phone).
- **Checked.** `settings-staff`, `settings-distance-units`, `settings`,
  `settings-server` 240 tests.

## 2026-09-30 — The phone Settings, to the owner-approved design

```text
Design package: docs/clubhouse/phone/settings.md (approved by the owner 2026-09-30; mockups linked in its Status line)
PR/commit:      agent/clubhouse (this change, not committed when written)
Contract IDs:   81901 PHONE_LAYOUT reserved -> implemented; new catalog codes CH-8509 and CH-8510
Actions:        none new (every phone control calls an existing write)
Data impact:    none
Held items:     none
```

### Changed

- At 820px or less Settings is a different screen, not the page reflowed: a grouped list that pushes to each section
  (a history entry, the tab bar stays), edit cards as full-height sheets, choices as bottom sheets, destructive choices
  as iOS action sheets, the priorities with a hold-and-drag reorder handle, and a phone skeleton. `phone/` holds it;
  `SettingsView` picks it with `useChPhone`. Same data, writes, loaders and `useAction` paths.
- The behaviour a desktop card and a phone screen both need moved out of the cards into `hooks.ts` (`useDelivery`,
  `useRouting`, `useCoachHelmPower`, `useInvite`, `useMembership`, `usePushToggle`, `useAvatarUpload`,
  `useReportProblem`, `useSignOut`, `useDeleteAccount`, `useDevicePrefs`, and the `SAVE_COPY` toasts) and
  `usePhilosophy` is exported, so a save has one set of copy, numbers and rollback on both. No desktop behaviour changed
  (the 113 desktop tests pass unchanged).
- New catalog rows: CH-8509 (the discard question when an edit sheet closes with changes) and CH-8510 (the typed follow-up
  sheet for Delete account); the "How" cells of the rows that differ on the phone; the phone paragraph at the top.
- Scoring choices on the phone save one at a time as they are picked. An edit sheet with changes reports as unsaved,
  so the page's guard (closing the tab, a link off the page) covers the phone too. The old addresses
  (`/settings/notifications`, `/settings/coaching-intelligence`) open their section pushed on the phone.

### Where it differs from the mockups

Real values for the placeholders; a coach's single Full name field; an Account section that holds Email, Password and
Delete; the quiet-mode footnote says what the router does; the desktop controls the mockups do not draw are rows in the
same style; Mute push, Mute email, Reset and Copy code are not built. The full list is in DESIGN.md.

### Why

The owner approved the phone design on 2026-09-30. The desktop page reflowed was never the phone design (81901 said
so while the design was a draft).

### Verification

- `settings.test.tsx` 169 cases (56 new, each titled 81901), with `settings-server.test.tsx` and `logic.test.ts`
  251/251; typecheck:fast exit 0; eslint on the changed Settings files exit 0.
- 67 mutations of the code the new tests guard, all killed. Not viewed in a browser or on a device (VERIFY.md).

## 2026-09-30 — V2 page docs; every contract answered; ten fixes

```text
Design package: none (D-18: built from the design system)
PR/commit:      agent/clubhouse (this change, not committed when written)
Contract IDs:   80101 to 82401 (30 new behaviour contracts without a catalog code, on top of the 91 from the catalog)
Actions:        29 (ACT-P008-*)
Data impact:    none
Held items:     none
```

### Changed

- The six page docs, the manifest's actions, and the behaviour contracts: the core view and deep links, no-team,
  offline refusal of a switch, the permission gates (sections by role, the two old links, no profile, the head-coach
  switch, the staff coach's team cards, writes scoped to the caller, the current password, an update the database hides
  the row from), success (a save, an instant save, a deleted account), warnings (push blocked, quiet mode), state
  preservation, rollback, retry, refresh, Discard, the phone layout, Enter, the loader, reporting and the tests.
- A second test file, `settings-server.test.tsx`: the loader, the route, the three addresses, the loading files and
  the live writes, which had no test. Four existing tests were retitled with a Bridge ID (CH-8005, CH-8020, CH-8022,
  and CH-8701 to CH-8703, which also checks that no toast shows).
- Catalog: the CH-8702 "How" cell (it still said `haptic('commit')`), the 86xx heading (it still carried the v1
  timings), the CH-8401 row (also the old links' loading files) and the handicap messages (a true minus).

### Fixed

Each has a test that fails without the fix.

- A value saved in a section snapped back when the person left the section and returned, because a section remounts
  from the data the server rendered. Now the page keeps a copy of that data with each landed write applied
  (81204). The same bug made a coach's first CoachHelm save create its row a second time on the next save.
- A failed CoachHelm dashboards switch put back a switch flipped in the meantime (81302).
- Retry on a failed save's toast repeated the write but skipped what the button does after it lands: the card stayed
  unsaved, a new invite code still showed the old one, Delete account did not hand over, Leave team did not close
  or refresh (81402). That work now runs inside the action, and a card's draft is no longer reset on save: typing
  after the sent values, or before a Retry lands, stays as an unsaved edit (81205).
- A CoachHelm slider moved less than 600 ms before leaving the section was dropped (81206).
- `/settings/notifications` and `/settings/coaching-intelligence` showed the Fairway skeleton inside the Clubhouse
  frame (CH-8401).
- The loader failed the whole page when the team CoachHelm action threw, and did not log a missing profile or team
  row (82101).
- Discard, Discard changes and Discard and leave were silent; D-70 gives Discard the warning haptic (81708).
- The handicap messages wrote a hyphen for the minus sign.
- Profile, team details (school and team), golf details and the coaching settings said Saved when a policy hid the
  row from the update, because such an update returns no error and no row. They now count the rows they change and
  fail with "Your account doesn’t have access to do this", as leaving a team already did (80808). The database's
  answer is read from how PostgREST works, not observed on the live project.
- When the team CoachHelm head-coach check failed, the loader treated the coach as an assistant, so a head coach saw
  the switch disabled with "Only the head coach can change this." The failure is now logged and the switch is left
  out (80804).

### Why

D-62: Messages is the gold standard and the other pages copy it. D-69: every category answered, permission for
real. Writing the contract from the code found the fixes above.

### Verification

- `npx vitest run src/clubhouse` 553/553; `settings.test.tsx` and `settings-server.test.tsx` 157/157; typecheck:fast
  exit 0; eslint on the changed files exit 0.
- 107 mutations of the guarded code, one at a time, in an isolated copy: all 107 made a test fail.

## 2026-09-29 — v2 foundation carried onto Settings

- v2 motion (D-64) and haptics (D-70): a switch, segment or slider that saves on change, and the CoachHelm autosave,
  are silent when they land; writes that land through `useAction` fire success.

## 2026-09-29 — Catalog and desktop build

- 76 tests, each named by its catalog number; `clubhouse:check` enforces the catalog. Found and fixed on the way:
  every Clubhouse toast rendered outside the Clubhouse root and had no background; the browser's own email bubble
  covered ours; the photo coin lost its initials while the name was empty.
- Desktop built at 1280px from the design system (D-18): coach (account, notifications, team, CoachHelm,
  preferences), player (account, golf profile, notifications). Fixed a live bug found on the way: `push_announcements`
  was stripped on save and read as off.
