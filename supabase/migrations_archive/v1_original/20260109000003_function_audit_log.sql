-- Add audit logging for SECURITY DEFINER functions

CREATE TABLE IF NOT EXISTS public.function_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name text NOT NULL,
  called_by uuid,
  input_params jsonb,
  output_result jsonb,
  error text,
  execution_time_ms integer,
  called_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_function_audit_log_name ON public.function_audit_log(function_name);
CREATE INDEX IF NOT EXISTS idx_function_audit_log_called_at ON public.function_audit_log(called_at);

ALTER TABLE public.function_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.function_audit_log FROM authenticated;
GRANT SELECT, INSERT ON public.function_audit_log TO service_role;

-- ============================================================================
-- are_users_on_same_roster
-- ============================================================================
CREATE OR REPLACE FUNCTION public.are_users_on_same_roster(user1 UUID, user2 UUID)
RETURNS BOOLEAN AS $$
DECLARE
  user1_coach_id UUID;
  user2_coach_id UUID;
  user1_player_id UUID;
  user2_player_id UUID;
  start_time timestamptz := clock_timestamp();
  result boolean;
BEGIN
  -- Get coach IDs
  SELECT id INTO user1_coach_id FROM coaches WHERE user_id = user1;
  SELECT id INTO user2_coach_id FROM coaches WHERE user_id = user2;

  -- Get player IDs
  SELECT id INTO user1_player_id FROM players WHERE user_id = user1;
  SELECT id INTO user2_player_id FROM players WHERE user_id = user2;

  -- Check if they share a team via team_members or team_coach_staff
  result := EXISTS (
    -- Both are players on same team
    SELECT 1 FROM team_members tm1
    JOIN team_members tm2 ON tm1.team_id = tm2.team_id
    WHERE tm1.player_id = user1_player_id
    AND tm2.player_id = user2_player_id
    AND tm1.status = 'active'
    AND tm2.status = 'active'
  )
  OR EXISTS (
    -- User1 is coach, User2 is player on their team
    SELECT 1 FROM teams t
    JOIN team_members tm ON tm.team_id = t.id
    WHERE (t.head_coach_id = user1_coach_id OR EXISTS (
      SELECT 1 FROM team_coach_staff tcs WHERE tcs.team_id = t.id AND tcs.coach_id = user1_coach_id
    ))
    AND tm.player_id = user2_player_id
    AND tm.status = 'active'
  )
  OR EXISTS (
    -- User2 is coach, User1 is player on their team
    SELECT 1 FROM teams t
    JOIN team_members tm ON tm.team_id = t.id
    WHERE (t.head_coach_id = user2_coach_id OR EXISTS (
      SELECT 1 FROM team_coach_staff tcs WHERE tcs.team_id = t.id AND tcs.coach_id = user2_coach_id
    ))
    AND tm.player_id = user1_player_id
    AND tm.status = 'active'
  );

  BEGIN
    INSERT INTO public.function_audit_log (
      function_name,
      called_by,
      input_params,
      output_result,
      execution_time_ms
    ) VALUES (
      'are_users_on_same_roster',
      auth.uid(),
      jsonb_build_object('user1', user1, 'user2', user2),
      jsonb_build_object('result', result),
      (EXTRACT(EPOCH FROM (clock_timestamp() - start_time)) * 1000)::int
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN result;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO public.function_audit_log (
      function_name,
      called_by,
      input_params,
      error,
      execution_time_ms
    ) VALUES (
      'are_users_on_same_roster',
      auth.uid(),
      jsonb_build_object('user1', user1, 'user2', user2),
      SQLERRM,
      (EXTRACT(EPOCH FROM (clock_timestamp() - start_time)) * 1000)::int
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- can_users_message
-- ============================================================================
CREATE OR REPLACE FUNCTION public.can_users_message(sender_uuid UUID, recipient_uuid UUID)
RETURNS BOOLEAN AS $$
DECLARE
  sender_coach_type coach_type;
  sender_player_type player_type;
  recipient_coach_type coach_type;
  recipient_player_type player_type;
  sender_is_coach BOOLEAN;
  sender_is_player BOOLEAN;
  recipient_is_coach BOOLEAN;
  recipient_is_player BOOLEAN;
  recipient_recruiting_active BOOLEAN;
  start_time timestamptz := clock_timestamp();
  result boolean := false;
BEGIN
  -- Get sender info
  sender_coach_type := get_user_coach_type(sender_uuid);
  sender_player_type := get_user_player_type(sender_uuid);
  sender_is_coach := sender_coach_type IS NOT NULL;
  sender_is_player := sender_player_type IS NOT NULL;

  -- Get recipient info
  recipient_coach_type := get_user_coach_type(recipient_uuid);
  recipient_player_type := get_user_player_type(recipient_uuid);
  recipient_is_coach := recipient_coach_type IS NOT NULL;
  recipient_is_player := recipient_player_type IS NOT NULL;
  recipient_recruiting_active := is_player_recruiting_active(recipient_uuid);

  -- ============================================
  -- GOLF: Team-scoped only
  -- ============================================
  IF EXISTS (SELECT 1 FROM golf_coaches WHERE user_id = sender_uuid)
     OR EXISTS (SELECT 1 FROM golf_players WHERE user_id = sender_uuid)
     OR EXISTS (SELECT 1 FROM golf_coaches WHERE user_id = recipient_uuid)
     OR EXISTS (SELECT 1 FROM golf_players WHERE user_id = recipient_uuid)
  THEN
    result := are_users_on_same_golf_team(sender_uuid, recipient_uuid);

  -- ============================================
  -- BASEBALL: Complex matrix
  -- ============================================
  ELSIF sender_is_coach AND recipient_is_coach THEN
    result := true;

  ELSIF sender_is_coach AND sender_coach_type = 'college' AND recipient_is_player THEN
    result := recipient_player_type = 'college' OR recipient_recruiting_active;

  ELSIF sender_is_coach AND sender_coach_type = 'juco' AND recipient_is_player THEN
    IF recipient_player_type IN ('high_school', 'showcase') THEN
      result := recipient_recruiting_active;
    ELSIF recipient_player_type = 'juco' THEN
      result := are_users_on_same_roster(sender_uuid, recipient_uuid);
    ELSE
      result := false;
    END IF;

  ELSIF sender_is_coach AND sender_coach_type = 'high_school' AND recipient_is_player THEN
    result := are_users_on_same_roster(sender_uuid, recipient_uuid);

  ELSIF sender_is_coach AND sender_coach_type = 'showcase' AND recipient_is_player THEN
    result := are_users_on_same_roster(sender_uuid, recipient_uuid);

  ELSIF sender_is_player AND recipient_is_coach THEN
    IF NOT is_player_recruiting_active(sender_uuid) THEN
      result := false;
    ELSIF sender_player_type IN ('high_school', 'showcase') THEN
      result := recipient_coach_type IN ('college', 'juco', 'showcase')
        OR are_users_on_same_roster(sender_uuid, recipient_uuid);
    ELSIF sender_player_type = 'juco' THEN
      result := recipient_coach_type = 'college'
        OR are_users_on_same_roster(sender_uuid, recipient_uuid);
    ELSIF sender_player_type = 'college' THEN
      result := are_users_on_same_roster(sender_uuid, recipient_uuid);
    END IF;

  ELSIF sender_is_player AND recipient_is_player THEN
    result := false;
  END IF;

  BEGIN
    INSERT INTO public.function_audit_log (
      function_name,
      called_by,
      input_params,
      output_result,
      execution_time_ms
    ) VALUES (
      'can_users_message',
      auth.uid(),
      jsonb_build_object('sender', sender_uuid, 'recipient', recipient_uuid),
      jsonb_build_object('allowed', result),
      (EXTRACT(EPOCH FROM (clock_timestamp() - start_time)) * 1000)::int
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN result;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO public.function_audit_log (
      function_name,
      called_by,
      input_params,
      error,
      execution_time_ms
    ) VALUES (
      'can_users_message',
      auth.uid(),
      jsonb_build_object('sender', sender_uuid, 'recipient', recipient_uuid),
      SQLERRM,
      (EXTRACT(EPOCH FROM (clock_timestamp() - start_time)) * 1000)::int
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RAISE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- create_conversation_with_participants
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_conversation_with_participants(
  participant_user_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_conversation_id uuid;
  participant_id uuid;
  current_user_id uuid;
  valid_participant_count integer;
  start_time timestamptz := clock_timestamp();
BEGIN
  -- Get the current authenticated user
  current_user_id := auth.uid();

  -- Validate caller is authenticated
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create conversations';
  END IF;

  -- Validate that at least one participant is provided
  IF participant_user_ids IS NULL OR array_length(participant_user_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one participant must be provided';
  END IF;

  -- Validate all participant_user_ids exist in the users table
  SELECT COUNT(*) INTO valid_participant_count
  FROM users
  WHERE id = ANY(participant_user_ids);

  IF valid_participant_count != array_length(participant_user_ids, 1) THEN
    RAISE EXCEPTION 'One or more participant IDs do not exist';
  END IF;

  -- Create the conversation with creator tracking
  INSERT INTO conversations (created_at, updated_at, creator_id)
  VALUES (NOW(), NOW(), current_user_id)
  RETURNING id INTO new_conversation_id;

  -- Add the creator as a participant
  INSERT INTO conversation_participants (conversation_id, user_id, last_read_at)
  VALUES (new_conversation_id, current_user_id, NOW());

  -- Add all other participants
  FOREACH participant_id IN ARRAY participant_user_ids
  LOOP
    -- Skip if it's the creator (already added)
    IF participant_id != current_user_id THEN
      INSERT INTO conversation_participants (conversation_id, user_id, last_read_at)
      VALUES (new_conversation_id, participant_id, NOW())
      ON CONFLICT (conversation_id, user_id) DO NOTHING;
    END IF;
  END LOOP;

  BEGIN
    INSERT INTO public.function_audit_log (
      function_name,
      called_by,
      input_params,
      output_result,
      execution_time_ms
    ) VALUES (
      'create_conversation_with_participants',
      auth.uid(),
      jsonb_build_object('participant_user_ids', participant_user_ids),
      jsonb_build_object('conversation_id', new_conversation_id),
      (EXTRACT(EPOCH FROM (clock_timestamp() - start_time)) * 1000)::int
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN new_conversation_id;
EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO public.function_audit_log (
      function_name,
      called_by,
      input_params,
      error,
      execution_time_ms
    ) VALUES (
      'create_conversation_with_participants',
      auth.uid(),
      jsonb_build_object('participant_user_ids', participant_user_ids),
      SQLERRM,
      (EXTRACT(EPOCH FROM (clock_timestamp() - start_time)) * 1000)::int
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RAISE;
END;
$$;

COMMENT ON FUNCTION public.create_conversation_with_participants(uuid[]) IS
  'Creates a conversation with validated participants. Requires authentication.';

GRANT EXECUTE ON FUNCTION public.create_conversation_with_participants(uuid[]) TO authenticated;

-- ============================================================================
-- handle_new_user
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_role user_role;
  user_sport text;
  player_type_val player_type;
  coach_type_val coach_type;
  start_time timestamptz := clock_timestamp();
BEGIN
  -- Extract role and sport from metadata, with defaults
  user_role := COALESCE(
    (NEW.raw_user_meta_data->>'role')::user_role,
    'player'
  );

  user_sport := COALESCE(
    NEW.raw_user_meta_data->>'sport',
    'baseball'
  );

  -- Step 1: Always create the users table record
  INSERT INTO public.users (id, email, role, created_at, updated_at)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    user_role,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    updated_at = NOW();

  -- Step 2: Create sport-specific records based on role and sport

  -- BASEBALL PLAYER
  IF user_role = 'player' AND user_sport = 'baseball' THEN
    -- Get player_type from metadata, default to 'high_school'
    player_type_val := COALESCE(
      (NEW.raw_user_meta_data->>'player_type')::player_type,
      'high_school'
    );

    INSERT INTO public.players (
      user_id,
      player_type,
      first_name,
      last_name,
      email,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      player_type_val,
      COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
      NEW.email,
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id) DO NOTHING;

  -- BASEBALL COACH
  ELSIF user_role = 'coach' AND user_sport = 'baseball' THEN
    -- Get coach_type from metadata, default to 'college'
    coach_type_val := COALESCE(
      (NEW.raw_user_meta_data->>'coach_type')::coach_type,
      'college'
    );

    INSERT INTO public.coaches (
      user_id,
      coach_type,
      full_name,
      email_contact,
      onboarding_completed,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      coach_type_val,
      CONCAT(
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        ' ',
        COALESCE(NEW.raw_user_meta_data->>'last_name', '')
      ),
      NEW.email,
      false,
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id) DO NOTHING;

  -- GOLF PLAYER
  ELSIF user_role = 'player' AND user_sport = 'golf' THEN
    INSERT INTO public.golf_players (
      user_id,
      first_name,
      last_name,
      email,
      status,
      onboarding_completed,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
      COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
      NEW.email,
      'active',
      false,
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id) DO NOTHING;

  -- GOLF COACH
  ELSIF user_role = 'coach' AND user_sport = 'golf' THEN
    INSERT INTO public.golf_coaches (
      user_id,
      full_name,
      email,
      onboarding_completed,
      created_at,
      updated_at
    )
    VALUES (
      NEW.id,
      CONCAT(
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        ' ',
        COALESCE(NEW.raw_user_meta_data->>'last_name', '')
      ),
      NEW.email,
      false,
      NOW(),
      NOW()
    )
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  BEGIN
    INSERT INTO public.function_audit_log (
      function_name,
      called_by,
      input_params,
      output_result,
      execution_time_ms
    ) VALUES (
      'handle_new_user',
      NEW.id,
      jsonb_build_object(
        'user_id', NEW.id,
        'email', NEW.email,
        'role', user_role,
        'sport', user_sport
      ),
      jsonb_build_object('status', 'ok'),
      (EXTRACT(EPOCH FROM (clock_timestamp() - start_time)) * 1000)::int
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN NEW;

EXCEPTION WHEN OTHERS THEN
  BEGIN
    INSERT INTO public.function_audit_log (
      function_name,
      called_by,
      input_params,
      error,
      execution_time_ms
    ) VALUES (
      'handle_new_user',
      NEW.id,
      jsonb_build_object('user_id', NEW.id, 'email', NEW.email),
      SQLERRM,
      (EXTRACT(EPOCH FROM (clock_timestamp() - start_time)) * 1000)::int
    );
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RAISE WARNING 'handle_new_user failed for user %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.handle_new_user() IS
  'Creates user profile and sport-specific records when a new user signs up. 
   Uses metadata from auth.signUp() to determine:
   - role (player/coach)
   - sport (baseball/golf)
   - player_type (high_school/college/juco/showcase)
   - coach_type (college/high_school/juco/showcase)
   All types default to sensible values if not provided in metadata.';
