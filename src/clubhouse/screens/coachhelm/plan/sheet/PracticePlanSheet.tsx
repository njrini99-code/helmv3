import { Fragment } from 'react';
import type { PlanSheetModel, PlanSheetSection } from './plan-sheet-model';

const DEFAULT_ORDER: Array<{ key: PlanSheetSection; name: string }> = [
  { key: 'groups', name: '' },
  { key: 'schedule', name: '' },
  { key: 'bring', name: '' },
  { key: 'notes', name: '' },
];

const Gd = ({ letter }: { letter: string }) => <i className={`gd g-${letter}`}>{letter}</i>;

/** A cell of names breaks between them, never inside one: "Coach Lin," then "Coach Rivera". It reads and copies as the same text. */
const Names = ({ value }: { value: string }) => (
  <>
    {value.split(', ').map((name, i, all) => (
      <Fragment key={`${name}-${i}`}>
        <span className="pp-co">{i < all.length - 1 ? `${name},` : name}</span>
        {i < all.length - 1 ? ' ' : null}
      </Fragment>
    ))}
  </>
);

/** The one printed plan: Ask's pane, the phone's full plan, the plan page, Documents, the PDF. The coach's Why lines are drawn only when the model has them. */
export function PracticePlanSheet({ plan, density = 'phone', part = 'all', draft = false }: { plan: PlanSheetModel; density?: 'pane' | 'phone' | 'print'; part?: 'all' | 'schedule' | 'rest'; draft?: boolean }) {
  const first = part !== 'rest';
  const last = part !== 'schedule';
  const order = plan.format?.sections ?? DEFAULT_ORDER;
  const named = (o: { key: PlanSheetSection; name: string }, word: string) => o.name || word;
  const section = (o: { key: PlanSheetSection; name: string }) => {
    if (o.key === 'groups') {
      return plan.groups.length > 0 ? (
        <section>
          <h3 className="pp-h">
            {named(o, 'Groups')}
            {plan.copy === 'coach' && <span>{plan.playersLine}</span>}
          </h3>
          <div className="pp-groups">
            {plan.groups.map((g) => (
              <div key={g.letter} className={`pp-g g-${g.letter}`}>
                <span className="gh">
                  <Gd letter={g.letter} />
                  Group {g.letter}
                </span>
                <ul>
                  {g.names.map((n, i) => (
                    <li key={`${n}-${i}`}>{n}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null;
    }
    if (o.key === 'schedule') return <Schedule plan={plan} title={named(o, 'Schedule')} />;
    if (o.key === 'bring') {
      return plan.bring.length > 0 ? (
        <section>
          <h3 className="pp-h">{named(o, 'Bring')}</h3>
          <ul className="pp-check">
            {plan.bring.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        </section>
      ) : null;
    }
    return (
      <section>
        <h3 className="pp-h">{named(o, 'Notes')}</h3>
        {plan.notes ? (
          <p className="pp-focus">{plan.notes}</p>
        ) : (
          <div className="pp-lines" aria-hidden="true">
            {Array.from({ length: part === 'rest' ? 6 : 4 }, (_, i) => (
              <i key={i} />
            ))}
          </div>
        )}
      </section>
    );
  };
  return (
    <article className="ch-cp-sheet" data-density={density} data-copy={plan.copy} data-part={part === 'all' ? undefined : part}>
      {first && (
        <>
      <header className="pp-top">
        <span className="pp-mark" aria-hidden="true">
          {plan.mark}
        </span>
        <span className="pp-org">
          <b>{plan.team}</b>
          <span>Practice plan · {plan.copy === 'coach' ? 'Coach copy' : 'Player copy'}{draft ? ' · Draft' : ''}</span>
        </span>
        <span className="pp-date">
          <span>{plan.dayWord}</span>
          <b>{plan.dayNum}</b>
          {plan.monthWord && <span>{plan.monthWord}</span>}
        </span>
      </header>
      <h2 className="pp-title">{plan.title}</h2>
      {plan.focus && <p className="pp-focus">{plan.focus}</p>}
      <dl className="pp-meta">
        {plan.meta.map((m) => (
          <div key={m.label}>
            <dt>{m.label}</dt>
            <dd>{m.label === 'Coaches' ? <Names value={m.value} /> : m.value}</dd>
          </div>
        ))}
      </dl>
        </>
      )}
      {order.filter((o) => (o.key === 'groups' || o.key === 'schedule' ? first : last)).map((o, i, shown) => {
        const pair = o.key === 'bring' ? shown[i + 1]?.key === 'notes' : o.key === 'notes' ? shown[i + 1]?.key === 'bring' : false;
        const paired = o.key === 'bring' ? shown[i - 1]?.key === 'notes' : o.key === 'notes' ? shown[i - 1]?.key === 'bring' : false;
        if (paired) return null;
        if (pair && plan.bring.length > 0) {
          const other = shown[i + 1]!;
          return (
            <div className="pp-two" key={o.key}>
              {section(o)}
              {section(other)}
            </div>
          );
        }
        return <Fragment key={o.key}>{section(o)}{pair ? section(shown[i + 1]!) : null}</Fragment>;
      })}
      {part === 'all' && (
        <footer className="pp-foot">
          <span>{plan.foot}</span>
          {plan.format && <span>In your format · {plan.format.name}</span>}
        </footer>
      )}
    </article>
  );
}


function Schedule({ plan, title }: { plan: PlanSheetModel; title: string }) {
  return (
      <section>
        <h3 className="pp-h">
          {title}
          <span>{plan.totalLine}</span>
        </h3>
        <div className="sched">
          {plan.rows.map((r) => (
            <div className="drow" key={r.id}>
              <span className="pt">
                <b>{r.start}</b>
                <span>{r.mins} min</span>
              </span>
              <div>
                <div className="pn">{r.title}</div>
                {r.detail && <div className="pd">{r.detail}</div>}
                {r.rotation ? (
                  <div className="pp-rot" style={{ ['--ch-pp-turns' as string]: r.rotation.turns.length }}>
                    <span className="h">Station</span>
                    {r.rotation.turns.map((t) => (
                      <span className="h" key={t}>
                        {t}
                      </span>
                    ))}
                    {r.rotation.rows.map((s) => (
                      <RotRow key={s.place} place={s.place} note={s.note} cells={s.cells} />
                    ))}
                  </div>
                ) : r.who === 'all' ? (
                  <div className="pp-who">
                    <span className="all">Everyone</span>
                  </div>
                ) : (
                  <div className="pp-who">
                    {r.who.map((w) => (
                      <span key={w.letter + w.text} className={`g-${w.letter}`}>
                        <Gd letter={w.letter} />
                        {w.text}
                      </span>
                    ))}
                  </div>
                )}
                {r.why && (
                  <p className="pp-why">
                    <b>Why</b> <WhyLine text={r.why} />
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
  );
}

/** A loss in a Why line, in amber: the figure only, with a true minus. */
function WhyLine({ text }: { text: string }) {
  // A minus that stands alone is a loss; "1-6" and "10-15 ft" are ranges. No lookbehind: iOS before 16.4 can't parse one.
  const parts: Array<{ loss: boolean; text: string }> = [];
  const loss = /(^|[\s(])([-\u2212]\d+(?:\.\d+)?)/g;
  let at = 0;
  for (let m = loss.exec(text); m; m = loss.exec(text)) {
    const start = m.index + m[1]!.length;
    parts.push({ loss: false, text: text.slice(at, start) }, { loss: true, text: m[2]!.replace('-', '\u2212') });
    at = start + m[2]!.length;
  }
  parts.push({ loss: false, text: text.slice(at) });
  return (
    <>
      {parts.map((p, i) =>
        p.loss ? (
          <span className="neg" key={i}>
            {p.text}
          </span>
        ) : (
          p.text
        ),
      )}
    </>
  );
}

function RotRow({ place, note, cells }: { place: string; note: string; cells: string[] }) {
  return (
    <>
      <span className="s">
        <b>{place}</b>
        {note && <span>{note}</span>}
      </span>
      {cells.map((c, i) => (
        <span key={i} className={`c g-${c}`}>
          {c && <Gd letter={c} />}
        </span>
      ))}
    </>
  );
}
