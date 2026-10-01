'use client';

import { useChPhone } from '../../../lib/use-phone';
import { Skeleton } from '../../../ui/States';

/**
 * Route loading for the player's views, each in its own final shape and height (the Game profile's is CH-13460, Standing's CH-13470, the Deep dive's CH-13480), so nothing jumps
 * when the read lands. `coachhelm/loading.tsx` cannot see `?view=`, so the route wraps each view in its own Suspense
 * (routes/coachhelm.tsx) and these are the fallbacks.
 */
function Chrome({ label, code, children }: { label: string; code: string; children: React.ReactNode }) {
  const phone = useChPhone();
  // The sub-navigation: a bar the height of the radiogroup (desktop) or the chip row (phone), where the page puts it.
  const tabs = (
    <div className="ch-hv-sk-tabs">
      <Skeleton width={phone ? '100%' : 380} height={phone ? 36 : 38} radius={phone ? 18 : 12} />
    </div>
  );
  return (
    <main className={'ch-hl ch-hv' + (phone ? ' is-phone' : '')} aria-busy="true" aria-label={label} data-ch-code={code}>
      {phone && tabs}
      <header className="ch-hl-h">
        <Skeleton width={62} height={24} radius={12} />
        <Skeleton width={190} height={44} radius={10} />
        <Skeleton width={360} height={14} />
      </header>
      {!phone && tabs}
      {children}
    </main>
  );
}

function MeasureSkeleton() {
  return (
    <div className="ch-hg-sk__m">
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Skeleton width={90} height={11} />
        <Skeleton width={86} height={22} radius={11} />
      </div>
      <Skeleton width="52%" height={16} />
      <Skeleton width="62%" height={28} radius={8} />
      <Skeleton width="78%" height={13} />
      <Skeleton width="100%" height={34} radius={10} />
      <Skeleton width="94%" height={12} />
      <Skeleton width="70%" height={12} />
    </div>
  );
}

/** The Game profile: the persona card, then the seven measures (CH-13460). */
export function ProfileSkeleton() {
  return (
    <Chrome label="Loading your game profile" code="CH-13460">
      <div className="ch-hg-sk__hero">
        <Skeleton width={150} height={11} />
        <Skeleton width="78%" height={32} radius={8} />
        <Skeleton width="56%" height={32} radius={8} />
        <div className="ch-hg-sk__stand">
          <Skeleton width="100%" height={92} radius={14} />
          <Skeleton width="100%" height={92} radius={14} />
        </div>
      </div>
      <div className="ch-hg-sk__grid">
        {Array.from({ length: 6 }, (_, i) => (
          <MeasureSkeleton key={i} />
        ))}
      </div>
    </Chrome>
  );
}

function StandingGroupSkeleton({ rows }: { rows: number }) {
  return (
    <div className="ch-hs-sk__g">
      <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: 12 }}>
        <Skeleton width={150} height={20} radius={6} />
        <Skeleton width={240} height={12} />
      </div>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="ch-hs-sk__r">
          <span style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Skeleton width="62%" height={14} />
            <Skeleton width="44%" height={11} />
          </span>
          <Skeleton width="100%" height={8} radius={4} />
          <Skeleton width="100%" height={30} radius={8} />
        </div>
      ))}
    </div>
  );
}

/** Standing: the green card with what is most to gain, then the groups of stats (CH-13470). */
export function StandingSkeleton() {
  return (
    <Chrome label="Loading your standing" code="CH-13470">
      <div className="ch-hs-sk__hero">
        <div className="ch-hs-sk__col">
          <Skeleton width={150} height={11} />
          <Skeleton width="86%" height={32} radius={8} />
          <Skeleton width="60%" height={32} radius={8} />
          <Skeleton width="78%" height={13} />
        </div>
        <Skeleton width="100%" height={200} radius={16} />
      </div>
      <StandingGroupSkeleton rows={5} />
      <StandingGroupSkeleton rows={4} />
      <StandingGroupSkeleton rows={4} />
    </Chrome>
  );
}

/** Deep dive: the green summary, the list of reads and, on desktop, the read beside it (CH-13480). */
export function DiveSkeleton() {
  const phone = useChPhone();
  return (
    <Chrome label="Loading your deep dive" code="CH-13480">
      <div className="ch-hd-sk__hero">
        <div className="ch-hd-sk__col">
          <Skeleton width={150} height={11} />
          <Skeleton width="70%" height={32} radius={8} />
          <Skeleton width="86%" height={13} />
        </div>
        <Skeleton width="100%" height={72} radius={14} />
      </div>
      <div className="ch-hd">
        <div className="ch-hd-rail">
          {[4, 2].map((rows, g) => (
            <div key={g} className="ch-hd-sk__grp">
              <Skeleton width={110} height={16} radius={6} />
              {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="ch-hd-sk__it">
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
                    <Skeleton width="38%" height={10} />
                    <Skeleton width="86%" height={14} />
                  </span>
                  <Skeleton width={34} height={16} />
                </div>
              ))}
            </div>
          ))}
        </div>
        {!phone && (
          <div className="ch-hd-sk__dos">
            <Skeleton width={90} height={11} />
            <Skeleton width="78%" height={32} radius={8} />
            <Skeleton width="92%" height={15} />
            <Skeleton width="100%" height={150} radius={14} />
            <Skeleton width="100%" height={112} radius={14} />
            <Skeleton width="100%" height={168} radius={14} />
            <Skeleton width="100%" height={196} radius={14} />
          </div>
        )}
      </div>
    </Chrome>
  );
}
