// =============================================================================
// src/app/golf/actions/__tests__/crm-sequences.test.ts
//
// Regression coverage for the SEQUENCES INTEGRITY fixes:
//
//   1. CRITICAL — editing an existing step's step_order used to upsert on
//      (sequence_id, step_order), which INSERTS a new row at the new
//      position and leaves the OLD row (same content, old position) live —
//      an orphaned duplicate that keeps firing on its original schedule.
//      upsertSequenceStep(..., { id }) now moves the SAME row in place
//      (shifting siblings as needed) so no orphan is ever created.
//
//   2. CRITICAL — paused enrollments had no way back to active.
//      resumeEnrollment() flips paused -> active, preserving current_step
//      and next_send_at exactly.
//
//   3. CRITICAL — a coach whose enrollment was stopped manually could never
//      be re-enrolled in the same sequence (the UNIQUE(sequence_id,
//      coach_id) constraint blocked a second insert). enrollCoachesInSequence
//      now reactivates the SAME row (restarting at step 0) for a
//      status='stopped' + stop_reason='manual' prior enrollment, while a
//      coach stopped for replied/unsubscribed/bounced stays permanently
//      blocked, and an active/paused/completed coach is left alone.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// A small in-memory fake Postgrest-style query builder. Each table is a
// mutable `{ rows }` box; the builder accumulates filters and, on await (or
// .single()/.maybeSingle()), executes select/update/insert/upsert against
// the in-memory rows. This lets tests assert on the FINAL table state
// directly (e.g. "still exactly 3 rows, no orphan") rather than having to
// hard-code the exact sequence of calls the implementation makes.
// ---------------------------------------------------------------------------
type Row = Record<string, unknown>;
type Table = { rows: Row[] };

function makeTable(rows: Row[]): Table {
  return { rows: rows.map((r) => ({ ...r })) };
}

let nextGenId = 1;

function makeQueryBuilder(table: Table) {
  type Filter = { col: string; op: 'eq' | 'neq' | 'in'; val: unknown };
  const filters: Filter[] = [];
  let mode: 'select' | 'update' | 'insert' | 'upsert' = 'select';
  let updatePayload: Row | null = null;
  let insertPayload: Row[] | null = null;
  let upsertPayload: Row | null = null;
  let onConflictCols: string[] = [];
  let orderCol: string | null = null;
  let orderAsc = true;

  function applyFilters(rows: Row[]): Row[] {
    return rows.filter((r) =>
      filters.every((f) => {
        if (f.op === 'eq') return r[f.col] === f.val;
        if (f.op === 'neq') return r[f.col] !== f.val;
        return (f.val as unknown[]).includes(r[f.col]);
      }),
    );
  }

  function execute(): { data: unknown; error: unknown } {
    if (mode === 'update') {
      const matched = applyFilters(table.rows);
      for (const row of matched) Object.assign(row, updatePayload);
      return { data: matched.map((r) => ({ ...r })), error: null };
    }
    if (mode === 'insert') {
      const inserted = (insertPayload ?? []).map((r) => ({ id: `gen-${nextGenId++}`, ...r }));
      table.rows.push(...inserted);
      return { data: inserted, error: null };
    }
    if (mode === 'upsert') {
      const match = table.rows.find((r) => onConflictCols.every((c) => r[c] === upsertPayload?.[c]));
      if (match) {
        Object.assign(match, upsertPayload);
        return { data: [{ ...match }], error: null };
      }
      const inserted = { id: `gen-${nextGenId++}`, ...upsertPayload };
      table.rows.push(inserted);
      return { data: [inserted], error: null };
    }
    let result = applyFilters(table.rows).map((r) => ({ ...r }));
    if (orderCol) {
      const col = orderCol;
      result = result
        .slice()
        .sort((a, b) => ((a[col] as number) > (b[col] as number) ? 1 : -1) * (orderAsc ? 1 : -1));
    }
    return { data: result, error: null };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn((col: string, val: unknown) => {
      filters.push({ col, op: 'eq', val });
      return chain;
    }),
    neq: vi.fn((col: string, val: unknown) => {
      filters.push({ col, op: 'neq', val });
      return chain;
    }),
    in: vi.fn((col: string, val: unknown[]) => {
      filters.push({ col, op: 'in', val });
      return chain;
    }),
    order: vi.fn((col: string, opts?: { ascending?: boolean }) => {
      orderCol = col;
      orderAsc = opts?.ascending !== false;
      return chain;
    }),
    update: vi.fn((payload: Row) => {
      mode = 'update';
      updatePayload = payload;
      return chain;
    }),
    insert: vi.fn((payload: Row | Row[]) => {
      mode = 'insert';
      insertPayload = Array.isArray(payload) ? payload : [payload];
      return chain;
    }),
    upsert: vi.fn((payload: Row, opts?: { onConflict?: string }) => {
      mode = 'upsert';
      upsertPayload = payload;
      onConflictCols = opts?.onConflict?.split(',') ?? [];
      return chain;
    }),
    single: vi.fn(async () => {
      const { data, error } = execute();
      if (Array.isArray(data)) {
        if (data.length !== 1) {
          return { data: null, error: error ?? { message: `expected 1 row, got ${data.length}` } };
        }
        return { data: data[0], error };
      }
      return { data, error };
    }),
    maybeSingle: vi.fn(async () => {
      const { data, error } = execute();
      if (Array.isArray(data)) {
        if (data.length === 0) return { data: null, error };
        return { data: data[0], error };
      }
      return { data, error };
    }),
    then: (resolve: (v: { data: unknown; error: unknown }) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(execute()).then(resolve, reject),
  };
  return chain;
}

let sequenceStepsTable: Table;
let enrollmentsTable: Table;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'admin-1' } } })) },
    from: vi.fn((table: string) => {
      if (table === 'crm_sequence_steps') return makeQueryBuilder(sequenceStepsTable);
      if (table === 'crm_sequence_enrollments') return makeQueryBuilder(enrollmentsTable);
      throw new Error(`Unexpected table in test: ${table}`);
    }),
  })),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerException: vi.fn(async () => undefined),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

