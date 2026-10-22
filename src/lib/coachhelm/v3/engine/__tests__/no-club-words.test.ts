/**
 * CoachHelm does not do clubs (owner rule): a read names the shot type, and
 * driver vs not-driver off the tee, and nothing else. One table over every
 * generator, insight angle and composite fixture (the coach-voice fixtures),
 * in the player's copy and the coach's, plus the wording that reaches a reader
 * outside title and content: the diagnosis on the evidence, the approach-miss
 * check and action, the driver-vs-penalties pair lines, and the tee path's
 * practice focus. "Driver" is allowed.
 */
import { describe, it, expect } from 'vitest';
import { CLUB_WORDS } from '../coach-voice';
import { approachAxisReading, type ApproachAxis } from '../diagnosis';
import { observedAction } from '../root-cause';
import { strategyPairLines } from '@/lib/coachhelm/v3/lifecycle/delivery-shape';
import type { ConflictRecord } from '@/lib/coachhelm/v3/lifecycle/types';
import { COMPOSERS, FIXTURES } from './coach-copy-fixtures';

/** Every user-facing string a composed read carries, labelled by where it sits. */
function readStrings(c: ReturnType<(typeof COMPOSERS)[string]>): [string, string][] {
  const out: [string, string][] = [
    ['player title', c.title],
    ['player content', c.content],
  ];
  if (c.coach) out.push(['coach title', c.coach.title], ['coach content', c.coach.content]);
  const ev = (c.evidence ?? {}) as unknown as Record<string, unknown>;
  if (typeof ev.metric_label === 'string') out.push(['metric_label', ev.metric_label]);
  const dx = ev.diagnosis as Record<string, unknown> | undefined;
  for (const k of ['symptom', 'root_cause', 'recommended_action'] as const) {
    if (typeof dx?.[k] === 'string') out.push([`diagnosis.${k}`, dx[k] as string]);
  }
  return out;
}

describe('no club words in CoachHelm read copy', () => {
  it('the guard allows driver and shot type, and catches club names', () => {
    for (const ok of ['driver', 'non-driver tee shots', 'short approach', 'inside 100', 'coming up short', 'off the tee']) {
      expect(ok).not.toMatch(CLUB_WORDS);
    }
    for (const bad of ['tee fairway clubs', 'under-clubbing', 'a wedge number', '7-iron', '3-wood', 'hybrid', 'the putter', 'your bag']) {
      expect(bad).toMatch(CLUB_WORDS);
    }
  });

  const rows = FIXTURES.flatMap((f, i) => {
    const c = COMPOSERS[f.g]!(f.agg);
    return readStrings(c).map(([where, text]) => ({ name: `${f.g} #${i} ${where}`, text }));
  });

  it('covers every composer in both voices', () => {
    expect(rows.length).toBeGreaterThan(FIXTURES.length * 4 - 1);
  });

  it.each(rows)('$name', ({ text }) => {
    expect(text).not.toMatch(CLUB_WORDS);
  });

  it.each<ApproachAxis>(['short', 'long', 'left', 'right'])('approach-miss %s check and action', (axis) => {
    const r = approachAxisReading(axis, 0.7, 40);
    for (const text of [r.observation, r.check, r.action]) expect(text).not.toMatch(CLUB_WORDS);
  });

  it('driver-vs-penalties pair lines, with and without a net', () => {
    const conflict: ConflictRecord = {
      with_insight_id: 'p',
      kind: 'opposing_strategy',
      role: 'paired',
      net_strokes: -0.4,
      resolution: 'net_favours_layback',
      subject: 'driver_vs_penalties',
      link: { penalties: 7, penalties_after_driver: 5, rounds_n: 9 },
      computed_at: '2026-10-18T03:00:00.000Z',
    };
    for (const voice of ['player', 'coach'] as const) {
      for (const c of [conflict, { ...conflict, net_strokes: null }]) {
        for (const line of strategyPairLines(c, voice)) expect(line).not.toMatch(CLUB_WORDS);
      }
    }
  });

  it('the tee path practice focus', () => {
    const text = observedAction({ family: 'tee', rollup: 'coverage' } as Parameters<typeof observedAction>[0], 'driver missed right into rough → approach missed the green');
    expect(text).not.toMatch(CLUB_WORDS);
    expect(text).toContain('driver');
  });
});
