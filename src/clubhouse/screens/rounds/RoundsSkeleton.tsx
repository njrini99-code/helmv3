import { Skeleton } from '../../ui/States';
import '../../styles/rounds.css';
import '../../styles/rounds-recover.css';
import { LargeTitleSkeleton } from '../../ui/LargeTitle';

/**
 * Route loading for Rounds: the header, the round card beside the season, then a month of rounds, in place. Both widths
 * draw the page at rest (no round in progress: the idle card, and no New round in the head, which the page only shows
 * beside a round in progress). On desktop the header is the framed page head at its loaded height, line for line (the
 * eyebrow's 18px line, the title's 47.5px line 8px under it), and each pane holds the loaded pane's box (measured in
 * WebKit at 1440, 2026-11-11).
 */
export function RoundsSkeleton() {
  return (
    <main className="ch-rd" aria-busy="true" aria-label="Loading your rounds" data-ch-code="CH-11401" data-canopy="">
      <div className="ch-rd-sk-desk">
        <header className="ch-rd-h" data-canopy-head="tight">
          <div>
            <SkelLine h={18} w={200} sh={13} />
            <div style={{ height: 8 }} />
            <SkelLine h={47.5} w={220} sh={36} r={10} />
          </div>
        </header>
        {/* The round card's content, and the season pane: its head, then the vs-par stage sized as the chart is (rounds.css). */}
        <div className="ch-rd-hero">
          <div className="ch-rd-sk-unf">
            <Skeleton width="100%" height={331.8} radius={20} />
          </div>
          <div className="ch-rd-sk-pane">
            <Skeleton width="100%" height={182.1} radius={20} />
            <span className="ch-skel ch-skel--block ch-rd-sk-stage" aria-hidden="true">
              <span />
            </span>
          </div>
        </div>
        <div className="ch-rd-tools">
          <Skeleton width={260} height={36} radius={12} />
          <Skeleton width={177} height={34} radius={16} />
        </div>
        {/* The first month under its heading, as the library draws it. */}
        <section className="ch-rd-grp">
          <div className="ch-rd-grp__h">
            <SkelLine h={25} w={132} sh={17} />
          </div>
          <div className="ch-rd-book">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} width="100%" height={76} radius={12} />
            ))}
          </div>
        </section>
      </div>
      <PhoneRoundsSkeleton />
    </main>
  );
}

/**
 * The phone's loading shape (the Mobile clubhouse pass, 2026-10-08), at the loaded page's geometry so nothing moves when it lands
 * (measured in WebKit at 390, 2026-11-11, on the page at rest): the intro (the eyebrow's line box, the title's own line 8px under
 * it), the green round card at the idle card's height (a round in progress is a little shorter), season scoring (its heading,
 * the average, the figures between hairlines, the chart's heading and the chart), the tools, then a month and its rows. The
 * card's height follows the idle card at other widths (rounds.css). It is drawn beside the desktop shape and rounds.css shows
 * the one for the width, so the server needs no width to draw it.
 */
