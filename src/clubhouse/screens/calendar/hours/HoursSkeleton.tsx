import { Skeleton } from '../../../ui/States';
import '../../../styles/hours.css';

/** Route loading for Practice hours (CH-6480): the head, the week stepper, the week's table and the first day's events, in place. */
export function HoursSkeleton() {
  return (
    <main className="ch-hrs" aria-busy="true" aria-label="Loading practice hours" data-ch-code="CH-6480" data-canopy="">
      <header className="ch-hrs-h" data-canopy-head="tight">
        <div className="ch-hrs-h__t">
          <Skeleton width={80} height={14} />
          <Skeleton width={220} height={14} />
          <Skeleton width={280} height={44} radius={10} />
          <Skeleton width={260} height={16} />
        </div>
        <div className="ch-hrs-tools">
          <Skeleton width={210} height={36} radius={11} />
          <Skeleton width={96} height={36} radius={11} />
        </div>
      </header>
      <Skeleton width="100%" height={320} radius={14} />
      <Skeleton width={140} height={18} />
      <Skeleton width="100%" height={160} radius={14} />
    </main>
  );
}
