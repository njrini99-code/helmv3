'use client';

/**
 * Visual-test lab (dev only) — renders the new CoachHelm viz with real DUG
 * sample data so it can be screenshot tested without an authenticated
 * dashboard session. Not shipped to users.
 */

import { fairwayScope } from '@/lib/redesign/flag';
import { InstrumentPanel } from '@/components/fairway/instrument/InstrumentPanel';
import { DiagnosisPanel } from '@/components/golf/coachhelm/insights/DiagnosisPanel';
import { StrokesGainedTornado } from '@/components/fairway/charts/StrokesGainedTornado';
import {
  FairwayTrendBrain,
  type FairwayTrendBrainProps,
} from '@/components/golf/coachhelm/player/FairwayTrendBrain';
import { RoundIntelligence } from '@/components/golf/coachhelm/round-review/RoundIntelligence';
import { LeakBoard, type LeakInsight } from '@/components/golf/coachhelm/coach/LeakBoard';
import {
  GoalsSection,
  type GoalSuggestionView,
} from '@/components/fairway/pages/coachhelm/GoalsSection';
import type { FairwayGoalCardData } from '@/components/fairway/pages/coachhelm/FairwayGoalCard';
import type { Goal, GoalSuggestion } from '@/lib/coachhelm/v3/goals/types';
import type { MetricId } from '@/lib/coachhelm/v3/metrics/registry';
import type { Diagnosis } from '@/lib/coachhelm/v2/insights/types';
import type { DiagnosisTrust } from '@/components/golf/coachhelm/insights/DiagnosisPanel';
import type { SGCategory } from '@/components/fairway/charts/StrokesGainedTornado';

const SG: SGCategory[] = [
  { label: 'Off the Tee', value: 0.1 },
  { label: 'Approach', value: -0.4 },
  { label: 'Around the Green', value: -0.6 },
  { label: 'Putting', value: -0.8 },
];

const TREND_CONFIRMED: FairwayTrendBrainProps = {
  trends: {
    metric: 'score_to_par',
    signal: 'strong_improving',
    description: '',
    windows: [
      { name: 'fast', direction: 'improving', magnitude: 0.6, confidence: 0.55 },
      { name: 'medium', direction: 'improving', magnitude: 0.5, confidence: 0.7 },
      { name: 'slow', direction: 'improving', magnitude: 0.4, confidence: 0.78 },
    ],
  },
  streaks: [{ type: 'hot', length: 4, magnitude: 1.2, isOngoing: true }],
  volatility: { current: 2.3, historical: 1.1, isElevated: true },
};

const TREND_FORMING: FairwayTrendBrainProps = {
  trends: {
    metric: 'score_to_par',
    signal: 'short_term_dip',
    description: '',
    windows: [
      { name: 'fast', direction: 'declining', magnitude: 0.7, confidence: 0.4 },
      { name: 'medium', direction: 'stable', magnitude: 0.2, confidence: 0.5 },
      { name: 'slow', direction: 'improving', magnitude: 0.3, confidence: 0.65 },
    ],
  },
};

const ROUND_OPPS = [
  { category: 'Putting', potentialStrokes: 1.7, description: 'Eliminating 2 three-putts saves ~1.7 strokes' },
  { category: 'Course Management', potentialStrokes: 1.0, description: '1 penalty stroke cost 1 stroke' },
  {
    category: 'Short Game',
    potentialStrokes: 0.6,
    description: 'Improving scramble rate to 50% saves ~0.6 strokes from 5 attempts',
  },
];

const TEAM_LEAKS: LeakInsight[] = [
  { id: '1', category: 'putting', title: 'Lag distance 3-putts', strokesImpact: 0.8, priority: 'high', playerName: 'A. Rivera' },
  { id: '2', category: 'putting', title: 'Short putt misses', strokesImpact: 0.4, priority: 'medium', playerName: 'J. Park' },
  { id: '3', category: 'putting', title: '10-15 ft conversion', strokesImpact: 0.5, priority: 'urgent', playerName: 'T. Walsh' },
  { id: '4', category: 'short_game', title: 'Sand saves', strokesImpact: 0.6, priority: 'high', playerName: 'A. Rivera' },
  { id: '5', category: 'approach', title: '175+ proximity', strokesImpact: 0.5, priority: 'medium', playerName: 'M. Chen' },
  { id: '6', category: 'approach', title: 'Rough approach', strokesImpact: 0.3, priority: 'low', playerName: 'J. Park' },
  { id: '7', category: 'tee', title: 'Driver accuracy', strokesImpact: 0.2, priority: 'low', playerName: 'M. Chen' },
];

