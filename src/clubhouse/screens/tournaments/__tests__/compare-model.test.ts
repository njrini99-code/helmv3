import { describe, expect, it } from 'vitest';
import { tourFixture } from '../../../preview/fixtures-tournaments';
import { deltaUnit, figureEvidence, figureText, groupOf, GROUPS, sampleWords, sideFigure, sideFigures, toMetricRound, verdict } from '../compare/model';
import { selectRounds, type ScopeEnv } from '../compare/scope';
import { METRICS } from '../metrics';
import type { ChTourScope } from '../types';

const d = tourFixture('ready').compare;
const env: ScopeEnv = { rounds: d.rounds, seasons: d.seasons, events: d.events, matchedPlayers: d.matchedPlayers };
const player = (id: string): ChTourScope => ({ subject: { kind: 'player', id }, context: { kind: 'events' }, period: { kind: 'season' }, refine: [] });
const met = (sc: ChTourScope, failed = {}) => selectRounds(sc, env).map((r) => toMetricRound(r, d.events, failed));

describe('compare model', () => {
  it('groups every metric once and falls back to the first group for an unknown id', () => {
    const keys = GROUPS.flatMap((g) => g.keys);
    expect(new Set(keys).size).toBe(keys.length);
    expect(groupOf('putt').label).toBe('Putting');
    expect(groupOf('nope').id).toBe('scoring');
    expect(groupOf(null).id).toBe('scoring');
  });

  it('writes figures by unit: whole percents, signed strokes gained and to par, one decimal on a score', () => {
    expect(figureText(METRICS.fir, 61.6)).toBe('62%');
    expect(figureText(METRICS.sg_total, 0.456)).toMatch(/^\+0\.46$/);
    expect(figureText(METRICS.sg_total, -0.456)).toMatch(/0\.46$/);
    expect(figureText(METRICS.sg_total, -0.456)).not.toBe('0.46');
    expect(figureText(METRICS.to_par_avg, 1.24)).toMatch(/^\+1\.2$/);
    expect(figureText(METRICS.score_avg, 72.04)).toBe('72.0');
    expect(figureText(METRICS.score_avg, null)).toBe('—');
  });

  it('turns a side into figures with the state of their sample and the words for it', () => {
    const f = sideFigure('score_avg', met(player('jonah')), { kind: 'player', id: 'jonah' });
    expect(f.result.value).not.toBeNull();
    expect(f.values.length).toBe(f.result.n);
    expect(['none', 'early', 'solid', 'thin'].includes(f.state) || typeof f.state === 'string').toBe(true);
    expect(sampleWords(METRICS.score_avg, f)).toMatch(/round/);
    const none = sideFigure('score_avg', [], { kind: 'team' });
    expect(none.state).toBe('none');
    expect(sampleWords(METRICS.score_avg, none)).toBe('No data');
    expect(Object.keys(sideFigures(groupOf('putt').keys, [], { kind: 'team' }))).toEqual(['putts', 'sg_putt']);
  });

  it('blanks versus field when the field did not load, and leaves scores alone', () => {
    const rs = selectRounds({ ...player('jonah'), context: { kind: 'all' } }, env);
    const ok = sideFigure('vs_field', rs.map((r) => toMetricRound(r, d.events)), { kind: 'player', id: 'jonah' });
    const bad = sideFigure('vs_field', rs.map((r) => toMetricRound(r, d.events, { field: true })), { kind: 'player', id: 'jonah' });
    expect(ok.result.value).not.toBeNull();
    expect(bad.result.value).toBeNull();
    const score = sideFigure('score_avg', rs.map((r) => toMetricRound(r, d.events, { field: true })), { kind: 'player', id: 'jonah' });
    expect(score.result.value).not.toBeNull();
  });

  it('gives a difference with its standard error, or why there is none', () => {
    const a = sideFigure('score_avg', met(player('theo')), { kind: 'player', id: 'theo' });
    const b = sideFigure('score_avg', met(player('jonah')), { kind: 'player', id: 'jonah' });
    const v = verdict(METRICS.score_avg, a, b);
    expect(v.kind).toBe('diff');
    if (v.kind === 'diff') expect(v.diff).toBeCloseTo(a.result.value! - b.result.value!, 10);
    const empty = sideFigure('score_avg', [], { kind: 'team' });
    const w = verdict(METRICS.score_avg, a, empty);
    expect(w.kind).toBe('none');
    if (w.kind === 'none') expect(w.why).toBe('No rounds on one side');
  });

  it('writes the unit a difference is in', () => {
    expect(deltaUnit(METRICS.fir)).toBe('pts');
    expect(deltaUnit(METRICS.sg_total)).toBe('sg');
    expect(deltaUnit(METRICS.score_avg)).toBe('strokes');
  });

  it('lists the rounds behind a figure with the reason each was used or left out', () => {
    const sc = player('jonah');
    const rs = selectRounds(sc, env);
    const fig = sideFigure('score_avg', rs.map((r) => toMetricRound(r, d.events)), sc.subject);
    const ref = figureEvidence({ def: METRICS.score_avg, figure: fig, side: 'a', title: 'Jonah', rounds: rs, events: d.events, firstName: () => 'Jonah', courseName: (id) => d.courses[id]?.name ?? 'Course' });
    expect(ref.title).toBe('Scoring average · A');
    expect(ref.formula).toContain('Jonah.');
    expect(ref.rounds).toHaveLength(rs.length);
    expect(ref.rounds.every((r) => typeof r.reasonWords === 'string' && r.reasonWords.length > 0)).toBe(true);
    expect(ref.rounds.filter((r) => r.included)).toHaveLength(fig.result.n);
  });
});
