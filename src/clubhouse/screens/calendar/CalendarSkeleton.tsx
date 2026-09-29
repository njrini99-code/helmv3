import { Skeleton } from '../../ui/States';
import '../../styles/calendar.css';

/** Route loading for Calendar: masthead, toolbar, the week grid and the panel, in place. */
export function CalendarSkeleton() {
  return (
    <main className="ch-cal" aria-busy="true" aria-label="Loading the calendar">
      <header className="ch-cal-mast">
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
        <Skeleton width={330} height={38} radius={12} />
        <Skeleton width={260} height={48} radius={14} />
      </div>
      <div className="ch-cal-body">
        <div className="ch-cal-surface" style={{ padding: 16, display: 'grid', gap: 14 }}>
          <Skeleton width="100%" height={48} radius={10} />
          <Skeleton width="100%" height={520} radius={10} />
        </div>
        <div className="ch-cal-surface" style={{ padding: 20, display: 'grid', gap: 14, alignContent: 'start' }}>
          <Skeleton width={120} height={12} />
          <Skeleton width={220} height={24} radius={8} />
          <Skeleton width="100%" height={56} radius={12} />
          <Skeleton width="100%" height={120} radius={12} />
        </div>
      </div>
    </main>
  );
}
