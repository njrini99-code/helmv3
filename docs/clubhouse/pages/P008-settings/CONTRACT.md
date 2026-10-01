# P008 — Settings: page contract

Every behaviour Settings promises, by the 25 V2 categories (D-69). A contract's
number is its Bridge ID (D-68: namespace 8, category, item); `Code` is the
catalog code on the element and in the test (`docs/clubhouse/catalog/settings.md`).
Rows without a code are behaviours with no single element, recorded in
`config/clubhouse/bridge-contracts.json` by hand. The shell's contracts (P001,
namespace 1) apply here too and are named where they carry a category.
`clubhouse:check` holds this file to the registry.

## 01 — Default / core UI

Status: DEFINED

The page opens on Account, or on the section the address names, with a header (role, team and email), the rail of this role's sections and the section's cards. It needs no team. A section is linkable with ?section= (80102), and the two old links open theirs.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 80101 | — | `SETTINGS_READY` | Settings is open: a header naming the role, team and email, the rail of the sections this role has, and the opened section (Account by default) with its cards; the page needs no team. |
| 80102 | — | `DEEP_LINK_OPENS_SECTION` | ?section=<id> opens that section, /golf/dashboard/settings/notifications opens Notifications and /golf/dashboard/settings/coaching-intelligence opens CoachHelm for a coach or Account for a player; choosing a section in the rail writes ?section= into the address. |

From the shell (P001): 10101 CH-1904, 10102 SHELL_READY.

## 02 — Initial loading / skeleton

Status: DEFINED

One route skeleton in Settings' own shape (80201): the title, the rail and two cards. It is `settings/loading.tsx`, and since 2026-09-30 also the loading file of the two old links, which used to show the Fairway skeleton inside the Clubhouse frame. Nothing on the page loads by itself after first paint (everything is read on the server, 82101), so there is no skeleton per section. v2 timing: nothing for 150ms, then a fade (the shell's 11609).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 80201 | CH-8401 | `THE_PAGE_IS_LOADING` | The page is loading |

From the shell (P001): 10201 CH-1401.

## 03 — Background loading / refresh

Status: DEFINED

There is no polling, realtime or pull to refresh. What runs in the background is work the person started: a form saving (80301: the button reads Saving… and cannot be pressed twice), a photo uploading (80302, a state tested in the preview only) and the CoachHelm autosave, whose status line reads Saving… and then All changes saved (80303). After a save that changes what the server renders the page reads again (81501).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 80301 | CH-8402 | `A_FORM_IS_SAVING` | A form is saving |
| 80302 | CH-8404 | `A_PHOTO_IS_UPLOADING` | A photo is uploading |
| 80303 | CH-8405 | `COACHHELM_SETTINGS_ARE_SAVING` | CoachHelm settings are saving |

## 04 — Empty

Status: DEFINED

First-run states only; the page has no filter or search, so no filtered empty. A coach with no team sees why Team is empty (80401); a player with no team can join one (80402) and sees a request that is waiting (80403); no photo shows the monogram (80404). Settings never replaces the whole page with a no-team state (80405, so D-71 does not apply): Account, Notifications and Preferences work without a team. A failed read is never drawn as empty; it is a notice with Try again (category 06).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 80401 | CH-8301 | `A_COACH_WITH_NO_TEAM_OPENS_TEAM` | A coach with no team opens Team |
| 80402 | CH-8302 | `A_PLAYER_WITH_NO_TEAM_OPENS_GOLF` | A player with no team opens Golf profile |
| 80403 | CH-8303 | `A_PLAYER_HAS_ASKED_TO_JOIN_AND` | A player has asked to join and is waiting |
| 80404 | CH-8304 | `NO_PROFILE_PHOTO` | No profile photo |
| 80405 | — | `SETTINGS_OPEN_WITHOUT_A_TEAM` | A coach or player with no team still gets Settings, never a no-team page: Account, Notifications and Preferences work, a coach's Team section says why it is empty (CH-8301) and a player's Golf profile offers Join a team (CH-8302). |

## 05 — Validation

Status: DEFINED

