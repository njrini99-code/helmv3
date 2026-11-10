import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoachChatContext } from '../context';

/**
 * The reads Ask v2 added for "what Ask can see": practice, documents and a wider calendar come with Ask v2; team patterns come only while the Board shows them
 * (`coachhelm_team_pattern_v1`, off). Every one announces a step of its own, in the present and the past tense.
 */
const flags = vi.hoisted(() => ({ on: new Set<string>() }));
vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: (id: string) => flags.on.has(id) }));
vi.mock('../ask-reads', async (importOriginal) => {
  const real = await importOriginal<Record<string, unknown>>();
  const stub = { summary: 'ok', measurements: [], series: [], detail: {}, coverage: 'complete', coverage_note: null, as_of: '2026-11-07T00:00:00.000Z' };
  return { ...real, getTeamPatterns: vi.fn(async () => stub), getPractice: vi.fn(async () => stub), getDocuments: vi.fn(async () => stub) };
});

import { buildCoachTools } from '../agent-tools';

const ctx: CoachChatContext = { coach_id: 'c1', user_id: 'u1', team_id: 'team-1', team_name: 'Varsity', timezone: 'America/New_York', roster: [] };

function build(askV2: boolean) {
  const writer = { write: vi.fn() };
  const tools = buildCoachTools({ sb: { from: vi.fn() } as never, ctx, conversationId: 'conv-1', writer: writer as never, collect: vi.fn(), teamTools: true, askV2 });
  return { tools, writer };
}

describe('Ask v2 reads: what Ask can see', () => {
  beforeEach(() => flags.on.clear());

  it('leaves practice, documents and team patterns out of the old Ask', () => {
    flags.on.add('coachhelm_team_pattern_v1');
    const names = Object.keys(build(false).tools);
    for (const t of ['get_practice', 'get_documents', 'get_team_patterns']) expect(names).not.toContain(t);
  });

  it('offers practice and documents with Ask v2, but team patterns only with the Board flag on', () => {
    const off = Object.keys(build(true).tools);
    expect(off).toContain('get_practice');
    expect(off).toContain('get_documents');
    expect(off).not.toContain('get_team_patterns');
    flags.on.add('coachhelm_team_pattern_v1');
    expect(Object.keys(build(true).tools)).toContain('get_team_patterns');
  });

  it.each([
    ['get_practice', { since_days: 30 }, 'Reading practice plans and sessions', 'Read practice plans and sessions'],
    ['get_documents', { limit: 30 }, 'Reading Documents', 'Read Documents'],
    ['get_team_patterns', {}, 'Looking for what the team shares', 'Looked for what the team shares'],
  ])('%s announces a step and folds it to a past-tense line', async (name, input, doing, done) => {
    flags.on.add('coachhelm_team_pattern_v1');
    const { tools, writer } = build(true);
    await tools[name]!.execute!(input as never, {} as never);
    const parts = writer.write.mock.calls.map((c) => c[0] as { type: string; data?: { label?: string; done?: string; state?: string } }).filter((p) => p.type === 'data-progress');
    expect(parts[0]?.data?.label).toBe(doing);
    expect(parts.at(-1)?.data).toMatchObject({ state: 'done', done });
  });
});
