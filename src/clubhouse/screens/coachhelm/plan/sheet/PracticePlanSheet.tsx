import type { PlanSheetModel } from './plan-sheet-model';

const Gd = ({ letter }: { letter: string }) => <i className={`gd g-${letter}`}>{letter}</i>;

/** The one printed plan: Ask's pane, the phone's full plan, the plan page, Documents, the PDF. The coach's Why lines are drawn only when the model has them. */
export function PracticePlanSheet({ plan, density = 'phone' }: { plan: PlanSheetModel; density?: 'pane' | 'phone' | 'print' }) {
  return (
    <article className="ch-cp-sheet" data-density={density} data-copy={plan.copy}>
      <header className="pp-top">
        <span className="pp-mark" aria-hidden="true">
          {plan.mark}
        </span>
        <span className="pp-org">
          <b>{plan.team}</b>
          <span>Practice plan · {plan.copy === 'coach' ? 'Coach copy' : 'Player copy'}</span>
        </span>
        <span className="pp-date">
          <span>{plan.dayWord}</span>
          <b>{plan.dayNum}</b>
        </span>
      </header>
      <h2 className="pp-title">{plan.title}</h2>
      {plan.focus && <p className="pp-focus">{plan.focus}</p>}
      <dl className="pp-meta">
        {plan.meta.map((m) => (
          <div key={m.label}>
            <dt>{m.label}</dt>
            <dd>{m.value}</dd>
          </div>
        ))}
      </dl>
      {plan.groups.length > 0 && (
        <section>
          <h3 className="pp-h">
            Groups{plan.copy === 'coach' && <span> · {plan.playersLine}</span>}
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
      )}
      <section>
        <h3 className="pp-h">
          Schedule<span> · {plan.totalLine}</span>
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
      <div className="pp-two">
        {plan.bring.length > 0 && (
          <section>
            <h3 className="pp-h">Bring</h3>
            <ul className="pp-check">
              {plan.bring.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </section>
        )}
        <section>
          <h3 className="pp-h">Notes</h3>
          {plan.notes ? <p className="pp-focus">{plan.notes}</p> : (
            <div className="pp-lines" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </div>
          )}
        </section>
      </div>
      <footer className="pp-foot">
        <span>{plan.foot}</span>
      </footer>
    </article>
  );
}

/** A loss in a Why line, in amber: the figure only, with a true minus. */
function WhyLine({ text }: { text: string }) {
  const parts = text.split(/([-\u2212]\d+(?:\.\d+)?)/);
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <span className="neg" key={i}>
            {p.replace('-', '\u2212')}
          </span>
        ) : (
          p
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
