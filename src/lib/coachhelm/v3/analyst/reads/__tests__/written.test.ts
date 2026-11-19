import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: vi.fn(() => false) }));

import type { ModelClient } from '@/lib/coachhelm/v3/chat/engine/model';
import { syntheticPlayers } from '../../writer/__tests__/fixtures';
import { SUBMIT_TOOL } from '../../writer/prompt';
import type { Draft } from '../../writer/types';
import { buildReadPayload } from '../build';
import { forPlayer } from '../player-card';
import { addWritten, readsWrittenEnabled } from '../written';

const irons = syntheticPlayers().find((p) => p.id === 'long-irons')!;
const NOW = new Date('2026-11-10T18:00:00Z');
const good: Draft = {
  what: 'Approach shots cost 3.1 strokes a round this season, 2.2 of it from 175 yards and longer. Only 10 of those 50 long approaches finished on the green.',
  rules_in_out: 'It is the long approaches, not the ones from 50 to 125 yards. The shots cannot tell whether it is the club or the contact.',
  this_week: 'Hit 30 balls from 180 to 200 yards and count the greens. Aim for 8 of the 30.',
  watch: 'Note the club and the miss side on every approach from 175 yards and longer.',
  this_week_area: 'approach',
  declared: [
    { value: 30, kind: 'prescription', unit: 'reps' },
    { value: 180, kind: 'prescription', unit: 'yards' },
    { value: 200, kind: 'prescription', unit: 'yards' },
    { value: 8, kind: 'prescription', unit: 'count' },
  ],
};

/** A scripted model that always submits the same draft and counts its calls. Never the API. */
function fake(): { client: ModelClient; calls: () => number } {
  let n = 0;
  const client: ModelClient = {
    stream() {
      n += 1;
      return {
        [Symbol.asyncIterator]() {
          return { next: async () => ({ done: true as const, value: undefined }) };
        },
        async finalMessage() {
          return { id: 'm' + n, type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }, stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'tu', name: SUBMIT_TOOL, input: good }] };
        },
      } as never;
    },
  };
  return { client, calls: () => n };
}

const payload = buildReadPayload(irons.sheet, irons.notability, { rounds: [], shots: [], holes: [] });

describe('stage 3 wiring: the written paragraph', () => {
  it('is off unless both switches are on and the team is listed for each', () => {
    const on = { flagOn: () => true, teams: 't1' };
    expect(readsWrittenEnabled('t1', { reads: on, written: on })).toBe(true);
    expect(readsWrittenEnabled('t1', { reads: { flagOn: () => false, teams: 't1' }, written: on })).toBe(false);
    expect(readsWrittenEnabled('t1', { reads: on, written: { flagOn: () => false, teams: 't1' } })).toBe(false);
    expect(readsWrittenEnabled('t1', { reads: on, written: { flagOn: () => true, teams: '' } })).toBe(false);
    expect(readsWrittenEnabled('t1')).toBe(false);
  });

  it('writes the coach paragraph and the player paragraph as two calls, and the player never reads the coach text', async () => {
    const { client, calls } = fake();
    const { payloads, summary } = await addWritten({ payloads: [payload], sheets: [irons.sheet], notables: [irons.notability], previous: new Map() }, { client, now: () => NOW });
    expect(calls()).toBeGreaterThanOrEqual(2);
    expect(payloads[0]!.written?.what).toBe(good.what);
    expect(summary.written).toBe(1);
    const mine = forPlayer(payloads[0]!);
    expect(mine.written_player).toBeUndefined();
    expect(mine.written ?? null).toEqual(payloads[0]!.written_player ?? null);
  });

  it('carries the last paragraph when the card’s words did not change: no model call', async () => {
    const { client, calls } = fake();
    const previous = new Map([[payload.player_id, { ...payload, written: { ...good, model: 'm', checked_at: 'x' } }]]);
    const { payloads, summary } = await addWritten({ payloads: [payload], sheets: [irons.sheet], notables: [irons.notability], previous }, { client, now: () => NOW });
    expect(calls()).toBe(0);
    expect(summary.carried).toBe(1);
    expect(payloads[0]!.written?.what).toBe(good.what);
  });
});
