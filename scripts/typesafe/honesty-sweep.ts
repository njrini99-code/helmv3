/**
 * Claim-honesty sweep over CoachHelm's pure prose generators.
 *
 * Drives every composite rule's `compose()`, every single-metric generator's
 * `composeContent()` (fixtures in ./generator-fixtures.ts) and the approach-axis readings
 * with SYNTHETIC inputs, then asks Jev the contract questions from
 * src/lib/typesafe/judgments/claim-honesty.ts about each output. Planted
 * breaches (a cause asserted as fact, an inflated figure, an over-claimed
 * sample, a verdict for an action) run alongside so detection is visible.
 * No database, no customer data, nothing written.
 *
 *   npm run typesafe:honesty            # report
 *   npm run typesafe:honesty -- --strict  # exit 1 if a REAL generator breaches
 *
 * Needs TYPESAFE_API_KEY in .env.local.
 */

import { COMPOSITE_RULES } from '@/lib/coachhelm/v3/composite/registry';
import type { CompositeMatch } from '@/lib/coachhelm/v3/composite/types';
import { approachAxisReading, axisReadingToText, type ApproachAxis } from '@/lib/coachhelm/v3/engine/diagnosis';
import { isTypeSafeConfigured } from '@/lib/typesafe/client';
import { generatorCases } from './generator-fixtures';
import {
  CLAIM_HONESTY_QUESTIONS,
  judgeClaimHonesty,
  type ClaimHonestyInput,
  type ClaimHonestyVerdict,
} from '@/lib/typesafe/judgments/claim-honesty';

const strict = process.argv.includes('--strict');
const pct = (n: number) => `${Math.round(n * 100)}%`.padStart(4);
const clip = (s: string, n = 150) => (s.length > n ? s.slice(0, n - 1) + '…' : s).replace(/\s+/g, ' ');

interface Case extends ClaimHonestyInput {
  label: string;
  /** Output of a real generator, unmodified. */
  real: boolean;
  /** For a planted case: the question that should fire. */
  expect?: keyof typeof CLAIM_HONESTY_QUESTIONS;
}

// ---------------------------------------------------------------------------
// Synthetic matches — one per composite rule, values in the ranges detect()
// produces. Only compose() runs, so nothing here needs to satisfy detect().
// ---------------------------------------------------------------------------

const MATCHES: Record<string, CompositeMatch> = {
  pressure_decel_chain: {
    source_insight_ids: ['a', 'b'],
    signals: { pressure_delta: 2.4, short_putt_signature: 'v3:putt_make:3_5ft', short_putt_value: 71, sample_n: 14 },
  },
  lag_distance_3putt: {
    source_insight_ids: ['a', 'b'],
    signals: { lag_signature: 'v3:lag', lag_value: 38, short_value: 74, three_putt_rate: 0.16, sample_n: 22 },
  },
  doubles_after_bogey: {
    source_insight_ids: [],
    signals: { opportunities: 19, compounded: 6, rate: 0.316, rounds: 5 },
  },
  bunker_miss_side_amplifier: {
    source_insight_ids: ['a', 'b'],
    signals: { sand_save_pct: 28, bias_direction: 'left', same_hole_share: 0, sample_n: 12 },
  },
  short_approach_proximity_gap: {
    source_insight_ids: ['a', 'b'],
    signals: { approach_proximity_ft: 27, scramble_pct: 41, sample_n: 18 },
  },
  short_side_scrambling_chain: {
    source_insight_ids: [],
    signals: { attempts: 16, avg_proximity: 14.2, rough_pct: 62, bunker_pct: 38 },
  },
  flyer_lie_over_the_green: {
    source_insight_ids: [],
    signals: { attempts: 9, avg_distance_yd: 148, avg_proximity_ft: 44 },
  },
  closing_hole_fatigue: {
    source_insight_ids: [],
    signals: { early_avg: 0.12, late_avg: 0.61, delta: 0.49, rounds: 6 },
  },
  front_9_starter: {
    source_insight_ids: [],
    signals: { opening_avg: 0.78, rest_avg: 0.21, delta: 0.57, rounds: 6 },
  },
};

/**
 * Direction the app's tone resolver derives for composite metrics that do not
 * stamp `polarity` themselves (all of them fall to the lower-better name
 * pattern in tone-derivation.ts except sand scrambling, a registry metric).
 */
