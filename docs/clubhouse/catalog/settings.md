# Settings catalog (8xxx)

Route `/golf/dashboard/settings` · code `src/clubhouse/screens/settings/` (the phone screen: `phone/`) · tests
`src/clubhouse/__tests__/settings.test.tsx` (each test is named by its number) · preview
`/clubhouse-preview/settings` (`?state=failed|partial|failwrites|player|noteam|assistant|loading`).

Success confirmations are listed next to their error: the toast shows for 4 seconds, errors for 8 with Retry.

**Phone (81901).** At 820px or less Settings is a different screen (owner design, `docs/clubhouse/phone/settings.md`):
a grouped list that pushes to each section, edit cards as sheets, choices as bottom sheets, destructive choices as
action sheets. It uses the same writes, hooks (`screens/settings/hooks.ts`) and numbers as desktop, so every row below
exists on the phone with the differences named in its "How" cell. Desktop only: CH-8009 and CH-8504 (Mute push, Mute
email and Reset are not in the phone design, and each kind's sheet changes the same switches) and CH-8507 (there is no
rail to switch). The tests for the phone are the "Settings · phone" group in `settings.test.tsx`.

## 80xx Error toasts

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-8001 | Saving the profile (name or photo) fails | "Couldn't save your profile" + the reason or "Check your connection and try again.", Retry. On success: "Profile saved" | `useAction('settings.saveProfile')` | settings.test › CH-8001 |
| CH-8002 | A photo can't be uploaded: wrong type, over 2 MB, or the upload fails | "Couldn't upload that photo" + "Use a JPEG, PNG, GIF or WebP photo." / "Photos must be under 2 MB." / "Check your connection and try again." | `writes.uploadAvatar`, toast in `ProfileCard` | settings.test › CH-8002 |
| CH-8003 | Sending the email-change confirmation fails | "Couldn't start the email change", Retry. On success: "Confirmation sent to name@school.edu" and a notice to check that inbox | `useAction('settings.changeEmail')` | settings.test › CH-8003 |
| CH-8004 | Changing the password fails, including a wrong current password | "Couldn't update your password" + "Your current password is incorrect." when that's why. On success: "Password updated" and the fields clear | `useAction('settings.changePassword')`, re-auth first | settings.test › CH-8004 |
| CH-8005 | An email or push switch (or quiet mode) doesn't save | "Couldn't change messages email" (the switch named) + "It is back where it was…", Retry; the switch flips back | `useInstantSave('notifications')` (`useDelivery`); on the phone, the switch in the kind's sheet | settings.test › CH-8005 |
| CH-8006 | The weekly team email switch doesn't save (coach) | "Couldn't change the weekly email", switch flips back | `useInstantSave` | settings.test › CH-8006 |
| CH-8007 | Push on this device can't be turned on or off | "Couldn't turn on push here" / "Couldn't turn off push here" + the browser's reason | `usePushSubscription` in `DeliveryCard` | settings.test › CH-8007 |
| CH-8008 | A CoachHelm update switch doesn't save (player) | "Couldn't change new insight" (the update named), switch flips back | `useInstantSave('routing')` (`useRouting`); on the phone, a switch in a kind's sheet changes every update in that kind in one write and the toast names the kind and channel ("Couldn't change goals push") | settings.test › CH-8008 |
| CH-8009 | Mute push, Mute email or Reset doesn't save (player) | "Couldn't mute push" / "Couldn't mute email" / "Couldn't reset your updates", every switch flips back | `useInstantSave` bulk | settings.test › CH-8009 |
| CH-8010 | CoachHelm quiet mode doesn't save (player) | "Couldn't change quiet mode" | `useInstantSave` | settings.test › CH-8010 |
| CH-8011 | Saving team details fails | "Couldn't save team details". On success: "Team details saved" | `useAction('settings.saveTeam')` | settings.test › CH-8011 |
| CH-8012 | Making a new invite code fails | "Couldn't make a new invite code"; the old code stays. On success: "New invite code ready" and the new code shows | `useAction('settings.regenerateCode')` (`useInvite`) | settings.test › CH-8012 |
| CH-8013 | Copying the code or link fails (clipboard blocked) | "Couldn't copy" + "Select the text and copy it yourself." On success: "Invite code copied" / "Invite link copied" | `navigator.clipboard` in `useInvite`, and in `useStaffInvite` for the staff code and link ("Staff code copied" / "Staff invite link copied"); on the phone, Share opens the share sheet, or copies the join link when the device has none | settings.test › CH-8013, settings-staff.test › CH-8013 |
| CH-8014 | Saving scoring and format fails | "Couldn't save scoring settings". On success: "Scoring settings saved" | `useAction('settings.saveScoring')`; on the phone a choice saves as it is picked (`useInstantSave('scoring')`), one at a time | settings.test › CH-8014 |
| CH-8015 | Saving the reminder schedule fails | "Couldn't save the reminder schedule". On success: "Reminder schedule saved" | `useAction('settings.saveReminders')`; on the phone, Send reminders saves as it flips and each time is a slider sheet with Save | settings.test › CH-8015 |
| CH-8016 | Saving golf details fails (player) | "Couldn't save your golf details". On success: "Golf details saved" | `useAction('settings.saveGolf')` | settings.test › CH-8016 |
| CH-8017 | Leaving the team fails (player) | "Couldn't leave the team"; still on the team. On success: "You left the team" | `useAction('settings.leaveTeam')` | settings.test › CH-8017 |
| CH-8018 | Asking to join a team fails (player) | "Couldn't send your request" + the reason, or "Check the code with your coach." On success: "Request sent to the coaches" | `useAction('settings.requestJoin')` | settings.test › CH-8018 |
| CH-8019 | Cancelling a join request fails (player) | "Couldn't cancel the request". On success: "Request cancelled" and it leaves the list | `useAction('settings.cancelRequest')` | settings.test › CH-8019 |
| CH-8020 | A CoachHelm dashboard switch doesn't save (coach) | "Couldn't turn CoachHelm off" / "…on" / "Couldn't change insights" etc., switch flips back | `useInstantSave('coachhelm')` | settings.test › CH-8020 |
| CH-8021 | The team CoachHelm switch doesn't save (head coach) | "Couldn't change CoachHelm for the team" | `useInstantSave` | settings.test › CH-8021 |
| CH-8022 | A CoachHelm priority, threshold, alert or display change doesn't save | "Couldn't save that CoachHelm setting" + "It's back where it was…"; the control reverts; the status line says "A change didn't save" | ordered save queue in `CoachHelm.tsx` | settings.test › CH-8022 |
| CH-8023 | Deleting the account fails | "Couldn't delete your account" + the server's reason (for example data that needs an admin) | `useAction('settings.deleteAccount')` | settings.test › CH-8023 |
| CH-8024 | Signing out fails | "Couldn't sign you out" + "Check your connection and try again." | `SessionCard` | settings.test › CH-8024 |
| CH-8025 | Report a problem can't open the in-app form (info, not an error) | "Opening email" + "The in-app report form isn't available right now." then the mail app opens | Sentry feedback, `mailto:` fallback | settings.test › CH-8025 |
| CH-8026 | Approving an assistant coach request fails (head coach) | "Couldn't approve Avery Lee" + the reason (for example "Only a head coach of this team can do that."), Retry; the request stays. On success: "Avery Lee is now an assistant coach", the request leaves and the staff list reads again | `useAction('settings.approveAssistant')` (`useCoachingStaff`) → `approvePendingAssistantCoach`; Approve on desktop, the Approve pill on the phone | settings-staff.test › CH-8026 |
| CH-8027 | Declining an assistant coach request fails (head coach) | "Couldn't decline Avery Lee" + the reason, Retry; the request stays. On success: "Declined Avery Lee" and the request leaves. The person is detached from the program, not deleted | `useAction('settings.declineAssistant')` (`useCoachingStaff`) → `declinePendingAssistantCoach` | settings-staff.test › CH-8027 |
| CH-8028 | Making a staff invite fails (head coach) | "Couldn't make the assistant coach invite" / "Couldn't make the program admin invite" + the server's reason (for example "Only a head coach of this team can invite staff."), Retry; a code shown before is cleared first. On success there is no toast: the code, its role and how long it works show, with Copy staff code, Copy staff invite link and Share (Copy code, Copy link and Share on the phone) | `useAction('settings.createStaffInvite')` (`useStaffInvite`) → `createStaffInvite` | settings-staff.test › CH-8028 |

