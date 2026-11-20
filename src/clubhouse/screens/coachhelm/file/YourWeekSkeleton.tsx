'use client';

import type { ReactNode } from 'react';
import { useChPhone } from '../../../lib/use-phone';
import { PhoneTop } from '../../../shell/phone-chrome';
import { LargeTitleSkeleton } from '../../../ui/LargeTitle';
import { SkelLine, Skeleton } from '../../../ui/States';
import { CardHead } from './cards';
import '../../../styles/coachhelm.css';
import '../../../styles/coachhelm-file.css';

/** Lines of a card's body in waiting (`.ch-hf .sk`: they wait the busy delay unless they continue a skeleton already up). */
const Lines = ({ widths }: { widths: readonly number[] }) => (
  <div className="sk">
    {widths.map((w, i) => (
      <i key={i} className="ch-skel" style={{ width: `${w}%` }} />
    ))}
  </div>
);

/** One card of the week in waiting: the loaded card's own head (its title is known before its read is), then its lines. */
const Card = ({ title, widths }: { title: string; widths: readonly number[] }) => (
  <section className="card">
    <CardHead title={title} />
    <Lines widths={widths} />
  </section>
);

/** The main read in waiting: the green feature card, as the loaded one (FeatureCard, EarlyFeature). */
const Feature = () => (
  <section className="feat">
    <div className="sk">
      <i className="ch-skel t" style={{ width: '44%' }} />
      <i className="ch-skel t" style={{ width: '78%' }} />
      <i className="ch-skel" style={{ width: '92%' }} />
      <i className="ch-skel" style={{ width: '70%' }} />
      <i className="ch-skel" style={{ width: '56%' }} />
    </div>
  </section>
);

/** The week's cards in the order YourWeek draws them: on a desk the left column, then the right; on a phone one stack. */
export const YOUR_WEEK_DESK_COLUMNS = [
  ['feat', 'plan', 'sg'],
  ['w', 'f', 'r'],
] as const;
export const YOUR_WEEK_PHONE_ORDER = ['feat', 'w', 'plan', 'f', 'sg', 'r'] as const;

const CARDS: Record<string, () => ReactNode> = {
  feat: () => <Feature key="feat" />,
  plan: () => <Card key="plan" title="Your plan" widths={[82, 64, 74]} />,
  sg: () => <Card key="sg" title="Where the strokes go" widths={[90, 90, 90, 90]} />,
  w: () => <Card key="w" title="What’s working" widths={[72, 58]} />,
  f: () => <Card key="f" title="Last round in context" widths={[84, 66, 76]} />,
  r: () => <Card key="r" title="Also worth knowing" widths={[80, 62, 80, 62]} />,
};

/**
 * The player's CoachHelm Board ("Your week") in waiting, on the loaded page's own frame (YourWeek.tsx): the same `.ch-hf` main on
 * the canopy, the same `.dfile` measure and gutters, the tight head (the title and the line at their loaded line heights), then the
 * week's cards on its two columns (`.grid2`), in its order, each under its own head. It is the one skeleton of the Board: the route's
 * `loading.tsx`, the route's Suspense (`chained`: its blocks do not wait the busy delay a second time) and the switch all draw it,
 * and it crossfades with the week when the week lands (`data-ch-arrive`, RouteFrame). It drew the focus-and-list board before the
 * week replaced it, so the page changed shape when it landed.
 */
export function YourWeekSkeleton({ chained = false }: { chained?: boolean }) {
  const phone = useChPhone();
  return (
    <main
      className={'ch-hf' + (phone ? ' is-phone' : ' is-desk')}
      aria-busy="true"
      aria-label="Loading CoachHelm"
      data-ch-wait="your-week"
      data-skel={chained ? 'chained' : undefined}
      data-ch-arrive="crossfade"
      data-canopy={phone ? undefined : ''}
    >
      {phone && <PhoneTop start title="CoachHelm" />}
      {/* The screen's one h1 while it loads, for the page outline (P013 D8). */}
      <h1 className="ch-sr-only">CoachHelm</h1>
      <div className="dfile" aria-hidden="true">
        {phone ? (
          <div className="dhead is-week">
            <div>
              <LargeTitleSkeleton width={150} />
              <Skeleton width={120} height={13} />
            </div>
          </div>
        ) : (
          // The head's two lines at their loaded line heights (Head `tight`: the 48px title and the 21px line).
          <header className="ch-hl-h" data-canopy-head="tight">
            <SkelLine line={48} bar={38} width={196} />
            <SkelLine line={21} bar={13} width={140} />
          </header>
        )}
        <div className="ch-hf-flow">
          {phone ? (
            YOUR_WEEK_PHONE_ORDER.map((k) => CARDS[k]!())
          ) : (
            <div className="grid2">
              {YOUR_WEEK_DESK_COLUMNS.map((col, i) => (
                <div className="col" key={i}>
                  {col.map((k) => CARDS[k]!())}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
