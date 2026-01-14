-- ============================================================================
-- Migration: 028_golf_travel.sql
-- Purpose: Golf travel itineraries
-- Consolidated from: 016_create_golf_schema.sql (travel section)
-- ============================================================================

-- Golf Travel Itineraries
CREATE TABLE IF NOT EXISTS golf_travel_itineraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES golf_teams(id) ON DELETE CASCADE,
  event_id UUID REFERENCES golf_events(id) ON DELETE SET NULL,
  event_name TEXT NOT NULL,
  destination TEXT NOT NULL,
  transportation_type golf_transportation_type NOT NULL,
  departure_date DATE NOT NULL,
  departure_time TIME,
  departure_location TEXT,
  return_date DATE,
  return_time TIME,
  flight_info TEXT,
  hotel_name TEXT,
  hotel_address TEXT,
  hotel_phone TEXT,
  hotel_confirmation TEXT,
  check_in_date DATE,
  check_out_date DATE,
  room_assignments TEXT,
  uniform_requirements TEXT,
  gear_list TEXT,
  notes TEXT,
  created_by UUID NOT NULL REFERENCES golf_coaches(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_golf_travel_team ON golf_travel_itineraries(team_id);
CREATE INDEX IF NOT EXISTS idx_golf_travel_date ON golf_travel_itineraries(departure_date);
CREATE INDEX IF NOT EXISTS idx_golf_travel_event ON golf_travel_itineraries(event_id);

-- Triggers
CREATE TRIGGER update_golf_travel_itineraries_updated_at
  BEFORE UPDATE ON golf_travel_itineraries
  FOR EACH ROW EXECUTE FUNCTION update_golf_updated_at_column();

-- Documentation
COMMENT ON TABLE golf_travel_itineraries IS 'Travel plans for tournaments and away events';