import { upsertSequenceStep, resumeEnrollment, enrollCoachesInSequence } from '../crm-sequences';

beforeEach(() => {
  vi.clearAllMocks();
  nextGenId = 1;
});

describe('upsertSequenceStep — reorder integrity (CRITICAL)', () => {
  beforeEach(() => {
    sequenceStepsTable = makeTable([
      { id: 's1', sequence_id: 'seq-1', step_order: 1, delay_hours: 0, template_id: null, subject_override: 'Step A', body_override: 'Body A', condition: {}, created_at: '' },
      { id: 's2', sequence_id: 'seq-1', step_order: 2, delay_hours: 24, template_id: null, subject_override: 'Step B', body_override: 'Body B', condition: {}, created_at: '' },
      { id: 's3', sequence_id: 'seq-1', step_order: 3, delay_hours: 48, template_id: null, subject_override: 'Step C', body_override: 'Body C', condition: {}, created_at: '' },
    ]);
  });

  it('moving a step LATER updates the SAME row and leaves no orphan behind', async () => {
    const saved = await upsertSequenceStep({
      id: 's1',
      sequence_id: 'seq-1',
      step_order: 3,
      delay_hours: 0,
      subject_override: 'Step A',
      body_override: 'Body A',
    });

    expect(saved.id).toBe('s1');
    expect(saved.step_order).toBe(3);

    // No orphan: still exactly 3 rows — the same 3 ids, nothing extra
    // inserted at the new position.
    expect(sequenceStepsTable.rows).toHaveLength(3);
    const ids = sequenceStepsTable.rows.map((r) => r.id).sort();
    expect(ids).toEqual(['s1', 's2', 's3']);

    // Siblings shifted down to fill the gap; step_order stays a valid
    // permutation with no duplicates.
    const byId = Object.fromEntries(sequenceStepsTable.rows.map((r) => [r.id, r.step_order]));
    expect(byId).toEqual({ s1: 3, s2: 1, s3: 2 });
    const orders = sequenceStepsTable.rows.map((r) => r.step_order).sort();
    expect(orders).toEqual([1, 2, 3]);
  });

  it('moving a step EARLIER updates the SAME row and leaves no orphan behind', async () => {
    const saved = await upsertSequenceStep({
      id: 's3',
      sequence_id: 'seq-1',
      step_order: 1,
      delay_hours: 48,
      subject_override: 'Step C',
      body_override: 'Body C',
    });

    expect(saved.id).toBe('s3');
    expect(saved.step_order).toBe(1);
    expect(sequenceStepsTable.rows).toHaveLength(3);
    const ids = sequenceStepsTable.rows.map((r) => r.id).sort();
    expect(ids).toEqual(['s1', 's2', 's3']);

    const byId = Object.fromEntries(sequenceStepsTable.rows.map((r) => [r.id, r.step_order]));
    expect(byId).toEqual({ s3: 1, s1: 2, s2: 3 });
  });

  it('re-saving a step at its OWN order updates fields with no reorder side effects', async () => {
    const saved = await upsertSequenceStep({
      id: 's2',
      sequence_id: 'seq-1',
      step_order: 2,
      delay_hours: 72,
      subject_override: 'Step B revised',
      body_override: 'Body B revised',
    });

    expect(saved.delay_hours).toBe(72);
    expect(saved.subject_override).toBe('Step B revised');
    expect(sequenceStepsTable.rows).toHaveLength(3);
    const byId = Object.fromEntries(sequenceStepsTable.rows.map((r) => [r.id, r.step_order]));
    expect(byId).toEqual({ s1: 1, s2: 2, s3: 3 });
  });

  it('creating a brand-new step (no id) still works via the create-time upsert path', async () => {
    const saved = await upsertSequenceStep({
      sequence_id: 'seq-1',
      step_order: 4,
      delay_hours: 96,
      subject_override: 'Step D',
      body_override: 'Body D',
    });

    expect(saved.step_order).toBe(4);
    expect(sequenceStepsTable.rows).toHaveLength(4);
  });
});

