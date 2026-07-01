# Duplicate Handling

Use deterministic keys per import type, e.g. game stat line = team_id + game_id + player_id + stat_category; lift result = team_id + workout_id + player_id + exercise_id + set_number; class = player_id + term + course_code + meeting days/time.

Preview duplicate rows before commit. Offer skip, update existing, create new version, or manual resolve.
