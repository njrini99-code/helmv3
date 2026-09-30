# P008 — Settings

One page for both roles: an account, notification, team and CoachHelm control room with a section rail.
Built from the design system because the handoff has no Settings screen (D-18).

## Identity

```text
Page ID:            P008
Page Name:          Settings
Route:              /golf/dashboard/settings (coach and player), ?section=account|notifications|team|golf|coachhelm|preferences
                    The old /golf/dashboard/settings/notifications and /golf/dashboard/settings/coaching-intelligence
                    open a section of this page (SCREENS.md lists them as deep links)
Bridge Namespace:   8 (Bridge IDs 8ccii, D-68; catalog codes CH-8xxx)
Roles:              coach, player
Implementation Root: src/clubhouse/screens/settings
Manifest:           config/clubhouse/pages/P008-settings.json
```

## Purpose

### Primary user

A college golf coach (head coach or assistant) keeping their account, notifications, team defaults and
CoachHelm the way they want them. A player uses the same page for their own profile, golf details, team
membership and notifications.

### Job to be done

Change a setting and know that it saved, without losing anything half-typed on the way.

### Primary action

None. Settings is a list of independent controls; each card has its own action (Save changes, a switch,
Ask to join). One section is open at a time.

### Secondary actions

Coach: change name and photo, email, password; email and push per kind of update; quiet mode; the weekly
team email; team details; copy or share the invite code and make a new one; scoring and format; event
reminders; CoachHelm on or off (for the team, if head coach, and for the coach's own dashboards),
priorities, sensitivity, thresholds, alerts, signal controls, analysis windows and display; animations
and haptics on this device; Report a problem; sign out; delete the account.
Player: the same account, notification and device controls, plus golf details, leave the team or ask to
join one with an invite code (and cancel the request), and the CoachHelm update matrix.

### Information hierarchy

1. The open section's cards, each with its own Save or switches.
2. The section rail: the sections this role has, the open one marked.
3. The header: the role, team and email the settings belong to.

### User should notice first

Which section they are in, and whether a card has unsaved changes ("Unsaved changes" in its footer).

### User should never have to think about

Whether a switch saved (it says so only when it did not, and puts the switch back), whether leaving
loses their edits (it asks), or whether they may change something (an assistant coach sees the
team-wide CoachHelm switch disabled with the reason).

### Success looks like

A coach sets up their team's scoring, reminders and invite code in a couple of minutes, and every card
that did not save told them exactly which one and why.

## Semantic features

Canonical IDs from `memory/registry.yml`:

```text
- settings_preferences
- auth_onboarding_join
- coachhelm_ai
```

## Design authority

```text
Package:          none. The handoff (v1 and v2) has no Settings screen (design/handoff/VERSIONS.md does not name one).
Reference:        design/handoff/design-system/components (Surface, Inset, PopoverPanel, FormField, Input, Select,
                  Switch, Segmented); the layout was chosen by the owner on 2026-09-29 (D-18): one page, a section
                  rail, the open section a flat green tint. The manifest also lists design/handoff/sidebar.css and
                  depth.css.
Phone spec:       docs/clubhouse/phone/settings.md (approved by the owner 2026-09-30; built)
Status:           draft (built to D-18; the owner has not reviewed the built screen)
```

## Related pages

### Enters from

The top bar's Settings gear (desktop), the More sheet (phone, D-41), Roster's invite state ("Open team
settings" opens `?section=team`), and the two old links (`/settings/notifications`,
`/settings/coaching-intelligence`).

### Exits to

The sign-in page (sign out, delete account), the privacy policy and terms (new tab), and the mail app
(Report a problem, when the in-app form is not available). Roster is where a coach approves the players
who join with the invite code.

## Ownership

```text
Design:          the owner (D-18), from the design system
Implementation:  src/clubhouse/screens/settings, on the current tables and server actions
Data:            users.notification_preferences; golf_coaches; golf_players; golf_teams; organizations;
                 golf_team_settings; golf_team_members; golf_team_join_requests; golf_coach_philosophy;
                 golf_coachhelm_settings; golf_team_coachhelm_settings; golf_player_notification_state;
                 the avatars bucket; Supabase Auth (email, password)
```

## Current status

```text
Design:         draft (no handoff screen; owner review of the built screen open)
Implementation: in_progress (desktop and phone built; owner review of both open)
Contract:       complete (CONTRACT.md: all 25 categories answered)
Bridge:         reserved (IDs recorded; nothing is sent until the Bridge is wired, D-68)
Data:           existing (no held plans)
Verification:   partial (VERIFY.md)
Docs:           current
```
