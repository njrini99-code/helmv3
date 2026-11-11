import { Skeleton } from '../../ui/States';
import '../../styles/rounds.css';
import '../../styles/whats-new.css';
import { LargeTitleSkeleton } from '../../ui/LargeTitle';

/** Route loading for What's new: the head, the filter, then a day of rows, in place. */
export function WhatsNewSkeleton() {
  return (
    <main className="ch-rd ch-wn" aria-busy="true" aria-label="Loading what’s new" data-ch-code="CH-13430" data-canopy="">
      <header className="ch-rd-h" data-canopy-head="tight">
        <div>
          <Skeleton width={150} height={13} />
          <div style={{ height: 10 }} />
          <span className="ch-rd-sk-desk">
            <Skeleton width={170} height={36} radius={10} />
          </span>
          {/* The phone's title block (CONS-13): the bar hides its own title while this shows, as it will once the page lands. */}
          <LargeTitleSkeleton width={170} />
        </div>
      </header>
      <div className="ch-rd-tools">
        <Skeleton width={340} height={34} radius={11} />
      </div>
      <Skeleton width={120} height={20} radius={6} />
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} width="100%" height={72} radius={8} />
      ))}
    </main>
  );
}
