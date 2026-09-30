# Phone design: Settings (coach and player)

Status: approved by the owner 2026-09-30, from the mockups at https://claude.ai/artifact/CLN6ENqA9BEqJ2Vom6mev2 (coach and player roots, Notifications and its per-kind sheet, Team, CoachHelm with the reorder, the edit-profile sheet, and the destructive action sheet). Where this text and the mockups differ, the mockups win.

The native pattern: a grouped list that pushes to each section, like the iOS Settings app, in Clubhouse styling.

## Root
1. Large title "Settings", then an identity row (photo, name, role and team) that opens Account.
2. Grouped rows with an icon, label and chevron: Account, Notifications, Team (coach) or Golf profile (player), CoachHelm (coach), Preferences. 52px rows on design-system Surface groups.
3. A final group: Report a problem, Privacy policy, Terms of service, and Sign out in its own row.

## Sections
- Each section pushes full-screen with a back chevron and the section name; the tab bar stays.
- Cards become grouped lists: a Switch row is the whole row (tap anywhere toggles, 52px), a picker row opens a bottom sheet of options instead of a dropdown, and a slider row keeps the slider full width under its label.
- Edit cards (profile, team details, golf details, password) open as a full-height sheet with Cancel and Save in the sheet bar; Save stays disabled until something changes. Swiping the sheet down with unsaved changes asks first.
- The notification matrix becomes one row per kind of update that opens a sheet with Email and Push (and In app for CoachHelm updates) switches, with the current state summarised on the row ("Email, Push").
- The priority ranker uses the native reorder handle (long-press and drag), with a selection haptic on each step.

## Destructive
Delete account, Leave team, New invite code and Turn off CoachHelm use an action sheet with the destructive action in red and a Cancel button; delete still asks for "delete" to be typed in a follow-up sheet.

## Haptics
Selection on switches and pickers, commit on a completed save, error on a failed save, warning before a destructive action.

## Build status (2026-09-30)

Built: `src/clubhouse/screens/settings/phone/` (the list, every section, the sheets and the reorder), picked by
`SettingsView` with `useChPhone`; tests are the "Settings · phone" group in `settings.test.tsx` (contract 81901). Where
the built screen differs from the mockups (real values, a coach's single name field, the Account section, the
quiet-mode wording, and what was added or left out) is listed in `docs/clubhouse/pages/P008-settings/DESIGN.md`. Not yet
viewed at 390px in a browser or on a device.
