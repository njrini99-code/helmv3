import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Chainable Supabase mock
// ---------------------------------------------------------------------------

function createChainableMock(finalResult: Record<string, unknown> = { data: [], error: null }) {
  const chain: Record<string, unknown> = {};
  const methods = ['select', 'eq', 'in', 'gte', 'lte', 'not', 'order', 'limit', 'single', 'insert', 'update', 'delete', 'upsert'];
  for (const method of methods) {
    chain[method] = vi.fn(() => ({ ...chain, ...finalResult }));
  }
  return chain;
}

let mockFromResult: ReturnType<typeof createChainableMock>;
const mockFrom = vi.fn(() => mockFromResult);
const mockGetUser = vi.fn((): { data: { user: { id: string } | null }; error: null } => ({
  data: { user: { id: 'user-1' } },
  error: null,
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: mockFrom,
    auth: { getUser: mockGetUser },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn(() => ({ data: { path: 'test/path' }, error: null })),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'https://example.com/receipt.jpg' } })),
      })),
    },
  })),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@/lib/validation/server-action-validator', () => ({
  formatSafeErrorResponse: vi.fn((err: unknown) => ({
    success: false,
    error: err instanceof Error ? err.message : 'Unknown error',
  })),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import {
  createGolfTravelItinerary,
  updateGolfTravelItinerary,
  deleteGolfTravelItinerary,
  createTravelExpense,
  updateTravelExpense,
  deleteTravelExpense,
  getExpensesForItinerary,
  getExpensesForTeam,
  getExpenseSummary,
  setBudget,
  getBudgetsForItinerary,
} from '../travel';