describe('resumeEnrollment', () => {
  beforeEach(() => {
    enrollmentsTable = makeTable([
      {
        id: 'enr-1',
        sequence_id: 'seq-1',
        coach_id: 'coach-1',
        status: 'paused',
        current_step: 2,
        next_send_at: '2026-07-01T00:00:00.000Z',
        enrolled_at: '2026-06-01T00:00:00.000Z',
        completed_at: null,
        stopped_at: null,
        stop_reason: null,
        enrolled_by: 'admin-0',
        metadata: {},
      },
    ]);
  });

  it('flips a paused enrollment back to active, preserving current_step and next_send_at', async () => {
    const result = await resumeEnrollment('enr-1');

    expect(result.status).toBe('active');
    expect(result.current_step).toBe(2);
    expect(result.next_send_at).toBe('2026-07-01T00:00:00.000Z');
  });

  it('refuses to resume an enrollment that is not currently paused', async () => {
    enrollmentsTable.rows[0]!.status = 'active';

    await expect(resumeEnrollment('enr-1')).rejects.toThrow(/Failed to resume enrollment/);
  });
});

describe('enrollCoachesInSequence — re-enrollment after a manual stop', () => {
  it('re-enrolls a coach whose prior enrollment was stopped manually, restarting at step 0 on the SAME row', async () => {
    enrollmentsTable = makeTable([
      {
        id: 'enr-old',
        sequence_id: 'seq-1',
        coach_id: 'coach-1',
        status: 'stopped',
        current_step: 3,
        next_send_at: null,
        enrolled_at: '2026-01-01T00:00:00.000Z',
        completed_at: null,
        stopped_at: '2026-01-05T00:00:00.000Z',
        stop_reason: 'manual',
        enrolled_by: 'admin-0',
        metadata: {},
      },
    ]);

    const result = await enrollCoachesInSequence({
      sequence_id: 'seq-1',
      coach_ids: ['coach-1'],
    });

    expect(result).toEqual({ enrolled: 1, skipped: 0 });
    // Reactivated the SAME row, not a second one — the UNIQUE(sequence_id,
    // coach_id) constraint would reject a duplicate insert.
    expect(enrollmentsTable.rows).toHaveLength(1);
    const row = enrollmentsTable.rows[0]!;
    expect(row.id).toBe('enr-old');
    expect(row.status).toBe('active');
    expect(row.current_step).toBe(0);
    expect(row.stop_reason).toBeNull();
    expect(row.stopped_at).toBeNull();
    expect(row.next_send_at).not.toBeNull();
  });

  it.each(['replied', 'unsubscribed', 'bounced'] as const)(
    'permanently blocks re-enrollment when stop_reason is %s',
    async (reason) => {
      enrollmentsTable = makeTable([
        {
          id: 'enr-old',
          sequence_id: 'seq-1',
          coach_id: 'coach-1',
          status: 'stopped',
          current_step: 1,
          next_send_at: null,
          enrolled_at: '',
          completed_at: null,
          stopped_at: '2026-01-05T00:00:00.000Z',
          stop_reason: reason,
          enrolled_by: 'admin-0',
          metadata: {},
        },
      ]);

      const result = await enrollCoachesInSequence({
        sequence_id: 'seq-1',
        coach_ids: ['coach-1'],
      });

      expect(result).toEqual({ enrolled: 0, skipped: 1 });
      expect(enrollmentsTable.rows).toHaveLength(1);
      expect(enrollmentsTable.rows[0]!.status).toBe('stopped');
      expect(enrollmentsTable.rows[0]!.stop_reason).toBe(reason);
    },
  );

  it('leaves an active enrollment untouched (skipped, not re-enrolled)', async () => {
    enrollmentsTable = makeTable([
      {
        id: 'enr-active',
        sequence_id: 'seq-1',
        coach_id: 'coach-1',
        status: 'active',
        current_step: 1,
        next_send_at: '2026-08-01T00:00:00.000Z',
        enrolled_at: '',
        completed_at: null,
        stopped_at: null,
        stop_reason: null,
        enrolled_by: 'admin-0',
        metadata: {},
      },
    ]);

    const result = await enrollCoachesInSequence({
      sequence_id: 'seq-1',
      coach_ids: ['coach-1'],
    });

    expect(result).toEqual({ enrolled: 0, skipped: 1 });
    expect(enrollmentsTable.rows[0]!.current_step).toBe(1);
  });

  it('inserts a brand-new row for a coach with no prior enrollment', async () => {
    enrollmentsTable = makeTable([]);

    const result = await enrollCoachesInSequence({
      sequence_id: 'seq-1',
      coach_ids: ['coach-new'],
    });

    expect(result).toEqual({ enrolled: 1, skipped: 0 });
    expect(enrollmentsTable.rows).toHaveLength(1);
    expect(enrollmentsTable.rows[0]!.coach_id).toBe('coach-new');
    expect(enrollmentsTable.rows[0]!.status).toBe('active');
    expect(enrollmentsTable.rows[0]!.current_step).toBe(0);
  });
});
