-- ============================================================================
-- Migration: 017_subscriptions.sql
-- Purpose: Subscription infrastructure (bones only - not enforced)
-- Consolidated from: 037_subscription_infrastructure.sql
-- ============================================================================

-- Subscription ENUMs
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

-- Add subscription columns to coaches
ALTER TABLE coaches
ADD COLUMN IF NOT EXISTS subscription_tier subscription_tier DEFAULT 'team_management',
ADD COLUMN IF NOT EXISTS subscription_status subscription_status DEFAULT 'active',
ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

CREATE INDEX IF NOT EXISTS idx_coaches_subscription ON coaches(subscription_tier, subscription_status);

-- Add subscription columns to players
ALTER TABLE players
ADD COLUMN IF NOT EXISTS subscription_tier subscription_tier DEFAULT 'free',
ADD COLUMN IF NOT EXISTS subscription_status subscription_status DEFAULT 'inactive',
ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

CREATE INDEX IF NOT EXISTS idx_players_subscription ON players(subscription_tier, subscription_status);

-- Helper function: Check coach subscription (returns true for now - disabled)
CREATE OR REPLACE FUNCTION coach_has_subscription(coach_uuid UUID, required_tier subscription_tier)
RETURNS BOOLEAN AS $$
BEGIN
  -- DISABLED: Always return true during development
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Helper function: Check player subscription (returns true for now - disabled)
CREATE OR REPLACE FUNCTION player_has_subscription(player_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  -- DISABLED: Always return true during development
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Documentation
COMMENT ON FUNCTION coach_has_subscription IS 'Check if coach has required subscription tier. Currently DISABLED - always returns true.';
COMMENT ON FUNCTION player_has_subscription IS 'Check if player has active recruiting subscription. Currently DISABLED - always returns true.';
