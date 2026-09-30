# P008 — Settings: design handoff

## Package

```text
Source:   none. The handoff (v1 and v2) has no Settings screen; the owner chose the layout and the pieces
          (D-18, 2026-09-29) and the page is built from the design system.
Version:  design/handoff/design-system/components (Surface, Inset, PopoverPanel, FormField, Input, Select,
          Switch, Segmented); design/handoff/sidebar.css and depth.css are the manifest's desktop files
Date:     2026-09-29
Status:   desktop draft (the owner has not reviewed the built screen); phone approved by the owner 2026-09-30
          (docs/clubhouse/phone/settings.md, mockups linked there) and built
```

## Design objective

A quiet control room on the depth vocabulary: one page, a rail of sections, and cards that each own their
save. Nothing is saved behind the person's back that they cannot see, and a card that could not read its
data never shows a blank form that could be saved over the real values.

## Problems being solved

Three separate routes (general, notifications, coaching intelligence) collapse into one page. The old page
could show a blank form after a failed read, could not clear an organization field once it was set, sent a
new invite code without asking, and deleted an account without a typed confirmation (D-18).

## User goal

Change one thing, see that it took, and leave.

## Visual hierarchy

Header (Settings; role, team and email), the rail (232px, sticky), then one section of cards at up to 720px.
A card is the design system's Surface: 15px title, caption, actions on the right, a 16/20 body, and the
ivory footer (status on the left, Save on the right). The open section is a flat green tint in the rail.
Below an 860px canvas the rail becomes a scrolling strip above the section; below 560px forms stack.

## Components

### Reused Clubhouse primitives

`Avatar`, `Badge`, `Button`, `IconButton`, `Icon`, `Modal`, `InlineNotice`, `EmptyState` (section),
`SectionBoundary`, `Skeleton`, `Switch`, `Segmented`, `Select`, `Slider`, `Toast`, `useChReducedMotion`.

### New Clubhouse components

`Settings` (the live container), `SettingsView` (header, rail and the open section), the six sections
(`AccountSection`, `NotificationsSection`, `TeamSection`, `GolfSection`, `CoachHelmSection`,
`PreferencesSection`), the shared pieces in `parts.tsx` (`Card`, `Row`, `Field`, `SaveBar`, `ReadFailed`,
`SettingSwitch`, and the hooks `useDraft`, `useSaveAction`, `useInstantSave`, `useUnsavedGuard`),
`keepSaved` (`live.ts`), `SettingsSkeleton`, and `createLiveWrites` (`writes.ts`). The behaviour the desktop cards and
the phone share is in `hooks.ts` (`useDelivery`, `useRouting`, `useCoachHelmPower`, `useInvite`, `useMembership`, and
the rest). The phone screen is in `phone/` (below).

### Modified Clubhouse components

None beyond the foundation's v2 changes (motion, haptics).

## Actions affected

All of them: the list is `config/clubhouse/pages/P008-settings.json` `actions`, and the graph is WIRING.md.

## Contract categories affected

All 25 (CONTRACT.md).

## Motion intent

Switching section is a base crossfade with a 6px settle (CH-8601, `CH_ROUTE`); the save status fades in
and settles after about two seconds (CH-8602); a switch thumb slides on a small spring (CH-8603); confirms
rise (CH-8604); toasts slide up (CH-8605); a moved CoachHelm priority glows green once (CH-8606); presses
are the shell's (CH-8607). Animations off in Preferences makes all of it instant (CH-8608). Everything uses
the v2 tokens (D-64).

## Haptic intent

v2 grammar (D-70): a selection tick for a section, a switch, a segment and each slider step; success when a
save lands and when an invite code or link is copied; error when a save fails or a photo is refused; warning
when Delete account opens, when Update password is pressed with a problem, and on every Discard; the light
tap on primary buttons. A switch, segment, slider or autosave that saves on change is silent when it lands
(its selection tick was the feedback, 80902). Turning Haptics back on gives one selection tick.

## Desktop

The rail and one section side by side on a canvas up to 1080px. Unsaved changes on any card are guarded:
switching section asks (CH-8507), following a link asks (CH-8506), closing the tab asks (CH-8508).

## Phone

Built 2026-09-30, to the design the owner approved that day (`docs/clubhouse/phone/settings.md`, with the mockups
linked in its Status line; where the text and the mockups differ, the mockups won). At 820px or less (`useChPhone`)
`SettingsView` renders `phone/SettingsPhone.tsx` in place of the rail page: a different screen over the same data,
writes and catalog numbers (81901).

- **The list.** The large title "Settings" (34px, the bar carries only "‹ More"); an identity row (photo or initials
  coin, name, role and team, and the handicap for a player) that opens the Profile sheet; a card of 52px rows with an
  icon tile, a label, a short summary and a chevron (coach: Account, Notifications, Team, CoachHelm, Preferences;
  player: Account, Golf profile, Notifications, Preferences); a card with Report a problem, Privacy policy and Terms
  of service; and Sign out in a card of its own. The tab bar stays.
- **Sections push** over the list. Each is a history entry, so Back, "‹ Settings" and the iOS edge swipe pop it
  (CH-1906); a section named in the URL (`?section=`) opens pushed. The heading is the bar's, for VoiceOver, and the
  large title is drawn in the page.
- **Grouped rows.** A switch row is the whole row (tap anywhere toggles) and keeps the design system's switch
  (`role="switch"`, the tick, the busy state), drawn 51 by 31. A picker row opens a bottom sheet of options and saves as
  one is picked. A slider row keeps the slider full width under its label and value.
