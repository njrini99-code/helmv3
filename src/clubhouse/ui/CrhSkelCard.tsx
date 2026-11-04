import { Skeleton } from './States';

/** A loading card in the lane's shape (classes-roster-home 06 §11.3): the real title over rows of bars, so only the figures land. */
export function CrhSkelCard({ title, rows = 3 }: { title: string; rows?: number }) {
  return (
    <div className="ch-crh-skcard" aria-hidden="true">
      <b>{title}</b>
      {Array.from({ length: rows }, (_, i) => (
        <span key={i} className="ch-crh-skcard__r">
          <span>
            <Skeleton width={`${44 - i * 4}%`} height={13} />
            <Skeleton width={`${60 - i * 6}%`} height={11} />
          </span>
          <Skeleton width={34} height={16} radius={8} />
        </span>
      ))}
    </div>
  );
}
