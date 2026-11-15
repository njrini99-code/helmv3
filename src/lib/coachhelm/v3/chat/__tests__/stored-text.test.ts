import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/coachhelm/v3/insight-visibility', () => ({ applyInsightVisibility: <T>(q: T) => q }));

import type { CoachChatContext } from '../context';
import { getRootCauses } from '../engine-reads';
import { isTemplateSentence, measuredFacts, storedInsightText } from '../stored-text';
import { person, pgrst } from './pgrst-double';

/**
 * Most stored insights carry the same two sentences whatever was measured: a placeholder cause and a fallback action
 * (`buildDiagnosis`, v3/engine/generator-base.ts), on good-news rows too. The chat hands the model the title and the
 * figures, and the stored words only without those sentences, so an answer reasons from the numbers.
 */
const CAUSE_NOW = 'Putts per round is off its benchmark. Likely cause inferred from the aggregate, not a measured shot sequence';
const CAUSE_OLD = 'Putts per round is off its benchmark - likely cause inferred from the aggregate, not a measured shot sequence';
const ACTION = 'Target putts per round in the next practice block';

describe('the two template sentences', () => {
  it('are recognised in both stored spellings, and a measured cause is not', () => {
    expect(isTemplateSentence(CAUSE_NOW)).toBe(true);
    expect(isTemplateSentence(`${CAUSE_OLD}.`)).toBe(true);
    expect(isTemplateSentence(ACTION)).toBe(true);
    expect(isTemplateSentence(`${ACTION}.`)).toBe(true);
    expect(isTemplateSentence('Short putts are left short on 7 of 11 three-putts.')).toBe(false);
    expect(isTemplateSentence('Target the low side on left-to-right putts.')).toBe(false);
    expect(isTemplateSentence(null)).toBe(false);
  });

  it('the generator still writes them as matched here', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(`${process.cwd()}/src/lib/coachhelm/v3/engine/generator-base.ts`, 'utf8');
    expect(src).toContain('root_cause: `${evidence.metric_label} is off its benchmark. Likely cause inferred from the aggregate, not a measured shot sequence`,');
    expect(src).toContain('recommended_action: `Target ${evidence.metric_label.toLowerCase()} in the next practice block`,');
  });
});

describe('stored words as the model is handed them', () => {
  it('lose the template sentences and the research pointer, and keep what was measured', () => {
    expect(storedInsightText(`Averaging 33.1 putts over 9 rounds. ${CAUSE_NOW}. ${ACTION}.`)).toBe('Averaging 33.1 putts over 9 rounds.');
    expect(storedInsightText('Per Research doc §4, short putts are left short late in rounds.')).toBe('Short putts are left short late in rounds.');
    expect(storedInsightText('Three-putts come from first putts left short. Target lag putts from 30 feet in the next practice block.')).toBe('Three-putts come from first putts left short.');
  });

  it('are nothing at all when the template was all there was', () => {
    expect(storedInsightText(`${CAUSE_NOW}. ${ACTION}.`)).toBeNull();
    expect(storedInsightText(CAUSE_OLD)).toBeNull();
    expect(storedInsightText('   ')).toBeNull();
    expect(storedInsightText(null)).toBeNull();
  });
});

describe('what a stored read measured', () => {
  it('is its metric, the figure, what it is read against, its sample and the day its window ends', () => {
    expect(measuredFacts({ metric_label: 'Putts per round', your_value_display: '33.1', comparison_label: 'Team average', comparison_value: 31.4, sample_n: 9, window_end: '2026-11-02T00:00:00Z', diagnosis: { root_cause: CAUSE_NOW, recommended_action: ACTION } })).toEqual({
      metric_label: 'Putts per round',
      value_display: '33.1',
      comparison_label: 'Team average',
      comparison_value: 31.4,
      sample_size: 9,
      window_end: '2026-11-02',
    });
  });

  it('says null for what the row does not hold, never a zero', () => {
    expect(measuredFacts(null)).toEqual({ metric_label: null, value_display: null, comparison_label: null, comparison_value: null, sample_size: null, window_end: null });
  });
});

describe('get_coachhelm causes', () => {
  const P1 = '00000000-0000-4000-8000-000000000001';
  const coach: CoachChatContext = { coach_id: 'c1', user_id: 'u1', team_id: 'team-1', team_name: 'Rini University', timezone: 'America/New_York', roster: [person(P1, 'Eli Brandt')] };

  it('a placeholder cause is withheld; a measured one is handed over', async () => {
    const { sb } = pgrst({
      golf_coach_insights: {
        rows: [
          { id: 'i1', player_id: P1, title: 'Putting is costing strokes', category: 'putting', evidence: { cause: { state: 'inferred', word: 'Likely', text: CAUSE_NOW } } },
          { id: 'i2', player_id: P1, title: 'Three-putts', category: 'putting', evidence: { cause: { state: 'measured', word: 'Measured', text: 'First putts finish short on 7 of 11 three-putts.' } } },
        ],
      },
    });
    const out = await getRootCauses(sb, coach, { player_id: P1 });
    const causes = (out.detail as { causes: Array<{ title: string; text: string | null }> }).causes;
    expect(causes.map((c) => c.text)).toEqual([null, 'First putts finish short on 7 of 11 three-putts.']);
    expect(JSON.stringify(out)).not.toMatch(/off its benchmark|inferred from the aggregate/);
  });
});
