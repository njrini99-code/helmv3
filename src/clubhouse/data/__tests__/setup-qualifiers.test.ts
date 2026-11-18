import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PMAC-03 (production audit 2026-11-15): New round drew skeleton slabs for about 3 s while the browser ran the qualifier
 * list and then each qualifier's next round as server actions, one after another. The route now reads them on the
 * server: every open qualifier's next round at once, and a read that never answers does not hold the page.
 */
const mocks = vi.hoisted(() => ({ list: vi.fn(), next: vi.fn(), log: vi.fn() }));
vi.mock('@/app/golf/actions/qualifier-actions', () => ({
  getPlayerQualifiers: () => mocks.list(),
  getNextQualifierRoundNumber: (id: string) => mocks.next(id),
}));
vi.mock('../../lib/track-server', () => ({ chLogServer: (...a: unknown[]) => mocks.log(...a) }));

import { loadSetupQualifiers } from '../setup-qualifiers';

const q = (id: string) => ({ id, name: `Q ${id}`, status: 'in_progress', numRounds: 3, roundsCompleted: 0, courseName: null });

beforeEach(() => {
  mocks.list.mockReset();
  mocks.next.mockReset();
  mocks.log.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('loadSetupQualifiers (server)', () => {
  it('asks for every open qualifier’s next round at once, not one after another', async () => {
    mocks.list.mockResolvedValue({ success: true, data: [q('a'), q('b'), q('c')] });
    const answers: Array<() => void> = [];
    mocks.next.mockImplementation(
      () =>
        new Promise((r) => {
          answers.push(() => r({ success: true, data: { nextRoundNumber: 1, availableRounds: [1, 2, 3] } }));
        }),
    );
    const read = loadSetupQualifiers();
    await vi.waitFor(() => expect(mocks.next).toHaveBeenCalledTimes(3));
    for (const answer of answers) answer();
    expect((await read)?.map((x) => [x.id, x.nextRound])).toEqual([
      ['a', 1],
      ['b', 1],
      ['c', 1],
    ]);
  });

  it('a list that never answers counts as not loaded after the wait, and is logged', async () => {
    vi.useFakeTimers();
    mocks.list.mockReturnValue(new Promise(() => {}));
    const read = loadSetupQualifiers(500);
    await vi.advanceTimersByTimeAsync(500);
    await expect(read).resolves.toBeNull();
    expect(mocks.log).toHaveBeenCalledWith('rounds.new', 'qualifiers.slow', expect.any(Error));
  });

  it('a list read that throws is null and logged; one qualifier that throws says so and the rest still load', async () => {
    mocks.list.mockRejectedValueOnce(new Error('down'));
    await expect(loadSetupQualifiers()).resolves.toBeNull();
    expect(mocks.log).toHaveBeenCalledWith('rounds.new', 'qualifiers', expect.any(Error));

    mocks.list.mockResolvedValue({ success: true, data: [q('a'), q('b')] });
    mocks.next.mockImplementation(async (id: string) => {
      if (id === 'a') throw new Error('timeout');
      return { success: true, data: { nextRoundNumber: 2, availableRounds: [2, 3] } };
    });
    const list = await loadSetupQualifiers();
    expect(list?.[0]).toMatchObject({ id: 'a', nextRound: null, blocked: 'We couldn’t check this qualifier. Try again in a moment.' });
    expect(list?.[1]).toMatchObject({ id: 'b', nextRound: 2, blocked: null });
    expect(mocks.log).toHaveBeenCalledWith('rounds.new', 'qualifiers.next', expect.any(Error));
  });
});
