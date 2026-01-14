-- Allow team coaches to upload videos and update player video status

-- Coaches can upload videos for players on their teams (HS, Showcase, JUCO)
DROP POLICY IF EXISTS "Coaches can upload videos for team players" ON public.videos;
CREATE POLICY "Coaches can upload videos for team players"
  ON public.videos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.coaches c
      JOIN public.team_coach_staff tcs ON tcs.coach_id = c.id
      JOIN public.team_members tm ON tm.team_id = tcs.team_id
      WHERE c.user_id = auth.uid()
        AND c.coach_type IN ('high_school', 'showcase', 'juco')
        AND tm.player_id = videos.player_id
        AND tm.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.coaches c
      JOIN public.teams t ON t.head_coach_id = c.id
      JOIN public.team_members tm ON tm.team_id = t.id
      WHERE c.user_id = auth.uid()
        AND c.coach_type IN ('high_school', 'showcase', 'juco')
        AND tm.player_id = videos.player_id
        AND tm.status = 'active'
    )
  );

-- Coaches can update players on their teams (needed to flag has_video)
DROP POLICY IF EXISTS "Coaches can update team players" ON public.players;
CREATE POLICY "Coaches can update team players"
  ON public.players
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.coaches c
      JOIN public.team_coach_staff tcs ON tcs.coach_id = c.id
      JOIN public.team_members tm ON tm.team_id = tcs.team_id
      WHERE c.user_id = auth.uid()
        AND c.coach_type IN ('high_school', 'showcase', 'juco')
        AND tm.player_id = players.id
        AND tm.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.coaches c
      JOIN public.teams t ON t.head_coach_id = c.id
      JOIN public.team_members tm ON tm.team_id = t.id
      WHERE c.user_id = auth.uid()
        AND c.coach_type IN ('high_school', 'showcase', 'juco')
        AND tm.player_id = players.id
        AND tm.status = 'active'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.coaches c
      JOIN public.team_coach_staff tcs ON tcs.coach_id = c.id
      JOIN public.team_members tm ON tm.team_id = tcs.team_id
      WHERE c.user_id = auth.uid()
        AND c.coach_type IN ('high_school', 'showcase', 'juco')
        AND tm.player_id = players.id
        AND tm.status = 'active'
    )
    OR EXISTS (
      SELECT 1
      FROM public.coaches c
      JOIN public.teams t ON t.head_coach_id = c.id
      JOIN public.team_members tm ON tm.team_id = t.id
      WHERE c.user_id = auth.uid()
        AND c.coach_type IN ('high_school', 'showcase', 'juco')
        AND tm.player_id = players.id
        AND tm.status = 'active'
    )
  );
