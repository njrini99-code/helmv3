import { describe, expect, it } from 'vitest';
import { isoDay } from '../../lib/dates';
import { tourFixture } from '../../preview/fixtures-tournaments';
import { rowsOf } from '../../__tests__/tournament-rows';
import { eventShow, roundShow, shapeEvent } from '../tournaments-shape';

/**
 * What a coach is told about a round and an event, on the team's calendar day (coach audit 13 Nov 2026, §10–§11): Tar Heel
 * R1 sat `live` from 25 Oct and Home, Rounds and Tournaments said "Live now" for 18 days; the Carolinas Classic (6–8 Nov)
 * still said "Upcoming" after it ended. Nothing is migrated: the stored status stays, and what is shown is derived.
 */
describe('roundShow', () => {
  const TODAY = '2026-11-12';
  it('a round left live on a past day needs closing (Tar Heel R1)', () => {
    expect(roundShow({ status: 'live', date: '2026-10-25' }, TODAY)).toBe('needs_closing');
  });
  it('a round never started on a past day needs closing (Carolinas R3)', () => {
    expect(roundShow({ status: 'upcoming', date: '2026-11-08' }, TODAY)).toBe('needs_closing');
  });
  it('a round dated tomorrow is upcoming, and today on its day', () => {
    expect(roundShow({ status: 'upcoming', date: '2026-11-13' }, '2026-11-12')).toBe('upcoming');
    expect(roundShow({ status: 'upcoming', date: '2026-11-13' }, '2026-11-13')).toBe('today');
  });
  it('live only when it is live and dated today', () => {
    expect(roundShow({ status: 'live', date: TODAY }, TODAY)).toBe('live');
    expect(roundShow({ status: 'live', date: '2026-11-13' }, TODAY)).toBe('upcoming');
  });
  it('a suspended round is not live: today it is today, on a past day it needs closing', () => {
    expect(roundShow({ status: 'suspended', date: TODAY }, TODAY)).toBe('today');
    expect(roundShow({ status: 'suspended_weather', date: '2026-11-01' }, TODAY)).toBe('needs_closing');
  });
  it('a final or official round is final whatever its day', () => {
    expect(roundShow({ status: 'final', date: '2026-10-01' }, TODAY)).toBe('final');
    expect(roundShow({ status: 'official', date: '2026-10-01' }, TODAY)).toBe('final');
  });
  it('the team’s day, not the UTC day: 23:30 ET on 12 Nov is still the 12th (Review Focus #4)', () => {
    expect(isoDay('2026-11-13T04:30:00Z', 'America/New_York')).toBe('2026-11-12');
  });
});

describe('eventShow', () => {
  const TODAY = '2026-11-12';
  it('Tar Heel: R1 left live, R2 never started, both past: needs closing, R1 first, and R1 is live', () => {
    expect(eventShow([{ number: 1, status: 'live', date: '2026-10-25' }, { number: 2, status: 'upcoming', date: '2026-10-26' }], TODAY)).toEqual({ show: 'needs_closing', close: { round: 1, live: true } });
  });
  it('Carolinas: three rounds never started, all past: needs closing from R1', () => {
    const rounds = ['2026-11-06', '2026-11-07', '2026-11-08'].map((date, i) => ({ number: i + 1, status: 'upcoming', date }));
    expect(eventShow(rounds, TODAY)).toEqual({ show: 'needs_closing', close: { round: 1, live: false } });
  });
  it('an event whose R1 is final and R2 is live today is live', () => {
    expect(eventShow([{ number: 1, status: 'final', date: '2026-11-11' }, { number: 2, status: 'live', date: TODAY }], TODAY)).toEqual({ show: 'live', close: null });
  });
  it('an event starting today is today; tomorrow, upcoming', () => {
    expect(eventShow([{ number: 1, status: 'upcoming', date: TODAY }], TODAY).show).toBe('today');
    expect(eventShow([{ number: 1, status: 'upcoming', date: '2026-11-13' }], TODAY).show).toBe('upcoming');
  });
  it('every round final is final; a cancelled round never holds the event open', () => {
    expect(eventShow([{ number: 1, status: 'final', date: '2026-11-01' }], TODAY).show).toBe('final');
    expect(eventShow([{ number: 1, status: 'final', date: '2026-11-01' }, { number: 2, status: 'upcoming', date: '2026-11-02', cancelled: true }], TODAY).show).toBe('final');
  });
});

describe('shapeEvent carries the display state for the team’s day', () => {
  it('an event the fixture calls upcoming, read after its last round, needs closing', () => {
    const fixture = tourFixture('ready').desks.e34!.event;
    const raw = rowsOf(fixture);
    const after = raw.rounds.map((r) => r.date).sort().at(-1)!;
    const later = `${after.slice(0, 8)}${String(Number(after.slice(8)) + 1).padStart(2, '0')}`;
    const shaped = shapeEvent({ ...raw, rounds: raw.rounds.map((r) => ({ ...r, status: 'upcoming' })) }, `${later}T16:00:00.000Z`, later);
    expect(shaped.show).toBe('needs_closing');
    expect(shaped.close).toEqual({ round: 1, live: false });
  });
});
