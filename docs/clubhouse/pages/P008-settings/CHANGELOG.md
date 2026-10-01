# P008 — Settings: changelog

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification log and decisions).

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
