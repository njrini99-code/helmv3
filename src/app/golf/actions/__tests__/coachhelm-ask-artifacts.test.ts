import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NOW = Date.parse('2026-11-08T17:00:00Z');
const ID = '11111111-1111-4111-8111-111111111111';
const state = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  error: null as { message: string } | null,
  user: { id: 'user' } as { id: string } | null,
  ctx: { team_id: 'team' } as { team_id: string } | null,
  afterRead: null as (() => void) | null,
  remove: vi.fn(),
  read: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({
  auth: { getUser: async () => ({ data: { user: state.user } }) },
  from: () => {
    const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => {
      state.read();
      state.afterRead?.();
      return { data: state.row, error: state.error };
    } };
    return chain;
  },
}) }));
vi.mock('@/lib/coachhelm/v3/chat/context', () => ({ resolveCoachChatContext: async () => state.ctx }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_name: string, _options: unknown, fn: unknown) => fn }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));
vi.mock('../documents', () => ({ deleteDocument: state.remove, saveTextDocument: vi.fn(), updateDocument: vi.fn() }));

import { undoAskArtifact } from '../coachhelm-ask-artifacts';

const input = (savedAt = new Date(NOW - 1000).toISOString()) => ({ id: ID, savedAt });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  state.row = { id: ID, team_id: 'team', is_public: false, uploaded_by: 'user', created_at: new Date(NOW - 2000).toISOString() };
  state.error = null;
  state.user = { id: 'user' };
  state.ctx = { team_id: 'team' };
  state.afterRead = null;
  state.read.mockReset();
  state.remove.mockReset().mockResolvedValue({ success: true });
});
afterEach(() => vi.useRealTimers());

describe('Save artifact Undo uses the stored document age', () => {
  it('cannot delete an old private document by forging a fresh savedAt', async () => {
    state.row!.created_at = new Date(NOW - 86_400_000).toISOString();
    expect(await undoAskArtifact(input(new Date(NOW).toISOString()))).toMatchObject({ success: false, error: expect.stringMatching(/Too late/) });
    expect(state.remove).not.toHaveBeenCalled();
  });

  it('allows the coach to undo a recent private save and propagates delete failure', async () => {
    expect(await undoAskArtifact(input())).toEqual({ success: true });
    expect(state.remove).toHaveBeenCalledExactlyOnceWith(ID);
    state.remove.mockResolvedValue({ success: false });
    expect(await undoAskArtifact(input())).toMatchObject({ success: false });
  });

  it.each([undefined, null, 'not a timestamp', new Date(NOW + 1000).toISOString(), new Date(NOW - 12_001).toISOString()])('refuses invalid, future or expired client time %s', async (savedAt) => {
    expect(await undoAskArtifact({ id: ID, savedAt } as never)).toMatchObject({ success: false });
    expect(state.read).not.toHaveBeenCalled();
    expect(state.remove).not.toHaveBeenCalled();
  });

  it.each([null, undefined, 'not a timestamp', new Date(NOW + 1000).toISOString(), new Date(NOW - 12_001).toISOString()])('refuses invalid, future or expired stored time %s', async (createdAt) => {
    state.row!.created_at = createdAt;
    expect(await undoAskArtifact(input())).toMatchObject({ success: false });
    expect(state.remove).not.toHaveBeenCalled();
  });

  it('checks the server clock after the read so query latency cannot extend Undo', async () => {
    state.row!.created_at = new Date(NOW - 11_000).toISOString();
    state.afterRead = () => vi.setSystemTime(NOW + 2000);
    expect(await undoAskArtifact(input())).toMatchObject({ success: false });
    expect(state.remove).not.toHaveBeenCalled();
  });

  it.each([{ team_id: 'other' }, { is_public: true }, { uploaded_by: 'other' }])('retains the document ownership/privacy guard %j', async (over) => {
    Object.assign(state.row!, over);
    expect(await undoAskArtifact(input())).toMatchObject({ success: false });
    expect(state.remove).not.toHaveBeenCalled();
  });

  it('fails closed for a missing user, failed read or malformed input', async () => {
    state.user = null;
    expect(await undoAskArtifact(input())).toMatchObject({ success: false });
    state.user = { id: 'user' };
    state.error = { message: 'Read refused' };
    expect(await undoAskArtifact(input())).toMatchObject({ success: false });
    expect(await undoAskArtifact(null as never)).toMatchObject({ success: false });
    expect(await undoAskArtifact({ ...input(), id: 'bad-id' })).toMatchObject({ success: false });
    expect(state.remove).not.toHaveBeenCalled();
  });

  it('is idempotent if a valid recent Undo already removed the document', async () => {
    state.row = null;
    expect(await undoAskArtifact(input())).toEqual({ success: true });
    expect(state.remove).not.toHaveBeenCalled();
  });
});
