// REDESIGN-SCRATCH (docs/redesign/rounds): the Eclectic scorecard, Direction G's signature.
//
// An eclectic card is your best score on every hole across the rounds you have played at one
// course, added up into one round you could in theory shoot. It is a real scorecard: a HOLE
// row, a PAR row, a BEST row drawn with the scorecard marks, OUT / IN / TOT, and (in G) a
// LATEST row that shows the newest round against it, with the holes where it fell short
// underlined.
//
// Two stacked nines, the way a folded card reads on a phone, in real <table>s so a screen
// reader gets row and column headers. `EclecticGrid` is the content; `EclecticCard` puts it on
// a Surface. Direction I uses the grid bare, inside its own page.
import { useId } from 'react';

import { Surface } from '@/components/fairway/surfaces/surface';
import { formatToPar } from '@/lib/golf/format-to-par';
import { MISSING } from '@/lib/golf/metrics/display-registry';
import { cn } from '@/lib/utils';

import { bucketForHole, listNumbers, type Eclectic, type EclecticHole, type Nine } from './model';
import { ScoreMark, holeWord } from './ScoreMark';

/** Shared cell recipe for the scorecard rows. */
const ROW_LABEL =
  'w-12 whitespace-nowrap pl-3 pr-1 text-left font-fw-sans text-caption font-medium text-text-secondary';
const SUBTOTAL = 'border-l border-border-strong bg-surface-tint text-center';

interface NineProps {
  holes: readonly EclecticHole[];
  name: 'Front' | 'Back';
  /** OUT for the front nine, IN for the back. */
  subLabel: 'Out' | 'In';
  sub: Nine;
  showLatest: boolean;
}

function EclecticNine({ holes, name, subLabel, sub, showLatest }: NineProps) {
  const first = holes[0]?.hole;
  const last = holes[holes.length - 1]?.hole;
  return (
    <table className="w-full table-fixed border-collapse tabular-nums">
      <caption className="sr-only">
        {name} nine, holes {first} to {last}: par, your best score, and the subtotal.
      </caption>
      <colgroup>
        <col className="w-12" />
        {holes.map((h) => (
          <col key={h.hole} />
        ))}
        <col className="w-11" />
      </colgroup>
      <thead>
        <tr className="bg-surface-tint">
          <th scope="col" className={cn(ROW_LABEL, 'h-6 text-eyebrow font-semibold uppercase')}>
            Hole
          </th>
          {holes.map((h) => (
            <th
              key={h.hole}
              scope="col"
              className="h-6 text-center font-fw-mono text-caption font-semibold text-text-secondary"
            >
              {h.hole}
            </th>
          ))}
          <th
            scope="col"
            className={cn(SUBTOTAL, 'h-6 bg-surface-sunken text-eyebrow font-semibold uppercase text-text-secondary')}
          >
            {subLabel}
          </th>
        </tr>
      </thead>
      <tbody>
        <tr className="border-t border-border-subtle">
          <th scope="row" className={cn(ROW_LABEL, 'h-7')}>
            Par
          </th>
          {holes.map((h) => (
            <td key={h.hole} className="h-7 text-center font-fw-mono text-body-sm text-text-secondary">
              {h.par}
            </td>
          ))}
          <td className={cn(SUBTOTAL, 'font-fw-mono text-body-sm text-text-secondary')}>{sub.par}</td>
        </tr>
        <tr className="border-t border-border-subtle">
          <th scope="row" className={cn(ROW_LABEL, 'h-10 font-semibold text-text-primary')}>
            Best
          </th>
          {holes.map((h) => {
            const kind = bucketForHole(h.best, h.par);
            return (
              <td key={h.hole} className="h-10 text-center">
                <ScoreMark
                  kind={kind}
                  size="sm"
                  label={`Hole ${h.hole}: best ${h.best} on a par ${h.par}, ${holeWord(kind)}`}
                >
                  {h.best}
                </ScoreMark>
              </td>
            );
          })}
          <td className={cn(SUBTOTAL, 'font-fw-mono text-body font-semibold text-text-primary')}>
            {sub.best}
          </td>
        </tr>
        {showLatest ? (
          <tr className="border-t border-border-subtle">
            <th scope="row" className={cn(ROW_LABEL, 'h-7')}>
              Latest
            </th>
            {holes.map((h) => (
              <td
                key={h.hole}
                className={cn(
                  'h-7 text-center font-fw-mono text-body-sm',
                  h.gap
                    ? 'font-semibold text-fw-warning-text underline decoration-2 underline-offset-4'
                    : 'text-text-secondary',
                )}
              >
                {h.latest ?? MISSING}
              </td>
            ))}
            <td className={cn(SUBTOTAL, 'font-fw-mono text-body-sm text-text-secondary')}>
              {sub.latest ?? MISSING}
            </td>
          </tr>
        ) : null}
      </tbody>
    </table>
  );
}

