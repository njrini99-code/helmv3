'use client';

import { useGolfUserOptional } from '@/contexts/golf-user-context';
import { Skeleton } from '../../ui/States';
import { useChPhone } from '../../lib/use-phone';
import '../../styles/coachhelm.css';

function FocusSkeleton() {
  return (
    <div className="ch-hl-sk__card">
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Skeleton width={140} height={11} />
        <Skeleton width={90} height={22} radius={11} />
      </div>
      <Skeleton width="84%" height={30} radius={8} />
      <Skeleton width="56%" height={30} radius={8} />
      <Skeleton width="92%" height={13} />
      <Skeleton width="70%" height={13} />
      <Skeleton width="100%" height={140} radius={16} />
      <Skeleton width="100%" height={90} radius={16} />
    </div>
  );
}

function RowsSkeleton({ rows, avatar }: { rows: number; avatar: number }) {
  return (
    <div className="ch-hl-sk__col">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Skeleton width={avatar} height={avatar} radius={avatar / 2.6} />
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton width="46%" height={12} />
            <Skeleton width="72%" height={10} />
          </span>
          <Skeleton width={22} height={22} radius={11} />
        </div>
      ))}
    </div>
  );
}

/**
 * Route loading for CoachHelm, in each role's own shape (gh-states.jsx): the
 * player's focus beside a short list; the coach's program pulse, then the
 * players beside the focus. CH-13401 (player) and CH-13402 (coach).
 */
export function CoachHelmSkeleton({ view }: { view: 'coach' | 'player' }) {
  const coach = view === 'coach';
  const phone = useChPhone();
  return (
    <main className={'ch-hl' + (phone ? ' is-phone' : '')} aria-busy="true" aria-label="Loading CoachHelm" data-ch-code={coach ? 'CH-13402' : 'CH-13401'}>
      <header className="ch-hl-h">
        <Skeleton width={62} height={24} radius={12} />
        <Skeleton width={190} height={44} radius={10} />
        <Skeleton width={360} height={14} />
      </header>
      {coach ? (
        <>
          <div className="ch-hl-sk__pulse">
            <Skeleton width={110} height={11} />
            <RowsSkeleton rows={2} avatar={30} />
          </div>
          <div className="ch-hl-sk ch-hl-sk--coach">
            <RowsSkeleton rows={4} avatar={34} />
            <FocusSkeleton />
          </div>
        </>
      ) : (
        <div className="ch-hl-sk ch-hl-sk--player">
          <FocusSkeleton />
          <div className="ch-hl-sk__col">
            <Skeleton width={120} height={11} />
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Skeleton width={10} height={10} radius={5} />
                <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Skeleton width="40%" height={10} />
                  <Skeleton width="80%" height={13} />
                </span>
                <Skeleton width={36} height={13} />
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  );
}

/** For loading.tsx: the shell knows who is signed in, so the skeleton takes their role's shape (a player until it is known). */
export function CoachHelmRouteSkeleton() {
  const role = useGolfUserOptional()?.role;
  return <CoachHelmSkeleton view={role === 'coach' ? 'coach' : 'player'} />;
}
