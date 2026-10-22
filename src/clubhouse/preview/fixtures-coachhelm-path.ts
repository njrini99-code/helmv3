import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import type { InsightCause, InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import { toChInsight } from '../data/coachhelm-map';
import { firstName, type ChCoachHelmData, type ChCoachPlayer } from '../data/coachhelm-shape';
import type { ChViewer } from '../data/coachhelm-voice';
import { bigNumber, breakBias, HELM_PLAYERS, penalties, PREVIEW_HELM_COACH, PREVIEW_TOUR, slope } from './fixtures-coachhelm';

/**
 * The coach Board's path line (design call D2), one preview state per source: the engine's counted cause path (`?state=path`),
 * the honest fallback on a row that carries only the generators' placeholder cause (`?state=fallback`), a narrowing the engine
 * stored, drawn as chips (`?state=narrowing`), and players with no read yet as By player rows (`?state=noreads`). Each row is an
 * `EvidenceInsight` in the shape the engine writes and goes through the loader's own mapper, so the preview cannot draw what the
 * page cannot.
 */

const coachOf = (p: { name: string }): ChViewer => ({ role: 'coach', first: firstName(p.name) });
const patch = (ins: EvidenceInsight, extra: Partial<InsightEvidence>): EvidenceInsight => ({ ...ins, evidence: { ...ins.evidence, ...extra } });
const card = (p: { id: string; name: string }, ins: EvidenceInsight, count: number): ChCoachPlayer => ({
  id: p.id,
  name: p.name,
  count,
  top: toChInsight(ins, { tour: PREVIEW_TOUR, viewer: coachOf(p) }),
});

const baseCause: InsightCause = {
  state: 'not_traced',
  population: null,
  window: null,
  path: null,
  occurrences: null,
  denominator: null,
  distinct_rounds: null,
  example_holes: [],
  event_strokes: null,
  checked: { holes_with_full_record: 0, of: 0, fields_missing: [] },
  alternatives: [],
  data_gap: null,
  coach_override: null,
};

/** Penalties with a counted path (Slice 2, observed_sequence): 5 of 7 penalties came after a driver into the water, over 4 rounds. */
const penaltiesTraced = (playerId: string, id: string) =>
  patch(penalties(playerId, id), {
    rounds_n: 21,
    cause: { ...baseCause, state: 'observed_sequence', population: 'penalties', path: ['driver off the tee', 'into the water'], occurrences: 5, denominator: 7, distinct_rounds: 4 },
  });

/** Greens hit from 175+ yd with a stored narrowing (175+ yd › long par 4s › short-right) and the likely cause it led to. */
const approachNarrowed = (playerId: string, id: string): EvidenceInsight => {
  const base = penalties(playerId, id);
  return {
    ...base,
    category: 'approach',
    priority: 'high',
    title: 'Greens hit from 175+ yd: 43%',
    content: 'From 175 yards and out you hit 43% of greens, against 52% for the Tour. Most of the misses finish short and right on the long par 4s.',
    evidence: {
      ...base.evidence,
      metric: 'gir_175_plus',
      metric_label: 'Greens hit from 175+ yd',
      unit: 'percent',
      polarity: 'higher_better',
      your_value: 43,
      your_value_display: '43%',
      comparison_value: 52,
      comparison_label: 'PGA Tour avg',
      comparison_source: 'pga_baseline',
      secondary_value: undefined,
      secondary_label: undefined,
      secondary_source: undefined,
      sample_n: 28,
      window_basis: undefined,
      window_days: 90,
      rounds_n: 9,
      diagnosis: {
        symptom: 'Greens hit from 175+ yd: 43% over 28 approaches.',
        root_cause: 'Greens hit from 175+ yds is off its benchmark. Likely cause inferred from the aggregate, not a measured shot sequence',
        causality_level: 'inferred_hypothesis',
        drivers: [],
        recommended_action: 'Target greens hit from 175+ yds in the next practice block',
        confidence_reason: 'sample adequate',
        basis: {
          kind: 'hypothesis_policy',
          hypothesis_label: 'candidate',
          checked: ['Length of the approach', 'Par and length of the hole', 'Where the miss finished'],
          narrowing: {
            subject: 'approach',
            path: ['175+ yd', 'long par 4s', 'short-right'],
            stopped_at: null,
            steps: [
              { level: 'length', passed: true, label: '175+ yd', statement: '16 of 28 missed from 175+ yd.' },
              { level: 'par', passed: true, label: 'long par 4s', statement: '12 of 16 on long par 4s.' },
              { level: 'shape', passed: true, label: 'short-right', statement: '9 of 12 finished short-right.' },
            ],
            sentence: 'Observed, not a cause: 16 of 28 missed; 12 of 16 on long par 4s; 9 of 12 short-right.',
          },
        },
      },
      cause: {
        ...baseCause,
        state: 'inferred_hypothesis',
        population: 'approaches from 175+ yd',
        distinct_rounds: 9,
        alternatives: [{ label: 'Green missed on long par 4s', lift: 1.6, arm_a: { n: 16, failures: 12, rate: 12 / 16 }, arm_b: { n: 12, failures: 4, rate: 4 / 12 }, lower_bound: 0.05, upper_bound: 0.7 }],
      },
    },
  };
};

const { jonah, eli, priya, theo } = HELM_PLAYERS;
const REST = (skip: string): ChCoachPlayer[] =>
  [card(jonah, slope(jonah.id), 3), card(eli, penalties(eli.id, 'in-pen-eli'), 2), card(priya, breakBias(priya.id, 'in-brk-priya'), 1), card(theo, bigNumber(theo.id, 'in-dbl-theo'), 0)].filter((p) => p.id !== skip);

/** `?state=path`: Eli's penalties read leads with its counted path. */
export const PREVIEW_HELM_COACH_PATH: ChCoachHelmData = {
  ...PREVIEW_HELM_COACH,
  players: { list: [card(eli, penaltiesTraced(eli.id, 'in-pen-eli'), 2), ...REST(eli.id)], error: false },
};

/**
 * `?state=fallback`: the same read as production stores it with only the placeholder cause: the template symptom names the college
 * cohort, which is never drawn (Q-88), so the line is the measure, the count, then "Not yet traced shot by shot".
 */
const penaltiesTemplate = (playerId: string, id: string) => {
  const row = penalties(playerId, id);
  return patch(row, { rounds_n: 21, diagnosis: { ...row.evidence.diagnosis!, symptom: 'Penalties per Round: 1.1 vs College cohort avg 0.6' } });
};
export const PREVIEW_HELM_COACH_FALLBACK: ChCoachHelmData = {
  ...PREVIEW_HELM_COACH,
  players: { list: [card(eli, penaltiesTemplate(eli.id, 'in-pen-eli'), 2), ...REST(eli.id)], error: false },
};

/** `?state=narrowing`: Priya's long-approach read with the narrowing the engine stored, as chips under its path line. */
export const PREVIEW_HELM_COACH_NARROWING: ChCoachHelmData = {
  ...PREVIEW_HELM_COACH,
  players: { list: [card(priya, approachNarrowed(priya.id, 'in-gir-priya'), 2), ...REST(priya.id)], error: false },
};

/** `?state=noreads`: two roster players with no read yet, one named and one with no name on file, as By player rows. */
export const PREVIEW_HELM_COACH_NO_READS: ChCoachHelmData = {
  ...PREVIEW_HELM_COACH,
  roster: { count: 6, error: false },
  withoutSignals: 2,
  withoutNames: ['Sam Whitfield'],
};
