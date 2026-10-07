import type { ReactNode } from 'react';
import { Skeleton } from '../../ui/States';
import { SkeletonCoachActions } from './SkeletonCoachActions';
import '../../styles/qualifiers.css';

/** Route loading for the Qualifiers list: head, tools, the hero and a row of cards in their final slots. */
export function QualifiersSkeleton() {
  return (
    <main className="ch-qf ch-qf--list" aria-busy="true" aria-label="Loading qualifiers" data-ch-code="CH-09401" data-canopy="">
      <header className="ch-qf-head" data-canopy-head="">
        <div>
          <Skeleton width={200} height={11} />
          <Skeleton width={300} height={38} radius={10} />
          <Skeleton width={380} height={16} />
        </div>
        <Skeleton width={160} height={38} radius={10} />
      </header>
      <div className="ch-qf-tools">
        <Skeleton width={260} height={32} radius={16} />
        <Skeleton width={360} height={36} radius={10} />
      </div>
      <div className="ch-qf-hero" style={{ cursor: 'default' }}>
        <div className="ch-qf-hero__main">
          <Skeleton width={56} height={22} radius={5} />
          <Skeleton width={280} height={30} radius={8} />
          <Skeleton width="80%" height={14} />
          <Skeleton width={240} height={14} />
        </div>
        <Skeleton width="100%" height={180} radius={12} />
      </div>
      <div className="ch-qf-grid">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="ch-qf-card" style={{ cursor: 'default' }}>
            <Skeleton width={200} height={18} />
            <Skeleton width="90%" height={13} />
            <Skeleton width={220} height={13} />
          </div>
        ))}
      </div>
    </main>
  );
}

/** Route loading for one qualifier: the way back, head, facts, the leaderboard and the side sections. */
export function QualifierDetailSkeleton() {
  return (
    <main className="ch-qf" aria-busy="true" aria-label="Loading the qualifier" data-ch-code="CH-09402" data-canopy="">
      <div className="ch-qf-back">
        <Skeleton width={110} height={30} radius={8} />
      </div>
      {/* Each line at its loaded height (measured in WebKit 2026-10-07): the eyebrow, the name, the sentence at its
          measure (so the coach's actions sit where they do loaded), then the actions. The framed head's heights are the
          held lines' classes in qualifiers.css. */}
      <header className="ch-qf-head" data-canopy-head="">
        <div>
          <Skeleton width={140} height={22} radius={5} />
          <Held className="ch-qf-held--name">
            <Skeleton width={320} height={44} radius={10} />
          </Held>
          <Held className="ch-qf-held--lede">
            <Skeleton width={420} height={16} />
            <Skeleton width={260} height={16} />
          </Held>
        </div>
        <SkeletonCoachActions />
      </header>
      {/* The facts' four lines at their loaded heights: label, value, the line under it, and the drawing's line. */}
      <div className="ch-qf-facts">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i}>
            <Held height={13}>
              <Skeleton width={70} height={12} />
            </Held>
            <Held height={24} top={4}>
              <Skeleton width={90} height={22} radius={6} />
            </Held>
            <Held height={16}>
              <Skeleton width={60} height={12} />
            </Held>
            <Held height={10} top={2} />
          </div>
        ))}
      </div>
      <div className="ch-qf-body">
        <div className="ch-qf-panel ch-qf-skel">
          <Skeleton width={120} height={16} />
          {Array.from({ length: 7 }, (_, i) => (
            <Skeleton key={i} width="100%" height={44} radius={10} />
          ))}
        </div>
        <div className="ch-qf-col">
          <div className="ch-qf-side ch-qf-skel">
            <Skeleton width={100} height={16} />
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} width="100%" height={30} radius={8} />
            ))}
          </div>
          <div className="ch-qf-side ch-qf-skel">
            <Skeleton width={130} height={16} />
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} width="100%" height={30} radius={8} />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

