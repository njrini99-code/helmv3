import type { ChCourseHistory } from '../../data/course-page-shape';

/**
 * P-7 4.2.5: how the course plays for the player against their other courses, in one sentence, then the rows that pass
 * their floors (nines, pars, the costly and the best stretch, qualifiers against practice). A stretch row picks its first
 * hole on the map.
 */
export function HowItPlays({ data, who, onHole }: { data: ChCourseHistory['howItPlays']; who: string | null; onHole: (n: number) => void }) {
  return (
    <section className="ch-ch-sec" aria-labelledby="ch-hip-h">
      <div className="ch-ch-sec__h">
        <h2 id="ch-hip-h">{who ? `How it plays for ${who}` : 'How it plays for you'}</h2>
      </div>
      <p className="ch-hip__s">{data.sentence}</p>
      {data.sample && <p className="ch-ch-sec__note ch-num">{data.sample}</p>}
      {data.rows.length > 0 && (
        <ul className="ch-hip__rows">
          {data.rows.map((r) => (
            <li key={r.label}>
              {r.hole != null ? (
                <button type="button" className="ch-hip__row" onClick={() => onHole(r.hole!)}>
                  <span>{r.label}</span>
                  <b className="ch-num">{r.value}</b>
                </button>
              ) : (
                <div className="ch-hip__row">
                  <span>{r.label}</span>
                  <b className="ch-num">{r.value}</b>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
