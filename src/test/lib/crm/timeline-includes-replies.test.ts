/**
 * ============================================================================
 * getCoachTimeline — crm_replies is the sixth source
 * ----------------------------------------------------------------------------
 * The timeline unioned five tables and crm_replies was not one of them, so a
 * coach's activity feed could show six touches from us — emails sent, opens,
 * scheduled demos, notes, tasks — and give no indication that they had written
 * back. Every source present was outbound activity or our own record-keeping;
 * the one inbound signal was the one missing, and it is the one a rep acts on.
 *
 * These exercise the real merge in crm-timeline.ts against a mocked Supabase
 * client rather than asserting on source text, so they cover the ordering and
 * the actor attribution and not merely the presence of a query.
 * ========================================================================== */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const HOURS_AGO = (h: number) => new Date(Date.now() - h * 3600_000).toISOString();

// One row per source, interleaved in time so the DESC sort is actually tested:
// reply (1h) > task (2h) > note (3h) > contact_log (4h).
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
  email_events: [],
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
};

/**
 * A thenable chain: every builder method returns itself, and awaiting it resolves
 * to that table's rows. `single()` serves the requireAdmin() role lookup.
 */
function builder(table: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {};
  for (const m of ['select', 'eq', 'gte', 'lte', 'order', 'limit', 'in', 'neq', 'not']) {
    chain[m] = () => chain;
  }
  chain.single = async () => ({ data: { role: 'admin' }, error: null });
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
    // The reply is the most recent of the four fixtures, so it must lead — a
    // source appended after the sort would land at the bottom regardless of age.
    expect(items[0]!.source).toBe('reply');
    expect(items.map((i) => i.source)).toEqual(['reply', 'task', 'note', 'contact_log']);
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
