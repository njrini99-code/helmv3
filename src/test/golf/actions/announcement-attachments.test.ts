import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * A post's attachments are a separate insert (golf_announcement_documents) after the announcement row exists. Its
 * error was discarded, so a post whose files failed to link said it had posted and the coach believed players had the
 * files (Q-82). The post is real and stays; the failure must come back beside the id, `success` stays true, and a clean
 * run must not carry the field.
 */

const logServerError = vi.fn(async () => {});
vi.mock('@/lib/server-error-logger', () => ({
  logServerError,
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => makeClient() }));

type Outcome = { data: unknown; error: unknown };
const outcomes = new Map<string, Outcome>();
/** An insert into this table answers with this error. */
const insertErrors = new Map<string, unknown>();
const inserted: Array<{ table: string; rows: unknown }> = [];

const ROSTER = [{ player_id: 'p1' }, { player_id: 'p2' }];

function chain(table: string) {
  const settle = () => outcomes.get(table) ?? { data: [], error: null };
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self,
    eq: self,
    in: self,
    order: self,
    limit: self,
    update: self,
    upsert: self,
    delete: self,
    insert: (rows: unknown) => {
      inserted.push({ table, rows });
      const error = insertErrors.get(table) ?? null;
      const n: Record<string, unknown> = {};
      Object.assign(n, {
        select: () => n,
        single: async () => ({ data: { id: `${table}-id`, team_id: 't1' }, error: null }),
        then: (r: (v: Outcome) => unknown) => Promise.resolve({ data: error ? null : Array.isArray(rows) ? rows.map(() => ({ id: 'x' })) : null, error }).then(r),
      });
      return n;
    },
    single: async () => settle(),
    maybeSingle: async () => settle(),
    then: (resolve: (v: Outcome) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(settle()).then(resolve, reject),
  });
  return node;
}

function makeClient() {
  return {
    auth: { getUser: async () => ({ data: { user: { id: 'u1' } }, error: null }) },
    from: (table: string) => chain(table),
    rpc: async () => ({ data: null, error: null }),
  };
}

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => makeClient() }));
vi.mock('@/lib/golf/resolve-team-server', () => ({ resolveCoachTeamIdWithCookie: async () => 't1' }));

const DOC_A = '11111111-1111-4111-8111-111111111111';
const DOC_B = '22222222-2222-4222-8222-222222222222';

async function publish(documentIds: string[]) {
  const mod = await import('@/app/golf/actions/announcements');
  return mod.createEnrichedAnnouncement({
    title: 'Travel waiver and hotel',
    body: 'Both are in Documents.',
    urgency: 'normal',
    requiresAcknowledgement: true,
    recipientPlayerIds: null,
    documentIds,
    inlineTasks: [],
  });
}

describe('createEnrichedAnnouncement: a post whose files did not attach says so (Q-82)', () => {
  beforeEach(() => {
    logServerError.mockClear();
    inserted.length = 0;
    outcomes.clear();
    insertErrors.clear();
    outcomes.set('golf_coaches', { data: { id: 'c1', organization_id: 'o1', full_name: 'Coach' }, error: null });
    outcomes.set('golf_team_members', { data: ROSTER, error: null });
    // Both files are this team's own documents.
    outcomes.set('golf_documents', { data: [{ id: DOC_A }, { id: DOC_B }], error: null });
  });

  it("refuses a file that isn't in the team's documents, before posting anything", async () => {
    outcomes.set('golf_documents', { data: [{ id: DOC_A }], error: null });

    const result = await publish([DOC_A, DOC_B]);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/aren't in your team's documents/);
    expect(inserted).toEqual([]);
  });

  it('returns the attachments error beside the id, keeps success true, and logs it', async () => {
    insertErrors.set('golf_announcement_documents', { message: 'new row violates row-level security policy', code: '42501' });

    const result = await publish([DOC_A, DOC_B]);

    // The post exists: nothing replays it, and callers that ignore the field behave as before.
    expect(result.success).toBe(true);
    expect(result.data?.announcementId).toBe('golf_announcements-id');
    expect(result.data?.attachmentsError).toMatch(/files didn't attach/);
    expect(inserted.filter((i) => i.table === 'golf_announcements')).toHaveLength(1);
    expect(logServerError.mock.calls.some((call) => /attachment insert failed/.test(String((call as unknown[])[0])))).toBe(true);
  });

  it('carries no attachments error when the links landed, or when there were none to link', async () => {
    const withFiles = await publish([DOC_A]);
    expect(withFiles.success).toBe(true);
    expect(withFiles.data).toEqual({ announcementId: 'golf_announcements-id' });
    expect(inserted.some((i) => i.table === 'golf_announcement_documents')).toBe(true);

    const without = await publish([]);
    expect(without.data).toEqual({ announcementId: 'golf_announcements-id' });
  });
});
