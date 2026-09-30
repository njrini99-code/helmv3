import { Skeleton } from '../../ui/States';
import '../../styles/recruiting.css';

/** Route loading for Recruiting: the header, the pipeline, the table rows and the panel in their final slots; on a phone, the list's rows (switched in CSS, since this renders on the server). */
export function RecruitingSkeleton() {
  return (
    <main className="ch-rec" aria-busy="true" aria-label="Loading recruiting" data-ch-code="CH-14401">
      <div className="ch-rec-skel-desk">
        <header className="ch-rec-head">
          <div>
            <Skeleton width={170} height={30} radius={15} />
            <Skeleton width={420} height={15} />
          </div>
          <Skeleton width={140} height={42} radius={21} />
        </header>
        <div className="ch-rec-pipe">
          <div className="ch-rec-pipe__head">
            <Skeleton width={180} height={14} />
          </div>
          <div className="ch-rec-skel-pipe">
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} className="ch-rec-skel-pipe__s">
                <Skeleton width={56} height={56} radius={28} />
                <Skeleton width={84} height={14} />
                <Skeleton width={120} height={12} />
              </div>
            ))}
          </div>
        </div>
        <div className="ch-rec-body has-panel">
          <div className="ch-rec-list">
            <div className="ch-rec-bar">
              <Skeleton width="60%" height={40} radius={12} />
              <Skeleton width={300} height={36} radius={12} />
            </div>
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="ch-rec-skel-row">
                <Skeleton width={32} height={32} radius={16} />
                <Skeleton width={150} height={14} />
                <Skeleton width={40} height={14} />
                <Skeleton width={110} height={14} />
                <Skeleton width={76} height={24} radius={7} />
              </div>
            ))}
          </div>
          <div className="ch-rec-panel">
            <div className="ch-rec-panel__top">
              <Skeleton width={52} height={52} radius={26} />
              <Skeleton width={180} height={18} />
              <Skeleton width="100%" height={42} radius={12} />
            </div>
            <div className="ch-rec-panel__body">
              <Skeleton width="100%" height={96} radius={14} />
              <Skeleton width="100%" height={84} radius={14} />
            </div>
          </div>
        </div>
      </div>
      <div className="ch-recm-skel">
        <Skeleton width={150} height={34} radius={10} />
        <Skeleton width="100%" height={40} radius={12} />
        <Skeleton width="100%" height={92} radius={18} />
        <div className="ch-recm-list">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="ch-recm-row" style={{ cursor: 'default' }}>
              <Skeleton width={36} height={36} radius={18} />
              <span className="ch-recm-row__b">
                <Skeleton width={130} height={15} />
                <Skeleton width={110} height={12} />
              </span>
              <Skeleton width={70} height={24} radius={7} />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
