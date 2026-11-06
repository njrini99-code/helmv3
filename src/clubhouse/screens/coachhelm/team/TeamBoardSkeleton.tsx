'use client';

import { useChPhone } from '../../../lib/use-phone';
import { DeskTop, PhoneTop } from '../../../shell/phone-chrome';
import { LargeTitleSkeleton } from '../../../ui/LargeTitle';
import { CoachHelmTabs } from '../chat/SubTabs';

const rows = (n: number, height?: number) => (
  <div className="card sklc" style={height ? { minHeight: height } : undefined}>
    {Array.from({ length: n }, (_, i) => (
      <div className="sklrow" key={i}>
        <span className="skl" style={{ width: 30, height: 30, borderRadius: 15 }} />
        <span className="skl" style={{ height: 12 }} />
        <span className="skl" style={{ width: 48, height: 12 }} />
      </div>
    ))}
  </div>
);

const hero = (h: number, height?: number) => (
  <div className="feat ch-htb-feat" style={height ? { minHeight: height } : undefined}>
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
        <div className="sheet" aria-hidden="true">
          <header className="ch-chd is-phone">
            <div className="ch-chd__t">
              <LargeTitleSkeleton />
            </div>
            <div className="ch-chd__sw">
              <CoachHelmTabs active="board" held boardLabel="Team" />
            </div>
          </header>
          {/* The loaded cards' heights (06 #loading: 180, 406, 258, 216), so nothing jumps when they land (TEAM-28). */}
          <span className="skl" style={{ height: 180, borderRadius: 16 }} />
          {hero(232, 406)}
          {rows(5, 258)}
          {rows(4, 216)}
        </div>
      </main>
    );
  return (
    <main className="ch-htb is-desk" aria-busy="true">
      <div className="ch-htb-desk" aria-hidden="true">
        <DeskTop>
          <CoachHelmTabs active="board" held boardLabel="Team" />
        </DeskTop>
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
