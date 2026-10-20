/**
 * P006: golf_event_documents has INSERT/SELECT/DELETE policies and no UPDATE
 * policy. The attach used upsert(ignoreDuplicates: false) = ON CONFLICT DO
 * UPDATE, which RLS refuses whenever the row already exists, so a retry, an
 * Undo or a double attach told the coach "Couldn't attach" for a file that was
 * attached. The attach is now ON CONFLICT DO NOTHING: an already-attached
 * document answers success.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));
vi.mock('@/lib/admin/rls-denial', () => ({ maybeCaptureRlsDenial: vi.fn() }));

/** Existing (event_id, document_id) pairs, plus whether the caller passes the INSERT policy (a coach). */
const world = { attached: new Set<string>(), isCoach: true };
const upsertCalls: Array<{ row: Record<string, unknown>; opts: Record<string, unknown> }> = [];

function single(data: unknown) {
  const b: Record<string, unknown> = {};
  Object.assign(b, { select: () => b, eq: () => b, maybeSingle: async () => ({ data, error: null }) });
  return b;
}

/** Postgres semantics for INSERT ... ON CONFLICT under RLS with no UPDATE policy. */
function eventDocuments() {
  return {
    upsert: async (row: Record<string, unknown>, opts: Record<string, unknown>) => {
      upsertCalls.push({ row, opts });
      if (!world.isCoach) return { data: null, error: { code: '42501', message: 'new row violates row-level security policy' } };
      const key = `${row.event_id}:${row.document_id}`;
      if (world.attached.has(key)) {
        if (opts.ignoreDuplicates) return { data: null, error: null }; // DO NOTHING
        return { data: null, error: { code: '42501', message: 'new row violates row-level security policy (USING expression) for table "golf_event_documents"' } };
      }
      world.attached.add(key);
      return { data: null, error: null };
    },
  };
}

const client = {
  auth: { getUser: async () => ({ data: { user: { id: 'coach-user' } }, error: null }) },
  from: (table: string) => {
    if (table === 'golf_events') return single({ team_id: 'team-1' });
    if (table === 'golf_documents') return single({ team_id: 'team-1' });
    if (table === 'golf_coaches') return single(world.isCoach ? { id: 'coach-1' } : null);
    if (table === 'golf_event_documents') return eventDocuments();
    throw new Error(`unexpected table ${table}`);
  },
};
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => client }));

import { attachDocumentToEvent } from '../event-documents';

beforeEach(() => {
  world.attached.clear();
  world.isCoach = true;
  upsertCalls.length = 0;
});

describe('attachDocumentToEvent re-attach (P006)', () => {
  it('attaches a new document with ON CONFLICT DO NOTHING', async () => {
    expect(await attachDocumentToEvent('ev-1', 'doc-1')).toEqual({ success: true });
    expect(upsertCalls[0]?.opts).toEqual({ onConflict: 'event_id,document_id', ignoreDuplicates: true });
    expect(upsertCalls[0]?.row).toMatchObject({ event_id: 'ev-1', document_id: 'doc-1', attached_by: 'coach-1' });
  });

  it('answers success for an already-attached document (retry, Undo, double attach)', async () => {
    world.attached.add('ev-1:doc-1');
    expect(await attachDocumentToEvent('ev-1', 'doc-1', 'bring a rain jacket')).toEqual({ success: true });
    expect(await attachDocumentToEvent('ev-1', 'doc-1')).toEqual({ success: true });
    expect(world.attached.size).toBe(1);
  });

  it("still refuses a non-coach's attach (the INSERT policy is checked even with DO NOTHING)", async () => {
    world.isCoach = false;
    expect(await attachDocumentToEvent('ev-1', 'doc-1')).toEqual({
      success: false,
      error: "Only this team's coaches can attach documents",
    });
  });
});
