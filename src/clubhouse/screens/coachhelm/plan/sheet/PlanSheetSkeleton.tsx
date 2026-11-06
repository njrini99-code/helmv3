import { Skeleton } from '../../../../ui/States';

/** The sheet's shape while it loads: masthead, title, the three facts, groups, then the schedule's rows. */
export function PlanSheetSkeleton() {
  return (
    <article className="ch-cp-sheet ch-cp-skel" data-density="phone" aria-hidden="true">
      <div className="ch-cp-skel__top">
        <Skeleton width={36} height={36} />
        <Skeleton width="45%" height={16} />
        <Skeleton width={44} height={52} />
      </div>
      <Skeleton width="72%" height={28} />
      <Skeleton width="90%" height={16} />
      <div className="ch-cp-skel__cols">
        <Skeleton height={44} />
        <Skeleton height={44} />
        <Skeleton height={44} />
      </div>
      <div className="ch-cp-skel__cols">
        <Skeleton height={88} />
        <Skeleton height={88} />
        <Skeleton height={88} />
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div className="ch-cp-skel__row" key={i}>
          <Skeleton width={44} height={32} />
          <Skeleton height={32} />
        </div>
      ))}
    </article>
  );
}