## 81xx Validation (shown before anything is sent; Save stays disabled)

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-8101 | A coach clears their name | "Add your name." in the card footer (on the phone, under the field in the Profile sheet) | `profileProblem` | settings.test › CH-8101 |
| CH-8102 | A player clears first or last name | "Add your first and last name." | `profileProblem` | settings.test › CH-8102 |
| CH-8103 | New email isn't an address | "Enter a valid email address." under the field (after leaving it or pressing Send) | `emailProblem` | settings.test › CH-8103 |
| CH-8104 | New email is the current one | "That is already your email." | `emailProblem` | settings.test › CH-8104 |
| CH-8105 | Update password without the current one | "Enter your current password." with a warning haptic | `passwordProblem` | settings.test › CH-8105 |
| CH-8106 | New password under 8 characters | "Use at least 8 characters." | `passwordProblem` | settings.test › CH-8106 |
| CH-8107 | New passwords differ | "The new passwords don't match." | `passwordProblem` | settings.test › CH-8107 |
| CH-8108 | Team name cleared | "The team needs a name." | `teamProblem` | settings.test › CH-8108 |
| CH-8109 | School name cleared | "The school needs a name." | `teamProblem` | settings.test › CH-8109 |
| CH-8110 | School state isn't two letters | "Use the two-letter state code." | `teamProblem` | settings.test › CH-8110 |
| CH-8111 | First reminder isn't earlier than the final one | "The first reminder has to come before the final one." | `remindersProblem` | settings.test › CH-8111 |
| CH-8112 | Handicap outside −10 to 54 | "Handicap must be between −10 and 54." | `golfDetailsProblem` | settings.test › CH-8112 |
| CH-8113 | Handicap index outside −10 to 54 | "Handicap index must be between −10 and 54." | `golfDetailsProblem` | settings.test › CH-8113 |
| CH-8114 | Graduation year not 2000–2100 | "Graduation year looks wrong." | `golfDetailsProblem` | settings.test › CH-8114 |
| CH-8115 | Player state isn't two letters | "Use the two-letter state code." | `golfDetailsProblem` | settings.test › CH-8115 |

