# V11 Auth, Team Join, Staff Roles, And Program Access

This document turns BaseballHelm access control into a clean product system. It is grounded in the current `Downloads/helmv3` app:

- Current auth action: `/Users/ricknini/Downloads/helmv3/src/app/baseball/actions/auth.ts`
- Current onboarding action: `/Users/ricknini/Downloads/helmv3/src/app/baseball/actions/onboarding.ts`
- Current team action: `/Users/ricknini/Downloads/helmv3/src/app/baseball/actions/teams.ts`
- Current auth hook: `/Users/ricknini/Downloads/helmv3/src/hooks/use-baseball-auth.ts`
- Current auth store: `/Users/ricknini/Downloads/helmv3/src/stores/auth-store.ts`
- Current dashboard shell: `/Users/ricknini/Downloads/helmv3/src/components/baseball/dashboard-shell.tsx`
- Current join route: `/Users/ricknini/Downloads/helmv3/src/app/baseball/join/[code]/page.tsx`
- Current join client: `/Users/ricknini/Downloads/helmv3/src/app/baseball/join/[code]/join-team-client.tsx`
- Current complete signup client: `/Users/ricknini/Downloads/helmv3/src/app/baseball/(auth)/complete-signup/CompleteSignupClient.tsx`

## Current State To Preserve

The current BaseballHelm auth flow already has valuable production pieces:

- Server-side email/password login with rate limiting.
- Account lockout protection.
- Password strength validation.
- Generic password reset messaging to prevent email enumeration.
- Signup metadata containing `role`, `sport: baseball`, names, and selected role.
- Role resolution from `users`, `baseball_coaches`, and `baseball_players`.
- Redirects to coach onboarding, player onboarding, complete signup, or role-specific dashboards.
- `useBaseballAuth` fast-path authorization using the existing auth store, then background Supabase verification.
- `BaseballDashboardShell` with Sidebar, CommandPalette, mobile bottom nav, focus trap, escape behavior, skip link, and safe bottom padding.
- Player team join links at `/baseball/join/[code]`.
- Direct `join_code` lookup on `baseball_teams`.
- Invitation table lookup on `baseball_team_invitations`.
- Multi-team player rules for high school, showcase, JUCO, and college.
- IDOR protection on `joinTeam` and `processTeamInvitation`.
- RLS-aware team membership model through `baseball_team_members`.
- Staff relationship model through `baseball_team_coach_staff`.

Do not replace this. Claude should extend it.

## Access Model

BaseballHelm should use one account system and multiple program roles.

The user is authenticated by Supabase Auth. The application role is resolved from database records, not from user-editable metadata.

Primary identity tables:

| Layer | Current Table | Purpose |
|---|---|---|
| Auth identity | `auth.users` | Supabase login identity. |
| App user | `users` | Stable app user row and primary role hint. |
| Coach/staff profile | `baseball_coaches` | Any staff member who can operate inside a program: head coach, assistant, pitching coach, hitting coach, strength coach, director of ops, analyst, athletic trainer if enabled. |
| Player profile | `baseball_players` | Player identity and player-facing profile. |
| Team/program | `baseball_teams` | Team context with program type and `join_code`. |
| Player membership | `baseball_team_members` | Player-to-team membership. |
| Staff membership | `baseball_team_coach_staff` | Coach/staff-to-team membership and role scope. |

V11 rule: a lifting coach is not a separate auth identity type. A lifting coach is a `baseball_coaches` row joined to a team through `baseball_team_coach_staff` with strength/performance capabilities.

## Role Taxonomy

The current `coach_type` enum represents program market type: `college`, `high_school`, `juco`, `showcase`. It should not be overloaded to mean job title.

Add staff role fields on `baseball_team_coach_staff` or a companion staff-profile table.

Recommended staff roles:

| Staff Role | Product Label | Default Landing | Core Access |
|---|---|---|---|
| `head_coach` | Head Coach | Command Center | Full team operations, roles, settings, roster, practice, stats, lifting, CoachHelm, imports. |
| `associate_head_coach` | Associate Head Coach | Command Center | Broad staff access except billing/owner transfer unless granted. |
| `assistant_coach` | Assistant Coach | Command Center | Roster, practice, notes, stats, tasks, assigned player groups. |
| `pitching_coach` | Pitching Coach | Pitching Signals | Pitchers, bullpens, pitch data, workload, pitcher practice blocks, pitcher video. |
| `hitting_coach` | Hitting Coach | Hitting Signals | Hitters, cage work, hitting stats, approach plans, hitting video. |
| `catching_coach` | Catching Coach | Catcher Workload | Catchers, throwing, receiving, pop times, pitcher/catcher workload. |
| `defensive_coach` | Defensive Coach | Defense Board | Fielding, positions, throwing, defensive practice blocks. |
| `strength_coach` | Performance Coach | Performance Dashboard | Lifting, readiness, soreness, bodyweight, modifications, lift groups, lift reports. |
| `athletic_trainer` | Athletic Trainer | Availability Board | Availability, soreness, limitations, return-to-play status if enabled; no private tactical notes by default. |
| `director_ops` | Director of Ops | Calendar/Ops | Calendar, travel, documents, acknowledgements, logistics, imports if granted. |
| `analyst` | Analyst | Stats Lab | Imports, data quality, reports, advanced stats, source review; no private notes unless granted. |
| `volunteer` | Volunteer Staff | Assigned Tasks | Limited practice/tasks/attendance, no private player data by default. |

