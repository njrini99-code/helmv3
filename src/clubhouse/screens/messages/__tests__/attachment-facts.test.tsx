import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ calls: [] as Array<{ table: string; ids: string[] }>, rows: [] as Array<Record<string, unknown>>, fail: false }));
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => ({
      select: () => ({
        in: (_col: string, ids: string[]) => ({
          order: async () => {
            db.calls.push({ table, ids });
            return db.fail ? { data: null, error: { message: 'x' } } : { data: db.rows.filter((r) => ids.includes(r.message_id as string)), error: null };
          },
        }),
      }),
    }),
  }),
}));

import { attachmentKindOf, factsOf, useAttachmentFacts } from '../attachment-facts';

beforeEach(() => {
  db.calls.length = 0;
  db.rows = [];
  db.fail = false;
});

/** The real columns (golf_message_attachments): file_type is 'image' | 'video' | 'document' | 'audio'; width, height and duration_seconds are null where unmeasured. */
describe('attachment facts, from golf_message_attachments (the message payload carries none)', () => {
  it('maps file_type to the bubble kinds', () => {
    expect(['image', 'video', 'document', 'audio', null].map(attachmentKindOf)).toEqual(['photo', 'video', 'file', 'file', 'file']);
  });

  it('holds a photo’s size only when both sides are measured, and a clip’s length when it has one', () => {
    expect(factsOf({ file_type: 'image', width: 3024, height: 4032, duration_seconds: null })).toEqual({ attachmentKind: 'photo', attachmentWidth: 3024, attachmentHeight: 4032 });
    expect(factsOf({ file_type: 'image', width: 3024, height: null })).toEqual({ attachmentKind: 'photo' });
    expect(factsOf({ file_type: 'video', width: null, height: null, duration_seconds: 42 })).toEqual({ attachmentKind: 'video', durationSeconds: 42 });
    expect(factsOf({ file_type: 'document' })).toEqual({ attachmentKind: 'file' });
  });

  it('reads each message once, in runs, and keeps the first attachment’s facts', async () => {
    db.rows = [
      { message_id: 'm1', file_type: 'image', width: 100, height: 200 },
      { message_id: 'm1', file_type: 'document' },
      { message_id: 'm2', file_type: 'video', duration_seconds: 9 },
    ];
    const { result, rerender } = renderHook(({ ids }) => useAttachmentFacts(ids), { initialProps: { ids: ['m1', 'm2'] } });
    await waitFor(() => expect(result.current.size).toBe(2));
    expect(result.current.get('m1')).toEqual({ attachmentKind: 'photo', attachmentWidth: 100, attachmentHeight: 200 });
    expect(result.current.get('m2')).toEqual({ attachmentKind: 'video', durationSeconds: 9 });
    expect(db.calls).toHaveLength(1);
    rerender({ ids: ['m1', 'm2', 'm3'] });
    await waitFor(() => expect(db.calls).toHaveLength(2));
    expect(db.calls[1]!.ids).toEqual(['m3']);
  });

  it('draws no facts when the read fails, or is switched off', async () => {
    db.fail = true;
    const { result } = renderHook(() => useAttachmentFacts(['m1']));
    await waitFor(() => expect(db.calls).toHaveLength(1));
    expect(result.current.size).toBe(0);
    renderHook(() => useAttachmentFacts(['m9'], false));
    expect(db.calls).toHaveLength(1);
  });
});
