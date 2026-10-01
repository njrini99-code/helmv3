import { Skeleton } from '../../ui/States';
import '../../styles/rounds.css';

/** Route loading for Rounds: the header, the round card beside the season, then a month of rounds, in place. */
export function RoundsSkeleton() {
  return (
    <main className="ch-rd" aria-busy="true" aria-label="Loading your rounds" data-ch-code="CH-11401">
      <header className="ch-rd-h">
        <div>
          <Skeleton width={200} height={13} />
          <div style={{ height: 10 }} />
          <Skeleton width={220} height={36} radius={10} />
        </div>
        <Skeleton width={128} height={40} radius={11} />
      </header>
      <div className="ch-rd-hero">
        <Skeleton width="100%" height={236} radius={20} />
        <Skeleton width="100%" height={236} radius={20} />
      </div>
      <div className="ch-rd-tools">
        <Skeleton width={260} height={38} radius={10} />
        <Skeleton width={190} height={34} radius={11} />
      </div>
      <div className="ch-rd-book">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} width="100%" height={80} radius={16} />
        ))}
      </div>
    </main>
  );
}

/** Route loading for a round's review (CH-11406): the back link, the green hero, five figures and the scorecard, in place. */
export function RoundReviewSkeleton() {
  return (
    <main className="ch-rv" aria-busy="true" aria-label="Loading the round" data-ch-code="CH-11406">
      <Skeleton width={96} height={34} radius={17} />
      <Skeleton width="100%" height={182} radius={20} />
      <Skeleton width="100%" height={96} radius={16} />
      <Skeleton width="100%" height={430} radius={18} />
    </main>
  );
}

/** Route loading for round entry, a new round and a round to continue (CH-11407): the header, the course card, the round's details and the scorecard, in place. */
export function RoundEntrySkeleton() {
  return (
    <main className="ch-rd" aria-busy="true" aria-label="Loading your round" data-ch-code="CH-11407">
      <Skeleton width={96} height={34} radius={17} />
      <Skeleton width="100%" height={150} radius={20} />
      <div className="ch-rd-hero">
        <Skeleton width="100%" height={260} radius={20} />
        <Skeleton width="100%" height={260} radius={20} />
      </div>
      <Skeleton width="100%" height={64} radius={16} />
    </main>
  );
}
