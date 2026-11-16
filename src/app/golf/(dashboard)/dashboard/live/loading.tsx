import { SkelLine, SkelRows, Skeleton } from '@/clubhouse/ui/States';
import '@/clubhouse/styles/live.css';

/**
 * The Live page on its way (GAP-S-32), in the desk's own boxes (LiveView.tsx): the head with its eyebrow, title and freshness
 * chip, the filter and sort, then two groups of lanes, each a label over a card of rows. Nothing moves when the page lands.
 */
export default function Loading() {
  return (
    <main className="ch-lv ch-lv--desk" aria-busy="true" aria-label="Loading live rounds" data-canopy="">
      <header className="ch-lv-head" data-canopy-head="tight" aria-hidden="true">
        <div>
          <span className="ch-lv-eyebrow">
            <SkelLine line={18} bar={11} width={48} />
          </span>
          {/* A plain bar, not the large-title block: Live on a phone is a pushed screen whose title sits in its bar. */}
          <Skeleton width={72} height={34} radius={8} />
        </div>
        <Skeleton width={150} height={32} radius={16} />
      </header>
      <div className="ch-lv-tools" aria-hidden="true">
        <span style={{ flex: '1 1 240px', maxWidth: 480 }}>
          <Skeleton width="100%" height={36} radius={10} />
        </span>
        <Skeleton width={110} height={36} radius={10} />
      </div>
      <div className="ch-lv-groups" aria-hidden="true">
        {[4, 2].map((rows) => (
          <section key={rows} className="ch-lv-group">
            <SkelLine line={20} bar={13} width={140} />
            <div className="ch-lv-card">
              <SkelRows rows={rows} lead />
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