const RESOLVED_POLARITY: Record<string, 'higher_better' | 'lower_better'> = {
  pressure_decel_chain: 'lower_better',
  doubles_after_bogey: 'lower_better',
  bunker_miss_side_amplifier: 'higher_better',
  short_side_scrambling_chain: 'lower_better',
  flyer_lie_over_the_green: 'lower_better',
  closing_hole_fatigue: 'lower_better',
  front_9_starter: 'lower_better',
};

async function realCases(): Promise<Case[]> {
  const cases: Case[] = [];
  for (const rule of COMPOSITE_RULES) {
    const match = MATCHES[rule.id];
    if (!match) {
      console.warn(`no synthetic match for rule ${rule.id}; add one to MATCHES`);
      continue;
    }
    const out = rule.compose(match);
    cases.push({
      label: `composite:${rule.id}`,
      real: true,
      title: out.title,
      text: out.content,
      // A composite's persisted evidence row carries ONE metric; the figures
      // from its other source insight(s) reach the coach through
      // `source_insight_ids`. Hand Jev the same source signals so a figure
      // that traces to a source insight is not called unsupported.
      evidence: {
        ...(out.evidence as unknown as Record<string, unknown>),
        // The app resolves a row's direction at render time
        // (insight-card/tone-derivation.ts: producer polarity → registry →
        // name pattern). Jev must be handed the same resolved direction or it
        // is guessing from the metric name, exactly as a reader would.
        polarity: (out.evidence as { polarity?: string }).polarity ?? RESOLVED_POLARITY[rule.id] ?? null,
        source_signals: match.signals,
      },
    });
  }
  // The ten single-metric generators, driven through composeContent() with
  // the aggregates in ./generator-fixtures.ts. Their evidence rows carry
  // `metric` ids the registry resolves, so no polarity stamp is needed. The
  // aggregate rides along as `source_signals`: generator prose is
  // deterministic from it, so a figure that is in the aggregate but not the
  // evidence row is true data the row omits, not an invention — the
  // question here is whether the prose says anything the DATA does not.
  for (const g of generatorCases()) {
    cases.push({
      label: g.label,
      real: true,
      title: g.composed.title,
      text: g.composed.content,
      evidence: {
        ...(g.composed.evidence as unknown as Record<string, unknown>),
        source_signals: g.aggregate as never,
      },
    });
  }
  // v2 orchestrator round builders (Package 2 rewrote these to observation →
  // check → recommendation). Private methods on the singleton, reached the
  // same way src/test/coachhelm/v2/round-builders-claim-honesty.test.ts does.
  for (const r of await roundBuilderCases()) cases.push(r);
  const axes: Array<[ApproachAxis, number, number]> = [
    ['short', 0.82, 11],
    ['long', 0.64, 14],
    ['left', 0.71, 7],
    ['right', 0.58, 19],
  ];
  for (const [axis, share, n] of axes) {
    const reading = approachAxisReading(axis, share, n);
    cases.push({
      label: `diagnosis:approach_${axis}`,
      real: true,
      title: `Approach misses finishing ${axis}`,
      text: axisReadingToText(reading),
      evidence: {
        metric: 'approach_miss_axis',
        metric_label: `Share of axis-read misses finishing ${axis}`,
        your_value: Math.round(share * 100),
        unit: 'percent',
        sample_n: n,
        window_days: 90,
      },
    });
  }
  return cases;
}

type ShotRow = {
  hole_number: number;
  shot_number: number;
  shot_type: string | null;
  distance_to_hole_before: number | null;
  distance_to_hole_after: number | null;
  distance_unit_before: string | null;
  distance_unit_after: string | null;
  lie_before: string | null;
  lie_after: string | null;
  result: string | null;
  miss_direction: string | null;
};
type HoleRow = {
  hole_number: number;
  par: number | null;
  score: number | null;
  gir: boolean | null;
  up_and_down: boolean | null;
  fairway_hit: boolean | null;
  penalty_strokes: number | null;
};
interface RoundInsight {
  headline: string;
  body: string;
  callToAction?: string;
  rankScore?: number;
  evidenceMetrics?: unknown[];
}
interface RoundBuilders {
  buildRoundSevereApproachInsight(shots: ShotRow[]): RoundInsight | null;
  buildRoundLiePenaltyInsight(shots: ShotRow[]): RoundInsight | null;
  buildRoundTeeMissInsight(shots: ShotRow[]): RoundInsight | null;
  buildRoundScrambleInsight(holes: HoleRow[]): RoundInsight | null;
}

