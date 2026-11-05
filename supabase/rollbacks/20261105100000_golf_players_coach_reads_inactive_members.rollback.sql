DROP POLICY IF EXISTS golf_players_select_coach_inactive_member
ON public.golf_players;
DROP FUNCTION IF EXISTS public.user_coaches_inactive_golf_member(uuid);
