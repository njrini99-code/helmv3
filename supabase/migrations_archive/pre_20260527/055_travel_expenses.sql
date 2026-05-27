-- ============================================================================
-- Migration: 055_travel_expenses.sql
-- Purpose: Golf travel expense tracking
-- ============================================================================

-- Expense categories enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'golf_expense_category') THEN
    CREATE TYPE golf_expense_category AS ENUM (
      'lodging',
      'transportation',
      'meals',
      'entry_fees',
      'equipment',
      'other'
    );
  END IF;
END
$$;

-- Payment status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'golf_expense_paid_by') THEN
    CREATE TYPE golf_expense_paid_by AS ENUM (
      'team',
      'player',
      'pending_reimbursement',
      'split'
    );
  END IF;
END
$$;

-- Golf Travel Expenses
CREATE TABLE IF NOT EXISTS golf_travel_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id UUID REFERENCES golf_travel_itineraries(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES golf_teams(id) ON DELETE CASCADE,
  category golf_expense_category NOT NULL DEFAULT 'other',
  description TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
  receipt_url TEXT,
  paid_by golf_expense_paid_by NOT NULL DEFAULT 'team',
  vendor_name TEXT,
  expense_date DATE,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_golf_travel_expenses_itinerary ON golf_travel_expenses(itinerary_id);
CREATE INDEX IF NOT EXISTS idx_golf_travel_expenses_team ON golf_travel_expenses(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_travel_expenses_category ON golf_travel_expenses(category);
CREATE INDEX IF NOT EXISTS idx_golf_travel_expenses_date ON golf_travel_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_golf_travel_expenses_created_at ON golf_travel_expenses(created_at);

-- Per-player expense splits (for split expenses)
CREATE TABLE IF NOT EXISTS golf_travel_expense_splits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_id UUID NOT NULL REFERENCES golf_travel_expenses(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES golf_players(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL CHECK (amount >= 0),
  paid BOOLEAN DEFAULT FALSE,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(expense_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_golf_expense_splits_expense ON golf_travel_expense_splits(expense_id);
CREATE INDEX IF NOT EXISTS idx_golf_expense_splits_player ON golf_travel_expense_splits(player_id);

-- Budget tracking per itinerary
CREATE TABLE IF NOT EXISTS golf_travel_budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id UUID NOT NULL REFERENCES golf_travel_itineraries(id) ON DELETE CASCADE,
  category golf_expense_category NOT NULL,
  budgeted_amount DECIMAL(10,2) NOT NULL CHECK (budgeted_amount >= 0),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(itinerary_id, category)
);

CREATE INDEX IF NOT EXISTS idx_golf_travel_budgets_itinerary ON golf_travel_budgets(itinerary_id);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION update_golf_expenses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_golf_travel_expenses_updated_at ON golf_travel_expenses;
CREATE TRIGGER update_golf_travel_expenses_updated_at
  BEFORE UPDATE ON golf_travel_expenses
  FOR EACH ROW EXECUTE FUNCTION update_golf_expenses_updated_at();

DROP TRIGGER IF EXISTS update_golf_travel_budgets_updated_at ON golf_travel_budgets;
CREATE TRIGGER update_golf_travel_budgets_updated_at
  BEFORE UPDATE ON golf_travel_budgets
  FOR EACH ROW EXECUTE FUNCTION update_golf_expenses_updated_at();

-- RLS Policies
ALTER TABLE golf_travel_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_travel_expense_splits ENABLE ROW LEVEL SECURITY;
ALTER TABLE golf_travel_budgets ENABLE ROW LEVEL SECURITY;

-- Coaches can manage expenses for their teams
CREATE POLICY golf_travel_expenses_coach_all ON golf_travel_expenses
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM golf_coaches gc
      JOIN golf_teams gt ON gt.organization_id = gc.organization_id
      WHERE gc.user_id = auth.uid()
      AND gt.id = golf_travel_expenses.team_id
    )
  );

-- Players can view expenses for their teams
CREATE POLICY golf_travel_expenses_player_select ON golf_travel_expenses
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM golf_players gp
      JOIN golf_team_members gtm ON gtm.player_id = gp.id
      WHERE gp.user_id = auth.uid()
      AND gtm.team_id = golf_travel_expenses.team_id
    )
  );

-- Expense splits policies
CREATE POLICY golf_expense_splits_coach_all ON golf_travel_expense_splits
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM golf_travel_expenses gte
      JOIN golf_coaches gc ON EXISTS (
        SELECT 1 FROM golf_teams gt
        WHERE gt.organization_id = gc.organization_id
        AND gt.id = gte.team_id
      )
      WHERE gc.user_id = auth.uid()
      AND gte.id = golf_travel_expense_splits.expense_id
    )
  );

CREATE POLICY golf_expense_splits_player_select ON golf_travel_expense_splits
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM golf_players gp
      WHERE gp.user_id = auth.uid()
      AND gp.id = golf_travel_expense_splits.player_id
    )
  );

-- Budget policies
CREATE POLICY golf_travel_budgets_coach_all ON golf_travel_budgets
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM golf_travel_itineraries gti
      JOIN golf_coaches gc ON EXISTS (
        SELECT 1 FROM golf_teams gt
        WHERE gt.organization_id = gc.organization_id
        AND gt.id = gti.team_id
      )
      WHERE gc.user_id = auth.uid()
      AND gti.id = golf_travel_budgets.itinerary_id
    )
  );

CREATE POLICY golf_travel_budgets_player_select ON golf_travel_budgets
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM golf_travel_itineraries gti
      JOIN golf_team_members gtm ON gtm.team_id = gti.team_id
      JOIN golf_players gp ON gp.id = gtm.player_id
      WHERE gp.user_id = auth.uid()
      AND gti.id = golf_travel_budgets.itinerary_id
    )
  );

-- Documentation
COMMENT ON TABLE golf_travel_expenses IS 'Travel expenses for golf team trips';
COMMENT ON TABLE golf_travel_expense_splits IS 'Per-player expense splits for shared costs';
COMMENT ON TABLE golf_travel_budgets IS 'Budget allocations per category for travel itineraries';
COMMENT ON COLUMN golf_travel_expenses.category IS 'Expense category: lodging, transportation, meals, entry_fees, equipment, other';
COMMENT ON COLUMN golf_travel_expenses.paid_by IS 'Who paid: team, player, pending_reimbursement, split';
