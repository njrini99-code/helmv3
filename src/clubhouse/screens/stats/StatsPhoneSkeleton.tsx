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
function Figures({ count, line = false }: { count: number; line?: boolean }) {
  return (
    <dl className={'ch-stm-figs' + (count === 3 ? ' is-three' : '') + (line ? ' is-line' : '')} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <dt>
            <Bar height={16.2}><Skeleton width={52} height={11} /></Bar>
          </dt>
          {/* The value's 22px line (the trend's words share it, so every caption below starts level). */}
          <dd className={count === 3 && i === 2 ? 'is-words' : undefined}>
            <Bar height={22}>
              <Skeleton width={44} height={count === 3 && i === 2 ? 16 : 20} radius={6} />
            </Bar>
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
    <main className="ch-stm is-team" aria-busy="true" aria-label="Loading stats" data-ch-code="CH-4401">
      {/* Direction A's large title: the 15px context line, then the 34px title's line. */}
      <header className="ch-stm-head" aria-hidden="true">
        <Bar height={19.5}>
          <Skeleton width={230} height={12} />
        </Bar>
        <Bar height={37.4}>
          <Skeleton width={170} height={30} radius={8} />
        </Bar>
      </header>
      <div className="ch-stm-controls" aria-hidden="true">
        <Skeleton width="100%" height={44} radius={12} />
      </div>
      {/* The hero: its label's line, then the 64px figure's line with the comparison on its baseline. */}
      <dl className="ch-stm-hero" aria-hidden="true">
        <dt>
          <Bar height={19.5}>
            <Skeleton width={110} height={12} />
          </Bar>
        </dt>
        <dd className="ch-stm-hero__v">
          <Bar height={64}>
            <Skeleton width={136} height={52} radius={10} />
          </Bar>
        </dd>
        <dd className="ch-stm-hero__c" />
      </dl>
      {/* The trend's box at the plot's 340:120, and the reading's line. */}
      <section className="ch-stm-trend" aria-hidden="true">
        <div className="ch-stm-chart-hold">
          <Skeleton width="100%" height={60} radius={10} />
        </div>
        <p className="ch-stm-note">
          <Bar height={19.6}>
            <Skeleton width={220} height={12} />
          </Bar>
        </p>
      </section>
      {/* The round: its header, three 60px rows in their group, and the coverage line held. */}
      <section className="ch-stm-panel" aria-hidden="true">
        <div className="ch-stm-panel__h">
          <h2>The round</h2>
        </div>
        <div className="ch-stm-group">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="ch-stm-figrow">
              <Skeleton width={150} height={14} />
              <Skeleton width={40} height={14} />
              <Skeleton width={28} height={12} />
            </div>
          ))}
        </div>
        <p className="ch-stm-cover" aria-hidden="true" />
      </section>
      {/* Strokes gained: the header, the 64px figure and five 44px rows in their group. */}
      <section className="ch-stm-panel" aria-hidden="true">
        <div className="ch-stm-panel__h">
          <h2>Strokes gained by leg</h2>
          <Bar height={18.9}>
            <Skeleton width={110} height={11} />
          </Bar>
        </div>
        <div className="ch-stm-group">
          <p className="ch-stm-sgfig">
            <Skeleton width={84} height={34} radius={8} />
          </p>
          <div className="ch-stm-legs">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="ch-stm-leg">
                <Skeleton width={84} height={13} />
                <Skeleton width="100%" height={6} />
                <Skeleton width={32} height={13} />
              </div>
            ))}
          </div>
        </div>
      </section>
      {/* P004-D7: the page keeps its one h1 while it loads (last, so the loaded order stays). */}
      <h1 className="ch-sr-only">Team stats</h1>
    </main>
  );
}

export function StatsPlayerPhoneSkeleton() {
  return (
    <main className="ch-stm" aria-busy="true" aria-label="Loading player stats" data-ch-code="CH-5403">
      {/* As loaded: the avatar beside the 26px name's line and the caption's, under the double rule. */}
      <header className="ch-spm-head" aria-hidden="true">
        <Skeleton width={48} height={48} radius={24} />
        <span className="ch-spm-head__id">
          <Bar height={28.6}>
            <Skeleton width={160} height={22} radius={7} />
          </Bar>
          <Bar height={18.2}>
            <Skeleton width={190} height={12} />
          </Bar>
        </span>
      </header>
      {/* As on the loaded page: the header, the window and filter row, then the figures. */}
      <div className="ch-stm-controls" aria-hidden="true">
        <Skeleton width="100%" height={44} radius={12} />
      </div>
      <div className="ch-stm-overview" aria-hidden="true">
        {/* The stat line: the figures, then the gauge row's height held empty (as Team stats). */}
        <Figures count={3} line />
        <div className="ch-stm-gauges" />
        <div className="ch-stm-overview__meta">
          <Bar height={20.3}><Skeleton width={180} height={12} /></Bar>
          <Bar height={20.3}><Skeleton width={140} height={12} /></Bar>
        </div>
      </div>
      <Panel rows={5} height={266} title="Strokes gained" />
      <Panel rows={4} height={175} title="Game detail" />
      <h1 className="ch-sr-only">Player stats</h1>
    </main>
  );
}