import type {
  CreateTravelItineraryInput,
  CreateExpenseInput,
} from '../travel';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('travel server actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFromResult = createChainableMock({ data: { id: 'new-1' }, error: null });
    mockGetUser.mockReturnValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
  });

  // ========================================================================
  // createGolfTravelItinerary
  // ========================================================================
  describe('createGolfTravelItinerary', () => {
    const validInput: CreateTravelItineraryInput = {
      team_id: '550e8400-e29b-41d4-a716-446655440000',
      event_name: 'SEC Championship',
      destination: 'Kiawah Island',
      transportation_type: 'flight',
      departure_date: '2026-03-15',
      created_by: '550e8400-e29b-41d4-a716-446655440001',
    };

    it('returns success for valid input', async () => {
      const result = await createGolfTravelItinerary(validInput);
      expect(result.success).toBe(true);
    });

    it('inserts into golf_travel_itineraries table', async () => {
      await createGolfTravelItinerary(validInput);
      expect(mockFrom).toHaveBeenCalledWith('golf_travel_itineraries');
    });

    it('returns error for invalid input (missing required fields)', async () => {
      const invalidInput = {
        team_id: 'not-a-uuid',
        event_name: '',
        destination: '',
        transportation_type: 'flight',
        departure_date: '2026-03-15',
        created_by: 'not-a-uuid',
      } as CreateTravelItineraryInput;

      const result = await createGolfTravelItinerary(invalidInput);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid travel itinerary data');
    });

    it('returns error for invalid transportation type', async () => {
      const result = await createGolfTravelItinerary({
        ...validInput,
        transportation_type: 'rocket' as 'bus',
      });
      expect(result.success).toBe(false);
    });

    it('handles Supabase insert error gracefully', async () => {
      mockFromResult = createChainableMock({ data: null, error: { message: 'DB error' } });

      const result = await createGolfTravelItinerary(validInput);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Operation failed. Please try again.');
    });

    it('converts flight_info string to JSON object', async () => {
      const mock = createChainableMock({ data: { id: 'new-1' }, error: null });
      mockFromResult = mock;

      await createGolfTravelItinerary({
        ...validInput,
        flight_info: 'Delta 1234, departs 8am',
      });

      const insertFn = mock.insert as ReturnType<typeof vi.fn>;
      expect(insertFn).toHaveBeenCalled();
      const insertArg = insertFn.mock.calls[0]?.[0];
      expect(insertArg).toHaveProperty('flight_info');
      expect(insertArg.flight_info).toEqual({ text: 'Delta 1234, departs 8am' });
    });

    it('converts gear_list string to array', async () => {
      const mock = createChainableMock({ data: { id: 'new-1' }, error: null });
      mockFromResult = mock;

      await createGolfTravelItinerary({
        ...validInput,
        gear_list: 'clubs, shoes, gloves',
      });

      const insertFn = mock.insert as ReturnType<typeof vi.fn>;
      const insertArg = insertFn.mock.calls[0]?.[0];
      expect(insertArg.gear_list).toEqual(['clubs', 'shoes', 'gloves']);
    });
  });

  // ========================================================================
  // updateGolfTravelItinerary
  // ========================================================================
  describe('updateGolfTravelItinerary', () => {
    it('returns success for valid update', async () => {
      const result = await updateGolfTravelItinerary({
        id: '550e8400-e29b-41d4-a716-446655440000',
        event_name: 'Updated Championship',
      });
      expect(result.success).toBe(true);
    });

    it('returns error for invalid id', async () => {
      const result = await updateGolfTravelItinerary({
        id: 'not-uuid',
        event_name: 'Test',
      });
      expect(result.success).toBe(false);
    });
  });

  // ========================================================================
  // deleteGolfTravelItinerary
  // ========================================================================
  describe('deleteGolfTravelItinerary', () => {
    const validId = '550e8400-e29b-41d4-a716-446655440000';

    it('deletes from golf_travel_itineraries', async () => {
      mockFromResult = createChainableMock({ error: null });
      const result = await deleteGolfTravelItinerary(validId);
      expect(result.success).toBe(true);
      expect(mockFrom).toHaveBeenCalledWith('golf_travel_itineraries');
    });

    it('returns error when delete fails', async () => {
      mockFromResult = createChainableMock({ error: { message: 'Delete failed' } });
      const result = await deleteGolfTravelItinerary(validId);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to delete');
    });

    it('rejects non-UUID itinerary id', async () => {
      const result = await deleteGolfTravelItinerary('not-a-uuid');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid itinerary ID');
    });
  });

  // ========================================================================
  // Expense CRUD
  // ========================================================================
  describe('createTravelExpense', () => {
    const validExpense: CreateExpenseInput = {
      team_id: '550e8400-e29b-41d4-a716-446655440000',
      category: 'lodging',
      description: 'Hotel for 3 nights',
      amount: 450.00,
      paid_by: 'team',
    };

    it('checks auth before creating expense', async () => {
      await createTravelExpense(validExpense);
      expect(mockGetUser).toHaveBeenCalled();
    });

    it('returns unauthorized when no user', async () => {
      mockGetUser.mockReturnValueOnce({
        data: { user: null },
        error: null,
      });

      const result = await createTravelExpense(validExpense);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unauthorized');
    });

    it('returns success for valid expense', async () => {
      const result = await createTravelExpense(validExpense);
      expect(result.success).toBe(true);
    });

    it('validates amount must be positive', async () => {
      const result = await createTravelExpense({
        ...validExpense,
        amount: -10,
      });
      expect(result.success).toBe(false);
    });

    it('validates category enum', async () => {
      const result = await createTravelExpense({
        ...validExpense,
        category: 'invalid' as 'lodging',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updateTravelExpense', () => {
    it('returns success for valid update', async () => {
      const result = await updateTravelExpense({
        id: '550e8400-e29b-41d4-a716-446655440000',
        amount: 500.00,
      });
      expect(result.success).toBe(true);
    });

    it('returns error for invalid id', async () => {
      const result = await updateTravelExpense({ id: 'bad', amount: 100 });
      expect(result.success).toBe(false);
    });
  });

  describe('deleteTravelExpense', () => {
    it('deletes from golf_travel_expenses', async () => {
      mockFromResult = createChainableMock({ error: null });
      const result = await deleteTravelExpense('550e8400-e29b-41d4-a716-446655440002');
      expect(result.success).toBe(true);
      expect(mockFrom).toHaveBeenCalledWith('golf_travel_expenses');
    });

    it('rejects non-UUID expense id', async () => {
      const result = await deleteTravelExpense('bad-id');
      expect(result.success).toBe(false);
    });
  });

  // ========================================================================
  // Expense Queries
  // ========================================================================
  describe('getExpensesForItinerary', () => {
    it('returns empty array when no expenses', async () => {
      mockFromResult = createChainableMock({ data: [], error: null });
      const result = await getExpensesForItinerary('550e8400-e29b-41d4-a716-446655440000');
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('rejects non-UUID itinerary id', async () => {
      const result = await getExpensesForItinerary('bad-id');
      expect(result.success).toBe(false);
    });
  });

  describe('getExpensesForTeam', () => {
    it('returns empty array when no expenses', async () => {
      mockFromResult = createChainableMock({ data: [], error: null });
      const result = await getExpensesForTeam('550e8400-e29b-41d4-a716-446655440000');
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });

    it('rejects non-UUID team id', async () => {
      const result = await getExpensesForTeam('bad-id');
      expect(result.success).toBe(false);
    });
  });

  describe('getExpenseSummary', () => {
    it('returns zeroed summary with no expenses', async () => {
      mockFromResult = createChainableMock({ data: [], error: null });
      const result = await getExpenseSummary('550e8400-e29b-41d4-a716-446655440000');
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.total).toBe(0);
      expect(result.data!.count).toBe(0);
      expect(result.data!.byCategory).toEqual({
        lodging: 0, transportation: 0, meals: 0,
        entry_fees: 0, equipment: 0, other: 0,
      });
      expect(result.data!.byPaidBy).toEqual({
        team: 0, player: 0, pending_reimbursement: 0, split: 0,
      });
    });

    it('aggregates expense amounts correctly', async () => {
      mockFromResult = createChainableMock({
        data: [
          { category: 'lodging', amount: '200', paid_by: 'team' },
          { category: 'meals', amount: '50', paid_by: 'player' },
          { category: 'lodging', amount: '100', paid_by: 'team' },
        ],
        error: null,
      });

      const result = await getExpenseSummary('550e8400-e29b-41d4-a716-446655440000');
      expect(result.success).toBe(true);
      expect(result.data!.total).toBe(350);
      expect(result.data!.count).toBe(3);
      expect(result.data!.byCategory.lodging).toBe(300);
      expect(result.data!.byCategory.meals).toBe(50);
      expect(result.data!.byPaidBy.team).toBe(300);
      expect(result.data!.byPaidBy.player).toBe(50);
    });
  });

  // ========================================================================
  // Budget
  // ========================================================================
  describe('setBudget', () => {
    it('returns success for valid budget', async () => {
      const result = await setBudget({
        itinerary_id: '550e8400-e29b-41d4-a716-446655440000',
        category: 'lodging',
        budgeted_amount: 1000,
      });
      expect(result.success).toBe(true);
    });

    it('validates amount is non-negative', async () => {
      const result = await setBudget({
        itinerary_id: '550e8400-e29b-41d4-a716-446655440000',
        category: 'meals',
        budgeted_amount: -50,
      });
      expect(result.success).toBe(false);
    });

    it('validates itinerary_id is UUID', async () => {
      const result = await setBudget({
        itinerary_id: 'not-a-uuid',
        category: 'lodging',
        budgeted_amount: 100,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('getBudgetsForItinerary', () => {
    it('returns empty array when no budgets', async () => {
      mockFromResult = createChainableMock({ data: [], error: null });
      const result = await getBudgetsForItinerary('550e8400-e29b-41d4-a716-446655440000');
      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });
});
