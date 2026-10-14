import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The qualifiers a live round's type can change to (`loadRoundTypeOptions`, the Clubhouse continue route's one read
 * for the round-type sheet, CH-11521), and the sheet's pure rules (`round-type.ts`). A read that failed is "couldn't
 * tell" (CH-11218), never "none" (CH-11316): without the taken slots every number would look free.
 */

const mocks = vi.hoisted(() => ({
  tables: { current: {} as import('./supabase-fake').ChFakeTables },
  logServerError: vi.fn(async () => {}),
}));

vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(mocks.tables));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: mocks.logServerError }));
vi.mock('../screens/rounds/entry/ContinueRound', () => ({ ContinueRound: () => null }));

import { loadRoundTypeOptions } from '../routes/round-continue';
import { freeRoundNumbers, roundTypeFailure, sameChoice, savedLine } from '../screens/rounds/entry/round-type';

const input = { playerId: 'player-1', roundId: 'round-9' };
const entry = (id: string, over: Record<string, unknown> = {}) => ({ qualifier: { id, name: `Q ${id}`, num_rounds: 3, status: 'active', ...over } });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tables.current = {};
});

describe('loadRoundTypeOptions', () => {
  it('CH-11218 an entries read that fails is readFailed, logged, and never an empty "none"', async () => {
    mocks.tables.current = { golf_qualifier_entries: { error: { message: 'boom' } } };
    await expect(loadRoundTypeOptions(input)).resolves.toEqual({ qualifiers: [], readFailed: true });
    expect(mocks.logServerError).toHaveBeenCalled();
  });

  it('CH-11218 a taken-slots read that fails is readFailed too', async () => {
    mocks.tables.current = { golf_qualifier_entries: { data: [entry('q1')] }, golf_rounds: { error: { message: 'boom' } } };
    await expect(loadRoundTypeOptions(input)).resolves.toEqual({ qualifiers: [], readFailed: true });
  });

  it('CH-11316 no entries is an honest empty list, without reading rounds', async () => {
    const rounds = vi.fn(() => ({ data: [] }));
    mocks.tables.current = { golf_qualifier_entries: { data: [] }, golf_rounds: rounds };
    await expect(loadRoundTypeOptions(input)).resolves.toEqual({ qualifiers: [], readFailed: false });
    expect(rounds).not.toHaveBeenCalled();
  });

  it('groups the taken round numbers per qualifier, excludes this round, and reads a finished qualifier as completed', async () => {
    let filters: Array<[string, unknown[]]> = [];
    mocks.tables.current = {
      golf_qualifier_entries: { data: [entry('q1'), entry('q2', { name: null, num_rounds: null, status: 'completed' }), { qualifier: null }] },
      golf_rounds: (f) => {
        filters = f;
        return {
          data: [
            { qualifier_id: 'q1', qualifier_round_number: 1 },
            { qualifier_id: 'q1', qualifier_round_number: 3 },
            { qualifier_id: 'q2', qualifier_round_number: null },
          ],
        };
      },
    };
    const res = await loadRoundTypeOptions(input);
    expect(res.readFailed).toBe(false);
    expect(res.qualifiers).toEqual([
      { id: 'q1', name: 'Q q1', numRounds: 3, takenRoundNumbers: [1, 3], isCompleted: false },
      { id: 'q2', name: 'Qualifier', numRounds: 1, takenRoundNumbers: [], isCompleted: true },
    ]);
    expect(filters).toContainEqual(['neq', ['id', 'round-9']]);
    expect(filters).toContainEqual(['neq', ['status', 'abandoned']]);
    expect(filters).toContainEqual(['in', ['qualifier_id', ['q1', 'q2']]]);
  });
});

describe('round-type rules', () => {
  const q = { id: 'q1', name: 'Fall', numRounds: 3, takenRoundNumbers: [2], isCompleted: false };

  it('freeRoundNumbers skips held slots, and a qualifier with no rounds configured still has round 1', () => {
    expect(freeRoundNumbers(q)).toEqual([1, 3]);
    expect(freeRoundNumbers({ ...q, numRounds: 0, takenRoundNumbers: [] })).toEqual([1]);
    expect(freeRoundNumbers(undefined)).toEqual([]);
  });

  it('sameChoice: a type change, or a different qualifier or slot, is a change', () => {
    const cur = { type: 'qualifier' as const, qualifierId: 'q1', roundNumber: 1 };
    expect(sameChoice(cur, { ...cur })).toBe(true);
    expect(sameChoice(cur, { ...cur, roundNumber: 3 })).toBe(false);
    expect(sameChoice(cur, { type: 'practice', qualifierId: null, roundNumber: null })).toBe(false);
    expect(sameChoice({ type: 'practice', qualifierId: null, roundNumber: null }, { type: 'practice', qualifierId: null, roundNumber: null })).toBe(true);
  });

  it('savedLine names what the round counts toward', () => {
    expect(savedLine({ type: 'tournament', qualifierId: null, roundNumber: null }, undefined)).toBe('This round now counts as a tournament round');
    expect(savedLine({ type: 'qualifier', qualifierId: 'q1', roundNumber: 3 }, q)).toBe('This round now counts as round 3 of Fall');
  });

  it('roundTypeFailure: a permission refusal names entry and active membership; offline and busy add nothing', () => {
    expect(roundTypeFailure("You don't have permission to change this round.")).toMatch(/active member of the team/);
    expect(roundTypeFailure('Could not add this player to that qualifier. Please try again.')).toMatch(/Only active members/);
    expect(roundTypeFailure('offline')).toBeUndefined();
    expect(roundTypeFailure('busy')).toBeUndefined();
    expect(roundTypeFailure('That qualifier no longer exists.')).toBe('That qualifier no longer exists.');
  });
});
