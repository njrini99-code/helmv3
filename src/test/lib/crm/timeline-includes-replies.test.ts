/**
 * ============================================================================
 * getCoachTimeline — crm_replies + golf_demo_sessions
 * ----------------------------------------------------------------------------
 * The timeline unioned five tables and crm_replies was not one of them, so a
 * coach's activity feed could show six touches from us — emails sent, opens,
 * scheduled demos, notes, tasks — and give no indication that they had written
 * back. Every source present was outbound activity or our own record-keeping;
 * the one inbound signal was the one missing, and it is the one a rep acts on.
 *
 * 2026-07-31: golf_demo_sessions was added as a seventh source — the single
 * strongest buying signal in the system (170 real coaches toured the demo),
 * completely absent before this. It reads through createAdminClient() rather
 * than the RLS-scoped client (the table has a RESTRICTIVE deny-all policy), so
 * this file also mocks '@/lib/supabase/admin' — reusing the exact same
 * builder()/TABLE_DATA mechanism as every other source for consistency.
 *
 * These exercise the real merge in crm-timeline.ts against a mocked Supabase
 * client rather than asserting on source text, so they cover the ordering and
 * the actor attribution and not merely the presence of a query.
 * ========================================================================== */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const HOURS_AGO = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

// Matches REPLY.from_address on purpose — exercises the demo-session email
// fallback match (demo-1 has crm_coach_id: null) against the same coach.
const COACH_EMAIL = 'assistant@stanford.edu';

// Captured once so the fixture and the assertion that checks against it can
// never drift apart from two separate HOURS_AGO() calls resolving to
// millisecond-different timestamps.
const DEMO_1_ENTERED_AT = HOURS_AGO(1.5);

// One row per source, interleaved in time so the DESC sort is actually tested:
// reply (1h) > demo_session(demo-1, 1.5h) > task (2h) > email_event(click, 2.2h)
// > email_event(open, 2.4h) > note (3h) > demo_session(demo-3, 3.5h) >
// contact_log (4h). demo-2 ('automated') sits at the most-recent timestamp of
// all (0.1h) on purpose — the strongest possible test that an automated demo
// session never leaks to the top of the feed despite being newest by far.
const REPLY = {
  id: 'reply-row-1',
  from_address: 'assistant@stanford.edu',
  subject: 'Re: Helm demo',
  body_text: 'Happy to find time next week.',
  received_at: HOURS_AGO(1),
  is_read: false,
  thread_id: 'thread-1',
  message_id: '<msg-1@mail.gmail.com>',
  contact_log_id: 'cl-1',
};

const TABLE_DATA: Record<string, unknown[]> = {
  crm_contact_log: [
    {
      id: 'cl-1',
      contact_type: 'email',
      contact_date: HOURS_AGO(4),
      subject: 'Helm demo',
      notes: null,
      created_by: 'staff-1',
    },
  ],
  email_events: [
    {
      id: 'ee-open-1',
      event_type: 'email.opened',
      occurred_at: HOURS_AGO(2.4),
      recipient_email: COACH_EMAIL,
      resend_message_id: 'msg-open-1',
      contact_log_id: 'cl-1',
    },
    {
      id: 'ee-click-1',
      event_type: 'email.clicked',
      occurred_at: HOURS_AGO(2.2),
      recipient_email: COACH_EMAIL,
      resend_message_id: 'msg-click-1',
      contact_log_id: 'cl-1',
    },
  ],
  crm_events: [],
  crm_notes: [
    { id: 'note-1', body: 'Warm lead', kind: 'general', is_pinned: false, author_id: 'staff-1', created_at: HOURS_AGO(3) },
  ],
  crm_tasks: [
    {
      id: 'task-1',
      title: 'Send pricing',
      description: null,
      status: 'open',
      kind: null,
      priority: 'normal',
      assignee_id: 'staff-1',
      created_by: 'staff-1',
      due_at: null,
      completed_at: null,
      created_at: HOURS_AGO(2),
    },
  ],
  crm_replies: [REPLY],
  crm_coaches: [{ id: 'coach-1', email: COACH_EMAIL }],
  golf_demo_sessions: [
    // No crm_coach_id — must match via the email fallback against coach-1.
    {
      id: 'demo-1',
      name: 'Coach Smith',
      email: COACH_EMAIL,
      school: 'Stanford',
      referrer: 'https://linkedin.com',
      entered_at: DEMO_1_ENTERED_AT,
      traffic_quality: 'likely_human',
      quality_reason: null,
      crm_coach_id: null,
    },
    // 'automated' — must never surface, even though crm_coach_id matches
    // directly. This is the row that actually exercises the app-level guard,
    // since this mock's .or() is a no-op and would otherwise leak it through.
    {
      id: 'demo-2',
      name: 'Bot',
      email: 'bot@example.com',
      school: null,
      referrer: null,
      entered_at: HOURS_AGO(0.1),
      traffic_quality: 'automated',
      quality_reason: 'headless-ua',
      crm_coach_id: 'coach-1',
    },
    // NULL traffic_quality — must be treated as showable, not excluded.
    {
      id: 'demo-3',
      name: 'Coach Unclassified',
      email: 'unclassified@example.com',
      school: 'Duke',
      referrer: null,
      entered_at: HOURS_AGO(3.5),
      traffic_quality: null,
      quality_reason: null,
      crm_coach_id: 'coach-1',
    },
  ],
};

