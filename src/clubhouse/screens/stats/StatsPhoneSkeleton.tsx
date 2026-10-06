import type { ReactNode } from 'react';
import { Skeleton } from '../../ui/States';
import '../../styles/stats.css';

/**
 * Route loading for Stats on the phone (F-44): the phone page's own shape and classes (StatsTeamPhone,
 * StatsPlayerPhone), so the hand-off changes only the words. The desktop skeleton's hero, figure cards and tabs
 * drew a different page on the phone.
 *
 * Perf 2026-10-01: the blocks are the loaded page's height (measured with `npm run clubhouse:perf`, geometry), so what is
 * on screen does not move when the figures land. A bar sits in a box the height of its real line.
 */
function Bar({ height, children }: { height: number; children: ReactNode }) {
  return <span style={{ display: 'flex', alignItems: 'center', height }}>{children}</span>;
}

/** The trend uses the loaded chart aspect ratio; other panels retain their measured minimum. */
function Panel({ rows, chart = false, height, title }: { rows: number; chart?: boolean; height: number; title: string }) {
  return (
    <section className="ch-stm-panel" aria-hidden="true" style={{ minHeight: height }}>
      <div className="ch-stm-panel__h">
        <h2>{title}</h2>
        <Bar height={18.2}><Skeleton width={106} height={12} /></Bar>
      </div>
      {chart ? (
        <div className="ch-stm-chart-hold"><Skeleton width="100%" height={60} radius={10} /></div>
      ) : (
        Array.from({ length: rows }, (_, i) => <Skeleton key={i} width="100%" height={14} />)
      )}
      {chart && <p className="ch-stm-note"><Bar height={18.85}><Skeleton width={180} height={12} /></Bar></p>}
    </section>
  );
}

/** The strip's second line (a change or a caption) is in the loaded strip on Last 10, the window a page opens on. */
function Figures({ count }: { count: number }) {
  return (
    <dl className={'ch-stm-figs' + (count === 3 ? ' is-three' : '')} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <dt>
            <Bar height={16.2}><Skeleton width={52} height={11} /></Bar>
          </dt>
          <dd className={count === 3 && i === 2 ? 'is-words' : undefined}>
            <Skeleton width={44} height={count === 3 && i === 2 ? 15 : 20} radius={6} />
          </dd>
          <dd>
            <Skeleton width={36} height={11} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function StatsTeamPhoneSkeleton() {
  return (
    <main className="ch-stm" aria-busy="true" aria-label="Loading stats" data-ch-code="CH-4401">
      <header className="ch-stm-head" aria-hidden="true">
        <Bar height={18.2}>
          <Skeleton width={230} height={12} />
        </Bar>
        <Bar height={30.8}>
          <Skeleton width={150} height={28} radius={8} />
        </Bar>
      </header>
      <div className="ch-stm-controls" aria-hidden="true">
        <Skeleton width="100%" height={44} radius={12} />
      </div>
      <Figures count={4} />
      <p className="ch-stm-cover" aria-hidden="true"><Skeleton width={180} height={12} /></p>
      <Panel rows={0} chart height={0} title="Scoring trend" />
      <Panel rows={5} height={266} title="Strokes gained by leg" />
    </main>
  );
}

export function StatsPlayerPhoneSkeleton() {
  return (
    <main className="ch-stm" aria-busy="true" aria-label="Loading player stats" data-ch-code="CH-5403">
      <header className="ch-spm-head" aria-hidden="true">
        <Skeleton width={48} height={48} radius={24} />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton width={160} height={22} radius={7} />
          <Skeleton width={190} height={12} />
        </span>
      </header>
      {/* As on the loaded page: the header, the window and filter row, then the figures. */}
      <div className="ch-stm-controls" aria-hidden="true">
        <Skeleton width="100%" height={44} radius={12} />
      </div>
      <div className="ch-stm-overview" aria-hidden="true">
        <Figures count={3} />
        <div className="ch-stm-overview__meta">
          <Bar height={20.3}><Skeleton width={180} height={12} /></Bar>
          <Bar height={20.3}><Skeleton width={140} height={12} /></Bar>
        </div>
      </div>
      <Panel rows={5} height={266} title="Strokes gained" />
      <Panel rows={4} height={175} title="Game detail" />
    </main>
  );
}
