import { Skeleton } from '../../ui/States';
import '../../styles/stats.css';

/**
 * Route loading for Stats on the phone (F-44): the phone page's own shape and classes (StatsTeamPhone,
 * StatsPlayerPhone), so the hand-off changes only the words. The desktop skeleton's hero, figure cards and tabs
 * drew a different page on the phone.
 */
function Panel({ rows, chart = false }: { rows: number; chart?: boolean }) {
  return (
    <section className="ch-stm-panel" aria-hidden="true">
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

function Figures({ count }: { count: number }) {
  return (
    <dl className="ch-stm-figs" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <dt>
            <Skeleton width={52} height={11} />
          </dt>
          <dd>
            <Skeleton width={44} height={20} radius={6} />
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
        <Skeleton width={230} height={12} />
        <Skeleton width={150} height={28} radius={8} />
      </header>
      <div className="ch-stm-controls" aria-hidden="true">
        <Skeleton width="100%" height={40} radius={12} />
      </div>
      <Figures count={4} />
      <Panel rows={0} chart />
      <Panel rows={4} />
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
      <Figures count={3} />
      <div className="ch-stm-controls" aria-hidden="true">
        <Skeleton width="100%" height={40} radius={12} />
      </div>
      <Panel rows={0} chart />
      <Panel rows={4} />
    </main>
  );
}
