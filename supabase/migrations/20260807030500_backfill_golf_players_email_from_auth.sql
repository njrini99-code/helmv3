-- REPAIR: restore the player emails that completePlayerOnboarding destroyed.
--
-- The onboarding action built a full-column UPDATE and coerced every absent
-- optional field to NULL. The onboarding page never sends email, so completing
-- onboarding wrote NULL over the address ensurePlayerRecord had just copied from
-- the auth account. Measured 2026-08-07: 57 golf_players rows with email IS NULL,
-- including 22 of 22 August signups (April, before the regression reached them,
-- was 10 of 10 populated). Coaches' rosters select `email`, so the entire current
-- cohort showed a blank contact column.
--
-- auth.users.email is the authoritative source and covered all 57 rows. After
-- this ran, 82 of 82 golf players have an email and every roster is contactable.
--
-- Idempotent and non-destructive by construction: it only ever fills a NULL, and
-- never overwrites an address a player actually supplied.
UPDATE public.golf_players p
SET    email = u.email,
       updated_at = now()
FROM   auth.users u
WHERE  u.id = p.user_id
  AND  p.email IS NULL
  AND  u.email IS NOT NULL;
