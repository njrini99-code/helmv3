import { Skeleton } from '../../ui/States';
import '../../styles/classes.css';

/** Route loading for Classes: the header, the term overview, then the deck of classes beside the week's side card, in place. */
export function ClassesSkeleton() {
  return (
    <main className="ch-cl" aria-busy="true" aria-label="Loading your classes" data-ch-code="CH-12401">
      <header className="ch-cl-h">
        <div>
          <Skeleton width={190} height={13} />
          <div style={{ height: 10 }} />
          <Skeleton width={150} height={36} radius={10} />
        </div>
        <div className="ch-cl-h__a">
          <Skeleton width={150} height={40} radius={11} />
          <Skeleton width={120} height={40} radius={11} />
        </div>
      </header>
      <Skeleton width="100%" height={158} radius={22} />
      <div className="ch-cl-grid">
        <div className="ch-cl-deck">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} width="100%" height={236} radius={18} />
          ))}
        </div>
        <div className="ch-cl-side">
          <Skeleton width="100%" height={200} radius={18} />
          <Skeleton width="100%" height={92} radius={18} />
        </div>
      </div>
    </main>
  );
}
