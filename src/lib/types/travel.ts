/**
 * Travel Module Type Definitions
 *
 * Types for golf travel itineraries, expenses, and budgets.
 * Matches the actual database schema in supabase/migrations/028_golf_travel.sql
 * and supabase/migrations/055_travel_expenses.sql
 */

// Json type from Supabase - matches what the database expects
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ============================================================================
// ENUMS & CONSTANTS
// ============================================================================

// Matches golf_expense_category enum in database
export type ExpenseCategory =
  | 'transportation'
  | 'lodging'
  | 'meals'
  | 'entry_fees'
  | 'equipment'
  | 'other';

// Matches golf_expense_paid_by enum in database
export type ExpensePaidBy = 'team' | 'player' | 'pending_reimbursement' | 'split';

// For UI compatibility (maps to paid_by)
export type ExpenseStatus = 'pending' | 'approved' | 'rejected' | 'reimbursed';

// Matches golf_transportation_type enum in database
export type TransportationType = 'team_bus' | 'van' | 'flight' | 'personal_vehicle' | 'other';

export type EventType = 'tournament' | 'practice' | 'camp' | 'showcase' | 'meeting' | 'other';

// Team member status from database (maps to team_member_status enum)
export type TeamMemberStatus = 'pending' | 'active' | 'inactive' | 'removed';

// For UI compatibility only - not in actual database
export type TeamMemberRole = 'player' | 'captain' | 'manager';

// Label constants
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  transportation: 'Transportation',
  lodging: 'Lodging',
  meals: 'Meals',
  entry_fees: 'Entry Fees',
  equipment: 'Equipment',
  other: 'Other',
};

export const EXPENSE_PAID_BY_LABELS: Record<ExpensePaidBy, string> = {
  team: 'Team',
  player: 'Player',
  pending_reimbursement: 'Pending Reimbursement',
  split: 'Split',
};

// ============================================================================
// ACTION RESULT TYPE
// ============================================================================

export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

// ============================================================================
// DATE RANGE TYPE
// ============================================================================

export interface DateRange {
  start: string;
  end: string;
}

// ============================================================================
// TRAVEL EXPENSE TYPES (matches golf_travel_expenses table)
// ============================================================================