Each card checks its fields before anything is sent and keeps Save disabled while a value is invalid or unchanged (80501 to 80515). The message shows in the card's footer or under the field. The password card shows its message after the first press of Update password, with the warning haptic. A photo of the wrong type or over 2 MB is refused before it uploads (80602, in the write).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 80501 | CH-8101 | `A_COACH_CLEARS_THEIR_NAME` | A coach clears their name |
| 80502 | CH-8102 | `A_PLAYER_CLEARS_FIRST_OR_LAST_NAME` | A player clears first or last name |
| 80503 | CH-8103 | `NEW_EMAIL_ISNT_AN_ADDRESS` | New email isn't an address |
| 80504 | CH-8104 | `NEW_EMAIL_IS_THE_CURRENT_ONE` | New email is the current one |
| 80505 | CH-8105 | `UPDATE_PASSWORD_WITHOUT_THE_CURRENT_ONE` | Update password without the current one |
| 80506 | CH-8106 | `NEW_PASSWORD_UNDER_8_CHARACTERS` | New password under 8 characters |
| 80507 | CH-8107 | `NEW_PASSWORDS_DIFFER` | New passwords differ |
| 80508 | CH-8108 | `TEAM_NAME_CLEARED` | Team name cleared |
| 80509 | CH-8109 | `SCHOOL_NAME_CLEARED` | School name cleared |
| 80510 | CH-8110 | `SCHOOL_STATE_ISNT_TWO_LETTERS` | School state isn't two letters |
| 80511 | CH-8111 | `FIRST_REMINDER_ISNT_EARLIER_THAN_THE_FINAL` | First reminder isn't earlier than the final one |
| 80512 | CH-8112 | `HANDICAP_OUTSIDE_10_TO_54` | Handicap outside −10 to 54 |
| 80513 | CH-8113 | `HANDICAP_INDEX_OUTSIDE_10_TO_54` | Handicap index outside −10 to 54 |
| 80514 | CH-8114 | `GRADUATION_YEAR_NOT_2000_2100` | Graduation year not 2000–2100 |
| 80515 | CH-8115 | `PLAYER_STATE_ISNT_TWO_LETTERS` | Player state isn't two letters |

## 06 — Server / system error

Status: DEFINED

