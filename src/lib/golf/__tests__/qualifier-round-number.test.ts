/**
 * @vitest-environment node
 *
 * `resolveQualifierRoundNumber` is the shared derivation both
 * `getNextQualifierRoundNumber` and `savePartialRound`'s no-id branch use
 * (A2). Pinned here directly against the fake Supabase client so both call
 * sites can trust one tested implementation instead of two.
 */
import { describe, it, expect } from 'vitest';
import { createFakeSupabase } from '@/test/fixtures/fake-supabase';
import { resolveQualifierRoundNumber } from '../qualifier-round-number';

const QUALIFIER = 'q-1';
const PLAYER = 'player-1';

describe('resolveQualifierRoundNumber', () => {
  it('returns the in-progress round for reuse instead of deriving a number to insert with', async () => {
    // This is the exact 23505 loop: a max(completed)+1-style derivation would
    // ignore this in-progress round (it is not completed) and mint a FRESH
    // number that collides with it under
    // golf_rounds_qualifier_player_round_number_uq, which is not scoped to
    // status='in_progress'.
    const fake = createFakeSupabase({
      tables: {
        golf_rounds: [
          { id: 'round-active', qualifier_id: QUALIFIER, player_id: PLAYER, qualifier_round_number: 2, status: 'in_progress' },
        ],
      },
    });

    const result = await resolveQualifierRoundNumber(fake as never, { qualifierId: QUALIFIER, playerId: PLAYER, numRounds: 3 });

    expect(result).toMatchObject({ success: true, roundNumber: 2, activeRoundId: 'round-active' });
  });

  it('refuses rather than guess when more than one in-progress round exists', async () => {
    const fake = createFakeSupabase({
      tables: {
        golf_rounds: [
          { id: 'r1', qualifier_id: QUALIFIER, player_id: PLAYER, qualifier_round_number: 1, status: 'in_progress' },
          { id: 'r2', qualifier_id: QUALIFIER, player_id: PLAYER, qualifier_round_number: 2, status: 'in_progress' },
        ],
      },
    });

    const result = await resolveQualifierRoundNumber(fake as never, { qualifierId: QUALIFIER, playerId: PLAYER, numRounds: 3 });

    expect(result.success).toBe(false);
    expect(result.success === false && result.error).toMatch(/more than one saved round/i);
  });

  it('derives the first unused CONFIGURED number, not max(completed) + 1', async () => {
    const fake = createFakeSupabase({
      tables: {
        golf_rounds: [
          { id: 'r1', qualifier_id: QUALIFIER, player_id: PLAYER, qualifier_round_number: 1, status: 'completed' },
          { id: 'r3', qualifier_id: QUALIFIER, player_id: PLAYER, qualifier_round_number: 3, status: 'completed' },
        ],
      },
    });

    const result = await resolveQualifierRoundNumber(fake as never, { qualifierId: QUALIFIER, playerId: PLAYER, numRounds: 3 });

    expect(result).toMatchObject({ success: true, roundNumber: 2 });
  });

  it('returns a clear error, not a number above the cap, when every configured round is used', async () => {
    const fake = createFakeSupabase({
      tables: {
        golf_rounds: [
          { id: 'r1', qualifier_id: QUALIFIER, player_id: PLAYER, qualifier_round_number: 1, status: 'completed' },
          { id: 'r2', qualifier_id: QUALIFIER, player_id: PLAYER, qualifier_round_number: 2, status: 'completed' },
        ],
      },
    });

    const result = await resolveQualifierRoundNumber(fake as never, { qualifierId: QUALIFIER, playerId: PLAYER, numRounds: 2 });

    expect(result.success).toBe(false);
    expect(result.success === false && result.code).toBe('qualifier_round_limit_reached');
    expect(result.success === false && result.error).toMatch(/2 of 2/);
  });

  it('fetches num_rounds itself when the caller does not already have it', async () => {
    const fake = createFakeSupabase({
      tables: {
        golf_qualifiers: [{ id: QUALIFIER, num_rounds: 1 }],
        golf_rounds: [],
      },
    });

    const result = await resolveQualifierRoundNumber(fake as never, { qualifierId: QUALIFIER, playerId: PLAYER });

    expect(result).toMatchObject({ success: true, roundNumber: 1 });
  });

  it('marks a failed active-round read transient rather than inventing slot 1', async () => {
    const fake = createFakeSupabase({ tables: { golf_rounds: [] } });
    const original = fake.from.bind(fake);
    fake.from = ((table: string) => {
      if (table !== 'golf_rounds') return original(table);
      const builder: Record<string, unknown> = {};
      builder.select = () => builder;
      builder.eq = () => builder;
      builder.order = () => builder;
      builder.limit = () => builder;
      builder.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: { code: '08006', message: 'connection reset' } }).then(resolve);
      return builder;
    }) as typeof fake.from;

    const result = await resolveQualifierRoundNumber(fake as never, { qualifierId: QUALIFIER, playerId: PLAYER, numRounds: 3 });

    expect(result.success).toBe(false);
    expect(result.success === false && result.transient).toBe(true);
  });
});
