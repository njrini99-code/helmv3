import type { ReactNode } from 'react';
import { Skeleton } from '../../ui/States';
import '../../styles/stats.css';

/** A skeleton bar centred in a box the height of the real line, so the text lands where the bar was. */
function Line({ height, children }: { height: number; children: ReactNode }) {
  return (
    <div className="ch-skel-line" style={{ height }}>
      {children}
    </div>
  );
}

/**
 * Route loading for a player's stats, their own or a coach's `?player=` (CH-5403): the profile's hero, four figures and tabs, in place.
 * A coach's profile has the way back above the hero and three actions in it (Message, Schedule 1:1, Add focus area), so the skeleton
 * draws them for a coach (measured 2026-10-01: hero 349 px for a coach, 314 for a player).
 */
export function StatsProfileSkeleton({ coach = false }: { coach?: boolean }) {
  return (
    <main className="ch-st" aria-busy="true" aria-label="Loading player stats" data-ch-code="CH-5403">
      {coach && (
        <div className="ch-st-back" aria-hidden="true">
          <Skeleton width={112} height={30} radius={10} />
        </div>
      )}
      <section className="ch-pf-hero" aria-hidden="true">
        <span className="ch-pf-hero__av">
          <Skeleton width={112} height={112} radius={56} />
        </span>
        <div className="ch-pf-hero__id">
          {/* The name's serif display line (48px measured; was 35 before the serif title). */}
          <Line height={49}>
            <Skeleton width={240} height={36} radius={10} />
          </Line>
          <Line height={18}>
            <Skeleton width={280} height={14} />
          </Line>
          {coach && (
            <div className="ch-pf-hero__act">
              <Skeleton width={104} height={36} radius={10} />
              <Skeleton width={128} height={36} radius={10} />
              <Skeleton width={136} height={36} radius={10} />
            </div>
          )}
        </div>
        <div className="ch-pf-hero__figs">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i}>
              <Skeleton width={72} height={12} />
              <Skeleton width={56} height={24} radius={7} />
              <Skeleton width={64} height={17} />
              {/* The strokes gained figure's change line (the loaded hero keeps it in every window). */}
              {i === 2 && <span className="ch-pf-hero__chg" style={{ display: 'block' }} />}
            </div>
          ))}
        </div>
      </section>
      <div className="ch-pf-tabs" aria-hidden="true">
        <div className="ch-tabs">
          {[76, 96, 70, 96].map((w, i) => (
            <span key={i} className="ch-tab-t">
              <Skeleton width={w} height={14} />
            </span>
          ))}
        </div>
        {/* The window switch's measured width (216), so the tabs and it share one line wherever the loaded ones do. */}
        <Skeleton width={216} height={32} radius={11} />
      </div>
      {/* The round filter's bar (its Filter button), so the figures do not move when it appears. */}
      <div className="ch-sf" aria-hidden="true">
        <Skeleton width={78} height={30} radius={10} />
      </div>
      {/* The overview's five figures, held at the loaded row's height (`.ch-fg--profile`), so they land without moving the page. */}
      <div className="ch-fg ch-fg--profile" style={{ ['--ch-fg-n' as string]: 5 }} aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="ch-fg__c ch-fg__c--skel">
            <Line height={17}>
              <Skeleton width={110} height={13} />
            </Line>
            <Line height={36}>
              <Skeleton width={80} height={34} radius={8} />
            </Line>
            <Line height={22}>
              <Skeleton width={120} height={12} />
            </Line>
          </div>
        ))}
      </div>
      <div className="ch-sgt" style={{ padding: 20 }} aria-hidden="true">
        <Skeleton width={200} height={17} />
        <div style={{ height: 16 }} />
        <Skeleton width="100%" height={240} radius={12} />
      </div>
    </main>
  );
}

/** Route loading for Stats: title, window switch, the filter bar, six figure cards (strokes gained first) and the trend card, in place. */
export function StatsSkeleton() {
  return (
    <main className="ch-st" aria-busy="true" aria-label="Loading stats" data-ch-code="CH-4401">
      <header className="ch-st-head">
        <div className="ch-st-head__row">
          <div>
            {/* The serif title's line (52px type, 53px line), measured with the page (WebKit 1440, 2026-10-07). */}
            <Line height={53}>
              <Skeleton width={260} height={46} radius={10} />
            </Line>
            <div style={{ height: 8 }} />
            <Line height={21}>
              <Skeleton width={300} height={14} />
            </Line>
          </div>
          <Skeleton width={236} height={32} radius={11} />
        </div>
      </header>
      {/* The round filter's bar (its Filter button), so the figures do not move when it appears. */}
      <div className="ch-sf" aria-hidden="true">
        <Skeleton width={78} height={30} radius={10} />
      </div>
      {/* The loaded layout: strokes gained on its own card, the five supporting figures on one surface. */}
      <div className="ch-fg ch-fg--lead" style={{ ['--ch-fg-n' as string]: 5 }}>
        <div className="ch-fg__c ch-fg__c--lead ch-fg__c--skel">
          <Line height={17}>
            <Skeleton width={130} height={13} />
          </Line>
          <Line height={48}>
            <Skeleton width={110} height={44} radius={10} />
          </Line>
          <Line height={22}>
            <Skeleton width={150} height={12} />
          </Line>
        </div>
        <div className="ch-fg__group">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="ch-fg__c ch-fg__c--skel">
              <Line height={17}>
                <Skeleton width={110} height={13} />
              </Line>
              <Line height={36}>
                <Skeleton width={80} height={34} radius={8} />
              </Line>
              <Line height={22}>
                <Skeleton width={120} height={12} />
              </Line>
            </div>
          ))}
        </div>
      </div>
      {/* The caption line under the cards (the loaded page keeps it in every window). */}
      <p className="ch-st-cover" aria-hidden="true" />
      <TrendSkeleton />
    </main>
  );
}

/** The trend card: its own head and plot frame (the plot is as tall as a team of eight, the usual one), and the note's line, so the cards below it land where they will be. */
function TrendSkeleton() {
  return (
    <div className="ch-sgt" aria-hidden="true">
      {/* With the serif card title the head is 95px (WebKit 1440, 2026-10-07). */}
      <div className="ch-sgt__head" style={{ minHeight: 95 }}>
        <div>
          <Skeleton width={200} height={17} />
          <div style={{ height: 8 }} />
          <Skeleton width={320} height={12} />
        </div>
        <Skeleton width={236} height={32} radius={11} />
      </div>
      <div className="ch-sgt__hold" style={{ ['--ch-ends' as string]: 8, padding: '0 10px' }}>
        <Skeleton width="100%" height={240} radius={12} />
      </div>
      <div style={{ height: 26 }} />
    </div>
  );
}
