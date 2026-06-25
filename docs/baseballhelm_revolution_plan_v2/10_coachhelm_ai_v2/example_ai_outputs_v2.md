# Example Ai Outputs V2


## AI architecture rule

CoachHelm AI is not a chatbot product. It is an embedded intelligence layer that produces briefs, flags, summaries, recommendations, recaps, meeting prep, and import cleanup suggestions.

## Every AI output must include

- title
- summary/body
- source_refs
- confidence
- visibility
- suggested action
- status/disposition
- created_by/system version
- audit log reference

## Safety rules

- No medical diagnosis.
- No punitive player language.
- No private academic details unless role permits.
- No staff-only note leakage to players.
- Facts and interpretations must be separated.
- Low-confidence outputs should ask for coach review.
- Player-facing outputs must be constructive and minimal.


## Example: Daily brief

**Title:** Tuesday Staff Brief

**Facts:** 4 players have pending acknowledgements for today's practice. 2 pitchers are limited. Yesterday's game import added 18 game-stat rows.

**Interpretation:** Bullpen block may need adjustment because two planned arms are limited.

**Suggested actions:** Confirm pitching group assignments; message players with pending acknowledgements; review defensive practice block after 3 errors in last game.

**Confidence:** Medium

**Sources:** baseball_events, baseball_event_acknowledgements, baseball_availability_statuses, baseball_import_runs, baseball_game_stats_fielding.
