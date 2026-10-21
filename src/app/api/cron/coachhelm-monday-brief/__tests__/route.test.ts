import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/foundation/email', () => ({ sendEmail: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/monday-brief/flag', () => ({ isMondayBriefEnabled: vi.fn() }));
vi.mock('@/lib/coachhelm/v3/monday-brief/loader', () => ({ loadMondayBrief: vi.fn() }));
vi.mock('@/lib/admin/job-log', () => ({ recordJobRun: (_job: string, fn: () => Promise<unknown>) => fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn().mockResolvedValue(undefined) }));

import { GET } from '../route';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/coachhelm/v3/foundation/email';
import { isMondayBriefEnabled } from '@/lib/coachhelm/v3/monday-brief/flag';
import { loadMondayBrief } from '@/lib/coachhelm/v3/monday-brief/loader';
import type { MondayBrief } from '@/lib/coachhelm/v3/monday-brief/brief';

const flag = vi.mocked(isMondayBriefEnabled);
const admin = vi.mocked(createAdminClient);
const send = vi.mocked(sendEmail);
const load = vi.mocked(loadMondayBrief);

const req = () => new Request('http://x/api/cron/coachhelm-monday-brief', { headers: { authorization: 'Bearer cs' } }) as unknown as import('next/server').NextRequest;

/** A chainable stand-in that answers each table with its row. */
function client(rows: Record<string, unknown>) {
  const from = vi.fn((table: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit']) q[m] = () => q;
    q.range = () => Promise.resolve({ data: rows[table] ?? [], error: null });
    q.maybeSingle = () => Promise.resolve({ data: rows[table] ?? null, error: null });
    return q;
  });
  return { from };
}

const brief = (items: number): MondayBrief => ({
  team_id: 't1',
  week_start: '2026-10-12',
  week_end: '2026-10-19',
  roster_total: 8,
  with_enough_rounds: 6,
  rounds_last_week: 10,
  items: Array.from({ length: items }, (_, i) => ({ kind: 'read' as const, insight_id: `i${i}`, player_id: `p${i}`, player_name: 'A Player', title: 'Three-putts', ladder: 'observed' as const, strokes: 0.8, rounds_behind: 0 })),
  counts: { new: 0, cleared: 0, contradicted: 0, out_of_date: 0 },
  cleared: [],
  computed_at: '2026-10-19T05:00:00Z',
});

const teamRows = (pref: boolean | null) => ({
  golf_teams: [{ id: 't1', name: 'Varsity', season_active: true }],
  golf_team_coach_staff: { coach_id: 'c1' },
  golf_coach_philosophy: pref === null ? null : { email_digest_enabled: pref },
  golf_coaches: { user_id: 'u1', full_name: 'Sam Coach' },
  users: { email: 'coach@example.test' },
});

describe('GET /api/cron/coachhelm-monday-brief', () => {
  beforeEach(() => {
    process.env.CRON_SECRET = 'cs';
    vi.clearAllMocks();
    send.mockResolvedValue({ delivered: true, id: 'm1' });
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it('flag off: reads nothing and sends nothing', async () => {
    flag.mockReturnValue(false);
    const res = await GET(req());
    expect(await res.json()).toMatchObject({ skipped: 'flag_off', sent: 0 });
    expect(admin).not.toHaveBeenCalled();
    expect(load).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('flag on: sends only to a coach who opted in explicitly (a missing row sends nothing)', async () => {
    flag.mockReturnValue(true);
    load.mockResolvedValue(brief(2));
    for (const pref of [null, false]) {
      admin.mockReturnValue(client(teamRows(pref)) as never);
      const res = await GET(req());
      expect(await res.json()).toMatchObject({ skipped_not_opted_in: 1, sent: 0 });
    }
    expect(load).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('flag on: an empty brief is not sent; a brief that did not read is an error, never sent', async () => {
    flag.mockReturnValue(true);
    admin.mockReturnValue(client(teamRows(true)) as never);
    load.mockResolvedValueOnce({ ...brief(0) });
    expect(await (await GET(req())).json()).toMatchObject({ skipped_empty: 1, sent: 0 });
    load.mockResolvedValueOnce(null);
    expect(await (await GET(req())).json()).toMatchObject({ errors: 1, sent: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it('flag on: sends a non-empty brief once per coach, team and week', async () => {
    flag.mockReturnValue(true);
    admin.mockReturnValue(client(teamRows(true)) as never);
    load.mockResolvedValue(brief(2));
    expect(await (await GET(req())).json()).toMatchObject({ sent: 1 });
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]![0]).toMatchObject({ to: 'coach@example.test', subject: 'Varsity · Monday brief', idempotencyKey: expect.stringMatching(/^coachhelm-monday-brief:c1:t1:\d{4}-\d{2}-\d{2}$/) });
  });

  it('rejects a call without the cron secret', async () => {
    flag.mockReturnValue(true);
    const res = await GET(new Request('http://x/api/cron/coachhelm-monday-brief') as unknown as import('next/server').NextRequest);
    expect(res.status).toBe(401);
    expect(admin).not.toHaveBeenCalled();
  });
});
