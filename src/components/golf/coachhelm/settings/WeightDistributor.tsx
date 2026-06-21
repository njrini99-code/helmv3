'use client';

import type { CoachPhilosophy } from '@/lib/coachhelm/types';

type WeightKey = 'weightHistorical' | 'weightRecentForm' | 'weightTournament' | 'weightQualifying' | 'weightSubjective';

interface WeightDistributorProps {
  values: Pick<CoachPhilosophy, WeightKey>;
  onChange: (values: Pick<CoachPhilosophy, WeightKey>) => void;
}

/**
 * F062 / F115 — Comparison Weighting controls are HIDDEN until the engine wires
 * them up.
 *
 * The 5 weight sliders (golf_coach_philosophy.weight_historical /
 * weight_recent_form / weight_tournament / weight_qualifying / weight_subjective)
 * persisted to the DB but had ZERO consumers — no roster-comparison or ranking
 * code reads them. (The live insight ranker uses a SEPARATE per-insight-type
 * weights table, golf_coachhelm_coach_weights, not these sliders.) Surfacing
 * interactive sliders therefore promised a dead control: a coach could drag them
 * and "Save" but nothing in the product changed.
 *
 * Rather than ship a placebo, the interactive distributor is suppressed and a
 * short "coming soon" note is shown in its place. The `values` / `onChange`
 * props are intentionally kept so the consuming settings pages (legacy +
 * Fairway) need no change, and the editor can be restored verbatim once the
 * roster-comparison subsystem actually consumes these weights.
 *
 * TODO(coachhelm): wire the comparison weights into roster-comparison /
 * player-ranking, then restore the interactive slider UI (git history holds the
 * original WeightDistributor implementation) and remove this guard.
 */
export function WeightDistributor(_props: WeightDistributorProps) {
  // Props are referenced to satisfy noUnusedParameters without changing the
  // public signature consumed by the settings pages.
  void _props;

  return (
    <div className="rounded-lg border border-dashed border-warm-200 bg-warm-50/50 p-4">
      <p className="text-sm text-warm-600">
        Comparison weighting is coming soon. We&apos;re finishing the roster-comparison
        engine that uses these factors — until then this control is hidden so it
        doesn&apos;t imply changes that aren&apos;t applied yet.
      </p>
    </div>
  );
}
