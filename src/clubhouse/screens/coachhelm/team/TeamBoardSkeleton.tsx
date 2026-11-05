'use client';

import { useChPhone } from '../../../lib/use-phone';
import { PhoneTop } from '../../../shell/phone-chrome';
import { LargeTitleSkeleton } from '../../../ui/LargeTitle';
import { CoachHelmTabs } from '../chat/SubTabs';
import '../../../styles/coachhelm-team.css';

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

/** A card's title line at the loaded card's height: its name, and its aside when it has one. */
const head = (title: number, aside: number) => (
  <div className="ch">
    <span className="skl" style={{ width: title, height: 16 }} />
    {aside > 0 && <span className="skl" style={{ width: aside, height: 12 }} />}
  </div>
);

/** Rows with a coin, a title and a second line, as the board's lists draw them. */
const rowLines = (n: number) =>
  Array.from({ length: n }, (_, i) => (
    <div className="sklrow" key={i}>
      <span className="skl" style={{ width: 30, height: 30, borderRadius: 15 }} />
      <span className="skl" style={{ height: 12 }} />
      <span className="skl" style={{ width: 48, height: 12 }} />
    </div>
  ));

/** The green hole card in its loaded parts: the head and its station strip, the hole, the foot line. */
function DeskHero() {
  return (
    <div className="feat hero ch-htb-feat">
      <div className="top" style={{ minHeight: 104 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span className="skl" style={{ width: '70%', height: 14 }} />
          <span className="skl" style={{ width: 96, height: 32, marginTop: 12 }} />
        </div>
        <span className="skl" style={{ width: 372, height: 56, borderRadius: 12 }} />
      </div>
      <div className="hole">
        <span className="skl" style={{ width: '100%', height: 279, borderRadius: 14 }} />
      </div>
      <span className="skl" style={{ width: '46%', height: 12, marginTop: 8 }} />
    </div>
  );
}

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
      <div className="ch-htb-desk">
        {/* The board's own head line, so the cards don't step down when it arrives. */}
        <div className="ch-htb-deskhead">
          <span className="skl" aria-hidden="true" style={{ width: 180, height: 20 }} />
          <CoachHelmTabs active="board" held boardLabel="Team" />
        </div>
        <div className="dgrid" aria-hidden="true">
          <div className="dcol">
            <DeskHero />
            <section className="card spot" style={{ minHeight: 480 }}>
              {head(72, 150)}
              <div className="sklc">{rowLines(7)}</div>
            </section>
          </div>
          <div className="dcol">
            <section className="card today" style={{ minHeight: 328 }}>
              {head(80, 150)}
              <div className="sklc">
                {[0, 1, 2].map((i) => (
                  <span className="skl" key={i} style={{ height: 76, borderRadius: 14 }} />
                ))}
              </div>
            </section>
            <section className="card work" style={{ minHeight: 480 }}>
              {head(88, 70)}
              <div className="sklc">{rowLines(6)}</div>
            </section>
            <section className="card huddle" style={{ minHeight: 454 }}>
              {head(88, 0)}
              <div className="sklc">
                <span className="skl" style={{ height: 280, borderRadius: 14 }} />
              </div>
            </section>
          </div>
          <section className="card rost" style={{ minHeight: 512 }}>
            {head(64, 180)}
            <div className="sklc">{rowLines(7)}</div>
          </section>
          <section className="card recc" style={{ minHeight: 512 }}>
            {head(176, 0)}
            <div className="sklc">{rowLines(4)}</div>
          </section>
        </div>
      </div>
    </main>
  );
}
