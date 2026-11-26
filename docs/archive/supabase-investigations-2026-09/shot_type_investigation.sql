-- Read-only investigation queries for golf_shots.shot_type compatibility (#108)
-- Run against production with a read-only role. No DDL/DML.

SELECT shot_type, COUNT(*) AS row_count
FROM golf_shots
GROUP BY shot_type
ORDER BY row_count DESC;

SELECT COUNT(*) AS null_shot_type_count
FROM golf_shots
WHERE shot_type IS NULL;

SELECT shot_type, COUNT(*) AS row_count
FROM golf_shots
WHERE shot_type IS NOT NULL
  AND shot_type NOT IN ('tee', 'approach', 'around_green', 'putting', 'penalty')
GROUP BY shot_type
ORDER BY row_count DESC;

SELECT c.conname, c.convalidated, pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
JOIN pg_class t ON t.oid = c.conrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname = 'golf_shots'
  AND c.conname = 'golf_shots_shot_type_check';
