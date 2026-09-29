import { Skeleton } from '../../ui/States';
import '../../styles/stats.css';

/** Route loading for Stats: title, window switch, five figure cards and the trend card, in place. */
export function StatsSkeleton() {
  return (
    <main className="ch-st" aria-busy="true" aria-label="Loading stats" data-ch-code="CH-4401">
      <header className="ch-st-head">
        <div className="ch-st-head__row">
          <div>
            <Skeleton width={220} height={38} radius={10} />
            <div style={{ height: 10 }} />
            <Skeleton width={300} height={14} />
          </div>
          <Skeleton width={236} height={34} radius={11} />
        </div>
      </header>
      <div className="ch-fg">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="ch-fg__c">
            <Skeleton width={110} height={13} />
            <Skeleton width={80} height={34} radius={8} />
            <Skeleton width={120} height={12} />
          </div>
        ))}
      </div>
      <div className="ch-sgt" style={{ padding: 20 }}>
        <Skeleton width={200} height={17} />
        <div style={{ height: 16 }} />
        <Skeleton width="100%" height={240} radius={12} />
      </div>
    </main>
  );
}
