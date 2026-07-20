'use client';

/**
 * ============================================================================
 * CoachHomeBento — the Coach Intelligence stage home view (spec §5.4 bento)
 * ----------------------------------------------------------------------------
 * Weakest category (2×2, Ribbon evidence) · roster×category heat teaser
 * (links out to Team Stats) · signals summary (3-segment critical/warning/
 * info bar, from the FULL `getAlertCounts` payload) · effectiveness teaser
 * (accuracy readout) · ask cell — five cells on one gapless `Bento` surface.
 *
 * The weakest-category cell reuses `Ribbon` (evidence chart, never rewritten)
 * exactly like `FairwayBrief`'s hero right column: the team's yardage-band SG
 * curve when it's genuinely representative of the weakest category (driving/
 * approach/short-game — putting/scoring have no yardage-band curve), else an
 * honest sentence-only fallback (never a mis-categorized chart).
 * ========================================================================== */

import { useRouter } from 'next/navigation';
import { Bento, BentoCell, useStage } from '@/components/fairway/modules';
import { Ribbon, type RibbonPoint } from '@/components/fairway';
import { surfaceHref } from '@/lib/golf/surface-registry';
import type { RankedCoachCategory, SignalsSummary } from './buildCoachHomeViewModel';
import { buildRosterHeatSentence, formatAccuracyReadout } from './buildCoachHomeViewModel';

/** Same yardage-band-eligible set FairwayBrief's `isYardageBandCategory` uses
 *  — the full-swing shot curve excludes every putt, so it only ever describes
 *  driving/approach/short-game shots. */
const YARDAGE_BAND_CATEGORY_IDS = new Set(['driving', 'approach', 'short_game']);

function fmtSG(v: number): string {
  return v > 0 ? `+${v.toFixed(2)}` : v.toFixed(2);
}

export interface CoachHomeBentoProps {
  weakest: RankedCoachCategory | null;
  ribbonPoints: RibbonPoint[];
  playerCount: number;
  attentionCount: number;
  signalsSummary: SignalsSummary;
  predictionAccuracy: number | null;
}

export function CoachHomeBento({
  weakest,
  ribbonPoints,
  playerCount,
  attentionCount,
  signalsSummary,
  predictionAccuracy,
}: CoachHomeBentoProps) {
  const stage = useStage();
  const router = useRouter();

  const showRibbon = Boolean(weakest && YARDAGE_BAND_CATEGORY_IDS.has(weakest.categoryId) && ribbonPoints.length >= 2);

  return (
    <Bento>
      <BentoCell
        label="Weakest category"
        span={2}
        rows={2}
        chip={weakest ? { tone: 'leak', text: `${weakest.rating}/100` } : undefined}
        headline={weakest ? { value: weakest.long } : undefined}
        sentence={
          weakest
            ? `${weakest.long} is the team's biggest opportunity right now.`
            : 'The weakest category fills in once players log rounds with shot detail.'
        }
        onOpen={() => stage.open('signals')}
      >
        {showRibbon ? (
          <Ribbon
            title="Yardage map"
            overline="Last 90 days · team"
            data={ribbonPoints}
            benchmark={{ value: 0, label: 'Par' }}
            valueFormatter={fmtSG}
            seriesName="Strokes vs par"
            height={120}
            minPoints={2}
          />
        ) : null}
      </BentoCell>

      <BentoCell
        label="Roster"
        headline={{ value: String(playerCount), unit: playerCount === 1 ? 'player' : 'players' }}
        sentence={buildRosterHeatSentence(playerCount, attentionCount)}
        onOpen={() => router.push('/golf/dashboard/stats/team')}
      />

      <BentoCell
        label="Signals"
        headline={signalsSummary.total > 0 ? { value: String(signalsSummary.total), unit: 'open' } : undefined}
        sentence={
          signalsSummary.total > 0
            ? `${signalsSummary.criticalPct}% critical · ${signalsSummary.warningPct}% warning · ${signalsSummary.infoPct}% info`
            : 'No open signals right now.'
        }
        onOpen={() => stage.open('signals')}
      >
        {signalsSummary.total > 0 ? (
          <div
            role="img"
            aria-label={`${signalsSummary.criticalPct}% critical, ${signalsSummary.warningPct}% warning, ${signalsSummary.infoPct}% info`}
            className="flex h-2 w-full overflow-hidden rounded-full bg-surface-sunken"
          >
            <span className="h-full bg-fw-danger" style={{ width: `${signalsSummary.criticalPct}%` }} />
            <span className="h-full bg-fw-warning" style={{ width: `${signalsSummary.warningPct}%` }} />
            <span className="h-full bg-text-tertiary/40" style={{ width: `${signalsSummary.infoPct}%` }} />
          </div>
        ) : null}
      </BentoCell>

      <BentoCell
        label="Effectiveness"
        headline={{ value: formatAccuracyReadout(predictionAccuracy) }}
        sentence="Prediction accuracy · last 30 days."
        onOpen={() => stage.open('effectiveness')}
      />

      <BentoCell
        label="Ask CoachHelm"
        sentence="Chat with CoachHelm about your team."
        onOpen={() => router.push(surfaceHref('ask'))}
      />
    </Bento>
  );
}
