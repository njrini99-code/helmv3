import type { ReactNode } from 'react';
import { Skeleton } from '../../ui/States';
import { SkeletonCoachActions } from './SkeletonCoachActions';
import { SkeletonLede, SkeletonListAction, SkeletonMine } from './SkeletonListParts';
import '../../styles/qualifiers.css';

/**
 * Route loading for the Qualifiers list: head, tools, the hero and a row of cards in their final slots; on a phone, the
 * list's own shape (below). `mode`: a player's own entries (/my-qualifiers), whose lede is another sentence.
 */
export function QualifiersSkeleton({ mode = 'all' }: { mode?: 'all' | 'mine' }) {
  return (
    <main className="ch-qf ch-qf--list" aria-busy="true" aria-label="Loading qualifiers" data-ch-code="CH-09401" data-canopy="">
      <header className="ch-qf-head" data-canopy-head="">
        <div>
          <Skeleton width={200} height={11} />
          <Skeleton width={300} height={38} radius={10} />
          <Skeleton width={380} height={16} />
          {/* The phone draws the lede as the reader's own sentence instead of the bar above (qualifiers.css). */}
          <SkeletonLede mode={mode} />
        </div>
        <SkeletonListAction />
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
      {/* The phone's list (board 01) on the loaded page's own classes, each line at its loaded height (WebKit 390,
          2026-10-08): the live qualifier's place (its status, name, dates, three leaders and their caption, a player's
          standing and the link), then Active and Concluded under the double rule, their rows on seams. The desktop hero
          and cards above are hidden on the phone, and this on desktop (qualifiers.css). */}
      <div className="ch-qf-skel-phone" aria-hidden="true">
        <div className="ch-qf-hero" style={{ cursor: 'default' }}>
          <div className="ch-qf-hero__main">
            <Skeleton width={52} height={22} radius={5} />
            <Held height={26.45} top={4}>
              <Skeleton width={190} height={20} radius={6} />
            </Held>
            <SkelMeta />
            <SkeletonMine />
            <span className="ch-qf-cta">
              <Held height={16}>
                <Skeleton width={128} height={12} />
              </Held>
            </span>
          </div>
          <div className="ch-qf-lead ch-scoreboard">
            {/* A div, not a Held span: the caption's first span is its hidden label (qualifiers.css). */}
            <div className="ch-qf-lead__h">
              <div className="ch-qf-held" style={{ height: 12 }}>
                <Skeleton width={96} height={10} />
              </div>
            </div>
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i}>
                <div className="ch-qf-lead__r">
                  <Skeleton width={14} height={13} />
                  <Skeleton width={120} height={13} />
                  <Skeleton width={26} height={15} />
                </div>
              </div>
            ))}
          </div>
        </div>
        {PHONE_SECTIONS.map(({ heading, rows }, s) => (
          <section key={s} className="ch-qf-sec">
            <div className="ch-qf-skel-h">
              <Held height={22.8}>
                <Skeleton width={heading} height={16} />
              </Held>
            </div>
            <div className="ch-qf-grid is-ledger">
              {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="ch-qf-card" style={{ cursor: 'default' }}>
                  <div className="ch-qf-card__h">
                    <Held height={18.75}>
                      <Skeleton width={160} height={14} />
                    </Held>
                    <Skeleton width={84} height={22} radius={5} />
                  </div>
                  <SkelMeta />
                  <SkeletonMine />
                  <span className="ch-qf-cta is-quiet">
                    <Held height={15}>
                      <Skeleton width={96} height={11} />
                    </Held>
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

/** The phone list's sections in waiting: Active (the qualifiers after the live one), then Concluded. */
const PHONE_SECTIONS = [
  { heading: 64, rows: 1 },
  { heading: 96, rows: 2 },
];

/** A qualifier's meta at its loaded height: the dates on their own line, then the course and the squad. */
function SkelMeta() {
  return (
    <div className="ch-qf-meta">
      <Held height={19.6}>
        <Skeleton width={170} height={12} />
      </Held>
      <Held height={19.6}>
        <Skeleton width={130} height={12} />
      </Held>
    </div>
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
      {/* The phone's qualifier (QualifierDetailPhone) on its own classes, each line at the loaded line's height: the
          status and dates, the name, the entrants line, the coach's two actions, the three figures and the
          leaderboard's rows. The desktop shape above is hidden on the phone (qualifiers.css). */}
      <div className="ch-qfm ch-qfm-skel" aria-hidden="true">
        <div className="ch-qfm-head">
          <span className="ch-qfm-head__k">
            <Skeleton width={52} height={22} radius={5} />
            <Skeleton width={92} height={13} />
          </span>
          <Held className="ch-qfm-held--name">
            <Skeleton width={250} height={28} radius={8} />
          </Held>
          <Held className="ch-qfm-held--line">
            <Skeleton width={150} height={14} />
          </Held>
        </div>
        <SkeletonCoachActions phone />
        <div className="ch-qfm-facts">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i}>
              <Held className="ch-qfm-held--dt">
                <Skeleton width={58} height={12} />
              </Held>
              <Skeleton width={64} height={22} radius={6} />
              <Held className="ch-qfm-held--viz" />
            </div>
          ))}
        </div>
        <div className="ch-qf-panel">
          <div className="ch-qf-panel__head">
            <Held className="ch-qfm-held--h2">
              <Skeleton width={128} height={18} />
            </Held>
          </div>
          <ol className="ch-qfm-lb">
            {Array.from({ length: 5 }, (_, i) => (
              <li key={i}>
                <span className="ch-qfm-lb__row is-static">
                  <span className="ch-qfm-lb__top">
                    <Skeleton width={14} height={14} />
                    <Skeleton width={32} height={32} radius={16} />
                    <span className="ch-qfm-lb__n">
                      <Held className="ch-qfm-held--b">
                        <Skeleton width={128} height={14} />
                      </Held>
                      <Skeleton width={74} height={22} radius={5} />
                    </span>
                    <Skeleton width={26} height={17} />
                  </span>
                  <span className="ch-qfm-lb__g ch-well-soft">
                    {Array.from({ length: 3 }, (_, j) => (
                      <span key={j}>
                        <Held className="ch-qfm-held--em">
                          <Skeleton width={40} height={10} />
                        </Held>
                        <Held className="ch-qfm-held--fig">
                          <Skeleton width={34} height={12} />
                        </Held>
                      </span>
                    ))}
                  </span>
                </span>
              </li>
            ))}
          </ol>
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
