# V6 Current App and Supabase Deep Dive

This pass inspected `/Users/ricknini/Downloads/helmv3` directly so the one-shot build agent can work faster and avoid inventing a parallel product. The current app already contains many of the right ingredients. The missing layer is a source-aware, baseball-specific intelligence architecture that connects them into a staff operating system.

## Verified Baseball App Surface

Current baseball server actions exist under `src/app/baseball/actions` for:

- academics
- announcements
- auth
- calendar
- dev plans
- discover/recruiting
- documents
- games
- insights
- interests
- lineups
- messages
- onboarding
- philosophy
- player dashboard
- player peek
- recruiting philosophy
- stats
- tasks
- team dashboard
- teams
- travel
- watchlist

Current baseball components exist for:

- announcement creation, player selection, urgency picking, acknowledgement tracking
- box score entry, box score upload, box score view
- calendar wrapper
- coach mode toggle
- command center client, invite button, team player peek panel
- dashboard widgets: interest summary, hot leads, players needing attention, position needs, activity feed, development progress, team health, stats chart, upcoming schedule
- developmental plans
- documents
- games
- player profile and stats
- position planner
- program/team surfaces
- recruiting philosophy
- roster
- season stats
- showcase
- stats upload/history
- tasks
- travel

That means the build should not start by creating a clean-room app. It should consolidate, route, and deepen the existing pieces.

## Verified Baseball Supabase Tables From Generated Types

`src/lib/types/database.ts` includes these baseball tables and relationships:

- `baseball_academic_eligibility`
- `baseball_announcement_acknowledgements`
- `baseball_announcement_recipients`
- `baseball_announcements`
- `baseball_box_score_batting`
- `baseball_box_score_pitching`
- `baseball_box_score_uploads`
- `baseball_camp_registrations`
- `baseball_camps`
- `baseball_coach_insights`
- `baseball_coach_philosophy`
- `baseball_coach_recruiting_philosophy`
- `baseball_coaches`
- `baseball_conversation_participants`
- `baseball_conversations`
- `baseball_developmental_plans`
- `baseball_document_versions`
- `baseball_documents`
- `baseball_event_attendance`
- `baseball_events`
- `baseball_games`
- `baseball_lineup_positions`
- `baseball_messages`
- `baseball_notifications`
- `baseball_player_aggregates`
- `baseball_player_classes`
- `baseball_player_comparisons`
- `baseball_player_engagement_events`
- `baseball_player_percentiles`
- `baseball_player_season_stats`
- `baseball_player_settings`
- `baseball_player_stats`
- `baseball_players`
- `baseball_recruiting_interests`
- `baseball_stat_uploads`
- `baseball_task_assignments`
- `baseball_task_templates`
- `baseball_tasks`
- `baseball_team_coach_staff`
- `baseball_team_invitations`
- `baseball_team_lineups`
- `baseball_team_members`
- `baseball_teams`
- `baseball_travel_expenses`
- `baseball_travel_itineraries`
- `baseball_videos`
- `baseball_watchlists`

Enums include:

- `baseball_coach_type`: `college`, `juco`, `high_school`, `showcase`
- `baseball_player_type`: `college`, `juco`, `high_school`, `showcase`
- `baseball_pipeline_stage`

RPC/function types include:

- `get_admin_baseball_rollup`
- `get_baseball_conversations_with_details`
- `get_my_baseball_conversation_ids`
- `is_baseball_primary_coach`
- `is_baseball_team_coach`
- `is_baseball_team_coach_v2`
- `is_baseball_team_member`
- `is_baseball_team_member_v2`
- `is_baseball_team_player`
- `recalculate_baseball_season_stats`
- `recalculate_team_baseball_season_stats`

## Current Player and Team Shape

`baseball_players` already carries important recruiting/showcase metrics:

- identity/contact: first name, last name, email, phone, avatar, city/state
- physical: height, weight
- baseball profile: bats, throws, primary/secondary position
- performance: exit velocity, pitch velocity, sixty time, pop time, arm strength
- academics: GPA, SAT, ACT, high school name/city/state, grad year
- recruiting: profile completion, recruiting activated, social handles, video flag
- program type: college/JUCO/high school/showcase

This is useful but too shallow for elite programs. V6 requires a split between stable profile fields and time-series measurement tables. A player's `exit_velo` on the profile should be a current verified best, not the only stored record. Every measurement needs date, source, context, equipment, session, video link, confidence, and reviewer.

`baseball_teams` already supports organization, join code, logo, primary/secondary colors, team type, and created-by. V6 requires program settings to turn team type into behavior:

- college: eligibility, class conflicts, roster limits, staff roles, official stats, strength integration, travel
- high school: guardian visibility, school-day conflicts, multi-sport conflicts, booster-safe comms, simpler academic fields
- showcase: event roster, measurement stations, video/recruiting packet, public profile controls, scout packets
- JUCO: transfer readiness, credits, eligibility, recruiting board, class/work constraints

## Current Stats Implementation Gaps

`src/app/baseball/actions/stats.ts` currently provides CSV upload and aggregate recalculation. It maps a limited set of fields:

- player name
- at bats
- hits
- doubles
- triples
- home runs
- RBIs
- walks
- strikeouts
- stolen bases
- exit velocity
- launch angle in code

