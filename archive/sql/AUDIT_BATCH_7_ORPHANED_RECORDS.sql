-- ═══════════════════════════════════════════════════════════════════════════
-- AUDIT BATCH 7: 🟠 ORPHANED RECORDS CHECK
-- Sections 14-15: Orphaned Golf Players and Teams
-- ⚠️  These indicate data integrity issues
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 14: 🟠 HIGH - ORPHANED GOLF PLAYERS
-- Golf players without a valid user account
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  id,
  email,
  user_id,
  created_at
FROM golf_players
WHERE user_id IS NULL
   OR user_id NOT IN (SELECT id FROM users)
LIMIT 50;

-- ⚠️  ANY RECORDS HERE INDICATE:
-- - User account was deleted but golf_players record remains
-- - OR signup flow created golf_players but failed to create users record
-- - OR sport mismatch (users.sport != 'golf')

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 15: ORPHANED GOLF TEAMS
-- Golf teams without a valid organization
-- ═══════════════════════════════════════════════════════════════════════════

SELECT
  id,
  name,
  organization_id
FROM golf_teams
WHERE organization_id IS NULL
   OR organization_id NOT IN (SELECT id FROM golf_organizations)
LIMIT 50;

-- ═══════════════════════════════════════════════════════════════════════════
-- BONUS: Check for sport mismatches
-- ═══════════════════════════════════════════════════════════════════════════

-- Golf players whose user account has sport='baseball' (should be 'golf')
SELECT
  gp.id as golf_player_id,
  gp.email as golf_player_email,
  gp.user_id,
  u.sport as user_sport,
  CASE
    WHEN u.sport != 'golf' THEN '🔴 MISMATCH: Should be golf'
    ELSE '✅ OK'
  END as status
FROM golf_players gp
JOIN users u ON gp.user_id = u.id
WHERE u.sport != 'golf';

-- ═══════════════════════════════════════════════════════════════════════════
-- EXPECTED RESULTS:
-- - Section 14 should return 0 rows after fixing your account
-- - Section 15 should return 0 rows (all teams should have organizations)
-- - Sport mismatch query should return 0 rows
-- ═══════════════════════════════════════════════════════════════════════════
