# P008 — Settings: design handoff

## Package

```text
Source:   none. The handoff (v1 and v2) has no Settings screen; the owner chose the layout and the pieces
          (D-18, 2026-09-29) and the page is built from the design system.
Version:  design/handoff/design-system/components (Surface, Inset, PopoverPanel, FormField, Input, Select,
          Switch, Segmented); design/handoff/sidebar.css and depth.css are the manifest's desktop files
Date:     2026-09-29
Status:   draft (the owner has not reviewed the built screen; docs/clubhouse/phone/settings.md awaits approval)
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
`keepSaved` (`live.ts`), `SettingsSkeleton`, and `createLiveWrites` (`writes.ts`).

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

Not built. The phone design in `docs/clubhouse/phone/settings.md` is a draft awaiting owner approval (a
grouped list that pushes to each section, sheets for edit cards, action sheets for destructive choices).
Until then the desktop layout reflows (81901): the rail becomes a strip and forms stack. That is not the
phone design and it is not the Settings gate `phone`.

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
