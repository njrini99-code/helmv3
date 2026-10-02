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

/** `height`: the loaded panel's (the trend 204, the legs 250 on Team stats; the strokes gained 250 and the next 175 on a profile). */
function Panel({ rows, chart = false, height }: { rows: number; chart?: boolean; height: number }) {
  return (
    <section className="ch-stm-panel" aria-hidden="true" style={{ minHeight: height }}>
      <div className="ch-stm-panel__h">
        <Skeleton width={120} height={16} />
        <Skeleton width={84} height={12} />
      </div>
      {chart ? (
        <Skeleton width="100%" height={110} radius={10} />
      ) : (
        Array.from({ length: rows }, (_, i) => <Skeleton key={i} width="100%" height={14} />)
      )}
    </section>
  );
}

/** The strip's second line (a change or a caption) is in the loaded strip on Last 10, the window a page opens on. */
function Figures({ count }: { count: number }) {
  return (
    <dl className={'ch-stm-figs' + (count === 3 ? ' is-three' : '')} aria-hidden="true" style={count === 3 ? { minHeight: 125 } : undefined}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <dt>
            <Skeleton width={52} height={11} />
          </dt>
          <dd>
            <Skeleton width={44} height={20} radius={6} />
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
        <Bar height={17}>
          <Skeleton width={230} height={12} />
        </Bar>
        <Bar height={31}>
          <Skeleton width={150} height={28} radius={8} />
        </Bar>
      </header>
      <div className="ch-stm-controls" aria-hidden="true">
        <Skeleton width="100%" height={40} radius={12} />
      </div>
      <Figures count={4} />
      <Panel rows={0} chart height={204} />
      <Panel rows={4} height={250} />
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
        <Skeleton width="100%" height={40} radius={12} />
      </div>
      <Figures count={3} />
      <Panel rows={4} height={250} />
      <Panel rows={4} height={175} />
    </main>
  );
}
