'use client';

import type { CSSProperties } from 'react';
import { useSearchParams } from 'next/navigation';
import { Skeleton, SkelLine, SkelRows } from '../../ui/States';
import { parseHubTab, type ChHubTab } from '../../lib/hub-tabs';
import { useClubhouseRole } from '../../shell/context';
import { HubSkeletonAction, HubSkeletonChip, HubSkeletonStrip, HubSkeletonTop } from './HubSkeletonTop';
import '../../styles/hub.css';

/** The route's loading.tsx: `?tab=` (tasks, travel, docs, ann) decides the panel the skeleton draws, never Home first (GAP-S-17). */
export function HubRouteSkeleton() {
  const role = useClubhouseRole() === 'player' ? 'player' : 'coach';
  return <HubSkeleton tab={parseHubTab(useSearchParams().get('tab') ?? undefined, role)} />;
}

/** A section card in the loaded page's classes: its heading and rows on seams. */
function SkelCard({ rows, head = 84 }: { rows: number; head?: number }) {
  return (
    <section className="ch-hb-card">
      <div className="ch-hb-card__h">
        <SkelLine line={22} bar={15} width={head} />
        <SkelLine line={16} bar={10} width={64} />
      </div>
      <SkelRows rows={rows} lead />
    </section>
  );
}

/** Another tab's panel than Home, in its own container (TeamHub's tab panels), both widths. */
function TabPanel({ tab }: { tab: Exclude<ChHubTab, 'home'> }) {
  if (tab === 'travel') {
    return (
      <div className="ch-hb-travel" data-ch-skel-tab="travel">
        <div className="ch-hb-pass is-big" style={{ minHeight: 220 }} />
        <SkelCard rows={2} head={96} />
      </div>
    );
  }
  if (tab === 'docs') {
    return (
      <div className="ch-hb-docs" data-ch-skel-tab="docs">
        <SkelCard rows={3} head={90} />
        <SkelCard rows={2} head={70} />
      </div>
    );
  }
  return (
    <div className={'ch-hb-list' + (tab === 'tasks' ? ' is-board' : '')} data-ch-skel-tab={tab}>
      {(tab === 'tasks' ? [4, 2] : [3, 3, 2]).map((rows, i) => (
        <SkelCard key={i} rows={rows} head={i ? 72 : 120} />
      ))}
    </div>
  );
}

/**
 * Route loading for Team Hub (CH-10405): the header, the tab strip and the open tab's panel (Home's first widgets by
 * default), in place. On a phone the opening and the tabs take the signed-in role's shape from the shell
 * (HubSkeletonTop); the desktop draws the shape both roles share.
 */
export function HubSkeleton({ tab = 'home' }: { tab?: ChHubTab } = {}) {
  return (
    <main className="ch-hb ch-hb--skel" data-canopy="" aria-busy="true" aria-label="Loading Team Hub" data-ch-code="CH-10405" data-tab={tab}>
      <header className="ch-hb-h" data-canopy-head="tight">
        <div>
          <HubSkeletonChip />
          <Skeleton width={220} height={40} radius={10} />
          <div style={{ height: 12 }} />
          <Skeleton width={150} height={13} />
        </div>
        <HubSkeletonAction />
        <HubSkeletonStrip />
      </header>
      <div className="ch-hb-tabs" aria-hidden="true">
        {[64, 118, 62, 96].map((w, i) => (
          <Skeleton key={i} width={w} height={14} />
        ))}
      </div>
      {/* Home's widgets in place: the trip and the week, then the second row, on the loaded tiles' own spans. */}
      {tab !== 'home' ? <TabPanel tab={tab} /> : <div className="ch-hb-bento">
        <div className="ch-hw ch-hw--dark" style={{ '--ch-hw-span': 7, minHeight: 368 } as CSSProperties} />
        <div className="ch-hw" style={{ '--ch-hw-span': 5, minHeight: 368 } as CSSProperties}>
          <Skeleton width={90} height={14} />
          <Skeleton width="100%" height={60} radius={10} />
          <Skeleton width="80%" height={14} />
          <Skeleton width="60%" height={14} />
        </div>
        <div className="ch-hw" style={{ '--ch-hw-span': 8, minHeight: 419 } as CSSProperties}>
          <Skeleton width={90} height={14} />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} width="100%" height={28} radius={6} />
          ))}
        </div>
        <div className="ch-hw" style={{ '--ch-hw-span': 4, minHeight: 419 } as CSSProperties}>
          <Skeleton width={90} height={14} />
          <Skeleton width="85%" height={18} />
          <Skeleton width={60} height={34} radius={8} />
        </div>
      </div>}
      {/* The phone's shape (hub.css), in the loaded page's own classes so it lands in place: the opening on its double
          rule with a coach's role chip and the team line (and a coach's New announcement), the tabs on their hairline, then
          two flush sections with their headings and rows on seams. Switched in CSS, since this renders on the server. */}
      <div className="ch-hb-skelm">
        <HubSkeletonTop />
        {tab !== 'home' ? (
          <TabPanel tab={tab} />
        ) : (
          <>
            {/* The trip's dark tile leads, as tall as the loaded one, so the sections under it land where they stood. */}
            <div className="ch-hw ch-hw--dark" style={{ minHeight: 448 }} />
            {[3, 2].map((rows, i) => (
              <SkelCard key={i} rows={rows} head={i ? 84 : 72} />
            ))}
          </>
        )}
      </div>
    </main>
  );
}
