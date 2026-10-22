# Roster catalog (3xxx)

<!-- clubhouse:release-audit:start -->
## Catalog audit — 2026-10-06

Roster cards/list, player peek, invite, requests and read-only player view.
Check profile push/pop, note blur save, approve/decline feedback and roster
refresh without losing scroll.

See [current all-page evidence](../ALL_PAGE_AUDIT.md#p003-roster). Existing
checklist ticks and catalog identifiers retain their recorded scope. Automated
browser checks do not replace physical keyboard, gesture or
assistive-technology acceptance.
<!-- clubhouse:release-audit:end -->

Route `/golf/dashboard/roster` (coach) · code `src/clubhouse/screens/roster/`, loader
`src/clubhouse/data/roster.ts` · tests `src/clubhouse/__tests__/roster.test.tsx` · preview
`/clubhouse-preview/roster` (`?state=empty|failed|partial|loading`).

The player's roster (owner, 2026-10-01: "the same thing as coach except they
can't click") is the same route for a player: `TeamRoster` and
`TeamRosterPhone`, loader `src/clubhouse/data/roster-player.ts`, tests
`src/clubhouse/__tests__/roster-player.test.tsx`, preview
`/clubhouse-preview/roster-player` (`?state=empty|failed|noteam|loading`). CH-3210,
CH-3211, CH-3307, CH-3308, CH-3309, CH-3807 and CH-3808 are its own; CH-3302 is shared.

Success toasts sit next to their error. Every save goes through `useAction`, so
offline refusal (CH-1903), slow saves (CH-1902) and the commit/error haptics
(CH-1702, CH-1703) are the shell's.

## 30xx Error toasts

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-3001 | Removing a player fails | "Couldn’t remove Theo Marchetti" + "Nothing changed on the roster. Try again, or refresh if it keeps failing." Retry; the dialog stays open. Done: "Theo Marchetti removed from Varsity" | `useAction('roster.removePlayer')` | roster.test › CH-3001 |
| CH-3002 | Approving a join request fails | "Couldn’t approve Grace Liu" + "The request may have been withdrawn. Refresh to see the latest." The request comes back to the list. Done: "Grace Liu added to Varsity" | `useAction('roster.approveRequest')`, optimistic | roster.test › CH-3002 |
| CH-3003 | Declining a join request fails | "Couldn’t decline Grace Liu’s request"; the request comes back. Done: "Request from Grace Liu declined" | `useAction('roster.declineRequest')`, optimistic | roster.test › CH-3003 |
| CH-3004 | The coach's note doesn't save (on leaving the field) | "Couldn’t save your note about Theo" + "Your text is still in the field. Try again in a moment." Done: "Note saved for Theo" | `useAction('roster.coachNote')` | roster.test › CH-3004 |
| CH-3005 | The browser blocks the CSV download | "Couldn’t export the roster" + "Your browser blocked the download. Try again, or use a desktop browser." Done: "Roster exported · 7 players" | `exportCsv` | roster.test › CH-3005 |
| CH-3006 | Copying the team code or invite link fails | "Couldn’t copy the team code" + "Select it and copy it by hand." Done: "Team code copied" | `useCopyText` (Invite sheet, phone requests sheet) | roster.test › CH-3006 |
| CH-3007 | Approve all (phone requests sheet, D-55) leaves some requests unapproved | "Couldn’t approve Owen Park and Sam Reyes" + "1 of 3 added to Varsity. Those requests may have been withdrawn. Try again, or refresh to see the latest." Those requests stay listed, and Retry re-tries only them. Done: "3 players added to Varsity" | `useJoinRequests` → `useAction('roster.approveAll')`, one request at a time | roster.test › CH-3007 |
| CH-3008 | Changing a player's status (Active or Inactive) fails | "Couldn’t mark Theo Marchetti inactive" + "Nothing changed on the roster. Try again, or refresh if it keeps failing." Retry; the confirm stays open and the row keeps its status. Done: "Theo Marchetti marked inactive" (or "marked active"), and the player moves to that filter. Offline, nothing is sent (CH-1903). `updatePlayerStatus` resolves the coach's active team with the same resolver and cookie as the roster route | `useAction('roster.changeStatus')` → `updatePlayerStatus` | roster.test › CH-3008 |
| CH-3009 | Marking a player available, injured or away fails (row menu, the panel's or phone profile's Availability control) | "Couldn’t mark Jonah Okafor injured" + "Nothing changed on the roster. Try again, or refresh if it keeps failing." Retry. The word shows at once and goes back on failure; Retry applies it again and finishes the job. Done: "Jonah Okafor marked injured" (success haptic), with no action on the toast. No confirm: availability is display only and never changes team access (Mark inactive does). Offline, nothing is sent (CH-1903) | `useAction('roster.setAvailability')` → `setPlayerAvailability`, optimistic | roster.test › CH-3009 |
| CH-3010 | Retired 2026-10-21, never shipped: the availability note | There is no note. golf_team_members_select_v5 lets every teammate read every column of their team’s rows, so `availability_note` stays unused until a coach-only store exists (a held migration, docs/clubhouse/held/data/roster-availability.md). The number stays unused | — | retired |
| CH-3011 | The coach-only reason for an injured or away player doesn’t save (Why field, on leaving it) | "Couldn’t save the note about Ava" + "Your text is still in the field. Try again in a moment." + Retry; the text stays | — | defined |
| CH-3080 | Emailing the invite to players fails (Invite players › Email them): the request fails, the coach has sent a lot of invites this hour, email is paused, or the team has no code | "Couldn’t send the invites" + the reason ("You have sent a lot of invites. Try again in a little while, or share the team code or link.", "Email invites are off right now. Share the team code or link instead."). Retry only for a failure trying again can fix; every address stays in the box. Done: "Invite sent" or "3 invites sent"; "Sent 2 of 3 invites" when some did not go, those addresses stay marked "didn’t send" |`emailPlayerInvites` (`team-management.ts`; owner-gated customer email, `golf_player_invite`), `InviteByEmail` via `useAction` | roster-invite-email.test › CH-3080; email-player-invites.test |

## 31xx Validation

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-3101 | A coach's note is within 200 characters of its 2,000 limit | "150 characters left" under the field, then "That’s the limit: 2,000 characters." Typing stops at the limit | `CoachNote`, `maxLength` | roster.test › CH-3101 |
| CH-3102 | Retired 2026-10-21, never shipped: the availability note’s counter | No note, so no counter (CH-3010) | — | retired |
| CH-3180 | An address typed or pasted in Email them can’t be read as an email address | The address stays in the box as a red chip, "One address can’t be read. Fix or remove it." under the box, and Send is held until it is fixed or removed. Nothing is sent, and nothing is dropped | `parseInviteEmails` (`src/lib/golf/invite-emails.ts`), `InviteByEmail` chips (`data-ch-code`) | roster-invite-email.test › CH-3180; invite-emails.test |

## 32xx Didn't load

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-3201 | The roster doesn't load | "The roster didn’t load" + "Your players are safe…" Try again. Never "No players". With join requests failing too, the page's one notice under the head says both and carries the one Try again (CH-1209, `PageRefreshNotice`), and this keeps its title alone | `Roster`, `RosterPhone`; logged `clubhouse.roster.members` | roster.test › CH-3201, CH-1209 |
| CH-3202 | Season rounds don't load | "Season stats didn’t load" + "The roster is complete, but averages, form and strokes gained are missing until the rounds load." Try again; figures show "—" and no Needs a look chips | `Roster`, `RosterPhone` (and the phone profile); logged by `loadSeasonRounds` | roster.test › CH-3202 |
| CH-3203 | Join requests don't load | "Join requests didn’t load" + "Pending requests are safe…" Try again; covered by the page's one notice (title alone) when another part failed too (CH-1209) | `RosterRequests`; on the phone `RequestsBanner`, in the banner slot; logged `clubhouse.roster.joinRequests` | roster.test › CH-3203 |
| CH-3204 | The join requests section crashes | "Join requests couldn’t be shown." + "The rest of the page is fine…" Try again | `SectionBoundary roster.requests` | roster.test › CH-3204 |
| CH-3205 | The roster list crashes | "The roster couldn’t be shown." … | `SectionBoundary roster.list` | roster.test › CH-3205 |
| CH-3206 | The player panel crashes | "The player panel couldn’t be shown." … | `SectionBoundary roster.peek` | roster.test › CH-3206 |
| CH-3207 | The team row doesn't load | Invite players shows "The team code didn’t load" + "Your code still works for players who have it. Try again to show it here." (never "no team code"); the header reads "Your team" | `InviteModal`; logged `clubhouse.roster.team` | roster.test › CH-3207 |
| CH-3208 | Focus areas or goals don't load | The panel's Development counts read "—", never 0 | `RosterPeek`; logged `clubhouse.roster.golf_player_focus_areas` / `golf_goals` | roster.test › CH-3208 |
| CH-3209 | This coach's notes don't load | The note field is read-only with "Your notes didn’t load, so this one can’t be edited right now. Refresh the page to try again." A blank field can never save over a real note | `CoachNote locked`; logged `clubhouse.roster.coachNotes` | roster.test › CH-3209 |
| CH-3210 | The player's roster doesn't load (a player's own team's members) | "The roster didn’t load." + "Your team is safe. Try again; the error has been reported." Try again. Never "No one on the roster" | `TeamRoster`, `TeamRosterPhone`; logged `clubhouse.roster.playerMembers` | roster-player.test › CH-3210 |
| CH-3211 | The player's roster list crashes | "The roster couldn’t be shown." … The header, search and sort stay | `SectionBoundary roster.team` | roster-player.test › CH-3211 |
| CH-3212 | CoachHelm's counts don't load for the roster (the coach's gate, the visible reads or the newest rounds) | The panel's CoachHelm block (and the phone profile's CoachHelm panel) reads "— costing strokes · — working" + "Didn’t load. Refresh to try again.", never 0 or "No reads yet"; View insights stays | `RosterPeek` `HelmBlock`, `HelmPanel`; logged `clubhouse.coachhelm.gate` / `visible` / `newestRounds`, or `clubhouse.roster.coachhelm` | roster.test › CH-3212; roster-peek-reads.test |

## 33xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-3301 | No players yet | The page empty state (v2 medallion): "No players yet" + "Players who sign up with your team code or open your invite link join right away. You can remove anyone here." + Invite players; on desktop also Copy team code when the team has one (v2 says "by email"; there is no email invite, Data gaps). Every count would be 0, so the head shows the team and season only (desktop drops "0 players · 0 active.", the phone kicker reads the team's name), and the phone top bar's invite icon steps aside for the empty state's primary; it stays when the roster read failed (wave 10) | `Roster`, `RosterPhone` | roster.test › CH-3301 |
| CH-3302 | A search matches nobody | "No players match "zzz"" + Show everyone | `Roster`, `TeamRoster` | roster.test › CH-3302 |
| CH-3303 | A status filter has nobody | "No inactive players." / "No active players." + Show everyone | `Roster` | roster.test › CH-3303 |
| CH-3304 | The team has no team code | "There’s no team code yet" + "Make one in Settings, then invite players here." + Open team settings | `InviteModal` | roster.test › CH-3304 |
| CH-3305 | A player has no 18-hole rounds | Form reads "No 18-hole rounds this season" and "Form appears once rounds are posted." | `RosterPeek`, phone `RosterProfile` | roster.test › CH-3305 |
| CH-3306 | A coach signed in with no active team | The page empty state (v2 medallion): "You aren’t on a team yet" + "Your players appear here once your team is set up." + Open team settings (Team). It used to be Home's state (CH-2307), whose text is about Home | `RosterNoTeam`, from `ClubhouseRosterRoute` | roster.test › CH-3306 |
| CH-3307 | A player's team has nobody on it | The page empty state: "No one on the roster yet" + "Teammates show up here as they join with the team code." No action. The head shows the team and season only (no "0 players") | `TeamRoster`, `TeamRosterPhone` | roster-player.test › CH-3307 |
| CH-3308 | A player signed in with no active team | The page empty state: "You aren’t on a team yet" + "Your teammates appear here once your coach approves your request to join." + Open team settings (Golf profile, CH-8302) | `RosterNoTeam viewer="player"` | roster-player.test › CH-3308 |
| CH-3309 | A player alone on their team's roster (they are always on it once joined, so this is a new team's first run) | Their own row, then one quiet line: "You’re the first one here. Teammates show up as they join." No search, layout or sort control | `TeamRoster`, `TeamRosterPhone` | roster-player.test › CH-3309 |

## 34xx Loading

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-3401 | Roster is loading | Header, toolbar and six face cards as skeletons in their final slots | `RosterSkeleton`, `aria-busy`; below 820px the phone list rows, switched in CSS | roster.test › CH-3401 |
| CH-3402 | A remove is in flight | The button reads "Removing…" and can't be pressed again | `Modal` footer | roster.test › CH-3402 |
| CH-3403 | Approve all is in flight (phone join requests sheet, D-55) | The footer reads "Approving…" and can't be pressed again; each Approve and Decline waits too | `RequestsSheet` footer | roster.test › CH-3403 |
| CH-3404 | A status change is in flight | The confirm button reads "Saving…" and can't be pressed again; Cancel waits and the dialog can't be dismissed | `StatusConfirm` footer | roster.test › CH-3404 |
| CH-3405 | An availability change is in flight | The row or panel already shows the new word; the Availability control is `aria-busy` and refuses a second change until the first lands | `AvailabilityPanel` (`useAction` in-flight gate, shared with the row menu) | roster.test › CH-3405 |

## 35xx Confirm

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-3501 | Remove from team (row menu; on the phone, the profile's ⋯ sheet) | "Remove player?" + "Remove Theo Marchetti from Varsity? They can rejoin later with the team code." + "Their account and stats are not deleted…" Keep Theo / Remove player (the safe choice names the player) | `Modal` | roster.test › CH-3501 |
| CH-3502 | Mark inactive / Mark active (coach only: row menu; on the phone, the profile's ⋯ sheet) | "Mark player inactive?" + "Move Theo Marchetti to Inactive on Varsity?" + "They stay on the team with their account and stats, but leave team rankings and averages. Until you mark them active again, the app shows them no team." Cancel / Mark inactive. For an inactive player: "Mark player active?" + "Move Theo Marchetti back to the active roster of Varsity?" Not destructive: the confirm is the primary, no red and no warning haptic (D-42, D-70) | `StatusConfirm` (`Modal`) | roster.test › CH-3502 |

## 36xx Motion

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-3601 | Opening or switching a player (desktop: from a Needs a look chip) | The panel slides in 16px and fades (260ms); switching players cross-fades | `RosterPeek`, `chTween('base')`; on the phone the profile is pushed instead (the shell's CH-1610) | preview |
| CH-3602 | Hovering or pressing a face card or row | On desktop a face is a raised tile that lifts 8px on hover with a stronger gold ring and takes the green tint on press (110ms), with no scale; a list row presses the same way from its name; the selected face keeps a green tint, a 2px green ring and a stronger gold frame. On the phone a player row, an action in the ⋯ sheet and the profile's All link take the row press tint over the press beat, and the join requests card (the screen's one feature card) darkens under a shade over the press beat; nothing scales | `roster.css`, `--ch-ledger-row-press` | preview |
| CH-3603 | Switching between Team view and List view | The other layout settles in with a 6px rise (260ms) while the old one fades out (180ms), hidden from assistive tech. The kept layout coming back as the page opens never animates. Instant with reduced motion | `Swap` in `Roster` (`viewTurn`) | roster.test › CH-3603; preview (the timing) |
| CH-3604 | Phone: choosing Avg, SG or Name | Each moved row slides to its new place on the smooth spring, and each row's trailing figure is the new sort's figure at once, plain tabular text with a true minus: no digits roll and nothing counts up (owner rule, as on Qualifiers). A refresh never moves the rows. Instant with reduced motion or Animations off | `useRosterSort` (TanStack Table sorting), `<ViewTransition>` class `ch-rsm-reorder`, `RosterPhoneRow` | roster-sort.test › CH-3604; preview (the timing) |

## 37xx Haptics

| # | When | They feel | How | Test |
| --- | --- | --- | --- | --- |
| CH-3701 | Opening a player; changing a filter, layout or sort | A selection tick | `select()`, `Segmented`, `PillGroup` | roster.test › CH-3701 |
| CH-3702 | An export lands | The OS success pattern (D-70) | `exportCsv` | roster.test › CH-3702 |
| CH-3703 | The code or link is copied | The OS success pattern | `useCopyText` (Invite sheet, phone requests sheet) | preview |

## 38xx Accessibility

| # | What | How | Test |
| --- | --- | --- | --- |
| CH-3801 | The desktop list view is a table (phone rows: CH-3806): every value, including the player's open button, sits in a cell under a column header | `role="table|row|cell|columnheader"` | roster.test › CH-3801 |
| CH-3802 | A face card reads its status as a word; the green dot is decoration | `ch-sr-only`, `aria-hidden` dot | roster.test › CH-3802 |
| CH-3803 | Esc closes the player panel, except while typing a note (desktop; on the phone, Back and the edge swipe pop the profile, CH-1906) | `RosterPeek` key handler | roster.test › CH-3803 |
| CH-3804 | The note counter is announced politely; a locked note says why it's locked | `aria-live`, `aria-describedby` | roster.test › CH-3804 |
| CH-3805 | No axe violations in any preview state, both layouts, 1280px and 390px | `npm run clubhouse:a11y` | a11y scan |
| CH-3806 | Phone: a player row is one button that reads name, class, note, average and handicap; the form spark is decoration | `RosterPhoneRow` `aria-label`, spark `aria-hidden` | roster.test › CH-3806 |
| CH-3807 | The player's roster is read-only: a teammate is text, not a control. The desktop cards and table rows and the phone rows are not links or buttons, so none takes focus or a press, and nothing on the screen opens a profile, stats or notes or does anything to a teammate. Search, layout and sort only change what is listed | `TeamRoster`, `TeamRosterPhone` (`ch-rs-face--static`, `ch-rsm-row--static`) | roster-player.test › CH-3807 |
| CH-3808 | The player's roster names the coaches (wave 7, decision D): a "Coaches" group above the players: name and role ("Head coach" first, else their title, else "Coach"), plain text like every row. Desktop: a Coach and Role table; phone: a list under its heading, then "Players". Left out when the staff read failed (logged `playerCoaches`) or none is on record | `TeamRoster`, `TeamRosterPhone`; `loadPlayerRoster` (`golf_team_coach_staff` with `golf_coaches(full_name, title)`) | roster-player.test › CH-3808 |
| CH-3809 | Availability is said in words, never a colour: "Injured" or "Away" (the word only, no note) in the list's line under the name, a face's note slot and the phone row, in plain ink (red is under par, amber a slide, green a gain). A face's name and a phone row's name append "injured" or "away"; the Availability control is a radio group named for the player; the head counts "· 1 injured · 1 away" among the active | `RowMeta`, `faceLabel`, `RosterPhoneRow`, `AvailabilityPanel` | roster.test › CH-3809 |
| CH-3880 | Email them is one labelled field ("Or email them"). Each address is a chip with its own "Remove eli@school.edu" button, an unreadable one adds ", can’t be read as an email address" and one that did not send ", didn’t send"; Backspace in the empty field removes the last chip; the count and the result are read politely, and an unreadable address is announced as an alert | `label`, `aria-label`, `ch-sr-only`, `role="alert"` / `role="status"` | roster-invite-email.test › CH-3880 |

## 39xx Network and UX

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-3980 | Customer email is switched off for everyone (`HELM_CUSTOMER_EMAIL_ENABLED` is not `true`, `src/lib/email/outbound-gate.ts`) or no mail transport is configured, so Invite players cannot email anyone | The sheet keeps the team code and the invite link and replaces the email field with one quiet line: "Email invites are off for now. Share the team code or link above." No field, no button | `loadRoster` → `emailInvites` (`canEmailPlayerInvites`), `InviteByEmail` | roster-invite-email.test › CH-3980 |
