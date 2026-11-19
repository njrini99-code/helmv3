import { describe, expect, it } from 'vitest';
import type { ModelClient, ModelRequest } from '@/lib/coachhelm/v3/chat/engine/model';
import { withoutCoachOnly } from '../../types';
import { payloadFor } from '../payload';
import { factsMessage, SUBMIT_TOOL, WRITER_TOOLS } from '../prompt';
import type { Draft } from '../types';
import { writeRead, WRITER_PROFILE } from '../write-read';
import { syntheticPlayers } from './fixtures';

const players = syntheticPlayers();
const irons = players.find((p) => p.id === 'long-irons')!;
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
const bad: Draft = { ...good, what: 'Her swing costs 3.4 strokes a round on long approaches.' };

type Reply = Record<string, unknown> | Error;
const submit = (draft: unknown, id = 'tu_1') => ({ stop_reason: 'tool_use', content: [{ type: 'thinking', thinking: '', signature: 'sig' }, { type: 'tool_use', id, name: SUBMIT_TOOL, input: draft }] });

/** A scripted model: one reply per call, in order. Records every request. Never the API. */
function fake(replies: Reply[]): { client: ModelClient; seen: ModelRequest[] } {
  const seen: ModelRequest[] = [];
  const client: ModelClient = {
    stream(request) {
      seen.push(structuredClone(request));
      const reply = replies[seen.length - 1];
      return {
        [Symbol.asyncIterator]() {
          return { next: async () => ({ done: true as const, value: undefined }) };
        },
        async finalMessage() {
          if (!reply) throw new Error('no scripted reply');
          if (reply instanceof Error) throw reply;
          return { id: `m${seen.length}`, type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', stop_sequence: null, usage: { input_tokens: 3000, output_tokens: 1500, cache_read_input_tokens: 0, cache_creation_input_tokens: 1200 }, ...reply };
        },
      } as never;
    },
  };
  return { client, seen };
}

const deps = (client: ModelClient) => ({ client, now: () => NOW });

describe('writeRead', () => {
  it('returns a read that passes the first time, with what it cost', async () => {
    const { client, seen } = fake([submit(good)]);
    const out = await writeRead({ view: 'coach', sheet: irons.sheet, notability: irons.notability }, deps(client));
    expect(out.written).toEqual({ what: good.what, rules_in_out: good.rules_in_out, this_week: good.this_week, watch: good.watch, model: 'claude-sonnet-5-5', checked_at: '2026-11-10T18:00:00.000Z' });
    expect(out.attempts).toBe(1);
    expect(out.rejections).toEqual([]);
    expect(out.usage).toMatchObject({ input: 3000, output: 1500, cacheWrite: 1200 });
    // Sonnet 5.5 at $2 / $10 a million, a five-minute cache write at 1.25x of input: 3000 * 2 + 1200 * 1.25 * 2 + 1500 * 10, per million.
    expect(out.cost_usd).toBeCloseTo((3000 * 2 + 1200 * 1.25 * 2 + 1500 * 10) / 1e6, 8);
    expect(seen).toHaveLength(1);
  });

  it('sends the request the repo already runs live: Sonnet 5.5, medium effort, auto tool choice, no strict tool, refusal fallback', async () => {
    const { client, seen } = fake([submit(good)]);
    await writeRead({ view: 'coach', sheet: irons.sheet, notability: irons.notability }, deps(client));
    const r = seen[0]! as unknown as Record<string, unknown>;
    expect(r).toMatchObject({ model: 'claude-sonnet-5-5', max_tokens: 16000, tool_choice: { type: 'auto' }, thinking: { type: 'adaptive' }, output_config: { effort: 'medium' }, fallbacks: 'default', betas: ['server-side-fallback-2026-07-01'] });
    expect(WRITER_PROFILE).toMatchObject({ modelId: 'claude-sonnet-5-5', effort: 'medium', maxAttempts: 2 });
    for (const tool of WRITER_TOOLS) expect((tool as { strict?: unknown }).strict).toBeUndefined();
    expect(r.messages).toEqual([{ role: 'user', content: factsMessage(payloadFor(irons.sheet, irons.notability, 'coach')!) }]);
  });

  it('repairs once with the checker\'s reasons, then passes', async () => {
    const { client, seen } = fake([submit(bad, 'tu_1'), submit(good, 'tu_2')]);
    const out = await writeRead({ view: 'coach', sheet: irons.sheet, notability: irons.notability }, deps(client));
    expect(out.written?.what).toBe(good.what);
    expect(out.attempts).toBe(2);
    expect(out.rejections).toHaveLength(1);
    expect(out.rejections[0]!.reasons.map((r) => r.rule)).toEqual(['number_not_in_facts', 'unsupported_cause']);
    // The second request: the first turn exactly as returned, then an error result for its tool call with the reasons.
    const messages = seen[1]!.messages;
    expect(messages).toHaveLength(3);
    expect(messages[1]).toEqual({ role: 'assistant', content: submit(bad, 'tu_1').content });
    const result = (messages[2]!.content as unknown as Array<Record<string, unknown>>)[0]!;
    expect(result).toMatchObject({ type: 'tool_result', tool_use_id: 'tu_1', is_error: true });
    expect(result.content).toContain('3.4 is not a number in the facts');
    expect(result.content).toContain('"swing"');
    expect(out.usage.calls).toHaveLength(2);
  });

  it('returns null after two failures: the stage 1 card stands, never a template', async () => {
    const { client, seen } = fake([submit(bad), submit(bad, 'tu_2'), submit(good, 'tu_3')]);
    const out = await writeRead({ view: 'coach', sheet: irons.sheet, notability: irons.notability }, deps(client));
    expect(out.written).toBeNull();
    expect(out.attempts).toBe(2);
    expect(out.rejections.map((r) => r.attempt)).toEqual([1, 2]);
    expect(seen).toHaveLength(2);
  });

  it('repairs a malformed submission and a reply with no submission', async () => {
    const malformed = await writeRead({ view: 'coach', sheet: irons.sheet, notability: irons.notability }, deps(fake([submit({ what: 'x' }), submit(good, 'tu_2')]).client));
    expect(malformed.rejections[0]!.reasons[0]!.rule).toBe('malformed');
    expect(malformed.written).not.toBeNull();

    const { client, seen } = fake([{ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Here is the read.' }] }, submit(good, 'tu_2')]);
    const silent = await writeRead({ view: 'coach', sheet: irons.sheet, notability: irons.notability }, deps(client));
    expect(silent.rejections[0]!.reasons[0]!.rule).toBe('no_read_returned');
    expect(silent.written).not.toBeNull();
    expect(seen[1]!.messages[2]).toMatchObject({ role: 'user', content: expect.stringContaining('no submit_read call was made') });
  });

  it('does not repair a refusal, a cut-off reply or a failed call', async () => {
    const refused = await writeRead({ view: 'coach', sheet: irons.sheet, notability: irons.notability }, deps(fake([{ stop_reason: 'refusal', content: [] }, submit(good)]).client));
    expect(refused).toMatchObject({ written: null, attempts: 1 });
    expect(refused.rejections[0]!.reasons[0]!.rule).toBe('refused');

    const cut = await writeRead({ view: 'coach', sheet: irons.sheet, notability: irons.notability }, deps(fake([{ ...submit(good), stop_reason: 'max_tokens' }, submit(good)]).client));
    expect(cut).toMatchObject({ written: null, attempts: 1 });

    const failed = await writeRead({ view: 'coach', sheet: irons.sheet, notability: irons.notability }, deps(fake([new Error('socket hang up')]).client));
    expect(failed).toMatchObject({ written: null, attempts: 1 });
    expect(failed.rejections[0]!.reasons[0]).toMatchObject({ rule: 'api_error', detail: 'call failed' });
  });

  it('makes no call when there is no priority', async () => {
    const { client, seen } = fake([]);
    const out = await writeRead({ view: 'coach', sheet: irons.sheet, notability: { ...irons.notability, priority: null } }, deps(client));
    expect(out).toMatchObject({ written: null, attempts: 0, cost_usd: 0 });
    expect(seen).toHaveLength(0);
  });

  it('records the fallback model when a refusal fallback answered', async () => {
    const reply = { ...submit(good), model: 'claude-sonnet-5', usage: { input_tokens: 10, output_tokens: 10, iterations: [{ type: 'message', model: 'claude-sonnet-5-5', input_tokens: 5, output_tokens: 5 }, { type: 'fallback_message', model: 'claude-sonnet-5', input_tokens: 5, output_tokens: 5 }] } };
    const out = await writeRead({ view: 'coach', sheet: irons.sheet, notability: irons.notability }, deps(fake([reply]).client));
    expect(out.written?.model).toBe('claude-sonnet-5');
    // A fallback on the first attempt does not name the model of a second attempt that passed on Sonnet 5.5.
    const first = { ...reply, ...submit(bad) };
    const later = await writeRead({ view: 'coach', sheet: irons.sheet, notability: irons.notability }, deps(fake([first, submit(good, 'tu_2')]).client));
    expect(later.attempts).toBe(2);
    expect(later.written?.model).toBe('claude-sonnet-5-5');
  });
});

describe('the player view', () => {
  it('sends no teammate figure, median or team block to the model', async () => {
    const { client, seen } = fake([submit(good)]);
    await writeRead({ view: 'player', sheet: irons.sheet, notability: irons.notability }, deps(client));
    const sent = JSON.stringify(seen[0]!.messages);
    expect(sent).not.toMatch(/team|median|mate-/i);
    // The coach's prompt does carry them.
    expect(factsMessage(payloadFor(irons.sheet, irons.notability, 'coach')!)).toMatch(/team_median/);
  });

  it('strips coach-only parts even when the caller passes the full sheet and notability', () => {
    const leaning = players.find((p) => p.id === 'leaning')!;
    // The leaning player's good news is only "stands out in the team": gone from the player's view.
    expect(payloadFor(leaning.sheet, leaning.notability, 'coach')!.good_news.length).toBeGreaterThan(0);
    const mine = payloadFor(leaning.sheet, leaning.notability, 'player')!;
    expect(mine.good_news).toEqual([]);
    expect(mine.priority.team_shape).toBeUndefined();
    expect(JSON.stringify(mine)).not.toMatch(/team|median|mate-/i);
    expect(payloadFor(withoutCoachOnly(leaning.sheet), leaning.notability, 'player')).toEqual(mine);
  });

  it('rejects teammate content on the player card, and gives up after the repair fails too', async () => {
    const teamTalk: Draft = { ...good, rules_in_out: 'Her teammates lose most on approach too. The shots cannot tell whether it is the club.' };
    const out = await writeRead({ view: 'player', sheet: irons.sheet, notability: irons.notability }, deps(fake([submit(teamTalk), submit(teamTalk, 'tu_2')]).client));
    expect(out.written).toBeNull();
    expect(out.rejections.flatMap((r) => r.reasons.map((x) => x.rule))).toEqual(['teammate_reference', 'teammate_reference']);
    // The same words pass on the coach's card.
    const coach = await writeRead({ view: 'coach', sheet: irons.sheet, notability: irons.notability }, deps(fake([submit(teamTalk)]).client));
    expect(coach.written).not.toBeNull();
  });
});

describe('different players, different facts', () => {
  it('gives each synthetic player a different priority, band or certainty to write from', () => {
    const keys = players.map((p) => {
      const pl = payloadFor(p.sheet, p.notability, 'coach')!;
      return `${pl.priority.label}|${pl.priority.where.named_band?.label ?? '-'}|${pl.priority.certainty}`;
    });
    expect(new Set(keys).size).toBe(players.length);
  });

  it("rejects a draft that copies another player's paragraph", async () => {
    const other = [good.what, good.rules_in_out, good.this_week, good.watch].join(' ');
    const out = await writeRead({ view: 'coach', sheet: irons.sheet, notability: irons.notability, others: [other] }, deps(fake([submit(good), submit(good, 'tu_2')]).client));
    expect(out.written).toBeNull();
    expect(out.rejections[0]!.reasons.map((r) => r.rule)).toEqual(['template_like']);
  });
});
