import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import type { SupabaseClient } from '@supabase/supabase-js';
import { markRead, NOT_USEFUL_DEFAULT_REASON, setFocusFromRead, type ReadActionScope } from '../actions';
import { buildTeamReads } from '../build';
import type { ReadPayload } from '../types';
import { readsTeam } from './team';

const TEAM = '11111111-1111-4111-8111-111111111111';
const COACH = '22222222-2222-4222-8222-222222222222';
const ID = '33333333-3333-4333-8333-333333333333';

const built = buildTeamReads(readsTeam().rows()).payloads.find((p) => p.priority && p.priority.team)!;
const PLAYER = '44444444-4444-4444-8444-444444444444';
const payload: ReadPayload = { ...built, team_id: TEAM, player_id: PLAYER };

/** A stand-in for the coach's RLS client: the roster, the current read, and the two held tables (an id written once). */
function fakeDb(opts: { member?: boolean; current?: ReadPayload | null; missingTable?: boolean; insertError?: string } = {}) {
  const written: Record<string, Map<string, Record<string, unknown>>> = { golf_coach_read_feedback: new Map(), golf_coach_read_focus: new Map() };
  const upserts: Array<{ table: string; opts: unknown }> = [];
  const from = (table: string) => {
    const b: Record<string, unknown> = {};
    const chain = () => b;
    Object.assign(b, {
      select: chain,
      eq: chain,
      in: chain,
      order: chain,
      range: chain,
      maybeSingle: async () => ({ data: opts.member === false ? null : { player_id: PLAYER }, error: null }),
      upsert: async (row: Record<string, unknown>, o: unknown) => {
        upserts.push({ table, opts: o });
        if (opts.missingTable) return { error: { message: 'relation does not exist', code: '42P01' } };
        if (opts.insertError) return { error: { message: opts.insertError, code: '42501' } };
        const m = written[table]!;
        if (!m.has(row.id as string)) m.set(row.id as string, row);
        return { error: null };
      },
      then: (resolve: (v: unknown) => unknown) => {
        if (table === 'golf_coach_reads_current') {
          const cur = opts.current === undefined ? payload : opts.current;
          return Promise.resolve(resolve({ data: cur ? [{ id: 'r1', team_id: TEAM, player_id: PLAYER, payload: cur, content_hash: 'h' }] : [], error: null }));
        }
        return Promise.resolve(resolve({ data: [], error: null }));
      },
    });
    return b;
  };
  return { sb: { from } as unknown as SupabaseClient, written, upserts };
}

const scope = (db: ReturnType<typeof fakeDb>, over: Partial<ReadActionScope> = {}): ReadActionScope => ({ sb: db.sb, coachId: COACH, teamId: TEAM, zone: 'America/Los_Angeles', now: new Date('2026-11-19T05:30:00Z'), enabled: true, ...over });
const key = payload.priority!.key;

