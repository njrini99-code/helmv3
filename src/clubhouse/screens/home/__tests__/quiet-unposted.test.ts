import { describe, expect, it } from 'vitest';
import { homeSubline, quietOf, type ChSublineRow } from '../model';

/*
 * Launch readiness 2026-11-15, DF-C-04: the quietest players were never named. A player with no eighteen this season had no count
 * (Home counted days from the season's rounds only, and Roster from the season's last round), so Home's brief and Roster's Needs a
 * look skipped exactly the players who had gone longest. Both now count from the newest counted round in the year's read (a nine, or
 * one before the season), and a player with none is quiet since the season started, or since they joined if that is later.
 * HOME-S5's own case, a player with no count, is still never a sentence.
 */

const on = (name: string): ChSublineRow => ({ name, status: 'improving', quietDays: 2 });
const quietRow = (name: string, days: number): ChSublineRow => ({ name, status: 'steady', quietDays: days });
const opts = { roundsError: false, nextCompetition: null };

describe('quietOf: one count for Home and Roster (DF-C-04)', () => {
  it('counts from the newest counted round when there is one, before the season or not', () => {
    expect(quietOf('2026-11-10', { seasonStart: '2026-08-01' }, '2026-11-15')).toEqual({ days: 5, none: false });
    expect(quietOf('2026-05-20', { seasonStart: '2026-08-01' }, '2026-11-15')).toEqual({ days: 179, none: false });
  });

  it('with none, counts from the season’s start, or from joining when that is later, and says so', () => {
    expect(quietOf(null, { seasonStart: '2026-08-01' }, '2026-11-15')).toEqual({ days: 106, none: true });
    expect(quietOf(null, { seasonStart: '2026-08-01', joined: '2026-03-02T15:00:00Z' }, '2026-11-15')).toEqual({ days: 106, none: true });
    expect(quietOf(null, { seasonStart: '2026-08-01', joined: '2026-11-12T15:00:00Z' }, '2026-11-15')).toEqual({ days: 3, none: true });
  });
});

describe('Home’s brief names the quietest players (DF-C-04)', () => {
  it('a player with no round this season is named as that', () => {
    expect(homeSubline([on('Theo Marchetti')], { ...opts, unposted: [{ name: 'Ava Lin', quietDays: 106, none: true }] })).toBe(
      'Ava hasn’t posted a round this season. The others with enough rounds are on track.',
    );
  });

  it('a player whose last round was a nine or before the season is named with their days', () => {
    expect(homeSubline([on('Theo Marchetti')], { ...opts, unposted: [{ name: 'Ben Ruiz', quietDays: 179, none: false }] })).toBe(
      'Ben hasn’t posted a round in 179 days. The others with enough rounds are on track.',
    );
  });

  it('never names one who joined days ago, one who is out, or one with no count (HOME-S5)', () => {
    const unposted = [
      { name: 'Cal New', quietDays: 3, none: true },
      { name: 'Dev Hurt', quietDays: 106, none: true, availability: 'injured' as const },
      { name: 'Audit Testplayer' },
    ];
    expect(homeSubline([on('Theo Marchetti')], { ...opts, unposted })).toBe('Everyone with enough rounds is on track.');
  });

  it('three or more: all without a round this season are one sentence; a mix says how many have none', () => {
    const none = (name: string) => ({ name, quietDays: 106, none: true });
    expect(homeSubline([on('Theo Marchetti')], { ...opts, unposted: [none('Ava Lin'), none('Ben Ruiz'), none('Cy Park')] })).toBe(
      '3 players haven’t posted a round this season. The others with enough rounds are on track.',
    );
    expect(homeSubline([quietRow('Eli Ross', 9), quietRow('Finn Hale', 12), on('Theo Marchetti')], { ...opts, unposted: [none('Ava Lin')] })).toBe(
      '3 players haven’t posted a round in 9+ days. Ava hasn’t posted one this season. The others with enough rounds are on track.',
    );
    expect(homeSubline([quietRow('Eli Ross', 9)], { ...opts, unposted: [none('Ava Lin'), none('Ben Ruiz')] })).toBe(
      '3 players haven’t posted a round in 9+ days. 2 of them haven’t posted one this season.',
    );
  });
});
