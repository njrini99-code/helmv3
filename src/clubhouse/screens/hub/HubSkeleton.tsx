import { Skeleton } from '../../ui/States';
import '../../styles/hub.css';

/**
 * Route loading for Team Hub (CH-10405): the header, the tab strip and the two Home columns, in place. The role isn't
 * known until the page is read, so it draws the shape both roles share.
 */
export function HubSkeleton() {
  return (
    <main className="ch-hb" aria-busy="true" aria-label="Loading Team Hub" data-ch-code="CH-10405">
      <header className="ch-hb-h">
        <div>
          <Skeleton width={96} height={24} radius={12} />
          <div style={{ height: 14 }} />
          <Skeleton width={220} height={40} radius={10} />
          <div style={{ height: 10 }} />
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
          <div className="ch-hb-card" style={{ padding: 18, display: 'grid', gap: 14 }}>
            <Skeleton width={110} height={16} />
            <Skeleton width="100%" height={48} radius={10} />
            <Skeleton width="100%" height={48} radius={10} />
          </div>
          <div className="ch-hb-card" style={{ padding: 18, display: 'grid', gap: 12 }}>
            <Skeleton width="70%" height={22} radius={8} />
            <Skeleton width="100%" height={13} />
            <Skeleton width="85%" height={13} />
          </div>
        </div>
        <div className="ch-hb-col">
          <div className="ch-hb-card" style={{ padding: 18, display: 'grid', gap: 12 }}>
            <Skeleton width={90} height={16} />
            <Skeleton width="100%" height={36} radius={8} />
            <Skeleton width="100%" height={36} radius={8} />
            <Skeleton width="100%" height={36} radius={8} />
          </div>
        </div>
      </div>
    </main>
  );
}
