-- Check if the users exist in the system and their golf profiles

-- Check users table
SELECT
  id,
  email,
  role,
  sport
FROM users
WHERE email IN ('rinin376@gmail.com', 'nick@gmail.com');

-- Check golf_players
SELECT
  gp.id,
  gp.user_id,
  u.email,
  gp.first_name,
  gp.last_name,
  gp.team_id,
  gt.name as team_name
FROM golf_players gp
JOIN users u ON gp.user_id = u.id
LEFT JOIN golf_teams gt ON gp.team_id = gt.id
WHERE u.email IN ('rinin376@gmail.com', 'nick@gmail.com');

-- Check golf_coaches
SELECT
  gc.id,
  gc.user_id,
  u.email,
  gc.first_name,
  gc.last_name,
  gc.team_id,
  gt.name as team_name
FROM golf_coaches gc
JOIN users u ON gc.user_id = u.id
LEFT JOIN golf_teams gt ON gc.team_id = gt.id
WHERE u.email IN ('rinin376@gmail.com', 'nick@gmail.com');

-- Check current RLS policies on conversations
SELECT
  policyname,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'conversations'
ORDER BY policyname;