Recommended player roles:

| Player Type | Current Enum | Team Rules |
|---|---|---|
| High school | `high_school` | May join one high school team and one showcase team. |
| Showcase | `showcase` | May join one showcase team and one high school team. |
| JUCO | `juco` | One JUCO team; recruiting can auto-activate unless player has explicitly disabled visibility. |
| College | `college` | One college team. |

## Capability Model

Use capability flags instead of hardcoding every decision to role names. Role names define defaults; capabilities define the final permissions.

Recommended capability columns:

```text
baseball_team_coach_staff
- staff_role text
- title text
- is_primary boolean
- status text: active, invited, suspended, removed
- capabilities jsonb
- player_scope jsonb
- position_scope text[]
- group_scope uuid[]
- can_invite_staff boolean
- can_manage_roster boolean
- can_manage_practice boolean
- can_manage_lineups boolean
- can_manage_stats boolean
- can_manage_imports boolean
- can_manage_lifting boolean
- can_view_readiness boolean
- can_modify_availability boolean
- can_view_academics boolean
- can_view_private_notes boolean
- can_message_players boolean
- can_export_reports boolean
```

Capabilities must be server-enforced in actions and RLS. The UI may hide controls, but hidden controls are not security.

## Login UX

The login surface should feel like a premium team operations product, not a generic form.

Required login behavior:

- Single BaseballHelm login at `/baseball/login`.
- Email and password fields with visible labels.
- Password show/hide toggle.
- Rate-limit and lockout errors displayed near form with recovery language.
- "Forgot password" path.
- Return URL support for invite links.
- Role-aware redirect after login.
- If the user clicked a team invite link while logged out, login should return to `/baseball/join/[code]`, not dump the user at dashboard.
- If the user has no Baseball profile, redirect to `/baseball/complete-signup?returnTo=...`.
- If the user has both coach and player profiles, show a role switcher after login or route to last selected Baseball role.
- If the user has staff access to multiple teams, show a team/program switcher before landing if no active team exists.

Premium UI requirements:

- Full-screen auth layout with BaseballHelm brand, program-specific copy, and an embedded live product preview panel.
- Mobile-first layout with no horizontal overflow.
- Stable form height so error states do not jump the whole page.
- 44px minimum input and button height.
- Inline error messages with exact recovery path.
- Skeleton only for session checks; no long blank white screen.
- Avoid celebratory effects on login. Save celebration for successful team join or onboarding completion.

## Signup UX

Signup should support three entry paths:

1. Public signup from marketing or direct app entry.
2. Player team invite signup.
3. Staff invite signup.

Required signup fields:

- First name.
- Last name.
- Email.
- Password.
- Role: Player or Staff.
- For player: player type.
- For staff: program market type if creating a program, or staff role if joining a program invite.
- Return URL/invite code context preserved.

Current code uses `signupAction(email, password, role, firstName, lastName)` and passes metadata `{ role, sport: 'baseball' }`. Keep that, but do not trust metadata for authorization. Use metadata only to bootstrap onboarding.

## Complete Signup UX

Current complete signup asks "Coach" or "Player" and program/player type. V11 needs it to handle invite context.

Required upgrades:

- If signup came from player team invite, preselect Player and explain what team they are joining.
- If signup came from staff invite, preselect Staff and show the invited staff role.
- If signup came from strength coach invite, show "Performance Coach" as the role and explain access.
- If signup is organic, show clear role cards:
  - Create a program as Head Coach.
  - Join a program as Staff.
  - Join as Player.
- Preserve back navigation.
- Autosave selections locally until completion.
- Explain program type differences without long marketing copy.
- Never force a player to create a recruiting profile before team join.

## Team Join Flow For Players

The current `/baseball/join/[code]` flow is a good base. V11 upgrades it into a polished join confirmation and eligibility workflow.

Existing behavior to preserve:

- Logged-out users redirect to signup with return path.
- Logged-in users must have a player profile.
- Code can come from `baseball_team_invitations.code` or `baseball_teams.join_code`.
- Already-member state links to team dashboard.
- Invalid code state is clear.
- Expired/inactive state is clear.
- Join action validates player/team compatibility.
- Join action checks authenticated user owns the player profile.
- JUCO teams can auto-enable recruiting unless privacy is explicitly private.

