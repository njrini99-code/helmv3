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
  tables: { current: {} as import('../../__tests__/supabase-fake').ChFakeTables },
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/coachhelm/data-gap/load-asks', () => ({ dataGapAsksForShotEntry: (id: string) => mocks.asks(id) }));
vi.mock('@/lib/golf/data-prompts/flag', () => ({ dataPromptsV2ForShotEntry: (id: string) => mocks.v2(id) }));
vi.mock('@/lib/supabase/server', async () => (await import('../../__tests__/supabase-fake')).fakeServer(mocks.tables));
vi.mock('../../screens/rounds/entry/NewRound', () => ({ NewRound: () => null }));
vi.mock('../../screens/rounds/entry/ContinueRound', () => ({ ContinueRound: () => null }));

const { ClubhouseNewRoundRoute } = await import('../round-new');
const continueModule = await import('../round-continue');

const ASK = { readId: 'read-1' };

beforeEach(() => {
  mocks.asks.mockReset().mockResolvedValue(undefined);
  mocks.v2.mockReset().mockResolvedValue(false);
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
