import { Skeleton, SkelLine, SkelRows } from '../../ui/States';
import { HubSkeletonTop } from './HubSkeletonTop';
import '../../styles/hub.css';

/**
 * Route loading for Team Hub (CH-10405): the header, the tab strip and the two Home columns, in place. On a phone the
 * opening and the tabs take the signed-in role's shape from the shell (HubSkeletonTop); the desktop draws the shape
 * both roles share.
 */
export function HubSkeleton() {
  return (
    <main className="ch-hb ch-hb--skel" data-canopy="" aria-busy="true" aria-label="Loading Team Hub" data-ch-code="CH-10405">
      <header className="ch-hb-h" data-canopy-head="">
        <div>
          <Skeleton width={96} height={24} radius={12} />
          <div style={{ height: 4 }} />
          <Skeleton width={220} height={40} radius={10} />
          <div style={{ height: 12 }} />
          <Skeleton width={150} height={13} />
        </div>
      </header>
      <div className="ch-hb-tabs" aria-hidden="true">
        {[64, 118, 62, 96].map((w, i) => (
          <Skeleton key={i} width={w} height={14} />
        ))}
      </div>
      <div className="ch-hb-home">
        <div className="ch-hb-col">
          <div className="ch-hb-card" style={{ display: 'grid', gap: 14 }}>
            <Skeleton width={110} height={16} />
            <Skeleton width="100%" height={48} radius={10} />
            <Skeleton width="100%" height={48} radius={10} />
          </div>
          <div className="ch-hb-card" style={{ display: 'grid', gap: 12 }}>
            <Skeleton width="70%" height={22} radius={8} />
            <Skeleton width="100%" height={13} />
            <Skeleton width="85%" height={13} />
          </div>
        </div>
        <div className="ch-hb-col">
          <div className="ch-hb-card" style={{ display: 'grid', gap: 12 }}>
            <Skeleton width={90} height={16} />
            <Skeleton width="100%" height={36} radius={8} />
            <Skeleton width="100%" height={36} radius={8} />
            <Skeleton width="100%" height={36} radius={8} />
          </div>
        </div>
      </div>
      {/* The phone's shape (hub.css), in the loaded page's own classes so it lands in place: the opening on its double
          rule with the role chip and the team line (and a coach's New announcement), the tabs on their hairline, then
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
