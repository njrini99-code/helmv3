import { isValidElement, type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Clubhouse round entry routes hand CoachHelm's one-tap data prompts to the screen (chs-22, chs-23): the same two reads the
 * Fairway pages make, for the route's own player. With the flags off the loaders answer undefined and false, and the screen
 * gets exactly that, so it is what it was.
 */

const mocks = vi.hoisted(() => ({
  asks: vi.fn(async (_playerId: string): Promise<unknown[] | undefined> => undefined),
  v2: vi.fn(async (_playerId: string) => false),
  qualifiers: vi.fn(async (): Promise<unknown[] | null> => []),
  tables: { current: {} as import('../../__tests__/supabase-fake').ChFakeTables },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/coachhelm/data-gap/load-asks', () => ({ dataGapAsksForShotEntry: (id: string) => mocks.asks(id) }));
vi.mock('@/lib/golf/data-prompts/flag', () => ({ dataPromptsV2ForShotEntry: (id: string) => mocks.v2(id) }));
vi.mock('@/lib/supabase/server', async () => (await import('../../__tests__/supabase-fake')).fakeServer(mocks.tables));
vi.mock('../../screens/rounds/entry/NewRound', () => ({ NewRound: () => null }));
vi.mock('../../data/setup-qualifiers', () => ({ loadSetupQualifiers: () => mocks.qualifiers() }));
vi.mock('../../screens/rounds/entry/ContinueRound', () => ({ ContinueRound: () => null }));

const { ClubhouseNewRoundRoute } = await import('../round-new');
const continueModule = await import('../round-continue');

const ASK = { readId: 'read-1' };

beforeEach(() => {
  mocks.asks.mockReset().mockResolvedValue(undefined);
  mocks.v2.mockReset().mockResolvedValue(false);
  mocks.qualifiers.mockReset().mockResolvedValue([]);
});

function propsOf(node: unknown): Record<string, unknown> {
  if (!isValidElement(node)) throw new Error('expected an element');
  return (node as ReactElement<Record<string, unknown>>).props;
}

describe('round entry routes: the data prompts', () => {
  it('new round: flags off, nothing is handed down', async () => {
    const props = propsOf(await ClubhouseNewRoundRoute({ playerId: 'player-1' }));
    expect(mocks.asks).toHaveBeenCalledWith('player-1');
    expect(mocks.v2).toHaveBeenCalledWith('player-1');
    expect(props).toMatchObject({ playerId: 'player-1', dataGapAsks: undefined, dataPromptsV2: false });
  });

  it('new round: the asks and the v2 prompts for the route player', async () => {
    mocks.asks.mockResolvedValue([ASK]);
    mocks.v2.mockResolvedValue(true);
    expect(propsOf(await ClubhouseNewRoundRoute({ playerId: 'player-1' }))).toMatchObject({ dataGapAsks: [ASK], dataPromptsV2: true });
  });

  it('PMAC-03 new round: the qualifier list is read with the prompts, all three at once, and handed down', async () => {
    const gates: Array<(v: unknown) => void> = [];
    const held = <T,>(): Promise<T> => new Promise<T>((r) => gates.push(r as (v: unknown) => void));
    mocks.asks.mockImplementation(() => held());
    mocks.v2.mockImplementation(() => held());
    const list = [{ id: 'q1', nextRound: 2 }];
    mocks.qualifiers.mockImplementation(() => held());
    const page = ClubhouseNewRoundRoute({ playerId: 'player-1' });
    await Promise.resolve();
    // All three started before any answered: no read waits on another.
    expect(gates).toHaveLength(3);
    gates[0]!(undefined);
    gates[1]!(false);
    gates[2]!(list);
    expect(propsOf(await page)).toMatchObject({ playerId: 'player-1', qualifiers: list });
  });

  it('new round: a qualifier list that failed is handed down as null (CH-11211)', async () => {
    mocks.qualifiers.mockResolvedValue(null);
    expect(propsOf(await ClubhouseNewRoundRoute({ playerId: 'player-1' }))).toMatchObject({ qualifiers: null });
  });

  it('continue round: the asks and the v2 prompts beside the round-type options', async () => {
    mocks.asks.mockResolvedValue([ASK]);
    mocks.v2.mockResolvedValue(true);
    const route = continueModule.ClubhouseContinueRoundRoute as unknown as (p: Record<string, unknown>) => Promise<unknown>;
    const props = propsOf(await route({ playerId: 'player-1', roundId: 'round-9' }));
    expect(mocks.asks).toHaveBeenCalledWith('player-1');
    expect(mocks.v2).toHaveBeenCalledWith('player-1');
    expect(props).toMatchObject({ playerId: 'player-1', dataGapAsks: [ASK], dataPromptsV2: true, roundTypeOptions: { qualifiers: [], readFailed: false } });
  });
});
