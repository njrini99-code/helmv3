import { Skeleton } from '../../ui/States';
import '../../styles/rounds.css';
import { LargeTitleSkeleton } from '../../ui/LargeTitle';

/** Route loading for Team rounds: the head, the season's four figures, the tools, then a month of rows, in place. */
export function TeamRoundsSkeleton() {
  return (
    <main className="ch-rd ch-trd" aria-busy="true" aria-label="Loading team rounds" data-ch-code="CH-11413" data-canopy="">
      <header className="ch-rd-h" data-canopy-head="">
        <div>
          <Skeleton width={200} height={13} />
          <div style={{ height: 10 }} />
          <span className="ch-rd-sk-desk">
            <Skeleton width={190} height={36} radius={10} />
          </span>
          <LargeTitleSkeleton width={190} />
        </div>
      </header>
      <Skeleton width="100%" height={76} radius={12} />
      <div className="ch-rd-tools">
        <Skeleton width={260} height={38} radius={10} />
        <Skeleton width={160} height={38} radius={10} />
        <Skeleton width={190} height={34} radius={11} />
      </div>
      <Skeleton width={160} height={20} radius={6} />
      {[0, 1, 2, 3, 4].map((i) => (
        <Skeleton key={i} width="100%" height={58} radius={8} />
      ))}
    </main>
  );
}
