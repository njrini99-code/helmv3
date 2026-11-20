'use client';

import type { ReactNode } from 'react';
import { useChPhone } from '../../../lib/use-phone';
import { DeskTop, PhoneTop } from '../../../shell/phone-chrome';
import '../../../styles/coachhelm-team.css';
import { LargeTitleSkeleton } from '../../../ui/LargeTitle';
import { HOLE } from './hole-geometry';

/** A static block in waiting (`.ch-htb .skl`: it waits the busy delay unless it continues a skeleton already up). */
const Bar = ({ w = '100%', h = 12, r }: { w?: number | string; h?: number; r?: number }) => <span className="skl" style={{ width: w, height: h, ...(r != null ? { borderRadius: r } : {}) }} />;

/** A card's head in waiting, in the loaded head's box (`.ch`: 16px top, the 17pt title's line, 8px under). */
const Head = ({ w = 120 }: { w?: number }) => (
  <div className="ch ch-htb-skh">
    <Bar w={w} h={14} />
  </div>
);

/** Rows in waiting at the loaded rows' pitch: a coin, a name, a value. */
const Rows = ({ n }: { n: number }) => (
  <div className="sklc">
    {Array.from({ length: n }, (_, i) => (
      <div className="sklrow" key={i}>
        <Bar w={30} h={30} r={15} />
        <Bar w={`${72 - (i % 3) * 12}%`} />
        <Bar w={48} />
      </div>
    ))}
  </div>
);

/**
 * One card of the board in waiting, on the loaded card's own classes (`cls`), so it takes the same grid slot, padding and
 * ground; `h` is the loaded card's height (WebKit 1440, staging Demo University Golf, 2026-11-19) and holds the card's
 * place until it lands. `data-ch-team-wait` names the slot (never `data-ch-team-card`, which the board queries).
 */
function Wait({ cls, slot, h, head, children }: { cls: string; slot: TeamBoardSlot; h?: number; head?: number; children?: ReactNode }) {
  return (
    <section className={cls} data-ch-team-wait={slot} style={h ? { minHeight: h } : undefined} aria-hidden="true">
      <Head w={head} />
      {children}
    </section>
  );
}

/** The board's slots in the order the desk grid draws them (TeamBoard.tsx: two columns, then the roster and the record). */
export const TEAM_BOARD_DESK_SLOTS = ['hole', 'spot', 'today', 'work', 'huddle', 'roster', 'record'] as const;
/** The phone's order (TeamBoard.tsx): This week, the hole, the spot, the huddle, the roster, Working on, the record. */
export const TEAM_BOARD_PHONE_SLOTS = ['today', 'hole', 'spot', 'huddle', 'roster', 'work', 'record'] as const;
export type TeamBoardSlot = (typeof TEAM_BOARD_DESK_SLOTS)[number];

/** This week, Working on and the record while their own reads are still on the way (TeamBoard's `Part` fallbacks). */
export function TodayWait() {
  const phone = useChPhone();
  return (
    <Wait cls="card today" slot="today" h={phone ? 180 : 311} head={90}>
      <Rows n={3} />
    </Wait>
  );
}
export function WorkWait() {
  return (
    <Wait cls="card work" slot="work" h={592} head={96}>
      <Rows n={6} />
    </Wait>
  );
}
export function RecordWait() {
  return (
    <Wait cls="card recc" slot="record" h={300} head={220}>
      <Rows n={4} />
    </Wait>
  );
}

/**
 * The hole in waiting, built as the hero is (TeamBoard `Hero`): the top row (the key line and the figure, the station chips beside
 * them), the drawn hole at the hole's own aspect (HOLE.h, the same viewBox), and the foot line. Its height follows the card's width
 * as the drawing's does, so it lands where the hole lands at any desk width.
 */
