'use client';

import { useChPhone } from '../../../lib/use-phone';
import { PhoneTop } from '../../../shell/phone-chrome';
import { LargeTitleSkeleton } from '../../../ui/LargeTitle';
import { CoachHelmTabs } from '../chat/SubTabs';

const rows = (n: number) => (
  <div className="card sklc">
    {Array.from({ length: n }, (_, i) => (
      <div className="sklrow" key={i}>
        <span className="skl" style={{ width: 30, height: 30, borderRadius: 15 }} />
        <span className="skl" style={{ height: 12 }} />
        <span className="skl" style={{ width: 48, height: 12 }} />
      </div>
    ))}
  </div>
);

const hero = (h: number) => (
  <div className="feat ch-htb-feat">
    <span className="skl" style={{ width: '54%', height: 14 }} />
    <span className="skl" style={{ width: '38%', height: 40, marginTop: 8 }} />
    <span className="skl" style={{ width: '100%', height: h, borderRadius: 14, marginTop: 12 }} />
  </div>
);

/** The final shape and height, all hidden from assistive tech (AC-TEAM-10, AC-HOLE-16). */
export function TeamBoardSkeleton() {
  const phone = useChPhone();
  if (phone)
    return (
      <main className="ch-htb is-phone" aria-busy="true">
        <PhoneTop start title="CoachHelm" />
        <CoachHelmTabs active="board" held boardLabel="Team" />
        <div className="sheet" aria-hidden="true">
          <LargeTitleSkeleton />
          <span className="skl" style={{ height: 120, borderRadius: 16 }} />
          {hero(300)}
          {rows(5)}
          {rows(4)}
        </div>
      </main>
    );
  return (
    <main className="ch-htb is-desk" aria-busy="true">
      <div className="ch-htb-desk" aria-hidden="true">
        <div className="dgrid">
          <div className="dcol">
            {hero(250)}
            {rows(5)}
          </div>
          <div className="dcol">
            {rows(3)}
            {rows(2)}
            <span className="skl" style={{ height: 220, borderRadius: 16 }} />
          </div>
          {rows(5)}
          {rows(3)}
        </div>
      </div>
    </main>
  );
}