export interface EclecticGridProps {
  eclectic: Eclectic;
  /** Show the LATEST row and the newest-round line (Direction G). */
  showLatest?: boolean;
  /** Heading level of the title. The page owns the outline. */
  headingAs?: 'h2' | 'h3';
  className?: string;
}

/** Title, the answer as a numeral, the two nines, and the arithmetic. No container. */
export function EclecticGrid({
  eclectic,
  showLatest = false,
  headingAs: Heading = 'h2',
  className,
}: EclecticGridProps) {
  const titleId = useId();
  const front = eclectic.holes.filter((h) => h.hole <= 9);
  const back = eclectic.holes.filter((h) => h.hole > 9);
  const latest = showLatest ? eclectic.latest : null;
  const roundsWord = eclectic.nRounds === 1 ? 'round' : 'rounds';

  return (
    <section aria-labelledby={titleId} className={cn('flex flex-col', className)}>
      <header className="px-4 pt-4">
        <Heading
          id={titleId}
          className="m-0 font-fw-sans text-h3 font-semibold text-text-primary"
        >
          Your best {eclectic.short}
        </Heading>
        <p className="m-0 mt-0.5 font-fw-sans text-body-sm text-text-secondary">
          Eclectic scorecard: your best score on every hole, across {eclectic.nRounds} {roundsWord} here.
        </p>
        <p className="m-0 mt-2 flex items-end justify-between gap-3">
          <span className="flex items-baseline gap-3">
            <span className="font-fw-display text-stat-xl tabular-nums text-text-primary">
              {eclectic.best}
            </span>
            <span className="font-fw-display text-h1 tabular-nums text-accent-ink">
              {formatToPar(eclectic.toPar)}
            </span>
          </span>
          <span className="pb-2 font-fw-sans text-body-sm text-text-secondary">
            vs par {eclectic.par}
          </span>
        </p>
      </header>

      <div className="mt-3 flex flex-col border-t border-border-strong">
        <EclecticNine holes={front} name="Front" subLabel="Out" sub={eclectic.out} showLatest={latest !== null} />
        {eclectic.inn && back.length > 0 ? (
          <div className="border-t border-border-strong">
            <EclecticNine holes={back} name="Back" subLabel="In" sub={eclectic.inn} showLatest={latest !== null} />
          </div>
        ) : null}
      </div>

      <footer className="flex flex-col gap-1 border-t border-border-strong bg-surface-tint px-4 py-3 font-fw-sans text-body-sm tabular-nums text-text-secondary">
        <p className="m-0">
          <span className="text-eyebrow font-semibold uppercase">Out</span> {eclectic.out.best}
          {eclectic.inn ? (
            <>
              {' '}
              + <span className="text-eyebrow font-semibold uppercase">In</span> {eclectic.inn.best}
            </>
          ) : null}{' '}
          = <span className="text-eyebrow font-semibold uppercase">Tot</span>{' '}
          <span className="font-semibold text-text-primary">{eclectic.best}</span>
          {' · '}
          par {eclectic.par}
        </p>
        {latest ? (
          <p className="m-0 text-text-primary">
            <span className="font-semibold">Latest round {latest.total}</span>
            {latest.gap > 0
              ? `: ${latest.gap} over your best, on hole${latest.gapHoles.length === 1 ? '' : 's'} ${listNumbers(latest.gapHoles)}`
              : ': level with your best on every hole'}
          </p>
        ) : null}
      </footer>
    </section>
  );
}

export interface EclecticCardProps extends EclecticGridProps {
  /** Lift the card off the page with the soft shadow (the loudest element on a screen). */
  hero?: boolean;
}

export function EclecticCard({ hero = false, className, ...grid }: EclecticCardProps) {
  return (
    <Surface
      elevation={hero ? 'shadow' : 'border'}
      padding="none"
      className={cn('overflow-hidden', className)}
    >
      <EclecticGrid {...grid} />
    </Surface>
  );
}
