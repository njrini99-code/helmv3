'use client';

/**
 * Visual-test lab (dev only) — renders the new CoachHelm viz with real DUG
 * sample data so the summary → detail drill-through can be clicked + screenshot
 * tested without an authenticated dashboard session. Not shipped to users.
 */

import * as React from 'react';
import { fairwayScope } from '@/lib/redesign/flag';
import { InstrumentPanel } from '@/components/fairway/instrument/InstrumentPanel';
import { DiagnosisPanel } from '@/components/golf/coachhelm/insights/DiagnosisPanel';
import { DiagnosisSheet } from '@/components/golf/coachhelm/insights/DiagnosisSheet';
import { StrokesGainedTornado } from '@/components/fairway/charts/StrokesGainedTornado';
import type { Diagnosis } from '@/lib/coachhelm/v2/insights/types';
import type { DiagnosisTrust } from '@/components/golf/coachhelm/insights/DiagnosisPanel';
import type { SGCategory } from '@/components/fairway/charts/StrokesGainedTornado';

const SG: SGCategory[] = [
  { label: 'Off the Tee', value: 0.1 },
  { label: 'Approach', value: -0.4 },
  { label: 'Around the Green', value: -0.6 },
  { label: 'Putting', value: -0.8 },
];

interface DemoInsight {
  id: string;
  title: string;
  category: string;
  diagnosis: Diagnosis;
  confidence: number;
  strokesImpact: number;
  trust: DiagnosisTrust;
  sg?: SGCategory[];
}

const INSIGHTS: DemoInsight[] = [
  {
    id: 'lag',
    title: 'Long-range putting is leaking strokes',
    category: 'putting',
    confidence: 0.58,
    strokesImpact: 0.8,
    trust: 'new_hypothesis',
    sg: SG,
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
  const [openId, setOpenId] = React.useState<string | null>(null);
  const active = INSIGHTS.find((i) => i.id === openId) ?? null;

  return (
    <div className={fairwayScope('min-h-[100dvh] bg-canvas px-4 py-12 sm:px-8')}>
      <div className="mx-auto max-w-3xl space-y-10">
        <header className="space-y-2">
          <p className="font-fw-display text-eyebrow uppercase tracking-[0.14em] text-text-tertiary">
            Viz lab · dev only
          </p>
          <h1 className="font-fw-display text-h1 font-semibold text-text-primary">
            Root-cause insights — summary → detail
          </h1>
          <p className="text-body text-text-secondary">
            Each card is the new root-cause reasoning spine. Tap “See full breakdown” to open the
            detail screen.
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
                maxDrivers={2}
                onSeeEvidence={() => setOpenId(insight.id)}
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
      </div>

      {active ? (
        <DiagnosisSheet
          open={openId !== null}
          onOpenChange={(o) => !o && setOpenId(null)}
          title={active.title}
          category={active.category}
          diagnosis={active.diagnosis}
          confidence={active.confidence}
          strokesImpact={active.strokesImpact}
          sg={active.sg}
        />
      ) : null}
    </div>
  );
}
