import { Skeleton } from '../../ui/States';
import '../../styles/home.css';

/** Route loading for Home: the same frame as the page, so nothing shifts when data lands. */
export function HomeSkeleton() {
  return (
    <main className="ch-h-main" aria-busy="true" aria-label="Loading Home">
      <header className="ch-h-head">
        <Skeleton width={140} height={13} />
        <Skeleton width={360} height={44} radius={10} />
      </header>
      <div className="ch-h-sheet ch-sheet">
        {[0, 1].map((k) => (
          <div key={k} className="ch-h-pane">
            <Skeleton width={110} height={15} />
            <Skeleton width="100%" height={72} radius={12} />
            <Skeleton width="80%" height={13} />
            <Skeleton width="60%" height={13} />
          </div>
        ))}
      </div>
      <div className="ch-h-sec">
        <Skeleton width={130} height={21} />
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
