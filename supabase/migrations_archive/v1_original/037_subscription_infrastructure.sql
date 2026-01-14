-- ============================================================================
-- Subscription Infrastructure (Bones only - not enforced yet)
-- ============================================================================

-- ============================================================================
-- Create subscription ENUMs
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE subscription_tier AS ENUM ('free', 'recruiting', 'team_management');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE subscription_status AS ENUM ('active', 'inactive', 'trial', 'cancelled', 'past_due');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- Add subscription columns to coaches
-- ============================================================================

ALTER TABLE coaches
ADD COLUMN IF NOT EXISTS subscription_tier subscription_tier DEFAULT 'team_management',  -- Full access during dev
ADD COLUMN IF NOT EXISTS subscription_status subscription_status DEFAULT 'active',
ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

CREATE INDEX IF NOT EXISTS idx_coaches_subscription ON coaches(subscription_tier, subscription_status);

-- ============================================================================
-- Add subscription columns to players (for recruiting activation)
-- ============================================================================

ALTER TABLE players
ADD COLUMN IF NOT EXISTS subscription_tier subscription_tier DEFAULT 'free',
ADD COLUMN IF NOT EXISTS subscription_status subscription_status DEFAULT 'inactive',
ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

CREATE INDEX IF NOT EXISTS idx_players_subscription ON players(subscription_tier, subscription_status);

-- ============================================================================
-- Helper function: Check coach subscription (returns true for now - disabled)
-- ============================================================================

CREATE OR REPLACE FUNCTION coach_has_subscription(coach_uuid UUID, required_tier subscription_tier)
RETURNS BOOLEAN AS $$
BEGIN
  -- DISABLED: Always return true during development
  -- TODO: Enable subscription enforcement when ready
  RETURN TRUE;

  -- FUTURE ENFORCEMENT:
  -- RETURN EXISTS (
  --   SELECT 1 FROM coaches
  --   WHERE id = coach_uuid
  --   AND subscription_status = 'active'
  --   AND (
  --     subscription_tier = required_tier
  --     OR (subscription_tier = 'team_management' AND required_tier = 'recruiting')
  --   )
  -- );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- Helper function: Check player subscription (returns true for now - disabled)
-- ============================================================================

CREATE OR REPLACE FUNCTION player_has_subscription(player_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- DISABLED: Always return true during development
  -- TODO: Enable subscription enforcement when ready
  RETURN TRUE;

  -- FUTURE ENFORCEMENT:
  -- RETURN EXISTS (
  --   SELECT 1 FROM players
  --   WHERE id = player_uuid
  --   AND subscription_status = 'active'
  --   AND subscription_tier = 'recruiting'
  -- );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================================
-- Comment documenting future enforcement
-- ============================================================================

COMMENT ON FUNCTION coach_has_subscription IS 'Check if coach has required subscription tier. Currently DISABLED - always returns true. Enable by uncommenting enforcement logic.';
COMMENT ON FUNCTION player_has_subscription IS 'Check if player has active recruiting subscription. Currently DISABLED - always returns true. Enable by uncommenting enforcement logic.';