Every change has its own toast (80601 to 80624) naming what failed and why when the server gave a short reason, otherwise "Check your connection and try again", with Retry on saves and switches. Every section that fails to load shows its own notice with Try again (80625 to 80635), never a blank form that could be saved over real data; its Try again reads the whole page again (81401). A crash stays in its section (80636, SectionBoundary). The route's own errors are the shell's (10603 to 10607).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 80601 | CH-8001 | `SAVING_THE_PROFILE_FAILS` | Saving the profile (name or photo) fails |
| 80602 | CH-8002 | `A_PHOTO_CANT_BE_UPLOADED_WRONG_TYPE` | A photo can't be uploaded: wrong type, over 2 MB, or the upload fails |
| 80603 | CH-8003 | `SENDING_THE_EMAIL_CHANGE_CONFIRMATION_FAILS` | Sending the email-change confirmation fails |
| 80604 | CH-8004 | `CHANGING_THE_PASSWORD_FAILS_INCLUDING_A_WRONG` | Changing the password fails, including a wrong current password |
| 80605 | CH-8005 | `AN_EMAIL_OR_PUSH_SWITCH_DOESNT_SAVE` | An email or push switch (or quiet mode) doesn't save |
| 80606 | CH-8006 | `THE_WEEKLY_TEAM_EMAIL_SWITCH_DOESNT_SAVE` | The weekly team email switch doesn't save (coach) |
| 80607 | CH-8007 | `PUSH_ON_THIS_DEVICE_CANT_BE_TURNED` | Push on this device can't be turned on or off |
| 80608 | CH-8008 | `A_COACHHELM_UPDATE_SWITCH_DOESNT_SAVE` | A CoachHelm update switch doesn't save (player) |
| 80609 | CH-8009 | `MUTE_PUSH_MUTE_EMAIL_OR_RESET_DOESNT` | Mute push, Mute email or Reset doesn't save (player) |
| 80610 | CH-8010 | `COACHHELM_QUIET_MODE_DOESNT_SAVE` | CoachHelm quiet mode doesn't save (player) |
| 80611 | CH-8011 | `SAVING_TEAM_DETAILS_FAILS` | Saving team details fails |
| 80612 | CH-8012 | `MAKING_A_NEW_INVITE_CODE_FAILS` | Making a new invite code fails |
| 80613 | CH-8013 | `COPYING_THE_CODE_OR_LINK_FAILS` | Copying the code or link fails (clipboard blocked) |
| 80614 | CH-8014 | `SAVING_SCORING_AND_FORMAT_FAILS` | Saving scoring and format fails |
| 80615 | CH-8015 | `SAVING_THE_REMINDER_SCHEDULE_FAILS` | Saving the reminder schedule fails |
| 80616 | CH-8016 | `SAVING_GOLF_DETAILS_FAILS` | Saving golf details fails (player) |
| 80617 | CH-8017 | `LEAVING_THE_TEAM_FAILS` | Leaving the team fails (player) |
| 80618 | CH-8018 | `ASKING_TO_JOIN_A_TEAM_FAILS` | Asking to join a team fails (player) |
| 80619 | CH-8019 | `CANCELLING_A_JOIN_REQUEST_FAILS` | Cancelling a join request fails (player) |
| 80620 | CH-8020 | `A_COACHHELM_DASHBOARD_SWITCH_DOESNT_SAVE` | A CoachHelm dashboard switch doesn't save (coach) |
| 80621 | CH-8021 | `THE_TEAM_COACHHELM_SWITCH_DOESNT_SAVE` | The team CoachHelm switch doesn't save (head coach) |
| 80622 | CH-8022 | `A_COACHHELM_PRIORITY_THRESHOLD_ALERT_OR_DISPLAY` | A CoachHelm priority, threshold, alert or display change doesn't save |
| 80623 | CH-8023 | `DELETING_THE_ACCOUNT_FAILS` | Deleting the account fails |
| 80624 | CH-8024 | `SIGNING_OUT_FAILS` | Signing out fails |
| 80625 | CH-8201 | `THE_PROFILE_READ_FAILS` | The profile read fails |
| 80626 | CH-8202 | `EMAIL_AND_PUSH_SETTINGS_DONT_LOAD` | Email and push settings don't load |
| 80627 | CH-8203 | `COACHHELM_UPDATE_SETTINGS_DONT_LOAD` | CoachHelm update settings don't load (player) |
| 80628 | CH-8204 | `THE_WEEKLY_TEAM_EMAIL_SETTING_DOESNT_LOAD` | The weekly team email setting doesn't load (coach) |
| 80629 | CH-8205 | `TEAM_DETAILS_DONT_LOAD` | Team details don't load |
| 80630 | CH-8206 | `THE_INVITE_CODE_DOESNT_LOAD` | The invite code doesn't load |
| 80631 | CH-8207 | `SCORING_SETTINGS_DONT_LOAD` | Scoring settings don't load |
| 80632 | CH-8208 | `EVENT_REMINDERS_DONT_LOAD` | Event reminders don't load |
| 80633 | CH-8209 | `GOLF_DETAILS_DONT_LOAD` | Golf details don't load (player) |
| 80634 | CH-8210 | `TEAM_MEMBERSHIP_DOESNT_LOAD` | Team membership doesn't load (player) |
| 80635 | CH-8211 | `COACHHELM_SETTINGS_DONT_LOAD` | CoachHelm settings don't load (coach) |
| 80636 | CH-8212 | `A_SECTION_CRASHES_WHILE_DRAWING` | A section crashes while drawing |
| 80637 | CH-8026 | `APPROVING_AN_ASSISTANT_COACH_REQUEST_FAILS` | Approving an assistant coach request fails (head coach) |
| 80638 | CH-8027 | `DECLINING_AN_ASSISTANT_COACH_REQUEST_FAILS` | Declining an assistant coach request fails (head coach) |
| 80639 | CH-8028 | `MAKING_A_STAFF_INVITE_FAILS` | Making a staff invite fails (head coach) |
| 80640 | CH-8213 | `THE_ASSISTANT_COACH_REQUESTS_DONT_LOAD` | The assistant coach requests don't load (head coach) |

## 07 — Network / offline

Status: DEFINED