async function roundBuilderCases(): Promise<Case[]> {
  const mod = await import('@/lib/coachhelm/v2/orchestrator');
  const b = mod.coachHelmIntelligence as unknown as RoundBuilders;
  const shot = (over: Partial<ShotRow>): ShotRow => ({
    hole_number: 1,
    shot_number: 2,
    shot_type: 'approach',
    distance_to_hole_before: 150,
    distance_to_hole_after: 30,
    distance_unit_before: 'yards',
    distance_unit_after: 'yards',
    lie_before: 'fairway',
    lie_after: 'rough',
    result: 'miss',
    miss_direction: null,
    ...over,
  });
  const approachShots = [
    shot({ distance_to_hole_before: 160, distance_to_hole_after: 40, hole_number: 1 }),
    shot({ distance_to_hole_before: 165, distance_to_hole_after: 30, hole_number: 2 }),
    shot({ distance_to_hole_before: 170, distance_to_hole_after: 12, hole_number: 3 }),
    shot({ distance_to_hole_before: 155, distance_to_hole_after: 28, hole_number: 4 }),
  ];
  const lieShots = [
    shot({ distance_to_hole_before: 160, lie_before: 'fairway', distance_to_hole_after: 10, hole_number: 1 }),
    shot({ distance_to_hole_before: 165, lie_before: 'fairway', distance_to_hole_after: 12, hole_number: 2 }),
    shot({ distance_to_hole_before: 162, lie_before: 'rough', distance_to_hole_after: 30, hole_number: 3 }),
    shot({ distance_to_hole_before: 168, lie_before: 'rough', distance_to_hole_after: 34, hole_number: 4 }),
  ];
  const teeShots = [1, 2, 3, 4].map((h) => shot({ hole_number: h, shot_type: 'tee', lie_after: 'rough', miss_direction: 'right' }));
  const holes: HoleRow[] = [1, 2, 3, 4, 5].map((h) => ({
    hole_number: h,
    par: 4,
    score: h <= 4 ? 5 : 4,
    gir: false,
    up_and_down: h > 4,
    fairway_hit: true,
    penalty_strokes: 0,
  }));
  const built: Array<[string, RoundInsight | null, unknown]> = [
    ['round:severe_approach', b.buildRoundSevereApproachInsight(approachShots), approachShots],
    ['round:lie_penalty', b.buildRoundLiePenaltyInsight(lieShots), lieShots],
    ['round:tee_miss', b.buildRoundTeeMissInsight(teeShots), teeShots],
    ['round:scramble', b.buildRoundScrambleInsight(holes), holes],
  ];
  return built.flatMap(([label, insight, rows]) => {
    if (!insight) {
      console.warn(`${label}: builder returned null for its fixture`);
      return [];
    }
    return [
      {
        label,
        real: true,
        title: insight.headline,
        text: [insight.body, insight.callToAction ?? ''].join(' ').trim(),
        evidence: {
          evidence_metrics: (insight.evidenceMetrics ?? []) as never,
          sample_n: Array.isArray(rows) ? rows.length : null,
          window_days: 1,
          window: 'one round',
          source_signals: rows as never,
        },
      },
    ];
  });
}

