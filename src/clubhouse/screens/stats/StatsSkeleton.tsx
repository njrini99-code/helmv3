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

/** Route loading for Stats: title, window switch, five figure cards and the trend card, in place. */
export function StatsSkeleton() {
  return (
    <main className="ch-st" aria-busy="true" aria-label="Loading stats" data-ch-code="CH-4401">
      <header className="ch-st-head">
        <div className="ch-st-head__row">
          <div>
            <Line height={41}>
              <Skeleton width={220} height={38} radius={10} />
            </Line>
            <div style={{ height: 8 }} />
            <Line height={21}>
              <Skeleton width={300} height={14} />
            </Line>
          </div>
          <Skeleton width={236} height={32} radius={11} />
        </div>
      </header>
      <div className="ch-fg">
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
      <div className="ch-sgt" style={{ padding: 20 }}>
        <Skeleton width={200} height={17} />
        <div style={{ height: 16 }} />
        <Skeleton width="100%" height={240} radius={12} />
      </div>
    </main>
  );
}