export interface TravelExpense {
  id: string;
  itinerary_id: string | null;
  team_id: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  receipt_url: string | null;
  paid_by: ExpensePaidBy;
  vendor_name: string | null;
  expense_date: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface TravelExpenseWithDetails extends TravelExpense {
  // For UI compatibility
  currency: string;
  status: ExpenseStatus;
  per_player: boolean;
  player_id: string | null;
  player?: {
    id: string;
    profile?: {
      full_name: string;
      avatar_url?: string;
    };
  } | null;
  approver?: {
    full_name: string;
    avatar_url?: string;
  } | null;
  creator?: {
    full_name: string;
    avatar_url?: string;
  } | null;
  itinerary?: {
    id?: string;
    title?: string;
    event_name?: string;
  } | null;
}

export interface CreateExpenseData {
  itinerary_id?: string;
  team_id: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  paid_by?: ExpensePaidBy;
  vendor_name?: string;
  expense_date?: string;
  receipt_url?: string;
  notes?: string;
}

export interface UpdateExpenseData {
  category?: ExpenseCategory;
  description?: string;
  amount?: number;
  paid_by?: ExpensePaidBy;
  vendor_name?: string;
  expense_date?: string;
  receipt_url?: string | null;
  notes?: string;
}

export interface ExpenseFilters {
  itinerary_id?: string;
  team_id?: string;
  category?: ExpenseCategory;
  paid_by?: ExpensePaidBy;
  date_range?: DateRange;
  min_amount?: number;
  max_amount?: number;
}

// ============================================================================
// TRAVEL BUDGET TYPES (matches golf_travel_budgets table)
// ============================================================================

export interface TravelBudget {
  itinerary_id: string;
  total_budget: number;
  total_spent: number;
  remaining: number;
  by_category: Record<ExpenseCategory, number>;
  pending_count: number;
  approved_count: number;
}

// ============================================================================
// EXPENSE SUMMARY TYPES
// ============================================================================

export interface ExpenseSummary {
  team_id: string;
  total_expenses: number;
  total_approved: number;
  total_pending: number;
  total_rejected: number;
  by_category: Record<ExpenseCategory, number>;
  by_itinerary: Array<{
    id?: string;
    itinerary_id?: string;
    title?: string;
    itinerary_title?: string;
    total: number;
  }>;
  by_player: Array<{
    id?: string;
    player_id?: string;
    name?: string;
    player_name?: string;
    total: number;
  }>;
  date_range: DateRange;
}

// ============================================================================
// TRAVEL ITINERARY TYPES (matches golf_travel_itineraries table)
// ============================================================================

export interface TravelItinerary {
  id: string;
  team_id: string;
  event_id: string | null;
  event_name: string | null;
  destination: string | null;
  transportation_type: string | null;
  departure_date: string | null;
  departure_time: string | null;
  departure_location: string | null;
  return_date: string | null;
  return_time: string | null;
  flight_info: Json | null;
  hotel_name: string | null;
  hotel_address: string | null;
  hotel_phone: string | null;
  hotel_confirmation: string | null;
  room_assignments: Json | null;
  uniform_requirements: string | null;
  gear_list: string[] | null;
  notes: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface TravelItineraryWithDetails extends TravelItinerary {
  // For UI compatibility
  title?: string;
  status?: string;
  total_budget?: number;
  team?: {
    id: string;
    name: string;
    organization?: {
      id: string;
      name: string;
      city?: string;
      state?: string;
    };
  } | null;
  creator?: {
    full_name: string;
    avatar_url?: string;
  } | null;
  expenses_count?: number;
  budget_summary?: TravelBudget | null;
}

export interface CreateItineraryData {
  team_id: string;
  event_id?: string;
  event_name: string;
  destination: string;
  transportation_type?: string;
  departure_date: string;
  departure_time?: string;
  departure_location?: string;
  return_date?: string;
  return_time?: string;
  flight_info?: Json;
  hotel_name?: string;
  hotel_address?: string;
  hotel_phone?: string;
  hotel_confirmation?: string;
  room_assignments?: Json;
  uniform_requirements?: string;
  gear_list?: string[];
  notes?: string;
}

export interface UpdateItineraryData {
  event_name?: string;
  destination?: string;
  transportation_type?: string;
  departure_date?: string;
  departure_time?: string;
  departure_location?: string;
  return_date?: string;
  return_time?: string;
  flight_info?: Json;
  hotel_name?: string;
  hotel_address?: string;
  hotel_phone?: string;
  hotel_confirmation?: string;
  room_assignments?: Json;
  uniform_requirements?: string;
  gear_list?: string[];
  notes?: string;
}

export interface ItineraryFilters {
  team_id?: string;
  event_id?: string;
  date_range?: DateRange;
}

// ============================================================================
// TRAVEL TEAM TYPES (uses golf_teams table)
// ============================================================================

export interface TravelTeam {
  id: string;
  name: string;
  organization_id: string | null;
  join_code: string;
  description: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  season: string | null;
  created_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  // UI compatibility - not in database
  is_active?: boolean;
}

export interface TravelTeamWithDetails extends TravelTeam {
  organization?: {
    id: string;
    name: string;
    city?: string;
    state?: string;
  } | null;
  coach?: {
    id: string;
    user_id?: string;
    title?: string;
    profile?: {
      full_name: string;
      avatar_url?: string;
    };
  } | null;
  member_count?: number;
}

export interface CreateTravelTeamData {
  name: string;
  organization_id?: string;
  join_code?: string;
  description?: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  season?: string;
}

export interface UpdateTravelTeamData {
  name?: string;
  description?: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
  season?: string;
}

// ============================================================================
// TRAVEL TEAM MEMBER TYPES (uses golf_team_members table)
// ============================================================================

export interface TravelTeamMember {
  id: string;
  team_id: string;
  player_id: string;
  status: TeamMemberStatus | null;
  jersey_number: number | null;
  joined_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  created_at: string | null;
  updated_at: string | null;
  // UI compatibility - not in database
  role?: TeamMemberRole;
}

export interface TravelTeamMemberWithPlayer extends TravelTeamMember {
  player?: {
    id: string;
    user_id?: string;
    profile?: {
      full_name: string;
      avatar_url?: string;
    };
  } | null;
}

// ============================================================================
// EXPENSE SPLIT TYPES (matches golf_travel_expense_splits table)
// ============================================================================

export interface ExpenseSplit {
  id: string;
  expense_id: string;
  player_id: string;
  amount: number;
  paid: boolean;
  paid_at: string | null;
  created_at: string;
}
