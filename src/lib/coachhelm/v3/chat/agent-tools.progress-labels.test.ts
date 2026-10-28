import { describe, it, expect, vi } from 'vitest';
import type { CoachChatContext } from './context';

/**
 * The working step names what Ask is reading (P013, the 2026-10-28 polish pass). The team-wide reads
 * (`get_team_rounds`, `get_qualifiers`, `get_tournaments`) had no label, so the step read a bare "Working". Every read
 * tool announces a step of its own.
 */

const stub = { summary: 'ok', measurements: [], series: [], detail: {}, coverage: 'complete', coverage_note: null, as_of: '2026-10-28T00:00:00.000Z' };

vi.mock('./read-tools', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  return Object.fromEntries(
    Object.entries(real).map(([k, v]) => [k, typeof v === 'function' && /^(get|compare)[A-Z]/.test(k) ? vi.fn(async () => stub) : v]),
  );
});
// Every flag on and teamTools true (Clubhouse on for the team), so every gated read is in the set.
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: () => true }));

import { buildCoachTools } from './agent-tools';

const ctx: CoachChatContext = {
  coach_id: 'c1',
  user_id: 'u1',
  team_id: 'team-1',
  team_name: 'Rini University',
  timezone: 'America/New_York',
  roster: [],
};

async function stepLabel(name: string, input: Record<string, unknown> = {}) {
  const writer = { write: vi.fn() };
  const tools = buildCoachTools({ sb: {} as never, ctx, conversationId: 'conv-1', writer: writer as never, collect: vi.fn(), teamTools: true });
  const t = tools[name];
  expect(t, name).toBeDefined();
  await t!.execute!(input as never, {} as never);
  const part = writer.write.mock.calls.map((c) => c[0] as { type: string; data?: { label?: string } }).find((p) => p.type === 'data-progress');
  return part?.data?.label;
}

describe('agent-tools — every read announces its own step', () => {
  it.each([
    ['get_team_rounds', 'Reading the team’s rounds'],
    ['get_qualifiers', 'Reading qualifier standings'],
    ['get_tournaments', 'Reading tournament results'],
  ])('%s reads as “%s”, not “Working”', async (name, label) => {
    expect(await stepLabel(name, { limit: 5, since_days: 30 })).toBe(label);
  });

  it('no get_* read falls back to the generic “Working”', async () => {
    const tools = buildCoachTools({ sb: {} as never, ctx, conversationId: 'conv-1', writer: { write: vi.fn() } as never, collect: vi.fn(), teamTools: true });
    const reads = Object.keys(tools).filter((k) => k.startsWith('get_'));
    expect(reads.length).toBeGreaterThan(8);
    for (const name of reads) {
      expect(await stepLabel(name, { player_id: '00000000-0000-4000-8000-000000000001', limit: 5, since_days: 30 }), name).not.toBe('Working');
    }
  });
});
