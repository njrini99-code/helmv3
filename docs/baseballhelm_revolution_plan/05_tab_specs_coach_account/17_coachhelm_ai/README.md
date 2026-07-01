# CoachHelm AI — Readme

## Purpose

CoachHelm AI exists to support AI module hub with briefs, flags, Q&A for a college baseball program.

## Primary users

Head coach, assistant coaches, director of operations, and role-specific staff depending on permissions.

## Secondary users

Players, strength coach, academic viewer, student managers, and admin users where relevant.

## Why this tab matters in college baseball

College baseball staffs are small, time-constrained, and operationally overloaded. This tab should remove spreadsheet/text-thread chaos and create one source of truth for the workflow.

## Market research inspiration

- Teamworks/ARMS show that athletic departments need roster, calendar, communication, travel, and academic organization.
- GameChanger/NCAA stat systems show that official stat conventions matter.
- TrackMan/Rapsodo/Blast/Driveline show that player-development data is valuable but siloed.
- TeamBuildr/BridgeAthletic show that lift compliance and readiness are daily operational signals.

## What competitors miss

Competitors usually solve one domain deeply but fail to connect that domain to the player's full baseball timeline and daily staff decisions.

## BaseballHelm opportunity

Create a baseball-specific command surface that connects roster identity, events, notes, stats, development, lifts, wellness, academics, imports, and AI.

## Current app state if any

Current repo has related route surfaces for roster, stats, videos, dev plans, calendar, messages, announcements, tasks, documents, travel, and academics, but not a fully unified implementation for this future tab.

## Recommended future state

### Key cards / sections

- Command Brief
- Risk Flags
- Player Analyst
- Practice Assistant
- Import Assistant

## Coach workflow

1. Open tab from coach navigation.
2. Review today/default filtered view.
3. Filter by team, position group, player, status, date range, or owner.
4. Add or import data.
5. Resolve errors/conflicts.
6. Generate or review AI summary.
7. Assign follow-up tasks or acknowledgements.
8. Export/report when needed.

## Player workflow

Players only interact with the permitted subset through the player account. They should never see staff-only notes, private academic detail, or coach-only risk flags.

## Staff workflow

Staff members see capabilities based on role. Student managers may enter attendance/stat/log data but cannot see sensitive notes unless explicitly allowed.

## Strength coach workflow if relevant

Strength coaches can manage lift/readiness/performance data and see baseball availability context. They cannot see unrelated recruiting or academic private notes unless permitted.

## Data inputs

Manual entries, CSV/Excel imports, uploaded reports, attachments, video links, coach notes, player check-ins, calculated stats, and AI-generated summaries.

## Data outputs

Cards, tables, timeline entries, reports, AI briefs, tasks, acknowledgements, dashboard alerts, player-visible summaries.

## Manual entry fields

Date/time, player(s), group, type, status, result, note, visibility, owner, due date, tags, attachment/link.

## Importable fields

Player identifiers, dates, event/session types, metrics, status values, notes, external IDs, source file names, and vendor labels.

## Calculated fields

Completion %, trend direction, recent average, rolling 7/14/30-day summaries, conflict counts, missing data count, availability status, risk score where allowed.

## AI-generated fields

Brief, summary, next focus, risk flag, change explanation, data quality warning, missing-data prompt, staff follow-up suggestion.

## Database requirements

Suggested tables: `players, team_memberships, calendar_events, tasks, acknowledgements, ai_insights, audit_logs`.

## Suggested relationships

All records should connect to `team_id`; player-specific records connect to `player_id`; staff actions connect to `created_by`; imported records connect to `import_id`; AI outputs connect to source object IDs.

## Permissions

Use capability-based permissions: view, create, edit, delete, publish, import, export, view_staff_notes, approve_player_visible_ai.

## Privacy concerns

Academic, injury/limitation, wellness, and staff notes require explicit visibility levels. Player-facing outputs must be approved or constrained by allowed data sources.

## UI layout

Desktop: header + summary cards + filter bar + primary table/board + right-side detail panel. Mobile: stacked cards, minimal filters, quick actions.

## Search behavior

Search player name, jersey, position, group, tag, owner, external ID, and notes where permitted.

## Empty state

Explain the workflow, show one primary action, offer CSV template, and provide demo data option.

## Error state

Show actionable error, affected rows/records, rollback option for imports, and contact/support copy.

## Edge cases

Duplicate players, missing team selection, player without linked user, imported row without match, role without permission, conflicting event times, late edits after lock, deleted source import, partial AI confidence.

## Notifications

Notify only when actionable: due tasks, missed acknowledgement, status change, import needing review, player availability change, AI risk flag requiring staff review.

## Reports generated

Tab report, filtered export, player-specific report, weekly summary, import error report, AI brief section.

## Example user stories

- As a head coach, I want a quick answer to what needs attention today so I can run staff meeting efficiently.
- As an assistant coach, I want filtered player information so I can prepare individual development conversations.
- As a player, I want only my relevant actions and feedback so I know what to do without seeing staff-only context.

## Acceptance criteria

- Loads under 2 seconds with seeded demo data.
- Enforces RLS and capability checks.
- Supports empty/loading/error states.
- Links all records to team and player where applicable.
- Supports audit trail for sensitive changes.
- AI outputs include confidence and source references.

## Build priority

Phase depends on tab: command, roster, profiles, calendar, practice, lifting, stats, imports, basic AI are Phase 1; development depth Phase 2; academics/travel/communication reports Phase 3; recruiting Phase 4.

## Implementation notes

Create typed server-side data functions, avoid direct Supabase calls scattered across components, write seed data, add tests for permissions and import validation, and keep current routes working until replacement routes are stable.
