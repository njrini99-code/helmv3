import type { ReactNode } from 'react';
import { Skeleton } from '../../ui/States';
import { SkeletonHeroBar } from './SkeletonHeroBar';
import '../../styles/home.css';

/** A bar centred in a box the height of its real line, so the text lands where the bar was. */
function Line({ height, children }: { height: number; children: ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', height }}>{children}</div>;
}

/** Route loading for Home: the same frame as the page, so nothing shifts when data lands. */
export function HomeSkeleton() {
  return (
    // Desktop draws the loading page with the framed head, as the loaded page is, so nothing moves when the data lands.
    <main className="ch-h-main" aria-busy="true" aria-label="Loading Home" data-ch-code="CH-2401" data-canopy="">
      <SkeletonHeroBar />
      {/* Phone: the page's own shape in the Mobile clubhouse pass (the date under its double rule, the greeting, the
          brief's lines, the green Up next card, then the first section under its rule and its rows), so the hand-off
          changes nothing but the words (F-37). */}
      <div className="ch-hm-skel" aria-hidden="true">
        <div className="ch-hm-skel__hero">
          <span className="ch-hm-skel__date">
            <Skeleton width={150} height={11} />
          </span>
          <span className="ch-hm-skel__h1">
            <Skeleton width={240} height={28} radius={8} />
          </span>
          <span className="ch-hm-skel__line">
            <Skeleton width="85%" height={14} />
          </span>
          <span className="ch-hm-skel__line">
            <Skeleton width="60%" height={14} />
          </span>
          <span className="ch-hm-skel__card">
            <span className="ch-hm-skel__bar" style={{ width: 120, height: 12 }} />
            <span className="ch-hm-skel__bar" style={{ width: 210, height: 23 }} />
            <span className="ch-hm-skel__bar" style={{ width: 170, height: 14 }} />
          </span>
        </div>
        <div className="ch-hm-skel__body">
          <span className="ch-hm-skel__sec">
            <Skeleton width={96} height={17} />
          </span>
          {[0, 1, 2].map((k) => (
            <span key={k} className="ch-hm-skel__row">
              <Skeleton width={34} height={13} />
              <Skeleton width={k === 1 ? '46%' : '58%'} height={14} />
            </span>
          ))}
        </div>
      </div>
      {/* Desktop head, line for line as loaded (perf 2026-10-01, measured with `npm run clubhouse:perf`): the date, the greeting, a two-line sentence and the two actions. */}
      <header className="ch-h-head" data-canopy-head="">
        <Line height={14}>
          <Skeleton width={140} height={13} />
        </Line>
        {/* The sans greeting's line in the framed head (44px type, 47.5px line; WebKit 1440, 2026-10-07). */}
        <Line height={47.5}>
          <Skeleton width={400} height={38} radius={10} />
        </Line>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10, height: 49.6 }}>
          <Skeleton width="90%" height={14} />
          <Skeleton width="60%" height={14} />
        </div>
        <div className="ch-h-head__actions">
          <Skeleton width={150} height={36} radius={10} />
          <Skeleton width={130} height={36} radius={10} />
        </div>
      </header>
      <div className="ch-h-sheet ch-sheet">
        {[0, 1].map((k) => (
          <div key={k} className="ch-h-pane" style={{ minHeight: 623 }}>
            <Skeleton width={110} height={15} />
            <Skeleton width="100%" height={72} radius={12} />
            <Skeleton width="80%" height={13} />
            <Skeleton width="60%" height={13} />
          </div>
        ))}
      </div>
      {/* The leaderboard's heading: the title, its line of small print, and the Roster button (the loaded heading is 63px: a block of two lines and a 30px button). */}
      <div className="ch-h-sec">
        <div>
          <Line height={24}>
            <Skeleton width={130} height={21} />
          </Line>
          <Line height={20}>
            <Skeleton width={300} height={13} />
          </Line>
        </div>
        <Skeleton width={104} height={30} radius={10} />
      </div>
      <div className="ch-h-lb ch-sheet">
        {[0, 1, 2, 3, 4].map((k) => (
          <div key={k} className="ch-h-lb__row">
            <Skeleton width={14} />
            <Skeleton width={180} />
            <Skeleton width={148} height={24} />
            <Skeleton width={36} />
            <Skeleton width={36} />
            <Skeleton width={36} />
          </div>
        ))}
      </div>
    </main>
  );
}