/**
 * A thenable chain: every builder method returns itself, and awaiting it resolves
 * to that table's rows. `single()` serves the requireAdmin() role lookup;
 * `maybeSingle()` serves the crm_coaches email lookup in crm-timeline.ts, which
 * needs a different response shape than the hard-coded role check.
 */
function builder(table: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  for (const m of ['select', 'eq', 'gte', 'lte', 'order', 'limit', 'in', 'neq', 'not', 'or']) {
    chain[m] = () => chain;
  }
  chain.single = async () => ({ data: { role: 'admin' }, error: null });
  chain.maybeSingle = async () => {
    if (table === 'crm_coaches') {
      const [row] = (TABLE_DATA.crm_coaches ?? []) as { id: string; email: string | null }[];
      return { data: row ?? null, error: null };
    }
    return { data: null, error: null };
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chain.then = (resolve: any, reject: any) =>
    Promise.resolve({ data: TABLE_DATA[table] ?? [], error: null }).then(resolve, reject);
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } }, error: null }) },
    from: (t: string) => builder(t),
  }),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (t: string) => builder(t),
  }),
}));

vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));

import { getCoachTimeline } from '@/app/golf/actions/crm-timeline';
import { TIMELINE_CONFIG } from '@/app/golf/admin/crm/components/timeline/timeline-config';

describe('getCoachTimeline — inbound replies', () => {
  beforeEach(() => vi.clearAllMocks());

  it('includes the coach reply in the timeline', async () => {
    const items = await getCoachTimeline('coach-1');
    const replies = items.filter((i) => i.source === 'reply');

    expect(replies, 'crm_replies must be one of the unioned sources').toHaveLength(1);
    expect(replies[0]!.id).toBe(`reply-${REPLY.id}`);
    expect(replies[0]!.body).toBe(REPLY.body_text);
    expect(replies[0]!.title).toContain(REPLY.subject);
  });

  it('sorts the reply into the merged feed by time, not by source', async () => {
    const items = await getCoachTimeline('coach-1');
    // demo-2 ('automated') is the single most-recent timestamp of any fixture
    // (0.1h ago) but must be excluded, so the reply — the most recent
    // *surfaced* item — still has to lead. A source appended after the sort
    // would land at the bottom regardless of age.
    expect(items[0]!.source).toBe('reply');
    // Recomputed from the fixtures' actual timestamps (see the comment above
    // TABLE_DATA), not hand-copied — adding sources changes this array.
    expect(items.map((i) => i.source)).toEqual([
      'reply',
      'demo_session',
      'task',
      'email_event',
      'email_event',
      'note',
      'demo_session',
      'contact_log',
    ]);
  });

  /**
   * actor_id resolves against `users`, our internal staff table. A coach is not
   * in it, so attributing their reply to an actor would either fail to resolve or
   * — worse — credit a staff member with words they did not write.
   */
  it('does not attribute an inbound reply to an internal actor', async () => {
    const [reply] = (await getCoachTimeline('coach-1')).filter((i) => i.source === 'reply');
    expect(reply!.actor_id).toBeNull();
    expect(reply!.metadata.from_address).toBe(REPLY.from_address);
  });

  it('carries unread state where the UI can style on it', async () => {
    const [reply] = (await getCoachTimeline('coach-1')).filter((i) => i.source === 'reply');
    expect(reply!.type).toBe('unread');
    expect(reply!.metadata.is_read).toBe(false);
  });

  it('keeps thread identifiers so a reply can be traced back to its send', async () => {
    const [reply] = (await getCoachTimeline('coach-1')).filter((i) => i.source === 'reply');
    expect(reply!.metadata.thread_id).toBe(REPLY.thread_id);
    expect(reply!.metadata.message_id).toBe(REPLY.message_id);
    expect(reply!.metadata.contact_log_id).toBe(REPLY.contact_log_id);
  });

  /**
   * TIMELINE_CONFIG is Record<TimelineSource, …>, so a missing entry is a compile
   * error rather than a runtime one — but TimelineItem.tsx does
   * `TIMELINE_CONFIG[item.source]` and then reads `.iconKey` off it, so a config
   * that existed but was malformed would throw at render.
   */
  it('has a visual treatment for the reply source', () => {
    const cfg = TIMELINE_CONFIG.reply;
    expect(cfg).toBeDefined();
    expect(cfg.label).toBe('Reply');
    expect(cfg.iconKey).toBe('IconMessage');
    // Distinct from contact_log, or an inbound reply reads as our own outreach.
    expect(cfg.iconKey).not.toBe(TIMELINE_CONFIG.contact_log.iconKey);
  });
});

