import { describe, expect, it } from 'vitest';
import { tourFixture } from '../../../preview/fixtures-tournaments';
import { parseScope, presetsFor, printScope, sameScope, selectRounds, summarize, type ScopeEnv, type ScopeNames } from '../compare/scope';
import type { ChTourScope } from '../types';

const d = tourFixture('ready').compare;
const env: ScopeEnv = { rounds: d.rounds, seasons: d.seasons, events: d.events, matchedPlayers: d.matchedPlayers };
const names: ScopeNames = { players: d.players, events: d.events, seasons: d.seasons, courses: d.courses };
const scope = (over: Partial<ChTourScope>): ChTourScope => ({ subject: { kind: 'team' }, context: { kind: 'all' }, period: { kind: 'season' }, refine: [], ...over });

describe('compare scope tokens', () => {
  it('prints and parses every part of a side without loss', () => {
    const cases: ChTourScope[] = [
      scope({}),
      scope({ subject: { kind: 'player', id: 'jonah' }, context: { kind: 'events' }, period: { kind: 'l10' } }),
      scope({ subject: { kind: 'matched' }, context: { kind: 'qual' }, period: { kind: 'last-season' } }),
      scope({ subject: { kind: 'lineup', eventId: 'e33' }, context: { kind: 'event', id: 'e33', rounds: [1, 3] } }),
      scope({ subject: { kind: 'group', id: 'g.1' }, context: { kind: 'course', id: 'pin' }, period: { kind: 'range', from: '2026-08-01', to: '2026-10-01' } }),
      scope({ context: { kind: 'practice' }, refine: [{ kind: '18d' }, { kind: 'shot' }, { kind: 'exclude', roundId: 'r:1.x' }] }),
    ];
    for (const c of cases) {
      const back = parseScope(printScope(c));
      expect(back).toEqual(c);
      expect(sameScope(back!, c)).toBe(true);
    }
  });

  it('reads a missing context as all rounds and a missing period as this season', () => {
    expect(parseScope('team')).toEqual(scope({}));
  });

  it('refuses a token with no one in it, or nothing at all', () => {
    expect(parseScope(null)).toBeNull();
    expect(parseScope('')).toBeNull();
    expect(parseScope('ctx:events.per:season')).toBeNull();
  });
});

describe('compare scope selection', () => {
  it('selects one player’s rounds and a pooled side without individuals, oldest first', () => {
    const jonah = selectRounds(scope({ subject: { kind: 'player', id: 'jonah' } }), env);
    expect(jonah.length).toBeGreaterThan(0);
    expect(jonah.every((r) => r.playerId === 'jonah')).toBe(true);
    expect(jonah.map((r) => r.date)).toEqual([...jonah.map((r) => r.date)].sort());
    const team = selectRounds(scope({}), env);
    expect(team.every((r) => !r.individual)).toBe(true);
  });

  it('filters by context and by an event’s rounds, ignoring the period for an event', () => {
    const events = selectRounds(scope({ context: { kind: 'events' } }), env);
    expect(events.every((r) => r.context === 'event')).toBe(true);
    const e33 = selectRounds(scope({ context: { kind: 'event', id: 'e33', rounds: null }, period: { kind: 'last-season' } }), env);
    expect(e33.length).toBeGreaterThan(0);
    expect(e33.every((r) => r.eventId === 'e33')).toBe(true);
    const r3 = selectRounds(scope({ context: { kind: 'event', id: 'e33', rounds: [3] } }), env);
    expect(r3.every((r) => r.roundNumber === 3)).toBe(true);
    expect(r3.length).toBeLessThan(e33.length);
  });

  it('keeps the last N rounds of each player for a rolling period, and applies refinements', () => {
    const l10 = selectRounds(scope({ subject: { kind: 'player', id: 'jonah' }, period: { kind: 'l10' } }), env);
    expect(l10.length).toBeLessThanOrEqual(10);
    const all = selectRounds(scope({ subject: { kind: 'player', id: 'jonah' } }), env);
    const dropped = selectRounds(scope({ subject: { kind: 'player', id: 'jonah' }, refine: [{ kind: 'exclude', roundId: all[0]!.id }] }), env);
    expect(dropped).toHaveLength(all.length - 1);
    const eighteen = selectRounds(scope({ refine: [{ kind: '18d' }] }), env);
    expect(eighteen.every((r) => r.holes === 18)).toBe(true);
  });

  it('selects nothing for a subject it cannot place', () => {
    expect(selectRounds(scope({ subject: { kind: 'field', eventId: 'e33' } }), env)).toEqual([]);
  });

  it('summarizes counts, dates and shot data', () => {
    const rs = selectRounds(scope({ subject: { kind: 'player', id: 'jonah' }, context: { kind: 'events' } }), env);
    const s = summarize(rs);
    expect(s.n).toBe(rs.length);
    expect(s.full + s.nine).toBe(s.n);
    expect(s.shot).toBeLessThanOrEqual(s.full);
    expect(s.from! <= s.to!).toBe(true);
    expect(s.players).toBe(1);
    expect(summarize([])).toMatchObject({ n: 0, from: null, to: null });
  });

  it('offers presets only for the players and events the data holds, each with two distinct sides', () => {
    const ps = presetsFor(env, names);
    expect(ps.length).toBeGreaterThan(0);
    for (const p of ps) {
      expect(p.label.length).toBeGreaterThan(0);
      expect(sameScope(p.a, p.b)).toBe(false);
    }
    expect(new Set(ps.map((p) => p.key)).size).toBe(ps.length);
    expect(presetsFor({ ...env, events: [], matchedPlayers: [] }, names)).toEqual([]);
  });
});