## 82xx Didn't load (inline notice with Try again; the form is never shown blank)

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-8201 | The profile read fails | "Your profile didn't load." + "Nothing was changed. Reload to try again; the error has been reported." | `ReadFailed`, `data.profile.error` | settings.test › CH-8201 |
| CH-8202 | Email and push settings don't load | "Your email and push settings didn't load." | `ReadFailed` | settings.test › CH-8202 |
| CH-8203 | CoachHelm update settings don't load (player) | "Your CoachHelm update settings didn't load." | `ReadFailed` | settings.test › CH-8203 |
| CH-8204 | The weekly team email setting doesn't load (coach) | The row says "This setting didn't load. Reload to change it."; switch disabled | `DeliveryCard` | settings.test › CH-8204 |
| CH-8205 | Team details don't load | "Team details didn't load." | `ReadFailed` | settings.test › CH-8205 |
| CH-8206 | The invite code doesn't load | "Your invite code didn't load." | `ReadFailed` | settings.test › CH-8206 |
| CH-8207 | Scoring settings don't load | "Scoring settings didn't load." | `ReadFailed` | settings.test › CH-8207 |
| CH-8208 | Event reminders don't load | "Event reminders didn't load." | `ReadFailed` | settings.test › CH-8208 |
| CH-8209 | Golf details don't load (player) | "Your golf details didn't load." | `ReadFailed` | settings.test › CH-8209 |
| CH-8210 | Team membership doesn't load (player) | "Your team membership didn't load." | `ReadFailed` | settings.test › CH-8210 |
| CH-8211 | CoachHelm settings don't load (coach) | "Your CoachHelm settings didn't load." | `ReadFailed` | settings.test › CH-8211 |
| CH-8212 | A section crashes while drawing | "Account couldn't be shown." (the section named) + "The rest of the page is fine. This has been reported automatically.", Try again | `SectionBoundary` | settings.test › CH-8212 |
| CH-8213 | The assistant coach requests don't load (head coach) | "Requests didn't load." + "Nothing was changed. Try again; the error has been reported." with Try again (a card on desktop, a group on the phone). An assistant's refused read is not this: it is the answer, so an assistant sees the staff but no requests and no invite card. A staff list that doesn't load leaves its card out and is reported at low severity, never "no staff" | `StaffCards`, `StaffPhone` (`useCoachingStaff`) → `listPendingAssistantCoaches` | settings-staff.test › CH-8213 |

