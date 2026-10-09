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
    <main className="ch-st" aria-busy="true" aria-label="Loading player stats" data-ch-code="CH-5403" data-canopy="">
      {/* P004-D7: the page keeps its one h1 while it loads. */}
      <h1 className="ch-sr-only">Player stats</h1>
      {coach && (
        <div className="ch-st-back" aria-hidden="true">
          <Skeleton width={112} height={30} radius={10} />
        </div>
      )}
      <section className="ch-pf-hero" aria-hidden="true" data-canopy-head="">
        <span className="ch-pf-hero__av">
          <Skeleton width={84} height={84} radius={42} />
        </span>
        <div className="ch-pf-hero__id">
          <div className="ch-pf-hero__tags">
            <Skeleton width={64} height={22} radius={11} />
          </div>
          {/* The name in the page head's heavy sans (44px at 1.08). */}
          <Line height={47.5}>
            <Skeleton width={240} height={36} radius={10} />
          </Line>
          <Line height={24.8}>
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
              <Skeleton width={56} height={28} radius={7} />
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
      {/* The overview: the first zones of the loaded page (OverviewZones): what the stat is and its reading on the left, its picture on the right. */}
      <div className="ch-zones" aria-hidden="true">
        {[0, 1].map((i) => (
          <div key={i} className={'ch-z' + (i % 2 ? ' ch-z--alt' : '')}>
            <div className="ch-z__id">
              <Skeleton width={30} height={30} radius={15} />
              <Skeleton width={180} height={27} />
              <Skeleton width="100%" height={64} radius={8} />
              <Skeleton width={120} height={60} radius={8} />
            </div>
            <div className="ch-z__vis">
              <Skeleton width="100%" height={i ? 150 : 230} radius={12} />
              <Skeleton width="100%" height={120} radius={12} />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

/** Route loading for Stats: title, window switch, the filter bar, six figure cards (strokes gained first) and the trend card, in place. */
export function StatsSkeleton() {
  return (
    <main className="ch-st" aria-busy="true" aria-label="Loading stats" data-ch-code="CH-4401" data-canopy="">
      {/* P004-D7: the page keeps its one h1 while it loads. */}
      <h1 className="ch-sr-only">Team stats</h1>
      {/* The framed page head in place (PageHero): the section line, the sans title's line and the line under it, the window switch on the right. */}
      <header className="ch-hero" data-canopy-head="" aria-hidden="true">
        <Line height={14.3}>
          <Skeleton width={150} height={11} />
        </Line>
        <Line height={47.5}>
          <Skeleton width={240} height={38} radius={10} />
        </Line>
        <Line height={24.8}>
          <Skeleton width={300} height={14} />
        </Line>
        <div className="ch-hero__actions">
          <Skeleton width={236} height={32} radius={11} />
        </div>
      </header>
      {/* The round filter's bar (its Filter button), so the figures do not move when it appears. */}
      <div className="ch-sf" aria-hidden="true">
        <Skeleton width={78} height={30} radius={10} />
      </div>
      {/* The loaded layout: the trend with its headline first, then the tape of the other five figures (TeamTrend, TeamTape). */}
      <TrendSkeleton />
      <TapeSkeleton />
      {/* The caption line under the tape (the loaded page keeps it in every window). */}
      <p className="ch-st-cover" aria-hidden="true" />
    </main>
  );
}

/** The trend: the headline's label, its large figure and change, the plot as tall as a team of eight (the usual one), and the note's line, so the tape below lands where it will be. */
function TrendSkeleton() {
  return (
    <div className="ch-sgt" aria-hidden="true">
      <div className="ch-sgt__hero">
        <div className="ch-sgt__big">
          <Skeleton width={190} height={14} />
          <div style={{ height: 10 }} />
          <Skeleton width={150} height={64} radius={12} />
          <div style={{ height: 14 }} />
          <Skeleton width={340} height={12} />
        </div>
        <Skeleton width={236} height={32} radius={11} />
      </div>
      <div className="ch-sgt__hold" style={{ ['--ch-ends' as string]: 8 }}>
        <Skeleton width="100%" height={240} radius={12} />
      </div>
      <div style={{ height: 26 }} />
    </div>
  );
}

/** The tape: five cells at the loaded cell's rows (label, value, change, weekly line). */
export function TapeSkeleton() {
  return (
    <div className="ch-tp" aria-hidden="true">
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="ch-tp__c">
          <Skeleton width={110} height={13} />
          <Skeleton width={80} height={32} radius={8} />
          <Skeleton width={120} height={12} />
          <Skeleton width="100%" height={46} radius={8} />
          <span />
        </div>
      ))}
    </div>
  );
}
