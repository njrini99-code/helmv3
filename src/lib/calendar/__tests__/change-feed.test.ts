import { describe, expect, it } from 'vitest';
import { feedChangeLines, type FeedChangeRow } from '../change-feed';

const TZ = 'America/New_York';
const NOW = Date.parse('2026-10-14T18:40:00Z');
const AT = '2026-10-14T18:14:00.000Z';
const base = { start_time: '2026-10-15T17:00:00Z', end_time: '2026-10-15T17:45:00Z', all_day: false, location: 'Team room', title: 'Range', event_type: 'practice', cancelled: false };
const stored = (over: Record<string, unknown> = {}) => ({ v: 1, id: 's1', first_at: AT, at: AT, by: 'c2', by_names: ['Sam Okafor'], from: base, fields: ['start_time', 'end_time'], ...over });
const row = (over: Partial<FeedChangeRow> = {}): FeedChangeRow => ({ id: 'e1', start_time: '2026-10-15T17:30:00Z', end_time: '2026-10-15T18:15:00Z', all_day: false, location: 'Team room', title: 'Range', event_type: 'practice', status: 'confirmed', change: stored(), ...over });
const lines = (rows: FeedChangeRow[], nowMs = NOW) => feedChangeLines(rows, { timeZone: TZ, nowMs });

describe('feedChangeLines', () => {
  it('writes the line for a live mark, with who and the day', () => {
    expect(lines([row()]).get('e1')).toBe('Moved from 1:00 PM by Coach Okafor on Wed 14 October.');
  });

  it('says a cancellation and a place change in their own words', () => {
    expect(lines([row({ status: 'cancelled', change: stored({ fields: ['cancelled'] }) })]).get('e1')).toMatch(/^Cancelled by Coach Okafor on /);
    expect(lines([row({ location: 'Finley range', start_time: base.start_time, end_time: base.end_time, change: stored({ fields: ['location'] }) })]).get('e1')).toMatch(/^Now at Finley range, was Team room by Coach Okafor/);
  });

  it('adds nothing for no mark, a class, an unreadable mark, a mark past 72 hours or an event that has ended', () => {
    expect(lines([row({ change: null }), row({ id: 'c', event_type: 'class' }), row({ id: 'g', change: { v: 7 } })]).size).toBe(0);
    expect(lines([row()], Date.parse('2026-10-18T00:00:00Z')).size).toBe(0);
    expect(lines([row()], Date.parse('2026-10-15T19:00:00Z')).size).toBe(0);
  });

  it('gives each occurrence of a series its own line', () => {
    const a = row({ id: 'a' });
    const b = row({ id: 'b', start_time: '2026-10-16T17:30:00Z', end_time: '2026-10-16T18:15:00Z', change: stored({ from: { ...base, start_time: '2026-10-16T17:00:00Z', end_time: '2026-10-16T17:45:00Z' } }) });
    const out = lines([a, b]);
    expect([...out.keys()]).toEqual(['a', 'b']);
    expect(out.get('b')).toMatch(/^Moved from 1:00 PM/);
  });
});
