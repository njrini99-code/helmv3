# Roster catalog (3xxx)

Route `/golf/dashboard/roster` (coach) · code `src/clubhouse/screens/roster/`, loader
`src/clubhouse/data/roster.ts` · tests `src/clubhouse/__tests__/roster.test.tsx` · preview
`/clubhouse-preview/roster` (`?state=empty|failed|partial|loading`).

Success toasts sit next to their error. Every save goes through `useAction`, so
offline refusal (CH-1903), slow saves (CH-1902) and the commit/error haptics
(CH-1702, CH-1703) are the shell's.

## 30xx Error toasts

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-3001 | Removing a player fails | "Couldn't remove Theo Marchetti" + "Nothing changed on the roster. Try again, or refresh if it keeps failing." Retry; the dialog stays open. Done: "Theo Marchetti removed from Varsity" | `useAction('roster.removePlayer')` | roster.test › CH-3001 |
| CH-3002 | Approving a join request fails | "Couldn't approve Grace Liu" + "The request may have been withdrawn. Refresh to see the latest." The request comes back to the list. Done: "Grace Liu added to Varsity" | `useAction('roster.approveRequest')`, optimistic | roster.test › CH-3002 |
| CH-3003 | Declining a join request fails | "Couldn't decline Grace Liu's request"; the request comes back. Done: "Request from Grace Liu declined" | `useAction('roster.declineRequest')`, optimistic | roster.test › CH-3003 |
| CH-3004 | The coach's note doesn't save (on leaving the field) | "Couldn't save your note about Theo" + "Your text is still in the field. Try again in a moment." Done: "Note saved for Theo" | `useAction('roster.coachNote')` | roster.test › CH-3004 |
| CH-3005 | The browser blocks the CSV download | "Couldn't export the roster" + "Your browser blocked the download. Try again, or use a desktop browser." Done: "Roster exported · 7 players" | `exportCsv` | roster.test › CH-3005 |
| CH-3006 | Copying the join code or link fails | "Couldn't copy the join code" + "Select it and copy it by hand." Done: "Join code copied" | `useCopyText` (Invite sheet, phone requests sheet) | roster.test › CH-3006 |
| CH-3007 | Approve all (phone requests sheet, D-55) leaves some requests unapproved | "Couldn't approve Owen Park and Sam Reyes" + "1 of 3 added to Varsity. Those requests may have been withdrawn. Try again, or refresh to see the latest." Those requests stay listed, and Retry re-tries only them. Done: "3 players added to Varsity" | `useJoinRequests` → `useAction('roster.approveAll')`, one request at a time | roster.test › CH-3007 |

## 31xx Validation

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-3101 | A coach's note is within 200 characters of its 2,000 limit | "150 characters left" under the field, then "That's the limit: 2,000 characters." Typing stops at the limit | `CoachNote`, `maxLength` | roster.test › CH-3101 |

## 32xx Didn't load

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-3201 | The roster doesn't load | "The roster didn't load." + "Your players are safe…" Try again. Never "No players" | `Roster`, `RosterPhone`; logged `clubhouse.roster.members` | roster.test › CH-3201 |
| CH-3202 | Season rounds don't load | "Season stats didn't load." + "The roster is complete, but averages, form and strokes gained are missing until the rounds load." Try again; figures show "—" and no Needs a look chips | `Roster`, `RosterPhone` (and the phone profile); logged by `loadSeasonRounds` | roster.test › CH-3202 |
| CH-3203 | Join requests don't load | "Join requests didn't load." + "Pending requests are safe…" Try again | `RosterRequests`; on the phone `RequestsBanner`, in the banner slot; logged `clubhouse.roster.joinRequests` | roster.test › CH-3203 |
| CH-3204 | The join requests section crashes | "Join requests couldn't be shown." + "The rest of the page is fine…" Try again | `SectionBoundary roster.requests` | roster.test › CH-3204 |
| CH-3205 | The roster list crashes | "The roster couldn't be shown." … | `SectionBoundary roster.list` | roster.test › CH-3205 |
| CH-3206 | The player panel crashes | "The player panel couldn't be shown." … | `SectionBoundary roster.peek` | roster.test › CH-3206 |
| CH-3207 | The team row doesn't load | Invite players shows "The join code didn't load." + "Your code still works for players who have it. Try again to show it here." (never "no join code"); the header reads "Your team" | `InviteModal`; logged `clubhouse.roster.team` | roster.test › CH-3207 |
| CH-3208 | Focus areas or goals don't load | The panel's Development counts read "—", never 0 | `RosterPeek`; logged `clubhouse.roster.golf_player_focus_areas` / `golf_goals` | roster.test › CH-3208 |
| CH-3209 | This coach's notes don't load | The note field is read-only with "Your notes didn't load, so this one can't be edited right now. Refresh the page to try again." A blank field can never save over a real note | `CoachNote locked`; logged `clubhouse.roster.coachNotes` | roster.test › CH-3209 |

## 33xx Empty

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-3301 | No players yet | "No players on the roster yet." + "Share your join code and approve requests as they arrive…" + Invite players | `Roster`, `RosterPhone` | roster.test › CH-3301 |
| CH-3302 | A search matches nobody | "No players match "zzz"" + Show everyone | `Roster` | roster.test › CH-3302 |
| CH-3303 | A status filter has nobody | "No inactive players." / "No active players." + Show everyone | `Roster` | roster.test › CH-3303 |
| CH-3304 | The team has no join code | "Your team has no join code yet." + "Make one in Settings, then invite players here." + Open team settings | `InviteModal` | roster.test › CH-3304 |
| CH-3305 | A player has no 18-hole rounds | Form reads "No 18-hole rounds this season" and "Form appears once rounds are posted." | `RosterPeek`, phone `RosterProfile` | roster.test › CH-3305 |

## 34xx Loading

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-3401 | Roster is loading | Header, toolbar and six face cards as skeletons in their final slots | `RosterSkeleton`, `aria-busy`; below 820px the phone list rows, switched in CSS | roster.test › CH-3401 |
| CH-3402 | A remove is in flight | The button reads "Removing" and can't be pressed again | `Modal` footer | roster.test › CH-3402 |
| CH-3403 | Approve all is in flight (phone join requests sheet, D-55) | The footer reads "Approving" and can't be pressed again; each Approve and Decline waits too | `RequestsSheet` footer | roster.test › CH-3403 |

## 35xx Confirm

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-3501 | Remove from team (row menu; on the phone, the profile's ⋯ sheet) | "Remove player?" + "Remove Theo Marchetti from Varsity? They can rejoin later with the team code." + "Their account and stats are not deleted…" Cancel / Remove player | `Modal` | roster.test › CH-3501 |

## 36xx Motion

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-3601 | Opening or switching a player | The panel slides in 16px and fades (260ms); switching players cross-fades | `RosterPeek`, `chTween('base')`; on the phone the profile is pushed instead (the shell's CH-1610) | preview |
| CH-3602 | Hovering or pressing a face card or row | It lifts (180ms) and shrinks about 6px (110ms) and springs back (280ms); the selected card keeps a green ring | `roster.css` | preview |

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
| CH-3804 | The note counter is announced politely; a locked note says why it's locked | `aria-live`, `aria-describedby` | roster.test › CH-3101 |
| CH-3805 | No axe violations in any preview state, both layouts, 1280px and 390px | `npm run clubhouse:a11y` | a11y scan |
| CH-3806 | Phone: a player row is one button that reads name, class, note, average and handicap; the form spark is decoration | `RosterPhoneRow` `aria-label`, spark `aria-hidden` | roster.test › CH-3806 |
