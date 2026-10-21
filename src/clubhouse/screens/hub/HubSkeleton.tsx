import type { CSSProperties } from 'react';
import { Skeleton, SkelLine, SkelRows } from '../../ui/States';
import { HubSkeletonAction, HubSkeletonChip, HubSkeletonStrip, HubSkeletonTop } from './HubSkeletonTop';
import '../../styles/hub.css';

/**
 * Route loading for Team Hub (CH-10405): the header, the tab strip and Home's first widgets, in place. On a phone the
 * opening and the tabs take the signed-in role's shape from the shell (HubSkeletonTop); the desktop draws the shape
 * both roles share.
 */
export function HubSkeleton() {
  return (
    <main className="ch-hb ch-hb--skel" data-canopy="" aria-busy="true" aria-label="Loading Team Hub" data-ch-code="CH-10405">
      <header className="ch-hb-h" data-canopy-head="">
        <div>
          <HubSkeletonChip />
          <Skeleton width={220} height={40} radius={10} />
          <div style={{ height: 12 }} />
          <Skeleton width={150} height={13} />
        </div>
        <HubSkeletonAction />
        <HubSkeletonStrip />
      </header>
      <div className="ch-hb-tabs" aria-hidden="true">
        {[64, 118, 62, 96].map((w, i) => (
          <Skeleton key={i} width={w} height={14} />
        ))}
      </div>
      {/* Home's widgets in place: the trip and the week, then the second row, on the loaded tiles' own spans. */}
      <div className="ch-hb-bento">
        <div className="ch-hw ch-hw--dark" style={{ '--ch-hw-span': 7, minHeight: 364 } as CSSProperties} />
        <div className="ch-hw" style={{ '--ch-hw-span': 5, minHeight: 364 } as CSSProperties}>
          <Skeleton width={90} height={14} />
          <Skeleton width="100%" height={60} radius={10} />
          <Skeleton width="80%" height={14} />
          <Skeleton width="60%" height={14} />
        </div>
        <div className="ch-hw" style={{ '--ch-hw-span': 8, minHeight: 300 } as CSSProperties}>
          <Skeleton width={90} height={14} />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} width="100%" height={28} radius={6} />
          ))}
        </div>
        <div className="ch-hw" style={{ '--ch-hw-span': 4, minHeight: 300 } as CSSProperties}>
          <Skeleton width={90} height={14} />
          <Skeleton width="85%" height={18} />
          <Skeleton width={60} height={34} radius={8} />
        </div>
      </div>
      {/* The phone's shape (hub.css), in the loaded page's own classes so it lands in place: the opening on its double
          rule with a coach's role chip and the team line (and a coach's New announcement), the tabs on their hairline, then
          two flush sections with their headings and rows on seams. Switched in CSS, since this renders on the server. */}
      <div className="ch-hb-skelm">
        <HubSkeletonTop />
        {[3, 2].map((rows, i) => (
          <section key={i} className="ch-hb-card">
            <div className="ch-hb-card__h">
              <SkelLine line={22} bar={15} width={i ? 84 : 72} />
              <SkelLine line={16} bar={10} width={64} />
            </div>
            <SkelRows rows={rows} lead />
          </section>
        ))}
      </div>
    </main>
  );
}
