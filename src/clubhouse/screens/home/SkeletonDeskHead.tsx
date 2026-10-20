'use client';

import type { ReactNode } from 'react';
import { useClubhouseRole } from '../../shell/context';
import { Skeleton } from '../../ui/States';

/** A bar centred in a box the height of its real line, so the text lands where the bar was. */
function Line({ height, children }: { height: number; children: ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', height }}>{children}</div>;
}

/** A bar on the form's green stage, in a box the height of its loaded line. */
function StageLine({ height, bar, width }: { height: number; bar: number; width: number | string }) {
  return (
    <span className="ch-h-form__ln" style={{ height }}>
      <span className="ch-h-form__bar" style={{ width, height: bar }} />
    </span>
  );
}

/**
 * Desktop Home's head in waiting, in the reader's own shape (the shell's role, as SkeletonPhoneHero): the coach's has the
 * two-line brief and, under the head, the team's scoring form on its stage (CoachHome renders TeamForm there); the
 * player's head is the date, the greeting and the two actions, with no brief and no form. So the sheet lands where its
 * bars were for either. Without a role (a test, a coach) it draws the coach's.
 */
export function SkeletonDeskHead() {
  const player = useClubhouseRole() === 'player';
  return (
    <>
      {/* Line for line as loaded (perf 2026-10-01, measured with `npm run clubhouse:perf`): the date, the greeting, a two-line sentence and the two actions. */}
      <header className="ch-h-head" data-canopy-head="">
        <Line height={14}>
          <Skeleton width={140} height={13} />
        </Line>
        {/* The sans greeting's line in the framed head (44px type, 47.5px line; WebKit 1440, 2026-10-07). */}
        <Line height={47.5}>
          <Skeleton width={400} height={38} radius={10} />
        </Line>
        {!player && (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 10, height: 49.6 }}>
            <Skeleton width="90%" height={14} />
            <Skeleton width="60%" height={14} />
          </div>
        )}
        <div className="ch-h-head__actions">
          <Skeleton width={150} height={36} radius={10} />
          <Skeleton width={130} height={36} radius={10} />
        </div>
      </header>
      {/* TeamForm's own grid (it stacks under 1100px as the loaded one does): the lead's four lines, the plot's box left
          empty, and the three figure rows. Shapes only: no line is drawn before there are rounds to draw it from. */}
      {!player && (
        <section className="ch-h-form" aria-hidden="true">
          <div className="ch-h-form__lead">
            <StageLine height={16.8} bar={11} width={150} />
            <StageLine height={64} bar={48} width={150} />
            <StageLine height={18} bar={12} width={130} />
            <StageLine height={16.9} bar={10} width={170} />
          </div>
          <div className="ch-h-form__plot" />
          <div className="ch-h-form__figs">
            {[0, 1, 2].map((k) => (
              <div key={k}>
                <StageLine height={20.3} bar={12} width="100%" />
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
