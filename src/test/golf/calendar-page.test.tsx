/**
 * Calendar page (server component) — data-fetch contract.
 *
 *  - a FAILED events fetch THROWS to the route error boundary (real,
 *    retryable error state — never a cheerful empty calendar; audit #20)
 *  - the events select ships parent_event_id + recurrence_rule (series
 *    scope pickers depend on them end-to-end; audit #6)
 *  - cancelled events are NOT filtered out (they render distinctly; #19)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Light stand-ins for the page's UI imports ──────────────────────────────
vi.mock('@/components/golf/layout/AnimatedPage', () => ({
  AnimatedPage: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  AnimatedItem: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock('@/components/golf/layout/LargeTitleHeader', () => ({
  LargeTitleHeader: () => <header />,
}));
vi.mock('@/components/ui/skeleton', () => ({
  CalendarSkeleton: () => <div />,
}));
vi.mock('next/dynamic', () => ({
  default: () => () => null,
}));

vi.mock('@/lib/auth/session', () => ({
  getGolfSessionProfile: vi.fn(async () => ({
    role: 'coach',
    coach: { id: 'coach-1', organization_id: 'org-1' },
    player: null,
  })),
}));

vi.mock('@/lib/golf/resolve-team', () => ({
  resolveCoachTeamId: vi.fn(async () => 'team-1'),
}));

vi.mock('@/lib/golf/resolve-team-server', () => ({
  resolveCoachTeamIdWithCookie: vi.fn(async () => 'team-1'),
}));

vi.mock('@/lib/redesign/flag', () => ({
  isRedesignEnabled: () => false,
  fairwayScope: (s: string) => s,
}));

// ── Supabase server-client mock — chainable, thenable, call-recording ───────
interface QueryRecord {
  table: string;
  calls: Array<{ method: string; args: unknown[] }>;
}
const queryLog: QueryRecord[] = [];
const tableResults = new Map<string, { data: unknown; error: { message: string } | null }>();

function makeChain(table: string) {
  const record: QueryRecord = { table, calls: [] };
  queryLog.push(record);
  const result = tableResults.get(table) ?? { data: null, error: null };
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'neq', 'gte', 'lte', 'order', 'limit', 'range', 'maybeSingle']) {
    chain[method] = (...args: unknown[]) => {
      record.calls.push({ method, args });
      return chain;
    };
  }
  (chain as { then: (resolve: (v: unknown) => void) => void }).then = (resolve) => resolve(result);
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => makeChain(table),
  })),
}));

import GolfCalendarPage from '@/app/golf/(dashboard)/dashboard/calendar/page';

describe('GolfCalendarPage — events fetch contract', () => {
  beforeEach(() => {
    queryLog.length = 0;
    tableResults.clear();
    tableResults.set('golf_coaches', { data: [], error: null });
    tableResults.set('golf_team_members', { data: [], error: null });
    tableResults.set('golf_team_settings', { data: { timezone: 'America/New_York' }, error: null });
  });

  it('THROWS (route error boundary, retryable) when the events query errors', async () => {
    tableResults.set('golf_events', { data: null, error: { message: 'connection reset' } });

    await expect(GolfCalendarPage()).rejects.toThrow('Failed to load calendar events');
  });

  it('selects series fields and does NOT filter out cancelled events', async () => {
    tableResults.set('golf_events', { data: [], error: null });

    await GolfCalendarPage();

    const eventsQuery = queryLog.find((q) => q.table === 'golf_events');
    expect(eventsQuery).toBeDefined();
    const select = eventsQuery!.calls.find((c) => c.method === 'select');
    const selectStr = String(select?.args[0]);
    // Series identity must reach the client or the scope picker never renders.
    expect(selectStr).toContain('parent_event_id');
    expect(selectStr).toContain('recurrence_rule');
    expect(selectStr).toContain('status');
    // Soft-cancelled events stay in the payload (rendered distinctly).
    expect(eventsQuery!.calls.some((c) => c.method === 'neq')).toBe(false);
    // Window + pagination still applied. The 1000-row cap is now enforced
    // transparently via fetchAllRowsResult's .range() pagination (audit F102),
    // which replaced the old bare .limit(500) that silently dropped overflow.
    expect(eventsQuery!.calls.some((c) => c.method === 'gte')).toBe(true);
    expect(eventsQuery!.calls.some((c) => c.method === 'lte')).toBe(true);
    expect(eventsQuery!.calls.some((c) => c.method === 'range')).toBe(true);
  });

  it('maps series fields + cancelled status through to the client payload', async () => {
    const start = new Date().toISOString();
    tableResults.set('golf_events', {
      data: [
        {
          id: 'e1',
          team_id: 'team-1',
          title: 'Practice',
          event_type: 'practice',
          start_time: start,
          end_time: null,
          location: null,
          description: null,
          status: 'cancelled',
          all_day: false,
          created_by: null,
          requires_rsvp: true,
          rsvp_deadline: null,
          max_attendees: null,
          parent_event_id: 'root-1',
          recurrence_rule: null,
        },
      ],
      error: null,
    });

    const jsx = (await GolfCalendarPage()) as React.ReactElement;
    // Walk the element tree for the surface's `events` prop.
    const found: Array<Record<string, unknown>> = [];
    const visit = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      const el = node as { props?: Record<string, unknown> };
      if (el.props) {
        if (Array.isArray(el.props.events)) {
          found.push(...(el.props.events as Array<Record<string, unknown>>));
        }
        visit(el.props.children);
      }
      if (Array.isArray(node)) node.forEach(visit);
    };
    visit(jsx);
    const children = (jsx.props as { children?: unknown }).children;
    visit(children);

    expect(found.some((e) => e.parent_event_id === 'root-1' && e.status === 'cancelled')).toBe(
      true,
    );
  });
});
