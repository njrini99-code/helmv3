import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import type { ToolEnvelope } from '../../../lib/coachhelm/v3/chat/provenance';
import { type AskAssistantTurn, buildTurns, describeWork, evidenceBlocks, readNameOf } from '../coachhelm-chat-thread';
import stored from './fixtures/preview-dashboard-turn.json';

/**
 * The preview of 12 Nov: "build me a dashboard showcasing my teams trends this season". The fixture is the stored answer's parts
 * (names replaced). The coach saw no visual, a calendar card the answer never used, "Read 76 rounds" for a 25-round season, three
 * sources each named "Read", and a "comparison" of the team against one player.
 */
const parts = stored as Array<{ type: string; data?: { tool?: string; ref?: string; envelope?: ToolEnvelope } }>;
const read = (ref: string) => parts.find((p) => p.type === 'data-evidence' && p.data?.ref === ref)?.data as { tool: string; envelope: ToolEnvelope };

function turn(): AskAssistantTurn {
  const messages = [
    { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'build me a dashboard showcasing my teams trends this season' }] },
    { id: 'a1', role: 'assistant', parts: stored },
  ] as unknown as UIMessage[];
  const t = buildTurns(messages, { busy: false }).at(-1);
  if (!t || t.role !== 'assistant') throw new Error('not an assistant turn');
  return t;
}

describe('the preview dashboard answer (12 Nov), replayed', () => {
  it('draws the visual, without its bad block, and reports what was not drawn', () => {
    const t = turn();
    const comp = t.blocks.find((b) => b.kind === 'composition');
    expect(comp?.kind === 'composition' && comp.composition.blocks.map((b) => b.type)).toEqual(['split', 'putt_profile']);
    expect(t.visualFaults).toEqual([expect.stringMatching(/^block 1 \(season_compare\)/)]);
  });

  it('the calendar read the answer never used is in Sources only; the figure reads the visual left out still show', () => {
    const cards = turn().blocks.flatMap((b) => (b.kind === 'evidence' ? [b.ref] : []));
    expect(cards).not.toContain('e3');
    expect(cards.sort()).toEqual(['e1', 'e2']);
  });

  it('counts this season\'s rounds, with last season said after', () => {
    expect(turn().work).toBe('Read 25 rounds across 7 players, against 76 earlier');
  });

  it('names every source for what it read, never "Read"', () => {
    const names = (turn().reads ?? []).map((r) => r.name);
    expect(names).toEqual(['Team calendar', 'Team stats, this season', 'This season against last']);
  });
});

describe('the pieces, alone', () => {
  it('describeWork with one window keeps the old wording', () => {
    const e = read('e1').envelope;
    expect(describeWork([{} as never], [e])).toMatch(/^Read 25 rounds/);
    expect(describeWork([{} as never], [e])).not.toMatch(/earlier/);
  });

  it('readNameOf: one player\'s read says whose, an unknown tool uses its summary', () => {
    const base = read('e1').envelope;
    const one = { ...base, window_label: undefined, measurements: base.measurements.filter((m) => m.entity.kind === 'player').slice(0, 1) } as ToolEnvelope;
    const who = one.measurements[0]?.entity.label;
    expect(readNameOf('get_player_stats', one)).toBe(`${who}’s stats`);
    expect(readNameOf('some_new_tool', { ...base, summary: 'Putts by distance: 11 figures.' })).toBe('Putts by distance');
  });

  it('the team beside one player is not a comparison table', () => {
    const blocks = evidenceBlocks(read('e1').envelope);
    expect(blocks.some((b) => b.kind === 'compare')).toBe(false);
  });
});