/** Route loading for Manage selections: head, the three steps, the note, the places on score and the picks, in their final slots. */
export function QualifierSelectionSkeleton() {
  return (
    <main className="ch-qf ch-qfs" aria-busy="true" aria-label="Loading Manage selections" data-ch-code="CH-09409" data-canopy="">
      <div className="ch-qf-back">
        <Skeleton width={110} height={30} radius={8} />
      </div>
      <header className="ch-qf-head" data-canopy-head="">
        <div>
          <Held className="ch-qf-held--eyebrow">
            <Skeleton width={140} height={14} />
          </Held>
          <Held className="ch-qf-held--title">
            <Skeleton width={320} height={34} radius={10} />
          </Held>
          <Held className="ch-qf-held--line">
            <Skeleton width={380} height={16} />
          </Held>
        </div>
        <div className="ch-qf-head__act">
          <Skeleton width={150} height={38} radius={10} />
        </div>
      </header>
      <ol className="ch-qfs-steps" aria-hidden="true">
        {Array.from({ length: 3 }, (_, i) => (
          <li key={i}>
            <Skeleton width={22} height={22} radius={11} />
            <Skeleton width={96} height={13} />
          </li>
        ))}
      </ol>
      <div className="ch-qf-note">
        <Skeleton width={16} height={16} radius={8} />
        <Skeleton width="70%" height={14} />
      </div>
      <div className="ch-qf-body">
        <div className="ch-qf-col">
          <div className="ch-qf-panel ch-qf-skel">
            <Skeleton width={120} height={16} />
            {Array.from({ length: 4 }, (_, i) => (
              <Skeleton key={i} width="100%" height={42} radius={10} />
            ))}
          </div>
          <div className="ch-qf-panel ch-qf-skel">
            <Skeleton width={140} height={16} />
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} width="100%" height={42} radius={10} />
            ))}
          </div>
        </div>
        <div className="ch-qf-col">
          <div className="ch-qf-side ch-qf-skel">
            <Skeleton width={110} height={16} />
            <Skeleton width="100%" height={64} radius={10} />
          </div>
        </div>
      </div>
    </main>
  );
}

/** Route loading for the create and edit form. */
export function QualifierFormSkeleton() {
  return (
    <main className="ch-qf ch-qf--form" aria-busy="true" aria-label="Loading the qualifier form" data-ch-code="CH-09403" data-canopy="">
      {/* Not .ch-qf-back: the phone hides that, and this placeholder has always shown there. */}
      <Held className="ch-qf-held--back">
        <Skeleton width={110} height={30} radius={8} />
      </Held>
      <header className="ch-qf-head" data-canopy-head="">
        <div>
          <Held className="ch-qf-held--eyebrow">
            <Skeleton width={120} height={14} />
          </Held>
          <Held className="ch-qf-held--title">
            <Skeleton width={300} height={34} radius={10} />
          </Held>
          <Held className="ch-qf-held--line">
            <Skeleton width={420} height={16} />
          </Held>
        </div>
      </header>
      <div className="ch-qf-form">
        <div className="ch-qf-col">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="ch-qf-fs ch-qf-skel">
              <Skeleton width={120} height={16} />
              <Skeleton width="100%" height={38} radius={10} />
              <Skeleton width="100%" height={38} radius={10} />
            </div>
          ))}
        </div>
        <div className="ch-qf-fs ch-qf-skel">
          <Skeleton width={120} height={16} />
          <Skeleton width="100%" height={38} radius={10} />
          <Skeleton width="100%" height={44} radius={12} />
        </div>
      </div>
    </main>
  );
}

/**
 * A line held at a measured height and top margin, its placeholder inside. A class holds a head line instead: its phone
 * height, and the framed head's on desktop (qualifiers.css, "The Ledger").
 */
function Held({ height, top, className, children }: { height?: number; top?: number; className?: string; children?: ReactNode }) {
  return (
    <span className={'ch-qf-held' + (className ? ` ${className}` : '')} style={{ height, marginTop: top }} aria-hidden="true">
      {children}
    </span>
  );
}
