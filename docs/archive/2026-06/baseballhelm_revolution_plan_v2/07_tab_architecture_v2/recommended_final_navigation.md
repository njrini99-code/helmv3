# Recommended Final Navigation

## Principle

Navigation must shrink. BaseballHelm should feel premium and focused, not like an enterprise admin dump.

## Final coach/staff primary nav

1. Command
2. Roster
3. Calendar / Team Ops
4. Practice
5. Stats
6. Performance
7. Reports
8. Import
9. Admin / Settings

## What moved

| Old / V1 top-level area | V2 destination |
|---|---|
| CoachHelm AI | Embedded inside Command, Practice, Reports, Player Profile, Import |
| Hitting Development | Player Profile + Phase 2 Development tab/context |
| Pitching Development | Player Profile + Phase 2 Development tab/context |
| Availability & Wellness | Performance |
| Lifting & Performance | Performance |
| Academics | Calendar/Team Ops conflict layer + restricted player profile notes |
| Travel | Calendar/Team Ops |
| Communication | Calendar/Team Ops and Command actions |
| Recruiting | Deferred; hidden from Phase 1 nav |
| Documents | Team Ops or player profile attachments |

## Player nav

1. Today
2. Schedule
3. Tasks
4. Performance
5. My Profile

Players should not see the coach app compressed onto mobile. They should see a simple action app.

### Implementation note (nav registry)

These five surfaces are guaranteed in the player nav by `BASEBALL_NAV_REGISTRY`
(`src/lib/baseball/nav-registry.ts`):

| Spec item | Registry id | Route | Notes |
|---|---|---|---|
| Today | `player-today` | `/baseball/player/today` | player-only |
| Schedule | `calendar` | `/baseball/dashboard/calendar` | shared (`both`) route; renders as **"Schedule"** for players via `playerLabel`, **"Calendar"** for coaches |
| Tasks | `player-tasks` | `/baseball/dashboard/tasks` | player-only; page scopes to the player's own assignments (RLS + read model) |
| Performance | `performance` | `/baseball/dashboard/performance` | shared (`both`); players see their own loads |
| My Profile | `player-profile` | `/baseball/dashboard/profile` | player-only |

Order is enforced per program mode in `program-type-variants.ts`
(`playerNavPriority`): Today → Schedule → Tasks → (mode-specific) → Profile.

### Broader-than-5 divergence (intentional, confirmable)

The registry also surfaces the shared `roster`, `stats-center`, and
`practice-planner` entries to players, which is broader than the strict 5-item
list above. This is **intentional under the v4 program-type model**, not drift:
the per-mode `playerNavPriority` arrays deliberately include Stats and Practice
for college/JUCO players (a college player's "simple action app" still needs
their stats + the published practice plan), while modes that should stay lean
(e.g. showcase) rank them lower / omit them. Roster is a read-only team view for
players. Visibility is a UX affordance only — every page independently enforces
the player read model + RLS, so no staff-only / private data is exposed. If the
owner wants the player nav reduced to exactly five items in a given mode, drop
the unwanted ids from that mode's `playerNavPriority` (the registry entries can
stay `both` for coaches).