describe('Set focus from this card', () => {
  it('stores the numbers from the saved read, never from the client, on the team’s day', async () => {
    const db = fakeDb();
    const res = await setFocusFromRead(scope(db), { id: ID, playerId: PLAYER, cardKey: key });
    expect(res.success).toBe(true);
    const row = db.written.golf_coach_read_focus.get(ID)!;
    expect(row).toMatchObject({ team_id: TEAM, player_id: PLAYER, coach_id: COACH, card_key: key, part: payload.priority!.area, value_on_day: payload.priority!.numbers.lost_per_round, rounds_on_day: payload.priority!.numbers.rounds, focus_area_id: null });
    expect(row.team_lost_on_day).toBe(payload.priority!.team!.value.part_team_lost);
    // 05:30 UTC on the 19th is still the 18th in Los Angeles.
    expect(row.set_on).toBe('2026-11-18');
    if (res.success) expect(res.data.since).toMatch(/^Focus set 18 Nov on /);
    expect(db.upserts[0]!.opts).toEqual({ onConflict: 'id', ignoreDuplicates: true });
  });

  it('is idempotent: a second tap or a Retry with the same id writes one row', async () => {
    const db = fakeDb();
    await setFocusFromRead(scope(db), { id: ID, playerId: PLAYER, cardKey: key });
    const again = await setFocusFromRead(scope(db), { id: ID, playerId: PLAYER, cardKey: key });
    expect(again.success).toBe(true);
    expect(db.written.golf_coach_read_focus.size).toBe(1);
  });

  it('refuses a card that is no longer the current one, a player off the team, the flag off, and bad input', async () => {
    expect(await setFocusFromRead(scope(fakeDb()), { id: ID, playerId: PLAYER, cardKey: 'priority:strokes_gained_putting_other' })).toMatchObject({ success: false, error: expect.stringMatching(/changed since the page loaded/) });
    expect(await setFocusFromRead(scope(fakeDb({ member: false })), { id: ID, playerId: PLAYER, cardKey: key })).toMatchObject({ success: false, error: expect.stringMatching(/not on this team/) });
    expect(await setFocusFromRead(scope(fakeDb(), { enabled: false }), { id: ID, playerId: PLAYER, cardKey: key })).toMatchObject({ success: false, error: expect.stringMatching(/off for this team/) });
    expect(await setFocusFromRead(scope(fakeDb()), { id: 'not-a-uuid', playerId: PLAYER, cardKey: key })).toMatchObject({ success: false });
    expect(await setFocusFromRead(scope(fakeDb({ current: null })), { id: ID, playerId: PLAYER, cardKey: key })).toMatchObject({ success: false });
  });

  it('says so, never silently, when the table is not applied or the write is refused', async () => {
    expect(await setFocusFromRead(scope(fakeDb({ missingTable: true })), { id: ID, playerId: PLAYER, cardKey: key })).toMatchObject({ success: false, error: expect.stringMatching(/not set up yet/) });
    expect(await setFocusFromRead(scope(fakeDb({ insertError: 'new row violates row-level security policy' })), { id: ID, playerId: PLAYER, cardKey: key })).toMatchObject({ success: false, error: expect.stringMatching(/not saved/) });
  });
});

describe('Not useful and Wrong', () => {
  it('"not useful" keeps a default reason; "wrong" needs one', async () => {
    const db = fakeDb();
    expect(await markRead(scope(db), { id: ID, playerId: PLAYER, cardKey: key, verdict: 'not_useful' })).toEqual({ success: true, data: { verdict: 'not_useful', reason: NOT_USEFUL_DEFAULT_REASON } });
    expect(db.written.golf_coach_read_feedback.get(ID)).toMatchObject({ verdict: 'not_useful', reason: NOT_USEFUL_DEFAULT_REASON, lost_per_round: payload.priority!.numbers.lost_per_round, certainty: payload.priority!.certainty, area: payload.priority!.area, coach_id: COACH });
    expect(await markRead(scope(fakeDb()), { id: ID, playerId: PLAYER, cardKey: key, verdict: 'wrong', reason: '   ' })).toMatchObject({ success: false, error: expect.stringMatching(/what is wrong/) });
    expect(await markRead(scope(fakeDb()), { id: ID, playerId: PLAYER, cardKey: key, verdict: 'wrong', reason: 'x'.repeat(501) })).toMatchObject({ success: false });
    const w = fakeDb();
    expect(await markRead(scope(w), { id: ID, playerId: PLAYER, cardKey: key, verdict: 'wrong', reason: '  Played hurt  ' })).toEqual({ success: true, data: { verdict: 'wrong', reason: 'Played hurt' } });
    expect(w.written.golf_coach_read_feedback.get(ID)!.reason).toBe('Played hurt');
  });

  it('refuses an unknown verdict', async () => {
    expect(await markRead(scope(fakeDb()), { id: ID, playerId: PLAYER, cardKey: key, verdict: 'great' as never })).toMatchObject({ success: false });
  });
});
