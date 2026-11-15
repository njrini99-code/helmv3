/**
 * An Ask strokes-gained card draws the areas of one golfer or of the team, never the two mixed and never the total (R6, R7; staging,
 * 12 Nov). A team read carrying one player's figures listed "SG approach" twice (React's duplicate-key warning on the hole's stations),
 * and the dashboard card listed "Team SG per round" and "SG total" as two rows, naming the team's total as its largest loss.
 * The envelopes take the team-stats reader's shape (readers.ts): the team's total as "Team SG per round" (sg_total), its four areas,
 * its other figures; a player's figures beside them. Synthetic ids only.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { evidenceBlocks, type AskEvidence } from '../coachhelm-chat-thread';
import type { ToolEnvelope } from '@/lib/coachhelm/v3/chat/provenance';

type M = ToolEnvelope['measurements'][number];

const TEAM = { kind: 'team' as const, id: 'team-1', label: 'Finley University' };
const COLE = { kind: 'player' as const, id: 'player-1', label: 'Cole Bennett' };

const m = (entity: M['entity'], metric_id: string, metric_label: string, value: number, unit: M['unit'] = 'strokes'): M => ({
  metric_id,
  metric_label,
  unit,
  value,
  entity,
  window_start: null,
  window_end: null,
  as_of: '2026-11-12T00:00:00Z',
  sample_size: 10,
  sample_unit: 'rounds',
  coverage: 'complete',
  coverage_note: null,
  source: 'Team Stats page',
  method: 'team_stats_window',
  denominator: null,
  direction: 'higher_better',
  benchmark: null,
});

const areas = (entity: M['entity'], [tee, approach, around, putting]: [number, number, number, number]): M[] => [
  m(entity, 'sg_tee', 'SG off the tee', tee),
  m(entity, 'sg_approach', 'SG approach', approach),
  m(entity, 'sg_around_green', 'SG around green', around),
  m(entity, 'sg_putting', 'SG putting', putting),
];

const env = (measurements: M[]): ToolEnvelope => ({ summary: 'Finley University, last 10 rounds.', measurements, series: [], detail: undefined, coverage: 'complete', coverage_note: null, as_of: '2026-11-12T00:00:00Z' }) as ToolEnvelope;

const legsOf = (blocks: AskEvidence[]) => {
  const legs = blocks.filter((b): b is Extract<AskEvidence, { kind: 'legs' }> => b.kind === 'legs');
  expect(legs).toHaveLength(1);
  return legs[0]!;
};

const TOTAL = /total|per round/i;

describe('Ask strokes gained card: one golfer’s areas, never the total (R6, R7)', () => {
  it('a team read carrying one player’s figures draws the team’s four areas once each, without either total', () => {
    const block = legsOf(
      evidenceBlocks(
        env([
          m(TEAM, 'sg_total', 'Team SG per round', -8.1),
          m(TEAM, 'scoring_average', 'Scoring average', 79.4, 'score'),
          ...areas(TEAM, [-1.1, -3.4, -1.2, -2.4]),
          m(COLE, 'sg_total', 'SG total', -8.1),
          m(COLE, 'sg_approach', 'SG approach', -2.9),
        ]),
      ),
    );
    const labels = block.rows.map((r) => r.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).toEqual(['SG off the tee', 'SG approach', 'SG around green', 'SG putting']);
    expect(labels.some((l) => TOTAL.test(l))).toBe(false);
    expect(block.title).toBe('Strokes gained, Finley University');
    // The largest loss is an area, the team's approach: not the total, and not the player's figure.
    expect(block.takeaway).toBe('Largest loss: SG approach at −3.4.');
    expect(JSON.stringify(block.table)).not.toMatch(TOTAL);
    expect(JSON.stringify(block.table)).not.toContain('−2.9');
  });

  it('the team’s own read draws its four areas, not its total beside them', () => {
    const block = legsOf(evidenceBlocks(env([m(TEAM, 'sg_total', 'Team SG per round', -8.1), ...areas(TEAM, [-1.1, -3.4, -1.2, -2.4])])));
    expect(block.rows).toHaveLength(4);
    expect(block.rows.some((r) => TOTAL.test(r.label))).toBe(false);
    expect(block.takeaway).not.toMatch(TOTAL);
  });

  it('a player’s four areas beside the team’s total alone are the player’s card', () => {
    const block = legsOf(evidenceBlocks(env([m(TEAM, 'sg_total', 'Team SG per round', -8.1), m(COLE, 'sg_total', 'SG total', -2.0), ...areas(COLE, [0.4, -1.5, -0.3, -0.6])])));
    expect(block.title).toBe('Strokes gained, Cole Bennett');
    expect(block.rows.map((r) => r.display)).toEqual(['+0.4', '−1.5', '−0.3', '−0.6']);
  });

  it('with four areas each, the team’s are drawn', () => {
    const block = legsOf(evidenceBlocks(env([...areas(COLE, [0.4, -1.5, -0.3, -0.6]), ...areas(TEAM, [-1.1, -3.4, -1.2, -2.4])])));
    expect(block.title).toBe('Strokes gained, Finley University');
    expect(block.rows.map((r) => r.display)).toEqual(['−1.1', '−3.4', '−1.2', '−2.4']);
  });
});