## 83xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-8301 | A coach with no team opens Team | "You aren't on a team yet." + "Team settings appear once your program is set up and you're on its staff." | `EmptyState` | settings.test › CH-8301 |
| CH-8302 | A player with no team opens Golf profile | A "Join a team" card: invite code, optional note, "Ask to join" | `MembershipCard` | settings.test › CH-8302 |
| CH-8303 | A player has asked to join and is waiting | "Waiting on Wake Forest Golf · Sent Oct 12" with Cancel | `MembershipCard` | settings.test › CH-8303 |
| CH-8304 | No profile photo | The monogram coin (initials) in place of a photo, with "Add photo" | `Avatar` | settings.test › CH-8304 |

## 84xx Loading

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-8401 | The page is loading | A skeleton of the title, the section list and two cards, in the page's own layout | `SettingsSkeleton`, route `loading.tsx` (and the two old links' `loading.tsx`) | settings.test › CH-8401, settings-server.test › CH-8401 |
| CH-8402 | A form is saving | The button reads "Saving…" (or "Sending…", "Updating…", "Deleting…", "Leaving…") and can't be pressed twice | `useAction.pending` | settings.test › CH-8402 |
| CH-8403 | A switch is saving | The switch holds its new position and can't be flipped again until it lands | `Switch busy` | settings.test › CH-8403 |
| CH-8404 | A photo is uploading | The photo dims and the button reads "Uploading…" | `ProfileCard` | preview |
| CH-8405 | CoachHelm settings are saving | The line above the cards reads "Saving…", then "All changes saved" (or "A change didn't save") | `usePhilosophy` status | settings.test › CH-8405 |

## 85xx Confirm

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-8501 | Delete account | "Delete your account?" + "This permanently deletes your account and the data tied to it. This can't be undone." Delete stays disabled until "delete" is typed | `Modal`, warning haptic; on the phone an action sheet with Delete account in red and Cancel, then CH-8510 | settings.test › CH-8501 |
| CH-8502 | Leave team (player) | "Leave Varsity?" + "You come off the roster right away. To come back, you'll need the invite code and your coach's approval." | `Modal`; on the phone an action sheet with Leave team in red and Cancel | settings.test › CH-8502 |
| CH-8503 | Make a new invite code | "Replace your invite code?" + "K7M2Q9XA stops working as soon as the new code is made…" | `Modal`; on the phone an action sheet with Replace code in red and Cancel | settings.test › CH-8503 |
| CH-8504 | Reset CoachHelm updates (player) | "Reset CoachHelm updates?" + "Every update goes back to in app only, with push and email off." | `Modal` (desktop only) | settings.test › CH-8504 |
| CH-8505 | Turn off CoachHelm on your dashboards | "Turn off CoachHelm on your dashboards?" + what stops appearing | `Modal`; on the phone an action sheet with Turn off CoachHelm in red and Cancel | settings.test › CH-8505 |
| CH-8506 | Following a link off Settings with unsaved changes | "Leave without saving?" + "Your changes on this page haven't been saved." Keep editing / Discard and leave | `useUnsavedGuard`; on the phone an edit sheet with changes counts as unsaved (a link off the page asks with the same dialog) | settings.test › CH-8506 |
| CH-8507 | Switching section with unsaved changes | "Leave without saving?" + "Your changes in this section haven't been saved." | `SettingsView` | settings.test › CH-8507 |
| CH-8508 | Closing or reloading the tab with unsaved changes | The browser's own "Leave site?" prompt | `beforeunload` in `useUnsavedGuard`; on the phone, while an edit sheet holds changes | settings.test › CH-8508 |
| CH-8509 | Phone: closing an edit sheet (Cancel, swiping it down, Esc, tapping outside) with unsaved changes | An action sheet "Discard your changes?" + "What you changed hasn't been saved." with Discard changes in red and Keep editing; a warning haptic as it opens; a swipe that is refused puts the sheet back | `ActionSheet` inside `FormSheet` (`phone/sheets.tsx`) | settings.test › CH-8509 |
| CH-8510 | Phone: Delete account, after Delete account is chosen in the CH-8501 action sheet | A sheet "Delete account" with the field "Type delete to confirm"; Delete stays off until "delete" is typed, and Cancel leaves the account alone | `FormSheet` (`phone/AccountPhone.tsx`) | settings.test › CH-8510 |