const ROUND_COACH = {
  primaryTakeaway: 'Your putter cost you today.',
  practicePriority: 'Spend 20 minutes on lag putting from 30+ feet before your next round.',
  focusAreas: ['Lag putting', 'Tee accuracy'],
  confidence: 0.62,
};

/* ── Goals demo data (DUG-shaped) ─────────────────────────────────────────── */

function snaps(values: number[]): { date: string; value: number }[] {
  const today = Date.now();
  return values.map((value, i) => ({
    date: new Date(today - (values.length - 1 - i) * 3 * 86400000).toISOString().slice(0, 10),
    value,
  }));
}

function mkGoal(p: Partial<Goal> & { id: string; metric_id: MetricId }): Goal {
  const nowIso = new Date().toISOString();
  return {
    player_id: 'demo-player',
    team_id: 'demo-team',
    created_by_user_id: 'demo-user',
    creator_role: 'player',
    coach_id_if_assigned: null,
    title: '',
    category: 'manual',
    started_at: nowIso,
    ends_at: new Date(Date.now() + 20 * 86400000).toISOString(),
    window_days: 30,
    baseline_value: null,
    current_value: null,
    target_value: null,
    target_source: null,
    state: 'active',
    outcome_evaluated_at: null,
    shared_with_coach: false,
    shared_at: null,
    coach_assignment_mode: null,
    player_accepted_at: null,
    player_declined_at: null,
    origin: 'manual',
    origin_insight_id: null,
    snapshots: [],
    created_at: nowIso,
    updated_at: nowIso,
    ...p,
  };
}

const GOALS: FairwayGoalCardData[] = [
  {
    goal: mkGoal({
      id: 'g-coach',
      metric_id: 'sg_putting',
      creator_role: 'coach',
      coach_id_if_assigned: 'c1',
      coach_assignment_mode: 'suggested',
      baseline_value: -0.4,
      current_value: -0.1,
      target_value: 0.1,
      target_source: 'midpoint',
      ends_at: new Date(Date.now() + 12 * 86400000).toISOString(),
      snapshots: snaps([-0.4, -0.35, -0.28, -0.18, -0.1]),
    }),
    standing: null,
  },
  {
    goal: mkGoal({
      id: 'g-self',
      metric_id: 'putts_made_10_15ft_pct',
      baseline_value: 21,
      current_value: 34,
      target_value: 38,
      target_source: 'midpoint',
      shared_with_coach: true,
      shared_at: new Date().toISOString(),
      ends_at: new Date(Date.now() + 25 * 86400000).toISOString(),
      snapshots: snaps([21, 24, 28, 31, 34]),
    }),
    standing: null,
  },
  {
    goal: mkGoal({
      id: 'g-won',
      metric_id: 'scrambling_pct_sand',
      origin: 'engine_suggested',
      baseline_value: 30,
      current_value: 52,
      target_value: 50,
      target_source: 'midpoint',
      state: 'achieved',
      outcome_evaluated_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      snapshots: snaps([30, 38, 44, 52]),
    }),
    standing: null,
  },
  {
    goal: mkGoal({
      id: 'g-new',
      metric_id: 'approach_proximity_175_plus_ft',
      baseline_value: 64,
      current_value: 64,
      target_value: 55,
      target_source: 'midpoint',
      snapshots: snaps([64]),
    }),
    standing: null,
  },
];

const GOAL_SUGGESTIONS: GoalSuggestionView[] = [
  {
    suggestion: {
      id: 's1',
      player_id: 'demo-player',
      metric_id: 'gir_pct',
      suggested_at: new Date().toISOString(),
      suggested_target_value: 58,
      suggested_window_days: 30,
      origin_insight_id: null,
      state: 'pending',
      acted_at: null,
      snooze_until: null,
      expires_at: new Date(Date.now() + 14 * 86400000).toISOString(),
    } as GoalSuggestion,
    display_label: 'GIR %',
    unit: 'percent',
  },
];

interface DemoInsight {
  id: string;
  title: string;
  category: string;
  diagnosis: Diagnosis;
  confidence: number;
  strokesImpact: number;
  trust: DiagnosisTrust;
}

