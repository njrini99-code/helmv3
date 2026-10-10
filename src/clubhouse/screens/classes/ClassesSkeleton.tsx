import { Skeleton } from '../../ui/States';
import '../../styles/classes.css';

/** Route loading for Classes: the header, the term overview, then the deck of classes beside the week's side card, in place. On desktop the header is the framed page head at its loaded height and the deck's placeholders are rows (classes.css). */
export function ClassesSkeleton() {
  return (
    <main className="ch-cl" aria-busy="true" aria-label="Loading your classes" data-ch-code="CH-12401" data-canopy="">
      <div className="ch-cl-sk-desk">
        <header className="ch-cl-h" data-canopy-head="">
          <div>
            <Skeleton width={190} height={13} />
            <div style={{ height: 10 }} />
            <Skeleton width={150} height={36} radius={10} />
          </div>
          <div className="ch-cl-h__a">
            <Skeleton width={150} height={40} radius={11} />
            <Skeleton width={120} height={40} radius={11} />
          </div>
        </header>
        <Skeleton width="100%" height={158} radius={22} />
        <div className="ch-cl-grid">
          <div className="ch-cl-deck">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} width="100%" height={236} radius={18} />
            ))}
          </div>
          <div className="ch-cl-side">
            <Skeleton width="100%" height={200} radius={18} />
            <Skeleton width="100%" height={92} radius={18} />
          </div>
        </div>
      </div>
      {/* The phone (the Mobile clubhouse pass, 2026-10-08), at the loaded page's geometry so nothing moves when it lands (measured
          at 390): the term line's box under the double rule over the two actions, the term's feature card, Today and its rows, the
          week's overlaps and what your coach sees (the rail comes first on the phone), then your classes as rows. classes.css shows
          the shape for the width, so the server needs no width to draw it. */}
      <div className="ch-cl-sk-phone">
        <header className="ch-cl-sk-h">
          <span className="ch-cl-sk-line">
            <Skeleton width={190} height={11} />
          </span>
          <span className="ch-cl-sk-acts">
            <Skeleton width="100%" height={36} radius={11} />
            <Skeleton width="100%" height={36} radius={11} />
          </span>
        </header>
        <Skeleton width="100%" height={116.7} radius={14} shape="solid" />
        <div className="ch-cl-sk-sec">
          <span className="ch-cl-sk-head">
            <Skeleton width={70} height={17} radius={6} />
          </span>
          {[0, 1].map((i) => (
            <span key={i} className="ch-cl-sk-row">
              <Skeleton width={72} height={13} />
              <span>
                <Skeleton width="70%" height={14} />
                <Skeleton width="46%" height={11} />
              </span>
            </span>
          ))}
        </div>
        <div className="ch-cl-sk-sec is-over">
          <span className="ch-cl-sk-head is-two">
            <Skeleton width="78%" height={17} radius={6} />
            <Skeleton width="56%" height={11} />
          </span>
          {[0, 1, 2].map((i) => (
            <span key={i} className="ch-cl-sk-row is-short">
              <span>
                <Skeleton width={i === 0 ? '52%' : '30%'} height={13} />
                <Skeleton width="44%" height={11} />
              </span>
              <Skeleton width={44} height={11} />
            </span>
          ))}
        </div>
        <span className="ch-cl-sk-note">
          <Skeleton width={16} height={16} radius={8} />
          <span>
            <Skeleton width="48%" height={13} />
            <Skeleton width="96%" height={11} />
            <Skeleton width="88%" height={11} />
            <Skeleton width="62%" height={11} />
          </span>
        </span>
        <div className="ch-cl-sk-sec">
          <span className="ch-cl-sk-head">
            <Skeleton width={120} height={17} radius={6} />
          </span>
          {[0, 1].map((i) => (
            <span key={i} className="ch-cl-sk-class">
              <Skeleton width={84} height={14} />
              <Skeleton width="72%" height={16} />
              <Skeleton width="40%" height={12} />
              <Skeleton width="100%" height={42} radius={8} shape="solid" />
            </span>
          ))}
        </div>
      </div>
    </main>
  );
}
