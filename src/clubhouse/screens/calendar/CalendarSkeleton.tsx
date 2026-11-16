'use client';

import { useSearchParams } from 'next/navigation';
import { Skeleton, SkelLine, SkelRows } from '../../ui/States';
import type { ChCalView } from './model';
import '../../styles/calendar.css';

/** `?view=` as the route reads it (data/calendar.ts parseView, which is server-only): day, month and agenda, else the week. */
export function skeletonView(v: string | null | undefined): ChCalView {
  return v === 'day' || v === 'month' || v === 'agenda' ? v : 'week';
}

/** The route's loading.tsx: the address already names the view, so the skeleton draws that view, never the week first (GAP-S-17). */
export function CalendarRouteSkeleton() {
  return <CalendarSkeleton view={skeletonView(useSearchParams().get('view'))} />;
}

/** The desktop's day, month and list in their loaded classes, the panel beside them as those views keep it. */
function DeskView({ view }: { view: Exclude<ChCalView, 'week'> }) {
  return (
    <div className="ch-cal-body" data-view={view}>
      <div style={{ minWidth: 0 }}>
        {view === 'day' && (
          <div className="ch-wk ch-cal-surface" style={{ display: 'grid', gap: 16 }}>
            <Skeleton width="100%" height={48} radius={10} />
            <Skeleton width="100%" height={820} radius={10} />
          </div>
        )}
        {view === 'month' && (
          <div className="ch-mo ch-cal-surface">
            <div className="ch-mo__dow" aria-hidden="true">
              {Array.from({ length: 7 }, (_, i) => (
                <span key={i}>
                  <Skeleton width={24} height={10} />
                </span>
              ))}
            </div>
            <div className="ch-mo__grid" aria-hidden="true">
              {Array.from({ length: 5 }, (_, w) => (
                <div key={w} className="ch-mo__week">
                  {Array.from({ length: 7 }, (_, d) => (
                    <div key={d} className="ch-mo__gc">
                      <div className="ch-mo__cell" style={{ cursor: 'default' }}>
                        <Skeleton width={18} height={14} radius={4} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
        {view === 'agenda' && (
          <div className="ch-ag" aria-hidden="true">
            {[3, 2, 2].map((rows, i) => (
              <div key={i} className="ch-ag__day">
                <div className="ch-ag__when">
                  <Skeleton width={70} height={15} />
                  <Skeleton width={90} height={12} />
                </div>
                <div className="ch-ag__list ch-cal-surface">
                  <SkelRows rows={rows} lead />
                </div>
              </div>
            ))}
          </div>
        )}
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
  );
}

/** The phone's view under its opening: Day's week strip and day, Month's grid and the chosen day, or List's days. */
function PhoneView({ view }: { view: ChCalView }) {
  const day = (
    <div className="ch-calm-skel__day">
      {/* The day's heading as it loads: its 18px line beside the week arrows' 30px box (drawn empty), then the
          day's counts on a line of their own, 64px in all, so the rows start where the day's do. */}
      <div className="ch-calm-dayk ch-calm-skel__dayk">
        <SkelLine line={18} bar={15} width={150} />
        <span className="ch-calm-skel__step" />
        <SkelLine line={15} bar={10} width={170} />
      </div>
      <SkelRows rows={4} lead />
    </div>
  );
  if (view === 'month') {
    // The grid in react-day-picker's Clubhouse classes (month.tsx), the weekdays' rule over five weeks, then the chosen day.
    return (
      <>
        <section className="ch-calm-month" aria-hidden="true">
          <div className="ch-calm-month__h">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i}>
                <Skeleton width={10} height={10} radius={3} />
              </span>
            ))}
          </div>
          <div className="ch-calm-month__g">
            {Array.from({ length: 5 }, (_, w) => (
              <div key={w} className="ch-calm-month__w">
                {Array.from({ length: 7 }, (_, d) => (
                  <div key={d} className="ch-calm-month__d">
                    <span className="ch-calm-month__c" style={{ cursor: 'default' }}>
                      <Skeleton width={22} height={15} radius={4} />
                    </span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
        {day}
      </>
    );
  }
  if (view === 'agenda') {
    // List: the days one under another, each its heading and rows; no week strip.
    return (
      <>
        {[3, 2].map((rows, i) => (
          <div key={i} className="ch-calm-skel__day">
            <div className="ch-calm-dayk ch-calm-skel__dayk">
              <SkelLine line={18} bar={15} width={i ? 110 : 150} />
            </div>
            <SkelRows rows={rows} lead />
          </div>
        ))}
      </>
    );
  }
  return (
    <>
      <div className="ch-calm-skel__week">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className="ch-calm-skel__d">
            <Skeleton width={8} height={10} radius={3} />
            <Skeleton width={18} height={15} radius={4} />
          </span>
        ))}
      </div>
      {day}
    </>
  );
}

/** Route loading for Calendar: masthead, toolbar, the view the address names (the week by default) and the panel, in place. */
export function CalendarSkeleton({ view = 'week' }: { view?: ChCalView } = {}) {
  return (
    <main className="ch-cal ch-cal--skel" aria-busy="true" aria-label="Loading the calendar" data-ch-code="CH-6401" data-canopy="">
      <header className="ch-cal-mast" data-canopy-head="tight">
        <div>
          <Skeleton width={260} height={38} radius={10} />
          <div style={{ height: 10 }} />
          <Skeleton width={240} height={14} />
        </div>
        <div className="ch-cal-tools">
          <Skeleton width={36} height={36} radius={11} />
          <Skeleton width={145} height={36} radius={11} />
        </div>
      </header>
      <div className="ch-cal-bar">
        <Skeleton width={348} height={38} radius={12} />
        <Skeleton width={333} height={48} radius={14} />
      </div>
      {/* The view and the panel in the loaded page’s own classes, so they sit flush on the Ledger like it does. Calendar
          opens on the week, whose panel lies under it on the desktop (owner, 2026-11-11), so the skeleton waits that way. */}
      {view === 'week' ? (
        <div className="ch-cal-body" data-view="week">
          <div className="ch-wk ch-cal-surface" style={{ display: 'grid', gap: 16 }}>
            {/* The week's legend, in the week's head. */}
            <div className="ch-cal-legend" aria-hidden="true">
              <Skeleton width={333} height={18} radius={9} />
            </div>
            <Skeleton width="100%" height={48} radius={10} />
            <Skeleton width="100%" height={820} radius={10} />
          </div>
          <div className="ch-in-wrap ch-cal-surface" data-under="">
            <div className="ch-in">
              <Skeleton width={120} height={12} />
              <Skeleton width={220} height={24} radius={8} />
              <Skeleton width="100%" height={56} radius={12} />
              <Skeleton width="100%" height={120} radius={12} />
            </div>
          </div>
        </div>
      ) : (
        <DeskView view={view} />
      )}
      {/* The phone's shape, in the loaded page's own classes so nothing moves when it lands: the month's opening under its
          double rule with the view switch, the flush week, the day's heading on its own rule, and the day's rows on
          their seams. Switched in CSS, since this renders on the server. */}
      <div className="ch-calm-skel">
        <div className="ch-intro ch-calm-head">
          {/* The eyebrow's line as the phone draws it (14.8px, WebKit 390), so the title row lands where it loads. */}
          <SkelLine line={14.8} bar={9} width={124} />
          <span className="ch-intro__row">
            <SkelLine line={37} bar={26} width={120} />
            <Skeleton width={213} height={42} radius={12} />
          </span>
        </div>
        <PhoneView view={view} />
      </div>
    </main>
  );
}
