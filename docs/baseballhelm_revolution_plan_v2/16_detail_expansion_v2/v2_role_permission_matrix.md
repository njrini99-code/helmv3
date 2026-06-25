# V2 Role Permission Matrix

Permissions should be capability-based, not route-name-based. A user can have multiple capabilities. A role label is only the default bundle.

## Default Capability Bundles

| Role | Default landing | Primary capabilities | Hidden by default |
|---|---|---|---|
| Head coach | Command Center | all staff baseball ops, roster, practice, stats, player profile, AI, reports, role review | private academic notes unless explicitly granted, medical documents |
| Assistant coach | Command Center | roster read, practice edit, stats read/import if granted, player notes, tasks, AI staff cards | admin, role management, restricted academic notes |
| Pitching coach | Command Center filtered to pitchers | pitcher profiles, pitching metrics, bullpen notes, workload flags, practice blocks, player development briefs | hitting-only details unless granted, admin |
| Hitting coach | Command Center filtered to hitters | hitter profiles, hitting metrics, cage notes, practice blocks, player development briefs | pitching-only restricted notes unless granted, admin |
| Strength staff | Performance dashboard | lift assignments/results, wellness/readiness summary, availability, performance notes | staff scouting notes, private academic details, recruiting |
| Director of ops | Team Ops/Calendar | schedule, travel, roster logistics, acknowledgements, class conflicts, imports, announcements | private performance notes unless granted |
| Academic viewer | Academics/Conflicts | class conflicts, travel letter status, academic risk field if provided, limited player contact | performance, staff scouting, wellness detail |
| Player | Player Today | own schedule, tasks, acknowledgements, player-visible profile/timeline, own lift/check-in, own stats | staff-only notes, other players' private data, AI staff flags |
| Admin | Admin/Settings | users, team roles, org/team settings, import audit, demo reset | none except data explicitly outside org/team |

## Capability Flags

| Capability | Description | Typical roles |
|---|---|---|
| `baseball.team.read` | Read team roster, schedule, public staff data | all team members |
| `baseball.team.manage` | Manage team settings, roster status, invites | head coach, admin |
| `baseball.practice.edit` | Create/edit/publish practice plans | coaches |
| `baseball.practice.attendance` | Mark attendance/participation | coaches, ops |
| `baseball.stats.import` | Import official game/season stats | head coach, assistant, ops |
| `baseball.stats.read_staff` | View full stats and development metrics | coaches |
| `baseball.performance.manage` | Manage lift/performance assignments and results | strength staff, head coach |
| `baseball.wellness.read_summary` | See readiness/availability summaries | coaches, strength staff |
| `baseball.wellness.read_detail` | See detailed check-in values | head coach, strength staff if granted |
| `baseball.academics.read_conflicts` | See class/practice/travel conflicts | coaches, ops, academic viewer |
| `baseball.academics.read_private` | See private academic notes/risk details | academic viewer, explicitly granted staff |
| `baseball.travel.manage` | Create/import travel itinerary and roster | ops, head coach |
| `baseball.import.manage` | Run imports, preview, commit, rollback | head coach, ops, admin |
| `baseball.ai.staff` | View staff-only AI briefs and flags | coaches, selected staff |
| `baseball.ai.player_visible` | View player-safe AI summaries | player, staff |
| `baseball.admin.roles` | Change roles and capabilities | admin, head coach |
| `baseball.audit.read` | Read audit logs | admin, head coach |

## Data Visibility Rules

| Data type | Player visibility | Staff visibility | Notes |
|---|---|---|---|
| Event schedule | own/team visible | team visible | Travel-sensitive details can be role-gated |
| Acknowledgement status | own status | aggregate and individual status | Players should not see team-wide non-response unless intentional |
| Practice plan | assigned blocks/player groups | full plan | Player sees relevant groups/stations, not staff-only notes |
| Official stats | own and team if product exposes team stats | full | Preserve source label |
| Development metrics | own if marked player-visible | full by staff capability | Imported vendor data may be staff-only until reviewed |
| Coach notes | only if explicitly shared | staff scoped | Default staff-only |
| Wellness check-in | own | summary/detail by capability | No medical claims |
| Availability status | own plus team status if needed | full by capability | Distinguish limited/available/unavailable |
| Class schedule | own | conflicts only unless academic-private grant | Avoid unnecessary private academic exposure |
| AI daily brief | player-safe only | staff brief | Separate generation or visibility filter |
| AI risk flags | not visible by default | staff only | Player-facing version must be rewritten as action/support |
| Import errors | not visible | importer/admin | Data-quality issue, not player issue |
| Audit logs | not visible | admin/head coach | Sensitive operational record |

## Required Role Tests

- Player cannot open staff-only Command Center cards.
- Player cannot read another player's wellness, private notes, or academic details.
- Strength staff can manage lift/performance data but cannot read private academic notes.
- Academic viewer can see class conflicts but cannot read lift/wellness details.
- Assistant coach without import capability cannot commit imports.
- Ops can manage travel and acknowledgements without seeing private development notes.
- Head coach can view staff AI but player-safe AI output remains separately permissioned.
- Admin role changes update sidebar/nav and server-side access, not just client UI.