function PhoneRoundsSkeleton() {
  return (
    <div className="ch-rd-sk-phone">
      <header className="ch-rd-sk-h">
        <SkelLine h={24} w={190} sh={11} />
        <LargeTitleSkeleton width={100} className="ch-rd-sk-title" />
      </header>
      <div className="ch-rd-sk-hero">
        <Skeleton width="100%" height={315} radius={16} shape="feature" />
        <div className="ch-rd-sk-season">
          <SkelLine h={25} w={150} sh={17} r={6} />
          <SkelLine h={43.2} w={150} sh={40} r={8} />
          <span className="ch-rd-sk-figs">
            {[0, 1, 2].map((i) => (
              <span key={i}>
                <SkelLine h={14.3} w={42} sh={11} />
                <SkelLine h={30.8} w={56} sh={24} r={6} />
                <SkelLine h={37.2} w="86%" sh={8} r={4} />
                <SkelLine h={18} w="80%" sh={10} />
              </span>
            ))}
          </span>
          <span className="ch-rd-sk-chart">
            <SkelLine h={20} w={150} sh={13} />
            <SkelLine h={36} w="88%" sh={12} />
            <SkelLine h={13.2} w={290} sh={10} />
          </span>
          <Skeleton width="100%" height={205} radius={10} shape="solid" />
        </div>
      </div>
      <div className="ch-rd-tools">
        <Skeleton width="100%" height={36} radius={12} />
        <Skeleton width={177} height={42} radius={16} />
      </div>
      <div className="ch-rd-sk-sec ch-rd-sk-grp">
        <SkelLine h={25} w={132} sh={17} r={6} />
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="ch-rd-sk-row">
            <Skeleton width={44} height={39} radius={6} />
            <span>
              <SkelLine h={20.8} w="54%" sh={14} />
              <SkelLine h={20} w="38%" sh={11} />
            </span>
            <Skeleton width={28} height={22} radius={6} />
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Route loading for a round's review (CH-11406), in the loaded page's order and at its geometry (measured in WebKit at 390 and
 * 1440, 2026-11-11): the back link, the hero, the scorecard card with its actions under it, then the five figures.
 */
export function RoundReviewSkeleton() {
  return (
    <main className="ch-rv" aria-busy="true" aria-label="Loading the round" data-ch-code="CH-11406" data-canopy="">
      <div className="ch-rv-sk-desk">
        <span className="ch-rv-back" aria-hidden="true">
          <SkelLine h={18} w={66} sh={16} />
        </span>
        {/* The framed page head, line for line: the date line 18, the course in the 44px sans 47.5, the round's one line 21, the
            tee line 20; the score stands at the foot of its end. */}
        <header className="ch-rv-hero" aria-hidden="true" data-canopy-head="tight">
          <div className="ch-rv-hero__l">
            <SkelLine h={18} w={140} sh={10} />
            <SkelLine h={47.5} w={260} sh={36} />
            <SkelLine h={21} w={320} sh={12} />
            <SkelLine h={20} w={220} sh={12} />
          </div>
          <Skeleton width={67} height={94.3} radius={12} />
        </header>
        <div className="ch-rv-sk-card">
          <Skeleton width="100%" height={378} radius={16} shape="solid" />
          <span className="ch-rv-sk-act">
            <Skeleton width={124.5} height={36} radius={12} />
            <Skeleton width={86.7} height={36} radius={12} />
          </span>
        </div>
        <span className="ch-rv-sk-figsd">
          <Skeleton width="100%" height={93.2} radius={12} />
        </span>
      </div>
      {/* The phone (the Mobile clubhouse pass): the hero's feature card, the scorecard card where the page has it with Share
          card under it, then the five figures between hairlines in two rows. rounds.css shows the shape for the width. */}
      <div className="ch-rv-sk-phone">
        <Skeleton width="100%" height={207.4} radius={16} shape="feature" />
        <div className="ch-rv-sk-card">
          <Skeleton width="100%" height={580.2} radius={16} shape="solid" />
          <Skeleton width="100%" height={44} radius={12} />
        </div>
        <span className="ch-rv-sk-figs">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i}>
              <SkelLine h={13.2} w={46} sh={11} />
              <SkelLine h={24.2} w={40} sh={22} r={6} />
              <SkelLine h={13.2} w={30} sh={10} />
            </span>
          ))}
        </span>
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

/** P-7: the course page on its way, at its final geometry: the hero card, the figures, the hole tiles and three rows. */
export function CourseHistorySkeleton() {
  return (
    <main className="ch-ch" aria-busy="true" aria-label="Loading your history here">
      <Skeleton width="100%" height={196} radius={16} shape="solid" />
      <div className="ch-ch-sec" aria-hidden="true">
        <div className="ch-ch-fig">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="ch-ch-fig__c">
              <Skeleton width={56} height={12} />
              <Skeleton width={44} height={22} />
            </div>
          ))}
        </div>
      </div>
      <div className="ch-ch-sec" aria-hidden="true">
        <Skeleton width="100%" height={160} radius={16} shape="solid" />
      </div>
      <div className="ch-ch-sec" aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} width="100%" height={60} radius={0} shape="block" />
        ))}
      </div>
    </main>
  );
}