/** Planted breaches, each derived from a real output with one thing changed. */
function plantedCases(base: Case[]): Case[] {
  const scramble = base.find((c) => c.label === 'composite:short_side_scrambling_chain')!;
  const axisShort = base.find((c) => c.label === 'diagnosis:approach_short')!;
  const doubles = base.find((c) => c.label === 'composite:doubles_after_bogey')!;
  return [
    {
      ...axisShort,
      real: false,
      label: 'planted:cause_as_fact',
      expect: 'cause_stated_as_fact',
      text:
        '82% of the 11 misses with a distance read finished SHORT. He is under-clubbing because he does not trust his carry numbers. Have him take one more club from this range.',
    },
    {
      ...scramble,
      real: false,
      label: 'planted:unsupported_figure',
      expect: 'cites_unsupported_figure',
      text: scramble.text.replace('16 short-game shots', '31 short-game shots').replace('14 ft', '22 ft'),
    },
    {
      ...doubles,
      real: false,
      label: 'planted:overclaims_sample',
      expect: 'overclaims_sample',
      text:
        'You always compound a bogey into a double. Over 5 rounds, 6 of 19 bogeys became doubles (32%), and this has been a consistent habit all season that defines how you score.',
    },
    {
      ...scramble,
      real: false,
      label: 'planted:estimate_as_measured',
      expect: 'estimate_presented_as_measured',
      text:
        'You attempted 16 short-game shots from rough or bunker (62% from rough); the average leave was 14 ft. This measured 0.42 strokes lost per round versus tour, a gap the data confirms. Recommended: recovery reps to a 10-ft circle.',
    },
    {
      ...axisShort,
      real: false,
      label: 'planted:action_verdict',
      expect: 'action_is_verdict',
      text:
        '82% of the 11 misses with a distance read finished SHORT. The record does not say why. He must fix his club selection before the next tournament or he will keep leaving himself long.',
    },
    {
      ...doubles,
      real: false,
      label: 'planted:contradicts',
      expect: 'contradicts_evidence',
      text:
        'You rarely compound a bogey: only 6 of 19 bogeys became doubles (32%) over 5 rounds, well better than typical. Nothing to work on here. Recommended: keep the same approach after a bogey.',
    },
  ];
}

async function main() {
  if (!isTypeSafeConfigured()) {
    console.error('TYPESAFE_API_KEY is not set.');
    process.exit(1);
  }
  const real = await realCases();
  const cases = [...real, ...plantedCases(real)];
  console.log(`Claim-honesty sweep — ${real.length} generator outputs + ${cases.length - real.length} planted breaches\n`);

  const keys = Object.keys(CLAIM_HONESTY_QUESTIONS) as Array<keyof typeof CLAIM_HONESTY_QUESTIONS>;
  const short: Record<string, string> = {
    cites_unsupported_figure: 'figure',
    cause_stated_as_fact: 'cause',
    overclaims_sample: 'sample',
    contradicts_evidence: 'contra',
    estimate_presented_as_measured: 'estim',
    action_is_verdict: 'verdict',
  };

  let realBreaches = 0;
  let plantedCaught = 0;
  let plantedTotal = 0;
  const rows: Array<{ label: string; v: ClaimHonestyVerdict | null; c: Case }> = [];
  for (const c of cases) {
    const v = await judgeClaimHonesty(c);
    rows.push({ label: c.label, v, c });
  }

  console.log(`${'case'.padEnd(44)} ${keys.map((k) => short[k]!.padStart(7)).join('')}   honesty  result`);
  console.log('─'.repeat(44 + keys.length * 7 + 20));
  for (const { label, v, c } of rows) {
    if (!v) {
      console.log(`${label.padEnd(44)} (no answer)`);
      continue;
    }
    const cells = keys.map((k) => pct(v.answers[k].noul).padStart(7)).join('');
    let result: string;
    if (c.real) {
      result = v.violations.length ? `BREACH: ${v.violations.join(', ')}` : 'ok';
      if (v.violations.length) realBreaches += 1;
    } else {
      plantedTotal += 1;
      const hit = c.expect ? v.violations.includes(c.expect) : false;
      if (hit) plantedCaught += 1;
      result = hit ? `caught ${c.expect}` : `MISSED ${c.expect} (fired: ${v.violations.join(', ') || 'none'})`;
    }
    console.log(`${label.padEnd(44)} ${cells}   ${pct(v.honesty).padStart(6)}  ${result}`);
  }

  console.log('\nGenerator text under test:');
  for (const { label, c } of rows.filter((r) => r.c.real)) {
    console.log(`  ${label}: ${clip(c.text)}`);
  }

  const model = rows.find((r) => r.v)?.v?.model ?? '?';
  const avgMs = Math.round(rows.reduce((s, r) => s + (r.v?.latencyMs ?? 0), 0) / Math.max(1, rows.filter((r) => r.v).length));
  console.log(`\n${model}, avg ${avgMs}ms. Real generator breaches: ${realBreaches}/${real.length}. Planted breaches caught: ${plantedCaught}/${plantedTotal}.`);
  if (strict && realBreaches > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