const INSIGHTS: DemoInsight[] = [
  {
    id: 'lag',
    title: 'Long-range putting is leaking strokes',
    category: 'putting',
    confidence: 0.58,
    strokesImpact: 0.8,
    trust: 'new_hypothesis',
    diagnosis: {
      symptom: 'You 3-putt from outside 15 feet more than twice as often as Tour.',
      root_cause:
        'Lag distance control is the leak — long approaches leave 10–15 ft putts you convert at just 21%.',
      causality_level: 'inferred_hypothesis',
      drivers: [
        { metric: 'putts_made_10_15ft_pct', value: 0.21, unit: 'percent', sample_n: 42, source: 'golf_shots · last 12 rounds' },
        { metric: 'putts_made_15_25ft_pct', value: 0.09, unit: 'percent', sample_n: 31, source: 'golf_shots · last 12 rounds' },
        { metric: 'approach_proximity_175_plus_ft', value: 64, unit: 'feet', sample_n: 28, source: 'golf_shots · approach 175+ yd' },
      ],
      recommended_action:
        'Run a 30-foot lag ladder — leave every long putt inside a 3-foot circle before working the make.',
      confidence_reason:
        '12 rounds, 42 putts in the 10–15 ft band — enough to flag, not yet enough to call proven.',
    },
  },
  {
    id: 'closing',
    title: "You're fading on the closing stretch",
    category: 'scoring',
    confidence: 0.74,
    strokesImpact: 0.4,
    trust: 'promising',
    diagnosis: {
      symptom: 'Your scoring jumps on holes 13–18.',
      root_cause:
        'Closing-hole fatigue — you average +0.4 to par over the last six holes vs the first twelve.',
      causality_level: 'observed_sequence',
      drivers: [
        { metric: 'scoring_par_4', value: 4.6, unit: 'strokes', sample_n: 54, source: 'holes 13-18 · 9 rounds' },
        { metric: 'penalty_rate_per_round', value: 0.7, unit: 'count', sample_n: 9, source: 'holes 13-18 · 9 rounds' },
      ],
      recommended_action:
        'Add a hydration + reset routine at the turn and again before 13 to hold focus late.',
      confidence_reason: '9 rounds, 54 closing-stretch holes measured directly.',
    },
  },
];

export function VizLabClient() {
  return (
    <div className={fairwayScope('min-h-[100dvh] bg-canvas px-4 py-12 sm:px-8')}>
      <div className="mx-auto max-w-3xl space-y-10">
        <header className="space-y-2">
          <p className="font-fw-display text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
            Viz lab · dev only
          </p>
          <h1 className="font-fw-display text-h1 font-semibold text-text-primary">
            Root-cause insights
          </h1>
          <p className="text-body text-text-secondary">
            Each card is the root-cause reasoning spine as it renders in the real Signals UI.
          </p>
        </header>

        <section className="space-y-6">
          {INSIGHTS.map((insight) => (
            <InstrumentPanel key={insight.id} depth="base">
              <DiagnosisPanel
                diagnosis={insight.diagnosis}
                category={insight.category}
                confidence={insight.confidence}
                strokesImpact={insight.strokesImpact}
                trust={insight.trust}
              />
            </InstrumentPanel>
          ))}
        </section>

        <section className="space-y-3">
          <p className="font-fw-display text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
            Signature summary viz
          </p>
          <StrokesGainedTornado
            data={SG}
            overline="Last 12 rounds vs Tour"
            title="Strokes gained"
            takeaway="Putting and around-the-green are the leak."
            height={240}
          />
        </section>

        <section className="space-y-3">
          <p className="font-fw-display text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
            Trends · signal vs noise
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
            <FairwayTrendBrain {...TREND_CONFIRMED} />
            <FairwayTrendBrain {...TREND_FORMING} />
          </div>
        </section>

        <section className="space-y-3">
          <p className="font-fw-display text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
            Round review · this round
          </p>
          <div className="max-w-md">
            <RoundIntelligence strokesToGain={ROUND_OPPS} coachHelm={ROUND_COACH} />
          </div>
        </section>

        <section className="space-y-3">
          <p className="font-fw-display text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
            Coach · the leak board
          </p>
          <div className="max-w-md">
            <LeakBoard insights={TEAM_LEAKS} />
          </div>
        </section>

        <section className="space-y-3">
          <p className="font-fw-display text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
            Goals · elite tracking (hero · trajectory · validated win)
          </p>
          <GoalsSection
            // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
            role="player"
            activeGoals={GOALS.filter((d) => d.goal.state === 'active')}
            achievedGoals={GOALS.filter((d) => d.goal.state === 'achieved')}
            suggestions={GOAL_SUGGESTIONS}
            canCreate
          />
        </section>

        <section className="space-y-3">
          <p className="font-fw-display text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
            Goals · coach view (count panel · pause/abandon · player provenance)
          </p>
          <GoalsSection
            // eslint-disable-next-line jsx-a11y/aria-role -- domain prop, not ARIA
            role="coach"
            canCreate={false}
            activeGoals={GOALS.filter((d) => d.goal.state === 'active')}
            suggestions={[]}
            playerNameById={{ 'demo-player': 'A. Rivera' }}
          />
        </section>
      </div>
    </div>
  );
}
