import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * createTeamDrill, addTeamBreak and saveTeamTerm take an optional `requestId`. With one, the row's id is the request's,
 * so the same request sent twice answers with the first row and makes no second. Without one, the insert is what it
 * always was (no id): existing callers are unchanged.
 */
const { db } = vi.hoisted(() => {
  const db = { inserts: [] as Array<{ table: string; row: Record<string, unknown> }>, rows: new Map<string, Record<string, unknown>>(), selects: [] as Array<{ table: string; filters: Record<string, unknown> }> };
  return { db };
});

function client() {
  const from = (table: string) => {
    let inserted: Record<string, unknown> | null = null;
    let duplicate = false;
    const filters: Record<string, unknown> = {};
    const answer = async () => {
      if (inserted) return duplicate ? { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } } : { data: { id: inserted.id }, error: null };
      db.selects.push({ table, filters: { ...filters } });
      const found = db.rows.get(String(filters.id));
      return { data: found && found.team_id === filters.team_id ? { id: found.id } : null, error: null };
    };
    const q: Record<string, unknown> = {
      insert: (row: Record<string, unknown>) => {
        db.inserts.push({ table, row });
        const id = String(row.id ?? `generated-${db.inserts.length}`);
        if (db.rows.has(id)) duplicate = true;
        else db.rows.set(id, { ...row, id });
        inserted = { ...row, id };
        return q;
      },
      update: () => q,
      select: () => q,
      eq: (column: string, value: unknown) => ((filters[column] = value), q),
      maybeSingle: answer,
      single: answer,
    };
    return q;
  };
  return { from, auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) } };
}

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => client()) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn(() => client()) }));
vi.mock('@/lib/admin/observed-action', () => ({ withAdminObserved: (_name: string, _opts: unknown, fn: unknown) => fn }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(), logServerEvent: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), updateTag: vi.fn(), revalidateTag: vi.fn() }));

import { addTeamBreak, saveTeamTerm } from '../class-status';
import { createTeamDrill } from '../practice-library';

const TEAM = '00000000-0000-4000-8000-0000000000a1';
const OTHER_TEAM = '00000000-0000-4000-8000-0000000000b2';
const REQ = '3f2c1a9e-7b4d-4c1a-9e2f-5a6b7c8d9e0f';

beforeEach(() => {
  db.inserts.length = 0;
  db.selects.length = 0;
  db.rows.clear();
});

describe('createTeamDrill with a request id', () => {
  const drill = { teamId: TEAM, name: 'Ladder', area: 'putting', kind: 'skill' as const, minutes: 15 };

  it('makes the request id the drill’s id, and a repeat answers with the first drill', async () => {
    const first = await createTeamDrill({ ...drill, requestId: REQ });
    expect(first).toEqual({ success: true, id: REQ });
    expect(db.inserts[0]?.row).toMatchObject({ id: REQ, team_id: TEAM, name: 'Ladder' });
    const again = await createTeamDrill({ ...drill, requestId: REQ });
    expect(again).toEqual({ success: true, id: REQ });
    expect(db.rows.size).toBe(1);
    // The look for the first row is by the request's id AND this team.
    expect(db.selects).toEqual([{ table: 'golf_team_drills', filters: { id: REQ, team_id: TEAM } }]);
  });

  it('does not answer with another team’s row, refuses an id that is not a UUID, and is unchanged without one', async () => {
    await createTeamDrill({ ...drill, requestId: REQ });
    expect(await createTeamDrill({ ...drill, teamId: OTHER_TEAM, requestId: REQ })).toMatchObject({ success: false });
    db.inserts.length = 0;
    expect(await createTeamDrill({ ...drill, requestId: 'not-a-uuid' })).toMatchObject({ success: false });
    expect(db.inserts).toEqual([]);
    expect(await createTeamDrill(drill)).toMatchObject({ success: true });
    expect(db.inserts[0]?.row).not.toHaveProperty('id');
  });
});

describe('addTeamBreak with a request id', () => {
  const brk = { teamId: TEAM, startsOn: '2026-11-25', endsOn: '2026-11-29', label: 'Thanksgiving' };

  it('makes the request id the break’s id, and a repeat answers with the first break', async () => {
    expect(await addTeamBreak({ ...brk, requestId: REQ })).toEqual({ success: true, data: { id: REQ } });
    expect(db.inserts[0]).toMatchObject({ table: 'golf_class_exceptions', row: { id: REQ, team_id: TEAM, starts_on: '2026-11-25', ends_on: '2026-11-29' } });
    expect(await addTeamBreak({ ...brk, requestId: REQ })).toEqual({ success: true, data: { id: REQ } });
    expect(db.rows.size).toBe(1);
  });

  it('is unchanged without one, and refuses an id that is not a UUID before any write', async () => {
    expect(await addTeamBreak(brk)).toMatchObject({ success: true });
    expect(db.inserts[0]?.row).not.toHaveProperty('id');
    db.inserts.length = 0;
    expect(await addTeamBreak({ ...brk, requestId: 'nope' })).toMatchObject({ success: false });
    expect(db.inserts).toEqual([]);
  });
});

describe('saveTeamTerm with a request id', () => {
  const term = { teamId: TEAM, label: 'Spring 2027', classesStart: '2027-01-11', classesEnd: '2027-04-30', examsEnd: '2027-05-07', timeZone: 'America/New_York' };

  it('makes the request id the new term’s id, and a repeat answers with the first term', async () => {
    expect(await saveTeamTerm({ ...term, requestId: REQ })).toEqual({ success: true, data: { id: REQ } });
    expect(db.inserts[0]).toMatchObject({ table: 'golf_team_terms', row: { id: REQ, team_id: TEAM, label: 'Spring 2027' } });
    expect(await saveTeamTerm({ ...term, requestId: REQ })).toEqual({ success: true, data: { id: REQ } });
    expect(db.rows.size).toBe(1);
  });

  it('is unchanged without one', async () => {
    expect(await saveTeamTerm(term)).toMatchObject({ success: true });
    expect(db.inserts[0]?.row).not.toHaveProperty('id');
  });
});
