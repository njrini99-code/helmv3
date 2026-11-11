/**
 * setPlanFormat keeps what the team's format said before it overwrites the one row, so Undo can put it back. When that
 * read fails the action must write nothing: an overwrite with no "before" would make Undo delete the team's format.
 * Synthetic ids only.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  ctx: { coach_id: 'coach-1', user_id: 'user-1', team_id: 'team-1' } as { coach_id: string; user_id: string; team_id: string } | null,
  prior: { data: null, error: null } as { data: unknown; error: { code?: string; message: string } | null },
  written: { data: { id: 'format-1' }, error: null } as { data: unknown; error: { code?: string; message: string } | null },
  reads: [] as Array<{ table: string; column: string; value: unknown }>,
  upserts: [] as Array<Record<string, unknown>>,
  logServerError: vi.fn(async (..._args: unknown[]) => undefined),
}));

vi.mock('ai', () => ({ generateObject: vi.fn() }));
vi.mock('@/lib/ai/model-provider', () => ({ resolveModelProvider: () => ({}) }));
vi.mock('@/lib/coachhelm/v3/llm/types', () => ({ MODEL_FOR_TASK: { coach_chat: 'test-model' } }));
vi.mock('@/app/golf/actions/documents', () => ({ getPreviewUrl: vi.fn() }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_name: string, _meta: unknown, fn: unknown) => fn }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: state.logServerError }));
vi.mock('@/lib/coachhelm/v3/chat/context', () => ({
  resolveCoachChatContext: async () => {
    if (!state.ctx) throw new Error('no coach');
    return state.ctx;
  },
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (column: string, value: unknown) => {
          state.reads.push({ table, column, value });
          return { maybeSingle: async () => state.prior };
        },
      }),
      upsert: (row: Record<string, unknown>) => {
        state.upserts.push(row);
        return { select: () => ({ maybeSingle: async () => state.written }) };
      },
    }),
  }),
}));

import { setPlanFormat } from '../coachhelm-plan-format';

const INPUT = { documentId: 'doc-2', name: 'Tuesday sheet', sections: [{ key: 'header' as const, name: 'Header' }] };
const BEFORE = { source_document_id: 'doc-1', name: 'Monday sheet', sections: [{ key: 'groups', name: 'Groups' }] };

beforeEach(() => {
  state.ctx = { coach_id: 'coach-1', user_id: 'user-1', team_id: 'team-1' };
  state.prior = { data: null, error: null };
  state.written = { data: { id: 'format-1' }, error: null };
  state.reads = [];
  state.upserts = [];
  state.logServerError.mockClear();
});

describe('setPlanFormat', () => {
  it('writes nothing when the current format could not be read, and says the format was not set', async () => {
    state.prior = { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout' } };

    const res = await setPlanFormat(INPUT);

    expect(res).toEqual({ success: false, error: 'The format wasn’t set.' });
    // The overwrite is the thing that loses Undo: it must not have been sent.
    expect(state.upserts).toEqual([]);
    expect(state.logServerError).toHaveBeenCalledTimes(1);
    expect(String(state.logServerError.mock.calls[0]?.[0])).toContain('nothing written');
    expect(state.logServerError.mock.calls[0]?.[1]).toMatchObject({ action: 'coachhelm.plan.format', errorCode: '57014', handled: true });
  });

  it('says Practice is not there yet when the table is missing, and writes nothing', async () => {
    state.prior = { data: null, error: { code: 'PGRST205', message: 'Could not find the table' } };

    const res = await setPlanFormat(INPUT);

    expect(res).toEqual({ success: false, error: 'Comes with the Practice tab.' });
    expect(state.upserts).toEqual([]);
    // Unavailable, not broken: nothing to page anyone about.
    expect(state.logServerError).not.toHaveBeenCalled();
  });

  it('hands back the format it replaced, so Undo can put it back', async () => {
    state.prior = { data: BEFORE, error: null };

    const res = await setPlanFormat(INPUT);

    expect(res).toEqual({ success: true, id: 'format-1', prior: BEFORE });
    expect(state.reads).toEqual([{ table: 'golf_practice_plan_formats', column: 'team_id', value: 'team-1' }]);
    expect(state.upserts).toEqual([{ team_id: 'team-1', source_document_id: 'doc-2', name: 'Tuesday sheet', sections: INPUT.sections, created_by: 'user-1' }]);
  });

  it('a team with no format yet has no prior: a read that found nothing is not a failed read', async () => {
    const res = await setPlanFormat(INPUT);

    expect(res).toEqual({ success: true, id: 'format-1', prior: null });
    expect(state.upserts).toHaveLength(1);
  });

  it('a caller who is not a coach is refused before anything is read', async () => {
    state.ctx = null;

    const res = await setPlanFormat(INPUT);

    expect(res).toEqual({ success: false, error: 'Unauthorized' });
    expect(state.reads).toEqual([]);
    expect(state.upserts).toEqual([]);
  });
});
