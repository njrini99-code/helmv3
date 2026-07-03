# Lifting Data Model

# Recommended Tables

| Table | Purpose | Key columns | Phase |
|---|---|---|---|
| organizations | Account/school container | id, name, type, logo_url, settings, created_at | Phase 1 |
| teams | Baseball team/program | id, organization_id, sport, name, level, season_year, timezone | Phase 1 |
| profiles | Authenticated user profile | id, email, full_name, role_hint, avatar_url | Phase 1 |
| team_memberships | User-team roles | id, team_id, profile_id, role, status | Phase 1 |
| players | Athlete identity | id, team_id, profile_id, first_name, last_name, jersey, positions, bats, throws, class_year, status | Phase 1 |
| player_external_ids | Vendor/import matching IDs | id, player_id, source, external_id, confidence | Phase 1 |
| calendar_events | Events | id, team_id, type, title, start_at, end_at, location, visibility | Phase 1 |
| practices | Practice header | id, team_id, event_id, title, focus, status, published_at | Phase 1 |
| practice_blocks | Practice time blocks | id, practice_id, start_offset, duration, activity, location, coach_owner | Phase 1 |
| practice_attendance | Attendance | id, practice_id, player_id, status, reason | Phase 1 |
| games | Game schedule/result | id, team_id, opponent, date, venue, result, status | Phase 1 |
| game_stats_hitting | Hitting game lines | id, game_id, player_id, pa, ab, h, doubles, triples, hr, bb, hbp, k, rbi, r, sb, cs, qab, hhb | Phase 1 |
| game_stats_pitching | Pitching game lines | id, game_id, player_id, ip_outs, h, r, er, bb, k, hbp, hr, bf, pitch_count | Phase 1 |
| lift_workouts | Workout definitions | id, team_id, date, title, group, phase | Phase 1 |
| lift_assignments | Player lift assignments | id, workout_id, player_id, status, due_at | Phase 1 |
| lift_results | Exercise results | id, assignment_id, exercise, set_no, reps, weight, rpe, completed | Phase 1 |
| wellness_checkins | Wellness/readiness | id, player_id, date, sleep, soreness, stress, hydration, readiness, notes | Phase 1 |
| availability_statuses | Player availability | id, player_id, status, reason, start_at, end_at, visibility | Phase 1 |
| imports | Import batches | id, team_id, type, filename, mapping, status, created_by | Phase 1 |
| import_rows | Import rows | id, import_id, row_number, raw_data, mapped_data, status, target_id | Phase 1 |
| import_errors | Import errors | id, import_id, row_id, severity, field, message | Phase 1 |
| ai_briefs | AI briefs | id, team_id, type, date_range, output, confidence, created_by | Phase 1 |
| ai_flags | AI flags | id, team_id, player_id, type, severity, source_refs, status | Phase 1 |
| hitting_sessions | Hitting development sessions | id, player_id, date, type, notes, visibility | Phase 2 |
| pitching_sessions | Pitching sessions | id, player_id, date, type, notes, workload | Phase 2 |
| pitch_metrics | Imported pitch metrics | id, pitching_session_id, pitch_type, velocity, spin, ivb, hb, extension | Phase 2 |
| swing_metrics | Imported swing metrics | id, hitting_session_id, bat_speed, attack_angle, exit_velocity, launch_angle | Phase 2 |
| arm_care_logs | Arm care | id, player_id, date, completion, soreness, notes | Phase 2 |
| class_schedules | Class meetings | id, player_id, term, course_code, days, start_time, end_time | Phase 3 |
| academic_notes | Academic notes | id, player_id, type, risk_tag, note, visibility | Phase 3 |
| travel_trips | Trips | id, team_id, name, opponent, depart_at, return_at | Phase 3 |
| travel_itinerary_items | Trip items | id, trip_id, type, title, time, location | Phase 3 |
| announcements | Announcements | id, team_id, title, body, target_group, requires_ack | Phase 3 |
| tasks | Tasks | id, team_id, assigned_to, title, due_at, status, source_type | Phase 3 |
| recruiting_prospects | Prospects | id, team_id, first_name, last_name, grad_year, position, stage | Phase 4 |

## RLS principles

- Every team-scoped table includes `team_id`.
- Players can only read their own player-visible records.
- Staff capabilities determine access to staff-only notes, academics, imports, and AI flags.
- Sensitive writes create audit log entries.

## Index principles

Index `team_id`, `player_id`, date fields, import IDs, source external IDs, and common filters like position/status/type.

## Example JSON record

```json
{
  "team_id": "team_demo",
  "player_id": "player_12",
  "source": "manual_or_import",
  "visibility": "staff_only_or_player_visible",
  "created_at": "2026-06-23T09:00:00-04:00"
}
```
