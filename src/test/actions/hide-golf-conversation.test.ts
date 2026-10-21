import { beforeEach, describe, expect, it, vi } from 'vitest';

const USER = '11111111-1111-4111-8111-111111111111';
const CONVERSATION = '33333333-3333-4333-8333-333333333333';

vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(), logServerEvent: vi.fn(), logServerException: vi.fn() }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_name: unknown, _meta: unknown, fn: unknown) => fn }));

interface Options {
  signedIn?: boolean;
  conversation?: { id: string; is_team_channel: boolean | null } | null;
  /** The column does not exist yet (the migration is held): reads and writes of hidden_at answer 42703. */
  noColumn?: boolean;
  /** The caller has no participant row: the update matches nothing. */
  notMember?: boolean;
  /** The probe fails for a reason other than the missing column (a timeout). */
  probeFails?: boolean;
}

function harness(options: Options = {}) {
  const updates: Array<{ table: string; row: Record<string, unknown>; filters: Record<string, unknown> }> = [];
  const reads = { probes: 0 };
  const missing = { code: '42703', message: 'column golf_conversation_participants.hidden_at does not exist' };
  const client = {
    auth: { getUser: async () => ({ data: { user: options.signedIn === false ? null : { id: USER } } }) },
    from(table: string) {
      let mode = 'select';
      let row: Record<string, unknown> = {};
      let fields = '';
      const filters: Record<string, unknown> = {};
      const chain = {
        select(value = '*') {
          fields = value;
          return chain;
        },
        eq(column: string, value: unknown) {
          filters[column] = value;
          return chain;
        },
        limit() {
          return chain;
        },
        update(value: Record<string, unknown>) {
          mode = 'update';
          row = value;
          return chain;
        },
        async maybeSingle() {
          return { data: options.conversation === undefined ? { id: CONVERSATION, is_team_channel: false } : options.conversation, error: null };
        },
        then(resolve: (v: unknown) => void) {
          if (mode === 'update') {
            updates.push({ table, row, filters: { ...filters } });
            if (options.noColumn) return resolve({ data: null, error: missing });
            return resolve({ data: options.notMember ? [] : [{ id: 'participant' }], error: null });
          }
          // The probe: a select of hidden_at on the caller's rows.
          if (fields.includes('hidden_at')) reads.probes += 1;
          if (fields.includes('hidden_at') && options.noColumn) return resolve({ data: null, error: missing });
          if (fields.includes('hidden_at') && options.probeFails) return resolve({ data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } });
          return resolve({ data: [], error: null });
        },
      };
      return chain;
    },
  };
  return { client, updates, reads };
}

let current: ReturnType<typeof harness>;
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => current.client }));

async function load() {
  return import('@/app/golf/actions/conversation-hide');
}

describe('CH-7503 · hideGolfConversation', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('hides the conversation for the caller only: their own participant row, stamped now', async () => {
    current = harness();
    const { hideGolfConversation } = await load();
    expect(await hideGolfConversation(CONVERSATION)).toEqual({ success: true });
    expect(current.updates).toHaveLength(1);
    expect(current.updates[0]!.table).toBe('golf_conversation_participants');
    expect(current.updates[0]!.filters).toEqual({ conversation_id: CONVERSATION, user_id: USER });
    expect(Date.parse(String(current.updates[0]!.row.hidden_at))).toBeGreaterThan(Date.now() - 5000);
  });

  it('refuses a team channel, a bad id, a signed-out caller and a conversation the caller is not in', async () => {
    current = harness({ conversation: { id: CONVERSATION, is_team_channel: true } });
    let { hideGolfConversation } = await load();
    expect(await hideGolfConversation(CONVERSATION)).toMatchObject({ success: false });
    expect(await hideGolfConversation('not-a-uuid')).toMatchObject({ success: false, error: 'Invalid conversation' });

    vi.resetModules();
    current = harness({ signedIn: false });
    ({ hideGolfConversation } = await load());
    expect(await hideGolfConversation(CONVERSATION)).toMatchObject({ success: false, error: 'Not authenticated' });

    vi.resetModules();
    current = harness({ notMember: true });
    ({ hideGolfConversation } = await load());
    expect(await hideGolfConversation(CONVERSATION)).toMatchObject({ success: false, error: 'You are not in this conversation' });
    expect(current.updates.every((u) => u.filters.user_id === USER)).toBe(true);
  });

  it('says it is not available yet, without throwing, while the migration is held', async () => {
    current = harness({ noColumn: true });
    const { hideGolfConversation, canHideGolfConversations } = await load();
    expect(await hideGolfConversation(CONVERSATION)).toEqual({ success: false, error: 'Deleting a conversation isn’t available yet', unavailable: true });
    expect(await canHideGolfConversations()).toBe(false);
  });

  it('Q8 runs the failing probe at most once per server instance while the column is missing, and picks the column up after the expiry', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    try {
      current = harness({ noColumn: true });
      const { canHideGolfConversations } = await load();
      expect(await canHideGolfConversations()).toBe(false);
      expect(await canHideGolfConversations()).toBe(false);
      expect(await canHideGolfConversations()).toBe(false);
      expect(current.reads.probes).toBe(1);

      // The migration is applied: within the expiry nothing is read, after it the column is found.
      current = harness();
      now.mockReturnValue(1_000_000 + 5 * 60_000 - 1);
      expect(await canHideGolfConversations()).toBe(false);
      expect(current.reads.probes).toBe(0);
      now.mockReturnValue(1_000_000 + 5 * 60_000);
      expect(await canHideGolfConversations()).toBe(true);
      expect(await canHideGolfConversations()).toBe(true);
      expect(current.reads.probes).toBe(2);
    } finally {
      now.mockRestore();
    }
  });

  it('Q8 remembers only a missing column: a probe that failed otherwise, or a signed-out caller, is asked again', async () => {
    current = harness({ probeFails: true });
    const { canHideGolfConversations } = await load();
    expect(await canHideGolfConversations()).toBe(false);
    expect(await canHideGolfConversations()).toBe(false);
    expect(current.reads.probes).toBe(2);

    current = harness({ signedIn: false });
    expect(await canHideGolfConversations()).toBe(false);
    current = harness();
    expect(await canHideGolfConversations()).toBe(true);
  });

  it('Q8 a hide that meets the missing column stops the probe too', async () => {
    current = harness({ noColumn: true });
    const { hideGolfConversation, canHideGolfConversations } = await load();
    expect(await hideGolfConversation(CONVERSATION)).toMatchObject({ unavailable: true });
    expect(await canHideGolfConversations()).toBe(false);
    expect(current.reads.probes).toBe(0);
  });

  it('reports the feature available once the column exists', async () => {
    current = harness();
    const { canHideGolfConversations } = await load();
    expect(await canHideGolfConversations()).toBe(true);
  });
});
