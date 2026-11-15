import { describe, expect, it } from 'vitest';
import type { ToolEnvelope } from '@/lib/coachhelm/v3/chat/provenance';
import { STUDIO_READ_BOARD, STUDIO_READ_ROUND, STUDIO_READ_SCHEDULE } from '../../../../../preview/fixtures-chat-studio';
import { fromRead, type StudioData } from '..';

const read = (detail: unknown, over: Partial<ToolEnvelope> = {}): ToolEnvelope => ({ summary: '', measurements: [], series: [], detail, coverage: 'complete', coverage_note: null, as_of: '2026-11-11T12:00:00.000Z', ...over });
const detailOf = (e: ToolEnvelope) => e.detail as Record<string, unknown>;

describe('a read that is a thing the app has a screen for (fromRead)', () => {
  it('draws the schedule read as days, in the team’s time zone, with each event’s own replies and class conflicts', () => {
    const part = fromRead(STUDIO_READ_SCHEDULE);
    expect(part?.kind).toBe('schedule');
    const data = part!.data as StudioData['schedule'];
    // 23:45Z on the 12th is still the 12th in Chicago: the day is the zone's, not UTC's.
    expect(data.days.map((d) => [d.date, d.events.map((e) => e.id)])).toEqual([
      ['2026-11-12', ['ev-1', 'ev-2']],
      ['2026-11-13', ['ev-3']],
      ['2026-11-14', ['ev-4']],
    ]);
    const [practice, meeting] = data.days[0]!.events;
    expect(practice).toMatchObject({ kind: 'practice', time: '3:00 to 5:30 PM', place: 'Ridgeline practice green', replies: { going: 6, maybe: 1, out: 1, waiting: 1 }, conflicts: 2 });
    expect(practice!.href).toContain('ev-1');
    // A type the calendar has no drawing for keeps its own name, and an event nobody was asked about has no replies.
    expect(meeting).toMatchObject({ kind: 'other', kindLabel: 'Team meeting', replies: null, conflicts: 0 });
    // No end time: the start alone.
    expect(data.days[1]!.events[0]!.time).toBe('8:10 AM');
  });

  it('finds the calendar under `events` when the read carries other parts beside it', () => {
    const part = fromRead(read({ events: detailOf(STUDIO_READ_SCHEDULE), weather: { summary: 'Dry' } }));
    expect(part?.kind).toBe('schedule');
    expect((part!.data as StudioData['schedule']).days).toHaveLength(3);
  });

  it('draws the qualifier read as its board: the read’s order, totals only, the cut at the squad less the coach’s picks', () => {
    const part = fromRead(STUDIO_READ_BOARD);
    expect(part?.kind).toBe('qualifier_board');
    const data = part!.data as StudioData['qualifier_board'];
    const standings = detailOf(STUDIO_READ_BOARD).standings as Array<{ player: string; total: number }>;
    expect(data.rows.map((r) => r.name)).toEqual(standings.map((s) => s.player));
    expect(data.rows[0]).toMatchObject({ total: String(standings[0]!.total), toPar: '−5', rounds: [] });
    expect(data.roundLabels).toEqual([]);
    expect(data.cut).toBe(4);
    expect(data.status).toBe('In progress · 3 rounds');
    expect(data.href).toBe(detailOf(STUDIO_READ_BOARD).href);
    // A link is drawn only to a page the Clubhouse has: an address it does not know is no link, not a dead one.
    expect((fromRead(read({ ...detailOf(STUDIO_READ_BOARD), href: '/golf/dashboard/somewhere-else' }))!.data as StudioData['qualifier_board']).href).toBeNull();
  });

  it('draws no cut where the squad covers the whole board', () => {
    const part = fromRead(read({ ...detailOf(STUDIO_READ_BOARD), squad: 12, coach_picks: 0 }));
    expect((part!.data as StudioData['qualifier_board']).cut).toBeNull();
  });

  it('draws the round read as its scorecard, named by who, where, when and what was shot', () => {
    const part = fromRead(STUDIO_READ_ROUND);
    expect(part?.kind).toBe('round');
    const data = part!.data as StudioData['round'];
    const holes = 'holes' in data ? data.holes : [];
    expect(holes).toHaveLength(18);
    expect(holes[0]).toEqual({ n: 1, par: expect.any(Number), score: expect.any(Number) });
    expect(data.title).toMatch(/Ridgeline/);
    expect(data.title).toMatch(/75, 3 over$/);
    expect(data.href).toBe((detailOf(STUDIO_READ_ROUND).round as { href: string }).href);
  });

  it('leaves a round posted as a total, an empty read and any other read to their evidence', () => {
    const round = detailOf(STUDIO_READ_ROUND);
    expect(fromRead(read({ ...round, holes: [] }))).toBeNull();
    expect(fromRead(read({ ...round, holes: [{ hole_number: 1, par: 4, score: null }] }))).toBeNull();
    expect(fromRead(read({ zone: 'America/Chicago', events: [] }))).toBeNull();
    expect(fromRead(read({ ...detailOf(STUDIO_READ_BOARD), standings: [] }))).toBeNull();
    expect(fromRead({ ...STUDIO_READ_SCHEDULE, coverage: 'empty' })).toBeNull();
    expect(fromRead({ ...STUDIO_READ_BOARD, coverage: 'unavailable' })).toBeNull();
    expect(fromRead(read({ kind: 'sg_breakdown', legs: [] }))).toBeNull();
    expect(fromRead(read(null))).toBeNull();
  });
});