/**
 * ============================================================================
 * getCoachTimeline — golf_demo_sessions is the seventh source
 * ----------------------------------------------------------------------------
 * 170 real coaches toured the demo and none of it showed up on their timeline.
 * The table has a RESTRICTIVE deny-all RLS policy, so crm-timeline.ts reads it
 * through createAdminClient() rather than the RLS-scoped client — mocked above
 * to resolve through the same builder()/TABLE_DATA mechanism.
 * ========================================================================== */
describe('getCoachTimeline — demo sessions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('surfaces a likely_human session matched via the email fallback', async () => {
    const items = await getCoachTimeline('coach-1');
    const demo1 = items.find((i) => i.id === 'demo_session-demo-1');

    expect(demo1, 'demo-1 has no crm_coach_id — must match via the email fallback').toBeDefined();
    expect(demo1!.source).toBe('demo_session');
    expect(demo1!.occurred_at).toBe(DEMO_1_ENTERED_AT);
    expect(demo1!.metadata.matched_via).toBe('email');
  });

  it('surfaces a NULL traffic_quality session matched directly via crm_coach_id', async () => {
    const items = await getCoachTimeline('coach-1');
    const demo3 = items.find((i) => i.id === 'demo_session-demo-3');

    expect(demo3, 'NULL traffic_quality must be treated as showable, not excluded').toBeDefined();
    expect(demo3!.type).toBe('unclassified');
    expect(demo3!.metadata.matched_via).toBe('crm_coach_id');
  });

  it('never surfaces an automated session, even when crm_coach_id matches directly', async () => {
    const items = await getCoachTimeline('coach-1');
    // demo-2 is 'automated' AND has crm_coach_id: 'coach-1' — the strongest
    // possible case for it leaking through. This mock's .or() is a no-op, so
    // this test exercises the app-level
    // `if (r.traffic_quality !== null && r.traffic_quality !== 'likely_human') continue;`
    // guard specifically, not the query-level filter.
    expect(items.some((i) => i.id === 'demo_session-demo-2')).toBe(false);
  });

  it('exactly two demo_session items surface (automated excluded)', async () => {
    const items = await getCoachTimeline('coach-1');
    const demoSessions = items.filter((i) => i.source === 'demo_session');
    expect(demoSessions.map((i) => i.id).sort()).toEqual(['demo_session-demo-1', 'demo_session-demo-3']);
  });

  it('carries visitor metadata for the operator', async () => {
    const items = await getCoachTimeline('coach-1');
    const demo1 = items.find((i) => i.id === 'demo_session-demo-1');
    expect(demo1!.title).toBe('Toured the demo (Stanford)');
    expect(demo1!.metadata.name).toBe('Coach Smith');
    expect(demo1!.metadata.school).toBe('Stanford');
  });

  it('has a visual treatment for the demo_session source', () => {
    const cfg = TIMELINE_CONFIG.demo_session;
    expect(cfg).toBeDefined();
    expect(cfg.label).toBeTruthy();
  });
});

/**
 * ============================================================================
 * getCoachTimeline — clicks are labeled as possible scanner noise
 * ----------------------------------------------------------------------------
 * 1,073 of 1,219 all-time clicks fired in a single 24h window — email-security
 * -gateway link scanning, not coach intent. Clicks are not dropped, but they
 * must never read as stronger than an open.
 * ========================================================================== */
describe('getCoachTimeline — email click scanner caveat', () => {
  beforeEach(() => vi.clearAllMocks());

  it('labels a click with a scanner caveat', async () => {
    const items = await getCoachTimeline('coach-1');
    const click = items.find((i) => i.id === 'email_event-ee-click-1');

    expect(click).toBeDefined();
    expect(click!.title.toLowerCase()).toContain('likely scanner');
    expect(typeof click!.metadata.scanner_caveat).toBe('string');
    expect((click!.metadata.scanner_caveat as string).length).toBeGreaterThan(0);
  });

  it('does not caveat an open — opens are a real signal', async () => {
    const items = await getCoachTimeline('coach-1');
    const open = items.find((i) => i.id === 'email_event-ee-open-1');

    expect(open).toBeDefined();
    expect(open!.title.toLowerCase()).not.toContain('scanner');
    expect(open!.metadata.scanner_caveat).toBeNull();
  });
});
