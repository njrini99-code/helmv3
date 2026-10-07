// REDESIGN-SCRATCH (docs/redesign/rounds): Direction G · Your usual.
//
// Answers "was that round good for me, and what is my ceiling here?"
//   1. header
//   2. the Eclectic scorecard for the latest counted course: the loudest thing on the page
//   3. the latest round against the player's own usual, with the season strip and its band
//   4. one rich row per round
//   5. unfinished rounds, folded to one line
//
// Server component. The only client parts are the ones with state or a chart: the row filter,
// the header and the pills.
import { formatMetricText } from '@/lib/golf/metrics/display-registry';
import { RoundStrip } from '@/components/fairway/modules/RoundStrip';
import { EmptyState } from '@/components/fairway/feedback/EmptyState';
import { InsufficientData } from '@/components/fairway/feedback/InsufficientData';
import { Surface } from '@/components/fairway/surfaces/surface';

import { EclecticCard } from './EclecticCard';
import { GRoundRows } from './GRoundRows';
import { RoundsHeader, UnfinishedLine } from './PageChrome';
import {
  COUNTED,
  LATEST_COUNTED,
  MIN_ROUNDS_FOR_USUAL,
  STRIP_POINTS,
  USUAL,
  deltaVsUsual,
  eclecticFor,
  markVsUsual,
  versusUsualText,
} from './model';
import { ScoreMark } from './ScoreMark';
import { formatDateOnlyShort } from '@/lib/golf/date-only';
import { cn } from '@/lib/utils';

const toParAvg = (n: number): string => formatMetricText('scoring_average_vs_par', n);

function SeasonBlock() {
  if (!LATEST_COUNTED) return null;

  // Under five counted rounds there is no honest "usual": say so, draw no band, no trend.
  if (!USUAL) {
    return (
      <InsufficientData
        title="Not enough rounds for a usual yet"
        unit="counted rounds"
        current={COUNTED.length}
        required={MIN_ROUNDS_FOR_USUAL}
      />
    );
  }

  const latest = LATEST_COUNTED;
  const delta = deltaVsUsual(latest, USUAL) ?? 0;
  const kind = markVsUsual(latest.toPar18, USUAL);
  const verdict = versusUsualText(delta);
  const hollow = STRIP_POINTS.some((p) => p.fill === 'hollow');

  return (
    <section aria-labelledby="g-usual-title" className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <ScoreMark
          kind={kind}
          size="xl"
          label={`Latest counted round: ${latest.score}, ${verdict}`}
        >
          {latest.score}
        </ScoreMark>
        <div className="min-w-0">
          <h2
            id="g-usual-title"
            className={cn(
              'm-0 font-fw-display text-h2 tabular-nums',
              delta < -0.05 ? 'text-accent-ink' : delta > 0.05 ? 'text-fw-warning-text' : 'text-text-primary',
            )}
          >
            {verdict}
          </h2>
          <p className="m-0 mt-1 font-fw-sans text-body-sm text-text-secondary">
            {formatDateOnlyShort(latest.date)} · {latest.short} · {latest.typeLabel}
          </p>
        </div>
      </div>

      <div>
        <RoundStrip
          points={[...STRIP_POINTS]}
          label={`Your ${STRIP_POINTS.length} counted rounds, score to par`}
          height={148}
          band={{ lo: USUAL.q1, hi: USUAL.q3, label: 'Your usual' }}
        />
        <p className="m-0 mt-3 font-fw-sans text-caption text-text-secondary">
          Your usual is {toParAvg(USUAL.median)}: the middle half of your {USUAL.n} counted rounds runs{' '}
          {toParAvg(USUAL.q1)} to {toParAvg(USUAL.q3)}.
          {hollow ? ' To par is on an 18-hole basis; the hollow bar is a 9-hole round, doubled.' : ''}
        </p>
      </div>
    </section>
  );
}

export function GYourUsual() {
  const latest = LATEST_COUNTED;
  const eclectic = latest
    ? eclecticFor(
        latest.course,
        COUNTED.filter((r) => r.course === latest.course),
        latest,
      )
    : null;

  if (!latest) {
    return (
      <div className="flex flex-col gap-6">
        <RoundsHeader />
        <Surface padding="lg">
          <EmptyState title="No counted rounds yet" description="Finish a round and your scorecard starts here." />
        </Surface>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <RoundsHeader />
      {eclectic ? <EclecticCard eclectic={eclectic} showLatest hero className="-mt-2" /> : null}
      <SeasonBlock />
      <GRoundRows />
      <UnfinishedLine />
    </div>
  );
}