Required premium join screen:

- Program header: logo, team name, organization, city/state, program type.
- Invite status: valid, expired, inactive, max uses reached, pending approval, already joined.
- Player identity confirmation: name, player type, existing team memberships.
- Eligibility explanation: "You can join this team because high school players may join one high school and one showcase team."
- Conflicting membership explanation: show current team and why join is blocked.
- Pending approval path if program requires coach approval.
- Confirmation checkbox for sharing team-visible profile info.
- Success state:
  - Team joined.
  - Calendar synced.
  - Announcements/messages enabled.
  - Lifts/practice assignments will appear in Player Today.
  - CTA to Team Dashboard.

Do not overuse confetti. A short check animation is enough.

## Staff Invite Flow

This is missing from the current Baseball app and must be planned as a new module.

Staff invites should be created from Program Settings or Staff Management.

Routes:

- `/baseball/staff/join/[code]`
- `/baseball/dashboard/settings/staff`
- `/baseball/dashboard/settings/staff/invites`
- `/baseball/dashboard/settings/staff/[staffId]`

Recommended tables:

```text
baseball_staff_invitations
- id uuid
- team_id uuid references baseball_teams(id)
- organization_id uuid references organizations(id)
- email text nullable
- code text unique
- invited_by_coach_id uuid references baseball_coaches(id)
- staff_role text
- title text
- capabilities jsonb
- position_scope text[]
- group_scope uuid[]
- expires_at timestamptz
- max_uses integer default 1
- used_count integer default 0
- is_active boolean default true
- accepted_by_user_id uuid nullable
- accepted_by_coach_id uuid nullable
- accepted_at timestamptz nullable
- created_at timestamptz
- updated_at timestamptz
```

Staff invite behavior:

- Head coach or capability-granted admin creates invite.
- Invite can be email-bound or link-only.
- Invite preview shows exact role/capabilities before sending.
- Invite code can be copied, emailed, QR-shared, or revoked.
- New staff without account signs up and returns to invite acceptance.
- Existing coach/staff logs in and accepts.
- If the invited user already has a `baseball_coaches` row, attach it to `baseball_team_coach_staff`.
- If the invited user has no `baseball_coaches` row, create it with `coach_type` matching the program market type and `onboarding_completed = true` after minimal staff onboarding.
- Acceptance writes an audit event.
- Role changes after acceptance require confirmation and audit logging.

## Strength Coach Invite

Strength coach invite is a special staff invite preset, not a separate flow.

Default strength coach capabilities:

```text
can_manage_lifting = true
can_view_readiness = true
can_modify_availability = false by default
can_manage_practice = false by default
can_manage_stats = read-only summary by default
can_view_private_notes = false by default
can_message_players = true by default for assigned groups
can_export_reports = true for performance reports
position_scope = all positions unless restricted
group_scope = assigned lift groups if configured
```

Strength coach onboarding asks:

- Name and title.
- Certifications optional.
- Preferred training style: linear, undulating, conjugate, velocity-based, return-to-play, in-season maintenance.
- Sports covered: baseball now, future sports optional.
- Primary groups: pitchers, catchers, position players, injured/limited, freshmen, travel roster.
- Load prescription preference: percent 1RM, RPE, RIR, velocity, coach-entered load.
- Readiness inputs enabled: soreness map, bodyweight, sleep, stress, arm status.
- Visibility comfort: what players can see, what head coach can see.

## Program Creation Flow

Head coach program creation should create:

- `users` row with role coach.
- `baseball_coaches` row.
- `organizations` row.
- `baseball_teams` row with `join_code`.
- `baseball_team_coach_staff` row making creator primary head coach.
- Default staff capability presets.
- Default player groups:
  - Pitchers.
  - Catchers.
  - Position players.
  - Two-way players.
  - Injured/limited.
  - New players.
- Default lifting groups:
  - Pitcher in-season.
  - Position player in-season.
  - Catcher maintenance.
  - Return-to-play.

The current onboarding creates organization, coach profile, and team, but may not always create a `baseball_team_coach_staff` primary row. Claude should verify this and add it if missing.

## Team Context And Role Switcher

BaseballHelm needs an active team context because one user can have:

- One player profile with multiple allowed teams.
- One staff profile on multiple teams.
- A head coach role and a player role in edge cases.
- A strength coach role across multiple sports in the future.

Recommended client/server context:

```text
active_baseball_context
- user_id
- active_role: player, coach
- active_team_id
- active_staff_role
- active_player_id
- active_coach_id
- active_season_id
```

Implementation can use a cookie plus server validation:

- Cookie stores current team and role for quick routing.
- Server actions validate membership every time.
- If cookie context is stale, route to team switcher.
- Team switcher displays role badges and program type.

