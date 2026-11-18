import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { TeamFixture, tenRounds } from '../../__tests__/fixtures';
import type { TeamRows } from '../../fact-sheet';
import { buildTeamReads } from '../build';
import { FOCUS_HORIZON_ROUNDS, focusRead } from '../focus';
import { decideNext } from '../memory';
import type { ReadPayload } from '../types';

/** A season: five players, twenty rounds each; one improves on approach halfway, one gets worse on putting. */
function season(): TeamFixture {
  const fx = new TeamFixture();
  fx.player('improver', [...tenRounds(2, { tee: -0.5, approach: -0.3, around: -0.5, putting: -0.5 }), ...tenRounds(52, { tee: -0.5, approach: -3, around: -0.5, putting: -0.5 })]);
  fx.player('slipper', [...tenRounds(3, { tee: -0.4, approach: -0.6, around: -0.4, putting: -2.5 }), ...tenRounds(53, { tee: -0.4, approach: -0.6, around: -0.4, putting: -0.4 })]);
  for (let i = 0; i < 3; i++) fx.player(`steady-${i}`, [...tenRounds(4 + i, { tee: -1, approach: -1.6, around: -0.6, putting: -0.7 }), ...tenRounds(54 + i, { tee: -1, approach: -1.6, around: -0.6, putting: -0.7 })]);
  return fx;
}

/** The rows as they stood at the end of a day. */
function asOf(rows: TeamRows, day: string): TeamRows {
  const rounds = rows.rounds.filter((r) => r.round_date <= day);
  const ids = new Set(rounds.map((r) => r.id));
  return { ...rows, rounds, roundCache: rows.roundCache.filter((c) => ids.has(c.round_id)), holes: rows.holes.filter((h) => ids.has(h.round_id)), shots: rows.shots.filter((s) => ids.has(s.round_id)), now: new Date(`${day}T22:00:00Z`) };
}

describe('stage 4: a season replayed in date order', () => {
  const rows = season().rows();
  const days = [...new Set(rows.rounds.map((r) => r.round_date))].sort();
  const saved = new Map<string, ReadPayload[]>();
  for (const day of days) {
    for (const fresh of buildTeamReads(asOf(rows, day)).payloads) {
      const list = saved.get(fresh.player_id) ?? [];
      list.push(decideNext(list[list.length - 1] ?? null, fresh));
      saved.set(fresh.player_id, list);
    }
  }

  it('no flicker: the words change only at a checkpoint', () => {
    for (const list of saved.values()) {
      for (let i = 1; i < list.length; i++) {
        const [a, b] = [list[i - 1]!, list[i]!];
        if (a.priority && b.priority && !b.memory!.at_checkpoint) {
          expect(b.priority.headline).toBe(a.priority.headline);
          expect(b.priority.how_we_found).toEqual(a.priority.how_we_found);
        }
      }
      const changes = list.filter((p, i) => i > 0 && p.priority?.headline !== list[i - 1]!.priority?.headline).length;
      expect(changes).toBeLessThanOrEqual(Math.ceil(list.length / 3) + 1);
    }
  });

  it('no repeats: the same change is never said twice in a row', () => {
    for (const list of saved.values()) {
      const lines = list.map((p) => p.memory!.change_line).filter((l): l is string => !!l);
      for (let i = 1; i < lines.length; i++) expect(lines[i]).not.toBe(lines[i - 1]);
    }
  });

  it('every retirement is explained, and nothing is silently dropped', () => {
    for (const list of saved.values()) {
      const last = list[list.length - 1]!;
      for (const h of last.memory!.history) expect(h.why.length).toBeGreaterThan(10);
      const keys = new Set(list.flatMap((p) => (p.priority ? [p.priority.key] : [])));
      for (const k of keys) if (k !== last.priority?.key) expect(last.memory!.history.some((h) => h.card_key === k)).toBe(true);
    }
  });

  it('the improver’s approach card moves on, with a reason', () => {
    const list = saved.get('improver')!;
    const keys = list.flatMap((p) => (p.priority ? [p.priority.key] : []));
    expect(keys[0]).toBe('priority:strokes_gained_approach');
    const last = list[list.length - 1]!;
    if (last.priority?.key !== 'priority:strokes_gained_approach') expect(last.memory!.history.find((h) => h.card_key === 'priority:strokes_gained_approach')!.why).toBeTruthy();
  });
});

describe('stage 4: since the focus was set', () => {
  const rows = new TeamFixture().player('p', [...tenRounds(2, { tee: -0.5, approach: -0.4, around: -0.5, putting: -0.5 }), ...tenRounds(52, { tee: -0.5, approach: -2, around: -0.5, putting: -0.5 })]).rows();
  const sheet = buildTeamReads(rows).sheets[0]!;
  const dates = sheet.strokes_gained_by_round_season.map((r) => r.date).sort();
  const link = { card_key: 'priority:strokes_gained_approach', part: 'strokes_gained_approach' as const, value_on_day: 2, rounds_on_day: 10, team_lost_on_day: 1.5 };
  it('says the rounds since and the number on the day', () => {
    const r = focusRead({ ...link, set_on: dates[dates.length - 4]! }, sheet);
    expect(r.rounds_since).toBe(3);
    expect(r.since_text).toMatch(/^Since the focus was set \(3 rounds\): 0\.\d a round lost, was 2\.0\.$/);
    expect(r.word).toBe('too_early');
  });
  it('at the horizon gives one word against the drift the number would have had anyway', () => {
    const r = focusRead({ ...link, set_on: dates[9]! }, sheet);
    expect(r.rounds_since).toBe(FOCUS_HORIZON_ROUNDS);
    expect(r.expected_without_focus).toBeCloseTo((10 * 2 + 5 * 1.5) / 15, 6);
    expect(['worked', 'moved']).toContain(r.word);
    const worse = focusRead({ ...link, value_on_day: 0.1, team_lost_on_day: 0.1, set_on: dates[9]! }, { strokes_gained_by_round_season: sheet.strokes_gained_by_round_season.map((x) => ({ ...x, approach: (x.approach ?? 0) - 3 })) });
    expect(worse.word).toBe('got_worse');
  });
  it('cannot tell with no round logged since', () => {
    expect(focusRead({ ...link, set_on: '2099-01-01' }, sheet).word).toBe('cant_tell');
  });
});
