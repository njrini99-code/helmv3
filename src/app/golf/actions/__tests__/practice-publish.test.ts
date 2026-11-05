import { beforeEach, describe, expect, it, vi } from 'vitest';

/** The publish action against a stand-in for Supabase. It reads the same column names the migration creates, so a wrong column fails here as it does on the database. The RPC itself is not run. */
const COLUMNS = ['id', 'title', 'body', 'event_id', 'version', 'published_version'];
const rpc = vi.fn();
let plan: Record<string, unknown>;
let liveBody: unknown;

function from(table: string) {
  const chain = {
    select: (cols: string) => {
      if (table === 'golf_practice_plans') {
        const unknown = cols.split(',').map((c) => c.trim()).filter((c) => !COLUMNS.includes(c));
        if (unknown.length) (chain as { failed?: string }).failed = unknown.join();
      }
      return chain;
    },
    eq: () => chain,
    in: () => Promise.resolve({ data: [{ id: 'p1', user_id: 'u1' }], error: null }),
    maybeSingle: () => {
      const failed = (chain as { failed?: string }).failed;
      if (failed) return Promise.resolve({ data: null, error: { code: '42703', message: `column ${failed} does not exist` } });
      if (table === 'golf_practice_plans') return Promise.resolve({ data: plan, error: null });
      if (table === 'golf_practice_plan_versions') return Promise.resolve({ data: { body: liveBody }, error: null });
      if (table === 'golf_events') return Promise.resolve({ data: { start_time: '2026-11-05T19:00:00Z', end_time: '2026-11-05T22:00:00Z', team_id: 't1' }, error: null });
      return Promise.resolve({ data: { timezone: 'America/New_York' }, error: null });
    },
  };
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from, rpc: (...a: unknown[]) => rpc(...a) }) }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_n: string, _o: unknown, fn: unknown) => fn }));
vi.mock('@/lib/coachhelm/v3/practice-plan/flag', () => ({ isPracticeTabEnabled: () => true, isPracticePlansEnabled: () => true }));
vi.mock('@/lib/golf/practice-fanout', () => ({ fanOutPracticePlan: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/server', () => ({ after: (fn: () => void) => fn() }));

import { publishPracticePlan } from '../practice-publish';
import { fanOutPracticePlan } from '@/lib/golf/practice-fanout';

const block = (place: string) => ({ id: 'w', kind: 'team', title: 'Warm-up', len: 30, coach: null, note: '', place, drill: null });
const common = { v: 2, focus: 'Lag', notes: '', place: 'Lakeside', arrivalBufferMin: 15, bring: [], players: ['p1'], groups: [] };
const nested = (place: string) => ({ ...common, variants: { main: { blocks: [block(place)] }, rain: null } });
/** As `golf_practice_plan_publish` froze it. */
const frozen = (place: string) => ({ ...common, variant: 'main', blocks: [block(place)], title: 'Thursday', drills: {} });
const published = (version: number, first: boolean) => ({ data: [{ published_version: version, document_id: 'd1', first_publish: first, recipients: [{ user_id: 'u1' }] }], error: null });

beforeEach(() => {
  rpc.mockReset();
  vi.mocked(fanOutPracticePlan).mockClear();
  plan = { id: 'plan-1', title: 'Thursday', body: nested('Range'), event_id: 'ev', version: 1, published_version: null };
  liveBody = null;
});

describe('publishPracticePlan', () => {
  it('reads columns the plans table has, so a first publish reaches the RPC', async () => {
    rpc.mockResolvedValue(published(1, true));
    const res = await publishPracticePlan({ planId: 'plan-1', expectedVersion: 1, notify: 'now' });
    expect(res).toMatchObject({ success: true, version: 1, recipients: 1, firstPublish: true });
    expect(rpc).toHaveBeenCalledWith('golf_practice_plan_publish', expect.objectContaining({ p_plan_id: 'plan-1', p_expected_version: 1, p_changes: [], p_notified: true }));
    expect(vi.mocked(fanOutPracticePlan).mock.calls[0]![2]).toBe('published');
  });

  it('a republish diffs against the frozen version and sends the RPC strings', async () => {
    plan = { ...plan, version: 4, published_version: 1, body: nested('Back green') };
    liveBody = frozen('Range');
    rpc.mockResolvedValue(published(2, false));
    const res = await publishPracticePlan({ planId: 'plan-1', expectedVersion: 4, notify: 'now' });
    expect(res.success).toBe(true);
    const args = rpc.mock.calls[0]![1] as { p_changes: unknown[]; p_notified: boolean };
    expect(args.p_notified).toBe(true);
    expect(args.p_changes.length).toBeGreaterThan(0);
    for (const c of args.p_changes) expect(typeof c).toBe('string');
    expect(vi.mocked(fanOutPracticePlan).mock.calls[0]![2]).toBe('updated');
  });

  it('a wording-only republish tells nobody', async () => {
    plan = { ...plan, version: 4, published_version: 1, body: nested('Range') };
    liveBody = frozen('Range');
    rpc.mockResolvedValue(published(2, false));
    await publishPracticePlan({ planId: 'plan-1', expectedVersion: 4, notify: 'now' });
    expect(rpc.mock.calls[0]![1]).toMatchObject({ p_changes: [], p_notified: false });
    expect(fanOutPracticePlan).not.toHaveBeenCalled();
  });
});
