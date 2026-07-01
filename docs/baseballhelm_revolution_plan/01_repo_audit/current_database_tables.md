# Current Database Tables

## Observed current Supabase usage

Static inspection shows current BaseballHelm usage of at least:

- `baseball_players`
- `baseball_team_members`
- `baseball_watchlists`
- `baseball_player_engagement_events`
- `baseball_messages`
- `baseball_conversation_participants`
- likely team/calendar/travel/document/task/announcement tables based on routes and UI.

The generated `src/lib/types/database.ts` is large and includes both golf and baseball schema surfaces. A local build agent should run:

```bash
npm run db:types
npm run check:types-drift
```

Then extract all tables beginning with `baseball_`, plus shared organization/team/auth tables.

## Current model issues

- Recruiting-era tables still influence dashboard queries.
- Player profile identity exists, but not as a complete college baseball operating identity layer.
- Academics page needs academic fields not yet in schema.
- Import audit/history/rollback tables are not evident as first-class product primitives.
- Practice planner, lifting, wellness, arm care, and travel logistics need dedicated models instead of generic notes.

## Required next audit step

Generate `schema_current_snapshot.md` from local Supabase types using a script that extracts table names, columns, relationships, enums, and RLS policies.
