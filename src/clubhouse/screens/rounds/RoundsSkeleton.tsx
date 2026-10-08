import { Skeleton } from '../../ui/States';
import '../../styles/rounds.css';
import '../../styles/rounds-recover.css';

/** Route loading for Rounds: the header, the round card beside the season, then a month of rounds, in place. On desktop the header is the framed page head at its loaded height (rounds.css). */
export function RoundsSkeleton() {
  return (
    <main className="ch-rd" aria-busy="true" aria-label="Loading your rounds" data-ch-code="CH-11401" data-canopy="">
      <div className="ch-rd-sk-desk">
        <header className="ch-rd-h" data-canopy-head="">
          <div>
            <Skeleton width={200} height={13} />
            <div style={{ height: 10 }} />
            <Skeleton width={220} height={36} radius={10} />
          </div>
          <Skeleton width={128} height={40} radius={11} />
        </header>
        <div className="ch-rd-hero">
          <Skeleton width="100%" height={236} radius={20} />
          <Skeleton width="100%" height={236} radius={20} />
        </div>
        <div className="ch-rd-tools">
          <Skeleton width={260} height={38} radius={10} />
          <Skeleton width={190} height={34} radius={11} />
        </div>
        <div className="ch-rd-book">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} width="100%" height={80} radius={16} />
          ))}
        </div>
      </div>
      <PhoneRoundsSkeleton />
    </main>
  );
}

/**
 * The phone's loading shape (the Mobile clubhouse pass, 2026-10-08), at the loaded page's geometry so nothing moves when it lands
 * (measured at 390, 2026-10-08): the intro (the eyebrow's line box, the title 10px under it, New round at the end of its line), the
 * round card at the idle card's height (the page at rest; a round in progress is a little shorter), season scoring (the average, the
 * figures between hairlines, the chart and its legend), the tools, then a month and its rows. It is drawn beside the desktop shape
 * and rounds.css shows the one for the width, so the server needs no width to draw it.
 */
function PhoneRoundsSkeleton() {
  return (
    <div className="ch-rd-sk-phone">
      <header className="ch-rd-sk-h">
        <SkelLine h={24} w={210} sh={11} />
        <span className="ch-rd-sk-title">
          <SkelLine h={33.5} w={168} sh={28} r={8} />
        </span>
        <span className="ch-rd-sk-new">
          <Skeleton width={117} height={36} radius={11} />
        </span>
      </header>
      <div className="ch-rd-sk-hero">
        <Skeleton width="100%" height={340} radius={14} shape="solid" />
        <div className="ch-rd-sk-sec ch-rd-sk-season">
          <SkelLine h={18} w={140} sh={14} r={6} />
          <SkelLine h={62} w={150} sh={40} r={8} />
          <span className="ch-rd-sk-figs">
            {[0, 1, 2].map((i) => (
              <span key={i}>
                <Skeleton width={42} height={11} />
                <Skeleton width={56} height={24} radius={6} />
                <Skeleton width="86%" height={8} radius={4} />
                <Skeleton width="80%" height={10} />
              </span>
            ))}
          </span>
          <SkelLine h={52} w="72%" sh={12} />
          <Skeleton width="100%" height={199} radius={10} shape="solid" />
          <SkelLine h={18} w={180} sh={10} />
        </div>
      </div>
      <div className="ch-rd-tools">
        <Skeleton width={180} height={36} radius={10} />
        <Skeleton width={148} height={40} radius={12} />
      </div>
      <div className="ch-rd-sk-sec ch-rd-sk-grp">
        <SkelLine h={24.8} w={150} sh={17} r={6} />
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="ch-rd-sk-row">
            <Skeleton width={30} height={30} radius={6} />
            <span>
              <Skeleton width="54%" height={14} />
              <Skeleton width="38%" height={11} />
            </span>
            <Skeleton width={28} height={20} radius={6} />
          </span>
        ))}
      </div>
    </div>
  );
}