Offline and slow saves are the shell's: a form save offline is refused before anything is sent (10703), a save over 5 seconds says so once (10702), the banner (10701), Try again on a notice while offline (10704). Settings adds one: a switch or a CoachHelm autosave offline is refused before it changes anything (80701). Not covered: the photo upload, push on this device, sign out, copy and Report a problem check nothing first and fail with their own toast (80602, 80607, 80624, 80613).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 80701 | — | `INSTANT_SAVE_REFUSED_OFFLINE` | While the browser is offline a switch, or a CoachHelm autosave, is refused before it changes anything: it stays where it was, nothing is sent, the error haptic fires and an error toast (CH-1903) says nothing was changed. |

From the shell (P001): 10701 CH-1901, 10702 CH-1902, 10703 CH-1903, 10704 CH-1905.

## 08 — Permission / authorization

Status: DEFINED

Who may open it: a signed-in coach or player with the Clubhouse flag on (the shell's gate). A session with neither profile gets nothing from the route, and the old links send a signed-out visitor to sign in (80803). What each role sees: the rail lists the role's sections and a section it does not have opens Account (80801); the old coaching link opens CoachHelm for a coach and Account for a player (80802). What an assistant coach cannot change: the whole-team CoachHelm switch, disabled with the reason and refused again by the server (80804). When the head-coach check itself fails, the loader logs it and leaves the switch out instead of treating the coach as an assistant (80804). The migrations in the repo let any staff coach of the team write the team and its settings, and any coach of the organization write the organization, so an assistant coach gets every team card (80805). A save the database refuses reaches the person as that card's failure toast. An update whose row a policy hides comes back with no error and no row; profile, team details, golf details and the coaching settings count the rows they change and fail with "Your account doesn’t have access to do this" (80808), as leaving a team already did. A refusal that arrives as an error, such as an upsert against a policy ("violates row-level security"), reads as "Check your connection" because the toast drops technical wording. All of this was read from the migrations and the code, not checked against the live database. Off team: a coach with no team has no team cards (80401); a player with no team can join with a code (80402), and the server actions refuse a request made with another player's profile or a cancel of someone else's request (read from the actions, not tested here). Writes are scoped to the caller (80806) and a new password needs the current one (80807). Deleting the account acts on the signed-in user only; the route takes no id.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 80801 | — | `SECTIONS_BY_ROLE` | The rail lists only the sections the role has (coach: Account, Notifications, Team, CoachHelm, Preferences; player: Account, Golf profile, Notifications, Preferences), and a link naming a section the role does not have opens Account. |
| 80802 | — | `COACHING_LINK_BY_ROLE` | The old /settings/coaching-intelligence link opens the CoachHelm section for a coach; a player lands on their own Settings (Account) instead of a coach-only page. |
| 80803 | — | `NO_PROFILE_NO_PAGE` | The Settings route renders nothing, and reads nothing, for a session that has neither a coach nor a player profile, and the old notifications and coaching links send a signed-out visitor to /golf/login. |
| 80804 | — | `TEAM_COACHHELM_HEAD_COACH_ONLY` | The switch that turns CoachHelm off for the whole team can be changed only by the team's head coach: an assistant sees it disabled with 'Only the head coach can change this.', the loader never creates the team row for an assistant, and the server action refuses too. When the check itself fails the loader does not guess: it logs the failure and leaves the switch out, so a head coach is never told they may not change it. |
| 80805 | — | `TEAM_CARDS_FOR_EVERY_STAFF_COACH` | Team details, the invite code, scoring and event reminders are shown to every coach on the team, assistants included; the screen does not tell head and assistant coaches apart there, so a save the database refuses arrives as that card's own failure toast (80808). |
| 80806 | — | `WRITES_SCOPED_TO_THE_CALLER` | Every write is scoped to the signed-in person: profile rows by their own user id, golf details by their own player id, leaving by their own membership of their team, and join requests, invite codes and the team CoachHelm switch by their own player or team id, which the server actions and row policies check again. |
| 80807 | — | `PASSWORD_NEEDS_THE_CURRENT_ONE` | A new password is set only after the current password signs in; a wrong current password changes nothing and says 'Your current password is incorrect.' |
| 80808 | — | `REFUSED_UPDATE_IS_A_FAILURE` | An update the database refuses by hiding the row (no error, no row changed) is a failure the person sees, not a save: profile, team details (the school, then the team), golf details and the coaching settings count the rows they change and fail with 'Nothing was saved. <what> was not found, or you are not allowed to change it.', which the toast shows as 'Your account doesn’t have access to do this.'; the card stays unsaved with its edits. Leaving a team already did this. |

From the shell (P001): 10801 CLUBHOUSE_GATE, 10802 ROLE_SCOPED_NAV.

## 09 — Success

Status: DEFINED

A save that lands says so by name and fires the success haptic (80901); a card with a Save button also says Saved for about two seconds. A switch, segment, slider or CoachHelm autosave that lands says nothing (80902, D-70): its selection tick was the feedback, and CoachHelm's status line reads All changes saved. Deleting the account has its own hand-over (80903). Copying the invite code or link toasts and fires the success haptic (81705).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 80901 | — | `CHANGE_LANDED` | A save that lands (profile, team details, scoring, reminders, golf details, email confirmation sent, password updated, new invite code, left the team, join request sent or cancelled) fires the success haptic and shows a toast naming what landed; a card with a Save button also says Saved for about two seconds. |
| 80902 | — | `INSTANT_SAVE_SILENT` | A switch, segment, slider or CoachHelm autosave that lands says nothing: no toast and no success haptic, because its selection tick was the feedback (D-70); the CoachHelm status line reads All changes saved. |
| 80903 | — | `ACCOUNT_DELETE_LANDED` | Once the account is deleted a toast says so and the success haptic fires, then this device's caches, active team and session are cleared and the person is sent to the sign-in page in the app or the home page on the web. |

From the shell (P001): 10901 CHANGE_LANDED.

## 10 — Warning

Status: DEFINED

Report a problem when the in-app form is not available is information, not an error: email opens (81001). Two standing conditions are stated in place: push blocked in the browser (81002) and quiet mode (81003). A request to do something destructive is a confirm (category 11), not a warning.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 81001 | CH-8025 | `REPORT_A_PROBLEM_CANT_OPEN_THE_IN` | Report a problem can't open the in-app form (info, not an error) |
| 81002 | — | `PUSH_BLOCKED_IN_BROWSER` | When the browser blocks notifications for GolfHelm the Push on this device switch is disabled and its row says how to allow them; when push is not supported the row is not shown. |
| 81003 | — | `QUIET_MODE_PAUSES_UPDATES` | With quiet mode on, every update except messages reads Paused by quiet mode and its switches are disabled; the CoachHelm updates card marks round reviews and goals from the coach Always delivered. |

## 11 — Destructive

Status: DEFINED

Five confirms: Delete account (the person types delete), Leave team, Make a new invite code, Reset CoachHelm updates, and Turn off CoachHelm on your dashboards (81101 to 81105). Only Delete account fires the warning haptic when it opens (81704); the other four open silently. Open: D-70 names Remove, Delete, Discard, Exit round and Dismiss, and does not say whether Leave team and the others count. Unsaved edits have their own confirms (category 12).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 81101 | CH-8501 | `DELETE_ACCOUNT` | Delete account |
| 81102 | CH-8502 | `LEAVE_TEAM` | Leave team (player) |
| 81103 | CH-8503 | `MAKE_A_NEW_INVITE_CODE` | Make a new invite code |
| 81104 | CH-8504 | `RESET_COACHHELM_UPDATES` | Reset CoachHelm updates (player) |
| 81105 | CH-8505 | `TURN_OFF_COACHHELM_ON_YOUR_DASHBOARDS` | Turn off CoachHelm on your dashboards |
| 81106 | CH-8509 | `PHONE_CLOSING_AN_EDIT_SHEET_WITH_UNSAVED` | Phone: closing an edit sheet (Cancel, swiping it down, Esc, tapping outside) with unsaved changes |
| 81107 | CH-8510 | `PHONE_DELETE_ACCOUNT_AFTER_DELETE_ACCOUNT_IS` | Phone: Delete account, after Delete account is chosen in the CH-8501 action sheet |

## 12 — State preservation

Status: DEFINED

Leaving with unsaved edits asks first: following a link (81201), switching section (81202), closing the tab (81203). A save that fails keeps the edits (81205), and a Retry that lands after the person kept typing leaves the newer typing as an unsaved edit instead of overwriting it (81205). A value saved in a section is still there when the person leaves it and comes back (81204; fixed 2026-09-30: the section used to show the value from when the page loaded, and a coach's first CoachHelm save could then create its row a second time). A slider moved just before leaving is saved, not dropped (81206; fixed 2026-09-30). A draft is never kept: Discard drops it.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 81201 | CH-8506 | `FOLLOWING_A_LINK_OFF_SETTINGS_WITH_UNSAVED` | Following a link off Settings with unsaved changes |
| 81202 | CH-8507 | `SWITCHING_SECTION_WITH_UNSAVED_CHANGES` | Switching section with unsaved changes |
| 81203 | CH-8508 | `CLOSING_OR_RELOADING_THE_TAB_WITH_UNSAVED` | Closing or reloading the tab with unsaved changes |
| 81204 | — | `SAVED_VALUES_KEPT_ACROSS_SECTIONS` | A value saved in a section is still there when the person leaves the section and comes back: the page keeps a copy of its data with each landed write applied, a fresh server read replaces that copy, and an unsaved draft is never kept. |
| 81205 | — | `FAILED_SAVE_KEEPS_EDITS` | A card save that fails keeps what the person typed: the card stays unsaved with Save enabled, and the toast's Retry sends the same values again; if the person kept typing before a Retry landed, the newer typing stays as an unsaved edit and is not overwritten. |
| 81206 | — | `WAITING_SLIDER_SAVED_ON_LEAVING` | A CoachHelm slider moved less than 600 ms before the person leaves the section is saved when they leave, not dropped. |

## 13 — Optimistic UI

Status: DEFINED

Switches, segments, sliders and the CoachHelm settings show the new value at once and save behind it; a failure puts back that control only (81302; fixed 2026-09-30: a failed CoachHelm dashboards switch used to put back another one flipped in the meantime). A switch that is saving holds its new position and cannot be flipped again (81301).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 81301 | CH-8403 | `A_SWITCH_IS_SAVING` | A switch is saving |
| 81302 | — | `OPTIMISTIC_ROLLBACK` | A switch, segment, slider or CoachHelm setting that saves on change shows its new value at once; when the save fails it goes back to the value it had, alone (a control changed meanwhile keeps its position), with an error toast and the error haptic. |

## 14 — Retry / recovery

Status: DEFINED

Try again on a section that did not load reads the whole page again on the server, not only that section (81401): the fresh read replaces the page's copy (81204), so the notice becomes its card, and the open section and unsaved edits in other cards stay. A card that is already open keeps its own draft; it reads the fresh copy the next time its section opens. Retry on an error toast repeats the same save and now finishes it the way the button does (81402; fixed 2026-09-30: after Retry landed a save the card stayed unsaved and a new invite code still showed the old one).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 81401 | — | `TRY_AGAIN_READS_THE_PAGE` | Try again on a section that did not load reads the whole page again on the server (router.refresh); the fresh read replaces the page's copy, so the notice becomes the card, and the open section and any unsaved edits in other cards stay; it does not re-read only that section. |
| 81402 | — | `RETRY_FINISHES_THE_SAVE` | Retry on a failed save's toast finishes it the way its button would: a form card is clean and the page refreshes, a new invite code shows, a dialog closes, and a switch flips again and sends the same value. |

From the shell (P001): 11401 ROUTE_TRY_AGAIN, 11402 TOAST_RETRY.

## 15 — Data freshness / sync

Status: DEFINED

Settings is rendered on the server for each request and has no realtime. After a save that changes what the server renders the page asks for a fresh read (81501). Changes made on another device appear on the next visit. Whether the browser's router cache reuses a recent copy on a quick revisit is not verified.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 81501 | — | `SERVER_VIEW_REFRESHED_AFTER_SAVE` | A save that changes what the server renders (profile, team details, leaving a team, asking to join) asks for a fresh server read (router.refresh) after it lands, and a failed save does not. |

## 16 — Micro animation

Status: DEFINED

Settings' own motion (81601 to 81608) on the v2 tokens (D-64), and the shell's press, sheets and toasts (11601 to 11612). Animations off in Preferences makes every Clubhouse transition instant (81608).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 81601 | CH-8601 | `SWITCHING_SECTION` | Switching section |
| 81602 | CH-8602 | `SAVE_STATUS_CHANGES` | Save status changes |
| 81603 | CH-8603 | `FLIPPING_A_SWITCH` | Flipping a switch |
| 81604 | CH-8604 | `A_CONFIRM_OPENS` | A confirm opens |
| 81605 | CH-8605 | `A_TOAST_APPEARS_OR_LEAVES` | A toast appears or leaves |
| 81606 | CH-8606 | `MOVING_A_COACHHELM_PRIORITY` | Moving a CoachHelm priority |
| 81607 | CH-8607 | `PRESSING_A_SECTION_OR_BUTTON` | Pressing a section or button |
| 81608 | CH-8608 | `ANIMATIONS_TURNED_OFF_IN_PREFERENCES` | Animations turned off in Preferences |

From the shell (P001): 11601 CH-1601, 11602 CH-1602, 11603 CH-1603, 11604 CH-1604, 11605 CH-1605, 11606 CH-1606, 11607 CH-1607, 11608 CH-1608, 11609 CH-1609, 11610 CH-1610, 11611 CH-1611, 11612 CH-1612.

## 17 — Haptic

Status: DEFINED

Settings' own haptics (81701 to 81707) on the v2 grammar (D-70), with Discard added (81708), and the shell's (11701 to 11706). Open: Leave team, Make a new invite code, Reset CoachHelm updates and Turn off CoachHelm open their confirm silently (see 11).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 81701 | CH-8701 | `PICKING_A_SECTION_FLIPPING_A_SWITCH_CHOOSING` | Picking a section, flipping a switch, choosing a segment, each slider step |
| 81702 | CH-8702 | `A_SAVE_LANDS` | A Save changes that lands |
| 81703 | CH-8703 | `A_SAVE_FAILS_OR_A_PHOTO_IS` | A save fails or a photo is rejected |
| 81704 | CH-8704 | `OPENING_DELETE_ACCOUNT_OR_PRESSING_UPDATE_PASSWORD` | Opening Delete account, or pressing Update password with a problem |
| 81705 | CH-8705 | `COPYING_THE_INVITE_CODE_OR_LINK` | Copying the invite code or link |
| 81706 | CH-8706 | `PRESSING_A_PRIMARY_BUTTON` | Pressing a primary button (Save changes) |
| 81707 | CH-8707 | `TURNING_HAPTICS_BACK_ON` | Turning Haptics back on |
| 81708 | — | `DISCARD_WARNS` | Discard (a card's edits, Discard changes when leaving a section, Discard and leave when following a link) fires the warning haptic before anything is dropped (D-70). |

From the shell (P001): 11701 CH-1701, 11702 CH-1702, 11703 CH-1703, 11704 CH-1704, 11705 CH-1705, 11706 CH-1706, 11707 CH-1707.

## 18 — Accessibility

Status: DEFINED

Settings' own (81801 to 81807): the rail is a navigation with the open section marked current; every switch has a name; save status and errors are announced; the notification grids are tables; dialogs trap focus and close on Esc; fields are labelled and their help or error is read with them. The shell's skip link, landmarks and dialog behaviour (11801 to 11811). Axe (clubhouse:a11y) has eight Settings pages at 1280 and 390.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 81801 | CH-8801 | `THE_SECTION_LIST_IS_A_NAVIGATION_LANDMARK` | The section list is a navigation landmark; the open section is marked current. On the phone the list is the landmark and an open section names itself in the bar ("Back to Settings" and the heading) |
| 81802 | CH-8802 | `EVERY_SWITCH_HAS_A_NAME_A_SCREEN` | Every switch has a name a screen reader reads (for example "Messages by email") |
| 81803 | CH-8803 | `SAVE_STATUS_CHANGES_ARE_ANNOUNCED` | Save status changes are announced |
| 81804 | CH-8804 | `ERRORS_ARE_ANNOUNCED` | Errors are announced |
| 81805 | CH-8805 | `THE_NOTIFICATION_GRIDS_ARE_TABLES` | The notification grids are tables. On the phone there is no grid: each kind is a button that names what is on, and its sheet has named switches |
| 81806 | CH-8806 | `DIALOGS_TRAP_FOCUS_ESC_CLOSES_FOCUS_RETURNS` | Dialogs trap focus, Esc closes, focus returns to the button |
| 81807 | CH-8807 | `EVERY_FIELD_HAS_A_LABEL_AND_ITS` | Every field has a label, and its help or error is read with it |

From the shell (P001): 11801 CH-1801, 11802 CH-1802, 11803 CH-1803, 11804 CH-1804, 11805 CH-1805, 11806 CH-1806, 11807 CH-1807, 11808 CH-1808, 11809 CH-1809, 11810 CH-1810, 11811 CH-1811, 11812 CH-1812, 11813 CH-1813, 11814 CH-1814.

## 19 — Responsive layout

Status: DEFINED

At 820px or less Settings is the native phone screen (81901; owner-approved 2026-09-30, docs/clubhouse/phone/settings.md): a grouped list that pushes each section as a history entry with the tab bar kept, edit cards as full-height sheets, choices as bottom sheets and destructive choices as action sheets, over the same data, writes and catalog numbers. On a wider canvas the rail becomes a scrolling strip below 860px and form grids stack below 560px.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 81901 | — | `PHONE_LAYOUT` | At 820px or less Settings is the native phone screen (docs/clubhouse/phone/settings.md): a grouped list that pushes each section as a history entry with the tab bar kept, edit cards as full-height sheets, choices as bottom sheets and destructive choices as action sheets; on a wider canvas the rail becomes a scrolling strip at 860px and form grids stack at 560px. |

From the shell (P001): 11901 PHONE_CHROME.

## 20 — Keyboard / input

Status: DEFINED

Enter sends the email confirmation from New email and asks to join from the invite code field; every other card saves only with its Save button (82001). Segmented controls move with the arrow keys, sliders with the arrows, Page Up and Page Down, Home and End (the native range), and Esc closes a confirm. There are no shortcuts.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 82001 | — | `ENTER_SUBMITS_TWO_FORMS` | Enter in the New email field sends the confirmation and Enter in the invite code field asks to join; every other card saves only with its Save button. |

## 21 — Performance

Status: DEFINED

One server pass in parallel batches, then first paint with the data in it, and no client fetch after paint (82101). Known and not merged: the loader reads golf_coach_philosophy twice (the weekly-email flag and the full row) and golf_teams twice (the team name and the team row). Web vitals are the shell's. Layout shift and first-load JavaScript are not measured.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 82101 | — | `LOADER_NEVER_FAILS_THE_PAGE` | The server loader reads everything the page shows before first paint, in parallel batches; a read that returns an error or throws becomes that section's failed flag and a chLogServer line, and never fails the page. |

From the shell (P001): 12101 CH-1954.

## 22 — Analytics

Status: DEFINED

The shell records rage, dead and slow clicks for every page. Settings adds no events of its own.

From the shell (P001): 12201 CH-1951, 12202 CH-1952, 12203 CH-1953.

## 23 — Logging / observability

Status: DEFINED

Every client failure is reported with its surface and action, every read that fails on the server is logged with its read name and area, and each intent leaves a breadcrumb (82301). A missing profile row or team row is logged as well as a failed read (added 2026-09-30).

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 82301 | — | `FAILURES_REPORTED` | Every client failure is reported through chReport with surface settings (form saves, by action name), settings.notifications, settings.routing or settings.coachhelm (switches and autosave), settings.profile, settings.invite or settings.session (cards) or settings.<section> (a crash, high severity); server reads log through chLogServer('settings', read, error, area); each intent leaves a chTrail breadcrumb. |

From the shell (P001): 12301 FAILURES_REPORTED.

## 24 — CI / automated test

Status: DEFINED

Two test files: settings.test.tsx (the screen) and settings-server.test.tsx (the loader, the route, the three addresses, the loading files and the live writes), plus the model checks in logic.test.ts (82401). `clubhouse:check` fails a catalog row of kinds 0 to 5 that no test names.

| Bridge ID | Code | Name | Meaning |
| --- | --- | --- | --- |
| 82401 | — | `TESTS_NAME_CONTRACTS` | settings.test.tsx and settings-server.test.tsx name every catalog code of kinds 0 to 5 they force, and every hand contract they prove by its Bridge ID in a test title; the settings model checks are in logic.test.ts. |

From the shell (P001): 12401 TESTS_NAME_CONTRACTS.

## 25 — Helm Bridge action

Status: N/A — the Bridge is wired later (owner, D-68). Every contract above already has its Bridge ID; the commands (open a section, save the open card) are defined when the Bridge is.
