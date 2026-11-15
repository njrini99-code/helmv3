import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: (name: string) => name === 'golf_tournaments_v1' }));

import { toolsFor } from '../../registry';
import { doneLabelOf, stepKindOf } from '../steps';
import type { ChatSurface, ChatTool } from '../tool';

/**
 * A step's words are read by a coach in the thread's list of work, so they are held to the same rules as anything else a coach
 * reads (the readers' own lines are swept in `chat/__tests__/reader-words.test.ts`): full words, no notation, never a tool or a
 * column name. This sweeps what every registered tool says of its own step: the running label, the finished label when the tool
 * declares one, and the kind.
 */
const BANNED: Array<[string, RegExp]> = [
  ['a sample as n=4', /\bn\s*[=:-]\s*\d/i],
  ['ft for feet', /\d\s?ft\b|\bft\b/],
  ['yd for yards', /\d\s?yds?\b|\byds?\b/],
  ['avg for average', /\bavg\b/i],
  ['pct for percent', /\bpct\b/i],
  ['L10 for the last 10 rounds', /\bL\d+\b/],
  ['SG for strokes gained', /\bSG\b/],
  ['GIR for greens in regulation', /\bGIR\b/],
  ['a tool, column or table name', /\b[a-z]+_[a-z_]+\b/],
  ['a full stop or an ellipsis at the end', /[.…]\s*$/],
  ['a bare "Thinking" or "Loading"', /^(thinking|loading|working)\W*$/i],
];
const faults = (words: string): string[] => BANNED.filter(([, re]) => re.test(words)).map(([what]) => `${what}: ${words}`);

const ELI = '00000000-0000-4000-8000-000000000001';
const coach = { coach_id: 'c', user_id: 'u', team_id: 't', team_name: 'Rini University', timezone: 'America/New_York', roster: [{ id: ELI, name: 'Eli Brandt' }] } as never;
const player = { coach_id: '', user_id: 'u', team_id: 't', team_name: 'Rini University', timezone: 'America/New_York', roster: [{ id: ELI, name: 'Eli Brandt' }], player_id: ELI } as never;
const surfaces: Array<[ChatSurface, unknown]> = [['ask', coach], ['quick_chat', coach], ['practice_helper', coach], ['player', player]];
/** An input with nothing in it, and one with the fields a label is most often built from. A label must be sayable for both. */
const INPUTS: unknown[] = [{}, { player_id: ELI, player_ids: [ELI], window: 'last10', part: 'activity', title: 'Lag putting', name: 'Lag putting', metric: 'sg_putting', kind: 'chart' }];
const KINDS = ['read', 'find', 'compare', 'calculate', 'visual', 'draft', 'check'];

describe('what every registered tool says of its own step', () => {
  it.each(surfaces)('%s: the running label is a few plain words, for any input, and never throws', (surface, who) => {
    const tools: ChatTool[] = toolsFor(surface, who as never);
    expect(tools.length).toBeGreaterThan(0);
    const found: string[] = [];
    for (const tool of tools) {
      for (const input of INPUTS) {
        const label = tool.progress(input as never);
        expect(typeof label, tool.name).toBe('string');
        expect(label.trim().length, tool.name).toBeGreaterThan(2);
        expect(label.length, `${tool.name}: ${label}`).toBeLessThanOrEqual(80);
        expect(label[0], `${tool.name}: ${label}`).toBe(label[0]!.toUpperCase());
        expect(label, tool.name).not.toContain(tool.name);
        found.push(...faults(label).map((f) => `${tool.name}: ${f}`));
      }
    }
    expect(found).toEqual([]);
  });

  it.each(surfaces)('%s: a finished label, where a tool declares one, is held to the same rules; the kind is one the thread can draw', (surface, who) => {
    const found: string[] = [];
    for (const tool of toolsFor(surface, who as never)) {
      expect(KINDS, tool.name).toContain(stepKindOf(tool));
      for (const input of INPUTS) {
        const done = doneLabelOf(tool, input, null);
        if (done === null) continue;
        expect(done.length, `${tool.name}: ${done}`).toBeLessThanOrEqual(80);
        // Past tense is the tool's to write; what can be checked is that it is not the running label handed back.
        expect(done, tool.name).not.toBe(tool.progress(input as never));
        found.push(...faults(done).map((f) => `${tool.name}: ${f}`));
      }
    }
    expect(found).toEqual([]);
  });

  it('the sweep catches what it is for', () => {
    expect(faults('Reading Eli’s last 8 rounds')).toEqual([]);
    expect(faults('Reading SG from 10 ft').length).toBe(2);
    expect(faults('Reading golf_rounds')).toHaveLength(1);
    expect(faults('Reading the rounds…')).toHaveLength(1);
    expect(faults('Thinking')).toHaveLength(1);
  });
});