/** Route loading for a round's review (CH-11406): the back link, the green hero, five figures and the scorecard, in place. */
export function RoundReviewSkeleton() {
  return (
    <main className="ch-rv" aria-busy="true" aria-label="Loading the round" data-ch-code="CH-11406" data-canopy="">
      <div className="ch-rv-sk-desk">
        <span className="ch-rv-back" aria-hidden="true">
          <Skeleton width={72} height={16} />
        </span>
        {/* The framed page head, line for line: eyebrow 14.3, the course in the 44px sans 47.5, the tee line 21. */}
        <header className="ch-rv-hero" aria-hidden="true" data-canopy-head="">
          <div className="ch-rv-hero__l">
            <SkelLine h={14.3} w={140} sh={10} />
            <SkelLine h={47.5} w={260} sh={36} />
            <SkelLine h={21} w={220} sh={14} />
          </div>
          <Skeleton width={96} height={92} radius={12} />
        </header>
        <Skeleton width="100%" height={86} radius={12} />
        <Skeleton width="100%" height={430} radius={18} shape="solid" />
      </div>
      {/* The phone (the Mobile clubhouse pass), at the loaded page's geometry (measured at 390): the hero's feature card, the five
          figures between hairlines in two rows, then strokes gained and the scorecard under their double rules, each head with its
          figure. rounds.css shows the shape for the width. */}
      <div className="ch-rv-sk-phone">
        <Skeleton width="100%" height={178} radius={14} shape="solid" />
        <span className="ch-rv-sk-figs">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i}>
              <Skeleton width={46} height={11} />
              <Skeleton width={40} height={22} radius={6} />
              <Skeleton width={30} height={10} />
            </span>
          ))}
        </span>
        <div className="ch-rv-sk-sec">
          <span className="ch-rv-sk-head is-sg">
            <span>
              <Skeleton width={150} height={17} radius={6} />
              <Skeleton width={56} height={11} />
            </span>
            <Skeleton width={52} height={26} radius={6} />
          </span>
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="ch-rv-sk-leg">
              <Skeleton width={84} height={11} />
              <Skeleton width="100%" height={8} radius={4} />
              <Skeleton width={30} height={11} />
            </span>
          ))}
        </div>
        <div className="ch-rv-sk-sec">
          <span className="ch-rv-sk-head">
            <span>
              <Skeleton width={110} height={17} radius={6} />
              <Skeleton width={170} height={11} />
            </span>
          </span>
          <Skeleton width="100%" height={432} radius={12} shape="solid" />
        </div>
      </div>
    </main>
  );
}

/** Route loading for round entry, a new round and a round to continue (CH-11407): the header, the course card, the round's details and the scorecard, in place. */
export function RoundEntrySkeleton() {
  return (
    <main className="ch-rd" aria-busy="true" aria-label="Loading your round" data-ch-code="CH-11407">
      <Skeleton width={96} height={34} radius={17} />
      <Skeleton width="100%" height={150} radius={20} />
      <div className="ch-rd-hero">
        <Skeleton width="100%" height={260} radius={20} />
        <Skeleton width="100%" height={260} radius={20} />
      </div>
      <Skeleton width="100%" height={64} radius={16} />
    </main>
  );
}

/** Route loading for round recovery (CH-11408): the header and two saved rounds, in place. */
export function RoundRecoverSkeleton() {
  return (
    <main className="ch-rcv" aria-busy="true" aria-label="Loading saved rounds" data-ch-code="CH-11408">
      <header className="ch-rcv-h">
        <div>
          <Skeleton width={150} height={13} />
          <div style={{ height: 10 }} />
          <Skeleton width={260} height={36} radius={10} />
        </div>
      </header>
      <ul className="ch-rcv-list" aria-hidden="true">
        {[0, 1].map((i) => (
          <li key={i}>
            <Skeleton width="100%" height={140} radius={16} />
          </li>
        ))}
      </ul>
    </main>
  );
}

/** One text line's box at its measured height, with the bar centred in it. */
function SkelLine({ h, w, sh, r }: { h: number; w: number | string; sh: number; r?: number }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', height: h }}>
      <Skeleton width={w} height={sh} radius={r} />
    </span>
  );
}
