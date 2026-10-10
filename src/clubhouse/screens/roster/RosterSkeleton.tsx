import { Skeleton } from '../../ui/States';
import '../../styles/roster.css';

/** Route loading for Roster: header, toolbar and six face cards in their final slots; on a phone, the list's rows (switched in CSS, since this renders on the server). */
export function RosterSkeleton() {
  return (
    <main className="ch-rs" data-canopy="" aria-busy="true" aria-label="Loading roster" data-ch-code="CH-3401">
      <div className="ch-rs-skel-desk">
        <header className="ch-rs-head" data-canopy-head="tight">
          <div>
            <Skeleton width={180} height={30} radius={15} />
            <Skeleton width={280} height={40} radius={10} />
            <Skeleton width={340} height={15} />
          </div>
        </header>
        <div className="ch-rs-bar">
          <Skeleton width={320} height={36} radius={10} />
          <Skeleton width={360} height={34} radius={12} />
        </div>
        <div className="ch-rs-faces">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="ch-rs-face" style={{ cursor: 'default' }}>
              <Skeleton width={76} height={76} radius={38} />
              <Skeleton width={120} height={16} />
              <Skeleton width={140} height={12} />
              <Skeleton width={150} height={30} radius={8} />
              <Skeleton width="100%" height={48} radius={10} />
            </div>
          ))}
        </div>
      </div>
      {/* The phone page's own classes, so the eyebrow, the title, the sort and each row land where the loaded page puts them. */}
      <div className="ch-rsm-skel ch-rsm-page">
        <div className="ch-rsm-head">
          <Skeleton width={124} height={14.4} />
          <span data-ch-large-title="">
            <Skeleton width={128} height={33.48} radius={8} />
          </span>
        </div>
        <div className="ch-rsm-sort">
          <Skeleton width={48} height={14} />
          <Skeleton width={156} height={40} radius={12} />
        </div>
        <ul className="ch-rsm-list" aria-hidden="true">
          {Array.from({ length: 7 }, (_, i) => (
            <li key={i}>
              <div className="ch-rsm-row ch-rsm-row--static">
                <Skeleton width={40} height={40} radius={20} />
                <span className="ch-rsm-row__b">
                  <Skeleton width={130} height={15} />
                  <Skeleton width={110} height={12} />
                </span>
                <span className="ch-rsm-row__v">
                  <Skeleton width={38} height={17} />
                  <Skeleton width={48} height={12} />
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