## Settings: Staff And Access

Staff settings should be a premium admin surface.

Required sections:

- Staff roster table.
- Pending invites.
- Role preset editor.
- Capability matrix.
- Player/group scope.
- Position scope.
- Data visibility.
- Audit log.
- Invite link management.
- Owner/head coach controls.

Staff roster columns:

- Name.
- Title.
- Staff role.
- Teams.
- Scope.
- Last active.
- Open tasks.
- Pending approvals.
- Access status.
- Actions.

Capability matrix rows:

- Roster.
- Practice.
- Lineups.
- Stats.
- Imports.
- Video.
- Lifting.
- Readiness.
- Availability.
- Academics.
- Private notes.
- Messages.
- Reports.
- Settings.

Each row should have:

- View.
- Create.
- Edit.
- Delete.
- Export.
- Player-visible toggle where relevant.

## RLS Requirements

RLS must align with the staff capability model.

Minimum policy helpers:

```text
get_my_baseball_coach_id()
get_my_baseball_player_id()
is_baseball_team_member(team_id)
is_baseball_team_staff(team_id)
is_baseball_primary_coach(team_id)
has_baseball_staff_capability(team_id, capability)
can_view_baseball_player(team_id, player_id)
can_manage_baseball_lift_group(team_id, group_id)
```

RLS design:

- Players can read their own player-visible assignments, team announcements, schedule, roster fields allowed by program settings, and their own lift history.
- Players can insert their own lift set results, readiness check-ins, soreness maps, bodyweight entries, and task responses.
- Players cannot view private staff notes, other players' readiness, other players' lift loads, or staff-only CoachHelm signals unless explicitly player-visible.
- Strength coaches can view assigned players/groups and performance data.
- Strength coaches can create/edit lifting programs, sessions, assignments, modifications, and performance notes for their scope.
- Strength coaches cannot view private academic notes by default.
- Head coaches can view and manage all team-scoped data.
- Analysts can view/import stats without automatically seeing private readiness or medical-adjacent fields.

Security rule: never authorize from `raw_user_meta_data`. Use database rows and staff capabilities.

## Notifications

Auth and join notifications:

- Invite accepted by player.
- Invite accepted by staff.
- Invite expired.
- Join request pending.
- Join request approved.
- Join request rejected.
- Staff role changed.
- Staff invite revoked.
- Lifting coach assigned to group.

Player notifications:

- New lift assigned.
- Lift changed.
- Coach modified load.
- Lift due today.
- Missed lift.
- Readiness check-in due.
- Soreness follow-up requested.

Coach notifications:

- New player joined.
- Player failed eligibility/team rule.
- Staff invite accepted.
- Player lift complete.
- Player missed lift.
- Readiness red flag.
- Pitcher soreness + high recent workload.

## Program Type Differences

High school:

- Player/guardian account support should be planned.
- Staff roles are often fewer; head coach may also be strength coordinator.
- Join flow should support roster import and invite links.
- Strength dashboard emphasizes attendance, simple progression, soreness, bodyweight, and safe form cues.

College:

- Staff roles are deeper.
- Strength coach is likely a separate user.
- Academics, travel, compliance-sensitive visibility, lifting, practice, video, and advanced stats all matter.
- Team context and staff capability matrix are critical.

JUCO:

- Recruiting visibility rules matter.
- Strength coach must support transfer readiness and fall/spring cycles.
- Player profile should connect lifting progress to recruiting-visible measurables only when player/program allows it.

Showcase:

- Team joins may be event-based or temporary.
- Strength module may focus on testing days, measurables, readiness, and performance history rather than daily training cycles.
- Invite links may expire after an event or roster window.

## Acceptance Criteria

Auth:

- Login returns invite users to the invite flow.
- Login resolves player, coach, and dual-profile users without misrouting.
- Signup cannot bypass onboarding.
- Password reset does not reveal whether an email exists.
- Rate limiting and account lockout remain in place.

Team join:

- Valid player invite shows team context and player identity.
- Invalid, inactive, expired, maxed, already-member, and blocked-eligibility states are polished.
- Team join validates the authenticated user owns the player profile.
- Team join writes `baseball_team_members`.
- Team join updates player-facing dashboard and team roster.

Staff invite:

- Head coach can invite assistant coach and strength coach.
- Invited staff can sign up or log in and accept.
- Staff membership writes to `baseball_team_coach_staff`.
- Capability scope affects UI and server actions.
- Revoked invite cannot be accepted.
- Role changes are audited.

Strength coach access:

- Strength coach sees Performance Dashboard after login.
- Strength coach can create groups and assign lifts only for scoped teams/groups.
- Player sees assigned lift in Player Today and calendar.
- Player lift result is visible to strength coach and head coach.
- Private readiness and availability obey role visibility.
