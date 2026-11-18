import { describe, expect, it, vi } from 'vitest';
import { holeRounds as chHoleRounds } from '@/clubhouse/data/round-scope';
import type { ChRound } from '@/clubhouse/data/season';
import { sgOver } from '@/clubhouse/data/stats-weight';
import { countedRounds } from '../../rounds';
import { buildTeamReads } from '../build';
import { contentHash, stableJson } from '../hash';
import { changedRows, rowFor } from '../store';
import { readsTeam } from './team';

vi.mock('server-only', () => ({}));

const fx = readsTeam();
const rows = fx.rows();
const { sheets, payloads } = buildTeamReads(rows);

describe('the evidence rounds', () => {
  it('carry course, score and date, and the shots and holes that carry the read, all from that round', () => {
    // A part whose shots fall in fewer than two bands is not traced and has no rounds to show (fixtures log no
    // chips, so around the green is never traced); every traced one shows its rounds.
    expect(payloads.filter((p) => p.priority!.evidence.length > 0).length).toBeGreaterThanOrEqual(3);
    for (const p of payloads) {
      const c = p.priority!;
      if (c.where.finding === 'not_traced') expect(c.evidence).toEqual([]);
      else expect(c.evidence.length).toBeGreaterThan(0);
      expect(c.evidence.length).toBeLessThanOrEqual(5);
      for (const e of c.evidence) {
        const round = rows.rounds.find((r) => r.id === e.round_id)!;
        expect(round.player_id).toBe(p.player_id);
        expect(e.course).toBe(round.course_name);
        expect(e.total_score).toBe(round.total_score);
        expect(e.date).toBe(round.round_date.slice(0, 10));
        expect(e.score_text).toMatch(/^\d+/);
        expect(e.carry.length).toBeGreaterThan(0);
        expect(e.carry.length).toBeLessThanOrEqual(Math.min(5, e.shots));
        for (const s of e.carry) {
          const shot = rows.shots.find((x) => x.id === s.shot_id)!;
          expect(shot.round_id).toBe(e.round_id);
          if (shot.hole_number != null) expect(e.holes).toContain(shot.hole_number);
        }
        // Worst first, and the line states the round's own count and strokes.
        const sg = e.carry.map((s) => s.strokes_gained);
        expect([...sg].sort((a, b) => a - b)).toEqual(sg);
        expect(e.line).toContain(String(e.shots));
      }
      // The rounds are the analyst's: worst first.
      const lost = c.evidence.map((e) => e.strokes_gained);
      expect([...lost].sort((a, b) => a - b)).toEqual(lost);
    }
  });
});

describe('the saved payload against the Stats screens (parity)', () => {
  it('the four parts and the strokes lost a round equal the Stats function over the same rounds', () => {
    for (const [i, p] of payloads.entries()) {
      const sheet = sheets[i]!;
      const ids = new Set(sheet.strokes_gained_by_round_season.filter((r) => r.measured).map((r) => r.round_id));
      const ch = countedRounds(rows.rounds)
        .filter((r) => ids.has(r.id))
        .map(({ total_only: _t, ...r }) => ({ ...r, course_name: r.course_name ?? null, tees_played: null, total_gir: null, total_gir_possible: null, total_fairways_hit: null, total_fairways: null }) as ChRound);
      const screen = sgOver(chHoleRounds(ch));
      const parts = p.priority!.numbers.parts;
      expect(parts.strokes_gained_off_the_tee).toBeCloseTo(screen.legs.tee!, 4);
      expect(parts.strokes_gained_approach).toBeCloseTo(screen.legs.approach!, 4);
      expect(parts.strokes_gained_around_the_green).toBeCloseTo(screen.legs.around!, 4);
      expect(parts.strokes_gained_putting).toBeCloseTo(screen.legs.putting!, 4);
      const legOf = { strokes_gained_off_the_tee: 'tee', strokes_gained_approach: 'approach', strokes_gained_around_the_green: 'around', strokes_gained_putting: 'putting' } as const;
      const leg = screen.legs[legOf[p.priority!.area]]!;
      expect(p.priority!.numbers.lost_per_round).toBeCloseTo(-leg, 4);
      expect(p.figures.lost_per_round).toBe((Math.round(-leg * 10) / 10).toFixed(1));
      expect(p.priority!.numbers.rounds).toBe(ch.length);
    }
  });
});

describe('saving only what changed', () => {
  it('the hash ignores the day it was built for and nothing else', () => {
    const p = payloads[0]!;
    expect(contentHash({ ...p, as_of: '2030-01-01' })).toBe(contentHash(p));
    expect(contentHash({ ...p, figures: { ...p.figures, lost_per_round: '9.9' } })).not.toBe(contentHash(p));
    expect(stableJson({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe('{"a":[2,{"c":4,"d":3}],"b":1}');
  });

  it('writes a row only for players whose content changed', () => {
    const latest = new Map(payloads.map((p) => [p.player_id, { content_hash: contentHash(p) }]));
    expect(changedRows(payloads, latest, 'nightly', null)).toEqual([]);
    const moved = new Map(latest);
    moved.set(payloads[2]!.player_id, { content_hash: 'older' });
    const out = changedRows(payloads, moved, 'round', 'round-1');
    expect(out.map((r) => r.player_id)).toEqual([payloads[2]!.player_id]);
    expect(out[0]).toMatchObject({ trigger: 'round', round_id: 'round-1', analyst_version: 'reads-1', team_id: payloads[2]!.team_id });
    // A player with no saved read is written.
    expect(changedRows(payloads, new Map(), 'manual', null)).toHaveLength(payloads.length);
  });

  it('the row carries the read\'s through date, rounds, signature and certainty', () => {
    const p = payloads[0]!;
    const r = rowFor(p, 'nightly', null);
    expect(r).toMatchObject({ through_date: p.through_date, n_rounds: p.n_rounds, certainty: p.priority!.certainty });
    expect(r.signature).toMatch(/^strokes_gained_/);
  });

  it('is deterministic: the same rows give the same payloads', () => {
    expect(buildTeamReads(fx.rows()).payloads.map(contentHash)).toEqual(payloads.map(contentHash));
  });
});