function HoleWait({ phone = false }: { phone?: boolean }) {
  const H = HOLE[phone ? 'v' : 'h'];
  return (
    <section className="feat hero ch-htb-feat" data-ch-team-wait="hole" style={phone ? { minHeight: 406 } : undefined} aria-hidden="true">
      <div className="top ch-htb-skt">
        <div>
          <Bar w={220} h={14} />
          <Bar w={150} h={44} />
        </div>
        {!phone && <Bar w={300} h={36} r={10} />}
      </div>
      {/* The rounding note under the top row (hn-note), on a desk where the hero draws it under the row (WebKit: a 17px note under a row of 102px at 1440, where the chips wrap, and 79px at 1920). */}
      {!phone && (
        <p className="hn-note ch-htb-skn">
          <Bar w="44%" h={11} />
        </p>
      )}
      <div className="hole">
        <span className="skl" style={{ display: 'block', width: '100%', aspectRatio: `${H.w} / ${H.h}`, height: 'auto', borderRadius: 14 }} />
      </div>
      {/* The foot's two lines (36px at 1440). */}
      <div className="hfoot ch-htb-skf">
        <Bar w="64%" h={11} />
        <Bar w="40%" h={11} />
      </div>
    </section>
  );
}

/**
 * The Team page in waiting, in the loaded board's shape (AC-TEAM-10, AC-HOLE-16): the same `.ch-htb` main, the same desk grid
 * (`.dgrid`, two `.dcol`s, then the roster and the record) and the same cards in the same order, each at its loaded height, so
 * nothing moves when the board lands; the scope line waits in the glass top bar where the board writes it (CoachHelmHead). It is
 * the one skeleton of the page: the route's `loading.tsx` draws it, the route's Suspense draws it again `chained` in the same
 * place (its blocks do not wait the busy delay a second time), and the switch draws it on the way back to Team. It leaves by
 * crossfading with the board on the quick beat (`data-ch-arrive`, RouteFrame), never by a fade up from bare canvas.
 * The switch is the route's, above it (SwitchFrame, N13C-67).
 */
export function TeamBoardSkeleton({ chained = false }: { chained?: boolean }) {
  const phone = useChPhone();
  const mark = { 'aria-busy': true, 'aria-label': 'Loading Team view', 'data-skel': chained ? 'chained' : undefined, 'data-ch-arrive': 'crossfade' } as const;
  if (phone)
    return (
      <main className="ch-htb is-phone" {...mark}>
        <PhoneTop start title="CoachHelm" />
        <div className="sheet" aria-hidden="true">
          <header className="ch-chd is-phone">
            <div className="ch-chd__t">
              <LargeTitleSkeleton />
              <span className="skl" style={{ width: '72%', height: 16, margin: '2px 0' }} />
            </div>
          </header>
          {/* The loaded cards' heights (06 #loading: 180, 406, 258, 216), in the phone's order, so nothing jumps when they land (TEAM-28). */}
          <Wait cls="card today" slot="today" h={180} head={90}>
            <div className="sklc">
              <Bar h={130} r={12} />
            </div>
          </Wait>
          <HoleWait phone />
          <Wait cls="card spot" slot="spot" h={258} head={110}>
            <Rows n={4} />
          </Wait>
          <Wait cls="card huddle" slot="huddle" h={216} head={96}>
            <Rows n={3} />
          </Wait>
          <Wait cls="card" slot="roster" h={258} head={70}>
            <Rows n={5} />
          </Wait>
        </div>
      </main>
    );
  return (
    <main className="ch-htb is-desk" {...mark}>
      <DeskTop>
        <span className="ch-chd__scope ch-htb-skscope" aria-hidden="true">
          <span className="ch-skel" style={{ width: 300, height: 12 }} />
        </span>
      </DeskTop>
      <div className="ch-htb-desk" aria-hidden="true">
        <div className="dgrid">
          <div className="dcol">
            <HoleWait />
            <Wait cls="card spot" slot="spot" h={381} head={110}>
              <Rows n={5} />
            </Wait>
          </div>
          <div className="dcol">
            <TodayWait />
            <WorkWait />
            <Wait cls="card huddle" slot="huddle" head={96}>
              <span className="skl ch-htb-skplot" />
            </Wait>
          </div>
          <Wait cls="card rost" slot="roster" h={617} head={70}>
            <Rows n={8} />
          </Wait>
          <RecordWait />
        </div>
      </div>
    </main>
  );
}
