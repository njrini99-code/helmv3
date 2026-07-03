# Current Auth And Roles

## Observed model

Current UI logic distinguishes at least:

- `user.role === 'coach'`
- `user.role === 'player'`
- coach types: `college`, `juco`, `showcase`, `high_school`

The sidebar uses those values to choose navigation. JUCO receives Academics. Player sees a team-mode nav.

## Problems

- `coach_type` is doing too much work. It blends market segment, permissions, and navigation.
- Staff roles inside a college program are not sufficiently represented.
- A college team needs head coach, assistant coach, pitching coach, hitting coach, strength coach, director of operations, academic viewer, student manager, and admin roles.
- Player account visibility must be separate from coach/staff visibility, especially for academic notes, staff notes, injury limitations, and AI flags.

## Future role model

Use:

- `profiles`: authenticated user identity.
- `organizations`: school/program/account owner.
- `teams`: baseball team/program.
- `team_memberships`: user-team membership and top-level role.
- `staff_role_assignments`: granular staff capabilities.
- `players`: athlete identity, optionally linked to a user profile.
- `permission_overrides`: rare explicit overrides.

## Future role types

- `org_admin`
- `head_coach`
- `assistant_coach`
- `pitching_coach`
- `hitting_coach`
- `strength_coach`
- `director_ops`
- `academic_viewer`
- `student_manager`
- `player`
- `parent_guardian` future/usually disabled for college.
