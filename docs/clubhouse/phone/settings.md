# Phone design: Settings (coach and player)

Status: draft (awaiting owner approval)

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