- **Notifications.** This device (push on this device, the weekly team email); Email and push (one row per kind, each
  showing "Email, Push" and opening a sheet of Email and Push switches, then Quiet mode); for a player, CoachHelm
  updates (Rounds and reviews, Goals, Insights, each opening a sheet of In app, Push and Email, then Quiet mode).
  A kind spans several updates (Goals is four), so a switch in its sheet changes all of them in one write and is on
  only when every update in the kind has it on; a channel that is on for some shows "(some)" on the row and says how
  many in the sheet.
- **Team (coach).** The invite code card with Share and New code; Team details (Team name opens a sheet with the season
  and school; Team timezone is a picker); Scoring and format (three pickers); Event reminders (a switch, and each time
  is a slider in a sheet).
- **CoachHelm (coach).** The power switches (the team switch is locked for an assistant coach, with the reason), the
  priorities with the native reorder handle (touch and hold a row, then drag; a selection tick at each step; saved
  once, on drop), then every other desktop control as rows: sensitivity, thresholds, alerts, evidence, windows and
  display.
- **Edit sheets.** Profile, Team details and Golf details are full-height sheets with Cancel, a title and Save; Save is
  off until something changes (and while it is invalid). Email, Password, Join a team, the reminder times and the
  typed Delete are shorter ones. Cancel, a swipe down, Esc and tapping outside all ask first when there are changes
  (CH-8509), and a swipe that is refused puts the sheet back.
- **Destructive choices** (Delete account, Leave team, New invite code, Turn off CoachHelm, Discard) are iOS action
  sheets: a card saying what will happen with the destructive choice in red, and Cancel in a card of its own. Each warns
  as it opens (D-70). Delete account then asks for "delete" typed in a follow-up sheet (CH-8510).
- **Haptics** (D-70): a selection tick on switches, pickers and each reorder step; success when a save lands; error
  when one fails; warning before a destructive action.

### Where the built screen differs from the mockups

The mockups are samples of the design, not an inventory: where the desktop has a control they do not draw, it is built
as a row in the same style.

- Real values stand where the mockups had placeholders: the role line reads "Head coach" or "Coach" (a head coach is
  known from the CoachHelm read) and the team's name, not the school; "HCP" is the player's handicap and is left out
  when there is none; the email, the invite code (eight characters, no hyphen), the reminder times ("1 day before",
  "1 hour before") and the Minimum rounds value ("5 rounds") are the saved ones.
- A coach has one Full name field, not First and Last: the coach's profile stores a single name.
- The identity row opens the Profile sheet, as drawn. The Account row opens an Account section (Profile, Email,
  Password, Delete account), because the mockup gives Email, Password and Delete no other home; the Profile sheet's Email
  row opens Change email over it.
- Notifications combine what the mockup shows for a coach and for a player: the coach gets This device and Email and
  push (five kinds), the player gets those and CoachHelm updates. The weekly team email sits under This device, as drawn.
- The quiet-mode footnote says what the router does: quiet mode pauses these updates, and round reviews and goals your
  coach assigns are always delivered. The mockup's "keeps CoachHelm to in app only" is not what happens (quiet mode
  blocks in app as well).
- Added beyond the mockups so nothing on the desktop is lost: Scoring format, Final reminder, the season and school
  fields, the power switches, sensitivity, thresholds, alerts, windows and display in CoachHelm, and the golf details
  rows.
- Not built: Mute push, Mute email and Reset on the CoachHelm updates (each kind's sheet changes the same switches),
  and Copy code and Copy link (Share opens the share sheet, or copies the link where the device has none).

## Accessibility

The rail is a navigation with the open section marked current; every switch has a name; save status is
announced politely and errors as alerts; the notification grids are tables; dialogs are the native
`<dialog>`; fields are labelled and their help or error is read with them; a section that crashes is named.

## Data assumptions

Only data the app has. Not shown because Clubhouse does not honour them yet (PROGRESS.md data gaps): theme,
display density, date format, score display and distance units; the comparison weights stay hidden as in the
current app.

## Existing backend capabilities used

Supabase Auth (`updateUser`, `signInWithPassword`), `getNotificationPreferences` and
`updateNotificationPreferences`, `setCategoryChannel`, `setAllChannels`, `setQuietMode`,
`saveCoachingPhilosophy`, `regenerateJoinCode`, `createTeamJoinRequest`, `cancelJoinRequest`,
`getPlayerJoinRequests`, `getTeamCoachHelmAccess`, `getOrCreateTeamCoachHelmSettings`,
`updateTeamCoachHelmSettings`, direct RLS-scoped table writes, and `DELETE /api/account/delete`.
WIRING.md maps each.

## HELD requirements

### New features

None.

### New data/schema

None.

### Owner decisions

D-18 (one page with a rail; both notification stores stay; only preferences Clubhouse honours; Coaching
intelligence is the CoachHelm section; the typed delete, the confirm before a new code, blank organization
fields can be cleared), D-41 (Settings in the More sheet on the phone), D-64 (motion), D-70 (haptics).
Open: approval of the phone design, and review of the built desktop screen.

## Explicit non-goals

Theme and display formats, comparison weights, a phone-native Settings (until approved),
and any new server behaviour.

## Fresh-build confirmation

```text
[x] No old Fairway presentation is required
[x] No old Fairway component is nested in the new screen (clubhouse:check refuses the imports)
[x] Shared reuse is non-UI/headless infrastructure only (the server actions, the push hook, the appearance preference)
```