The generated `baseball_player_stats` type includes:

- assists
- at bats
- doubles
- earned runs
- errors
- exit velocity
- hits
- hits allowed
- home runs
- innings pitched
- pitch velocity
- putouts
- RBIs
- stolen bases
- strikeouts
- strikeouts thrown
- triples
- walks
- walks allowed

The generated `baseball_stat_uploads` type is lean:

- filename
- file URL
- row count
- processed count
- status
- error message
- completed at

But the current action code tries to insert or update richer fields such as `stat_type`, `session_date`, `session_name`, `total_rows`, `matched_rows`, `unmatched_rows`, and `unmatched_data`. The one-shot agent must reconcile this before relying on the upload action. Do not patch around it with `any`; fix the schema/types/action contract.

## Current Box Score System

`src/app/baseball/actions/games.ts` and `src/components/baseball/box-score/BoxScoreUpload.tsx` already support:

- creating/updating/deleting games
- linking games to calendar events
- manual box score entry
- CSV batting upload
- CSV pitching upload
- player matching and unmatched resolution
- season stat recalculation paths

The archived migration `20260222200000_baseball_box_score_system.sql` created:

- `baseball_games`
- `baseball_box_score_batting`
- `baseball_box_score_pitching`
- `baseball_player_season_stats`
- `baseball_box_score_uploads`
- recalc RPCs

Current official box score coverage is useful for a lite product but incomplete for elite college baseball. It needs:

- fielding lines
- catching lines
- baserunning lines
- team totals
- inning-level scoring
- lineup/substitution events
- plate appearances if imported from play-by-play
- pitch events if available from TrackMan/Synergy/Rapsodo/6-4-3
- source reliability rules for official vs developmental stats

## Current Academics and Classes

`src/app/baseball/actions/academics.ts` supports:

- team academics overview
- player class schedules
- adding/updating class records
- academic eligibility records

`baseball_player_classes` stores:

- class name
- instructor
- days
- start/end time
- building/room
- credits
- semester
- color
- notes

`baseball_academic_eligibility` stores GPA/credits/standing/eligibility.

This is a strong base for automation. V6 requires class data to feed:

- calendar conflict detection
- lift assignment windows
- practice availability
- travel departure conflict warnings
- missed-class risk
- player daily schedule
- staff meeting topics
- academic support task creation

## Current Video System

`baseball_videos` exists with:

- player/team
- title/description
- URL/thumbnail
- duration
- video type
- primary flag
- parent video/clip relationship
- clip start/end
- view count

Current helper code exists in:

- `src/components/features/video-player.tsx`
- `src/components/features/video-upload.tsx`
- `src/components/video/VideoClipper.tsx`
- `src/lib/video/clipper.ts`

V6 must convert this from "video storage" into "video-indexed baseball evidence":

- attach video clips to players, games, innings, plate appearances, pitches, swings, bullpens, lifts, defensive reps, catcher throws, and practice stations
- allow a clip to support an insight
- allow an insight to request a clip
- allow a coach to convert a clip into a player task or dev plan item
- allow imports from Synergy/AWRE/OnForm/video CSVs to create external video references without copying protected vendor video

## Current GolfHelm Depth To Mirror

Golf CoachHelm is much deeper than current baseball AI. It has:

- V2 orchestrator
- feature extraction
- pattern mining
- causal discovery
- predictions
- learning
- reasoning
- NLG composition
- baselines
- multi-window trends
- anomaly detection
- streak detection
- insight scoring
- coach behavior feedback
- v3 generator base classes
- insight visibility contract
- lifecycle vs coach-status separation
- source/citation support
- ranking
- themes
- counterfactuals
- practice prescriptions
- effectiveness event ledger
- exposure/action/outcome tracking
- cron/sweep patterns

Baseball CoachHelm must reuse the architecture pattern, not the golf assumptions. Golf categories like tee/approach/putting must become baseball categories:

- hitting process
- swing quality
- plate discipline
- contact quality
- baserunning value
- defense value
- catcher value
- pitching command
- pitch design
- stuff quality
- workload/readiness
- practice response
- lift response
- academic/availability risk
- recruiting/showcase readiness
- team operations risk

## One-Shot Agent Efficiency Rules

The build agent should start with these inspections:

- `src/app/baseball`
- `src/components/baseball`
- `src/app/baseball/actions`
- `src/lib/baseball/csv-utils.ts`
- `src/lib/queries/baseball-dashboard.ts`
- `src/hooks/use-baseball-auth.ts`
- `src/components/layout/sidebar.tsx`
- `src/lib/types/database.ts`
- `src/lib/types/database.types.ts`
- `src/lib/supabase/server.ts`
- `src/lib/supabase/admin.ts`
- `supabase/migrations`
- `supabase/migrations_archive/pre_20260527/*baseball*`
- `supabase/migrations_archive/pre_20260527/062_coachhelm_complete_schema.sql`
- `supabase/migrations/20260621160000_insight_event_ledger.sql`
- `src/lib/coachhelm/v2`
- `src/lib/coachhelm/v3`

The build agent should not create a new `baseball2_*` schema. It should extend the existing `baseball_*` tables and add missing source/import/stat/event tables in a way that preserves current app behavior.

