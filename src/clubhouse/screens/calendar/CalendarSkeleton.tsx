import { Skeleton } from '../../ui/States';
import '../../styles/calendar.css';

/** Route loading for Calendar: masthead, toolbar, the week grid and the panel, in place. */
export function CalendarSkeleton() {
  return (
    <main className="ch-cal ch-cal--skel" aria-busy="true" aria-label="Loading the calendar" data-ch-code="CH-6401" data-canopy="">
      <header className="ch-cal-mast" data-canopy-head="">
        <div>
          <Skeleton width={260} height={38} radius={10} />
          <div style={{ height: 10 }} />
          <Skeleton width={240} height={14} />
        </div>
        <div className="ch-cal-tools">
          <Skeleton width={40} height={40} radius={11} />
          <Skeleton width={140} height={40} radius={11} />
        </div>
      </header>
      <div className="ch-cal-bar">
        <Skeleton width={357} height={38} radius={12} />
        <Skeleton width={313} height={48} radius={14} />
        <div className="ch-cal-legend" aria-hidden="true">
          <Skeleton width={333} height={18} radius={9} />
        </div>
      </div>
      {/* The view and the panel in the loaded page's own classes, so they sit flush on the Ledger like it does. */}
      <div className="ch-cal-body">
        <div className="ch-wk ch-cal-surface" style={{ display: 'grid', gap: 14 }}>
          <Skeleton width="100%" height={48} radius={10} />
          <Skeleton width="100%" height={820} radius={10} />
        </div>
        <div className="ch-in-wrap ch-cal-surface">
          <div className="ch-in">
            <Skeleton width={120} height={12} />
            <Skeleton width={220} height={24} radius={8} />
            <Skeleton width="100%" height={56} radius={12} />
            <Skeleton width="100%" height={120} radius={12} />
          </div>
        </div>
      </div>
      {/* The phone's shape (board: Coach · Loading): the month and view switch, the week, the day's rows. Switched in CSS, since this renders on the server. */}
      <div className="ch-calm-skel">
        <div className="ch-calm-head">
          <Skeleton width={130} height={30} radius={8} />
          <Skeleton width={154} height={32} radius={12} />
        </div>
        <div className="ch-calm-skel__week">
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} width="100%" height={52} radius={12} />
          ))}
        </div>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="ch-calm-skel__row">
            <Skeleton width={44} height={34} radius={8} />
            <span>
              <Skeleton width="55%" height={13} />
              <Skeleton width="35%" height={11} />
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}
