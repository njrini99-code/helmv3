-- CoachHelm Settings Migration
-- Enables the enable/disable feature for CoachHelm V2 Intelligence

-- ============================================================================
-- COACHHELM SETTINGS TABLE
-- ============================================================================

-- Settings per user (player or coach)
CREATE TABLE IF NOT EXISTS golf_coachhelm_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

    -- Enable/disable at user level
    enabled BOOLEAN NOT NULL DEFAULT true,
    disabled_at TIMESTAMPTZ,
    disabled_reason TEXT,

    -- Preferences
    show_insights BOOLEAN NOT NULL DEFAULT true,
    show_predictions BOOLEAN NOT NULL DEFAULT true,
    show_patterns BOOLEAN NOT NULL DEFAULT true,
    notification_level TEXT NOT NULL DEFAULT 'all'
        CHECK (notification_level IN ('all', 'important', 'critical', 'none')),

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One settings record per user
    UNIQUE(user_id)
);

-- Team-level CoachHelm settings (coach controls for team)
CREATE TABLE IF NOT EXISTS golf_team_coachhelm_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES golf_teams(id) ON DELETE CASCADE,

    -- Team-wide enable/disable
    enabled BOOLEAN NOT NULL DEFAULT true,
    disabled_at TIMESTAMPTZ,
    disabled_by UUID REFERENCES auth.users(id),
    disabled_reason TEXT,

    -- Who can see CoachHelm insights
    player_access_level TEXT NOT NULL DEFAULT 'own_only'
        CHECK (player_access_level IN ('none', 'own_only', 'team_with_permission', 'full_team')),

    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- One settings record per team
    UNIQUE(team_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_coachhelm_settings_user
    ON golf_coachhelm_settings(user_id);
CREATE INDEX IF NOT EXISTS idx_team_coachhelm_settings_team
    ON golf_team_coachhelm_settings(team_id);

-- ============================================================================
-- UPDATED_AT TRIGGERS
-- ============================================================================

CREATE TRIGGER update_coachhelm_settings_updated_at
    BEFORE UPDATE ON golf_coachhelm_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_team_coachhelm_settings_updated_at
    BEFORE UPDATE ON golf_team_coachhelm_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE golf_coachhelm_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_team_coachhelm_settings ENABLE ROW LEVEL SECURITY;

-- User settings: Users can view/edit their own settings
CREATE POLICY "Users can view own settings"
    ON golf_coachhelm_settings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own settings"
    ON golf_coachhelm_settings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own settings"
    ON golf_coachhelm_settings FOR UPDATE
    USING (auth.uid() = user_id);

-- Team settings: Coaches can view/edit their team's settings
CREATE POLICY "Coaches can view team settings"
    ON golf_team_coachhelm_settings FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM golf_coaches gc
            WHERE gc.user_id = auth.uid()
            AND gc.team_id = golf_team_coachhelm_settings.team_id
        )
    );

CREATE POLICY "Coaches can insert team settings"
    ON golf_team_coachhelm_settings FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM golf_coaches gc
            WHERE gc.user_id = auth.uid()
            AND gc.team_id = golf_team_coachhelm_settings.team_id
        )
    );

CREATE POLICY "Coaches can update team settings"
    ON golf_team_coachhelm_settings FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM golf_coaches gc
            WHERE gc.user_id = auth.uid()
            AND gc.team_id = golf_team_coachhelm_settings.team_id
        )
    );

-- Players can view their team's settings (read only)
CREATE POLICY "Players can view team settings"
    ON golf_team_coachhelm_settings FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM golf_players gp
            WHERE gp.user_id = auth.uid()
            AND gp.team_id = golf_team_coachhelm_settings.team_id
        )
    );

-- ============================================================================
-- HELPER FUNCTION
-- ============================================================================

-- Function to check if CoachHelm is enabled for a user
CREATE OR REPLACE FUNCTION is_coachhelm_enabled_for_user(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    user_enabled BOOLEAN;
    team_enabled BOOLEAN;
    v_team_id UUID;
BEGIN
    -- Check user-level setting
    SELECT enabled INTO user_enabled
    FROM golf_coachhelm_settings
    WHERE user_id = p_user_id;

    -- If user has explicitly disabled, return false
    IF user_enabled = false THEN
        RETURN false;
    END IF;

    -- Get user's team (player or coach)
    SELECT COALESCE(gp.team_id, gc.team_id) INTO v_team_id
    FROM auth.users u
    LEFT JOIN golf_players gp ON gp.user_id = u.id
    LEFT JOIN golf_coaches gc ON gc.user_id = u.id
    WHERE u.id = p_user_id;

    -- If no team, return user setting or default true
    IF v_team_id IS NULL THEN
        RETURN COALESCE(user_enabled, true);
    END IF;

    -- Check team-level setting
    SELECT enabled INTO team_enabled
    FROM golf_team_coachhelm_settings
    WHERE team_id = v_team_id;

    -- If team has disabled, return false
    IF team_enabled = false THEN
        RETURN false;
    END IF;

    -- Default to enabled
    RETURN true;
END;
$$;

COMMENT ON TABLE golf_coachhelm_settings IS 'User-level CoachHelm enable/disable settings';
COMMENT ON TABLE golf_team_coachhelm_settings IS 'Team-level CoachHelm settings controlled by coach';