## 86xx Motion (v2, D-64: press 110, quick 180, base 260, release 280ms; off when Animations is off or the OS asks for reduced motion)

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-8601 | Switching section | The old section fades out, the new one fades in with a 6px settle (260ms) | `AnimatePresence` + `CH_ROUTE` | preview |
| CH-8602 | Save status changes | "Unsaved changes" → "Saved" with a check fades in and settles after 1.8s (180ms) | `SaveBar` | preview |
| CH-8603 | Flipping a switch | The thumb slides with a small spring (260ms) | `.ch-switch` CSS | preview |
| CH-8604 | A confirm opens | The dialog rises and fades in (260ms) | `Modal` | preview |
| CH-8605 | A toast appears or leaves | Slides up 10px and fades in; stacks reflow (260ms) | `ToastProvider` | preview |
| CH-8606 | Moving a CoachHelm priority | The moved row glows green briefly (260ms). On the phone the row lifts (green tint, shadow) while it is held and follows the finger | `ch-set-moved` keyframes; `.is-held` in `phone/Reorder.tsx` | preview |
| CH-8607 | Pressing a section or button | It shrinks about 6px (110ms) and springs back (280ms) (the shell's CH-1606) | `useChPress` | preview |
| CH-8608 | Animations turned off in Preferences | Every Clubhouse transition becomes instant | `data-motion="off"` + `useChReducedMotion` | settings.test › CH-8608 |

## 87xx Haptics (iOS app only; off when Haptics is off)

| # | When | They feel | How | Test |
| --- | --- | --- | --- | --- |
| CH-8701 | Picking a section, flipping a switch, choosing a segment, each slider step | A selection tick | `haptic('select')` | settings.test › CH-8701 |
| CH-8702 | A Save changes that lands | The OS success pattern (D-70). A switch, segment or slider that saves on change stays silent when it lands: its selection tick (CH-8701) was the feedback | `haptic('success')` through `useAction` | settings.test › CH-8702 |
| CH-8703 | A save fails or a photo is rejected | The OS error pattern | `haptic('error')` | settings.test › CH-8703 |
| CH-8704 | Opening Delete account, or pressing Update password with a problem | The OS warning pattern | `haptic('warning')` | settings.test › CH-8704 |
| CH-8705 | Copying the invite code or link | The OS success pattern | `haptic('success')` | settings.test › CH-8705 |
| CH-8706 | Pressing a primary button (Save changes) | A light tap | `Button` default | preview |
| CH-8707 | Turning Haptics back on | One selection tick so the change is felt (D-70) | `PreferencesSection` | preview |

## 88xx Accessibility

| # | What | How | Test |
| --- | --- | --- | --- |
| CH-8801 | The section list is a navigation landmark; the open section is marked current. On the phone the list is the landmark and an open section names itself in the bar ("Back to Settings" and the heading) | `nav aria-label`, `aria-current="page"` | settings.test › CH-8801 |
| CH-8802 | Every switch has a name a screen reader reads (for example "Messages by email") | `Switch label` + `role="switch"` | settings.test › CH-8802 |
| CH-8803 | Save status changes are announced | `aria-live="polite"` on the footer status and the CoachHelm status line | settings.test › CH-8803 |
| CH-8804 | Errors are announced | toasts, notices and field errors use `role="alert"` | settings.test › CH-8804 |
| CH-8805 | The notification grids are tables. On the phone there is no grid: each kind is a button that names what is on, and its sheet has named switches | `role="table"`, row and column headers | settings.test › CH-8805 |
| CH-8806 | Dialogs trap focus, Esc closes, focus returns to the button | native `<dialog>` in `Modal` | preview |
| CH-8807 | Every field has a label, and its help or error is read with it | `label htmlFor`, `aria-describedby`, `aria-invalid` | settings.test › CH-8807 |

## 89xx Network and UX

Settings uses the shared behaviour: CH-1901 offline banner, CH-1902 "Still saving…" after 5 seconds, CH-1903 a save refused while offline, and the CH-195x experience signals. See [shell](shell.md).
