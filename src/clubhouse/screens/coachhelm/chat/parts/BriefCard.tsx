'use client';

import { useState } from 'react';

export interface BriefQuestion {
  id: string;
  title: string;
  why?: string;
  multi?: boolean;
  options: Array<{ id: string; label: string; hint?: string }>;
  /** The default a read gave, with its source in `hint`. */
  pick?: string[];
}

/** Ask first (kit ⑥): one question at a time, dots, Back, Next, "Skip, just build"; folds to answer pills. Never asks what a read answered. */
export function BriefCard({ title, questions, onDone }: { title: string; questions: BriefQuestion[]; onDone: (answers: Record<string, string[]>, line: string) => boolean | void }) {
  const [at, setAt] = useState(0);
  // M-ASK-35: which way the next pane slides; Back reverses.
  const [back, setBack] = useState(false);
  const go = (to: number) => {
    setBack(to < at);
    setAt(to);
  };
  const [answers, setAnswers] = useState<Record<string, string[]>>(() => Object.fromEntries(questions.map((q) => [q.id, q.pick ?? []])));
  const [done, setDone] = useState(false);
  const q = questions[at];
  if (!q) return null;
  const summary = () => questions.map((x) => (answers[x.id] ?? []).map((id) => x.options.find((o) => o.id === id)?.label).filter(Boolean).join(', ')).filter(Boolean);
  const finish = () => {
    // Not sent (a reply is still running, or offline): the answers stay open to send again.
    if (onDone(answers, summary().join(' · ')) === false) return;
    setDone(true);
  };
  if (done)
    return (
      <section className="qcard">
        <div className="qsum">
          <div className="pills">
            {summary().map((s, i) => (
              <span key={s} style={{ ['--ch-i' as string]: i }}>{s}</span>
            ))}
          </div>
          <button type="button" className="ed" onClick={() => setDone(false)}>
            Change answers
          </button>
        </div>
      </section>
    );
  const chosen = answers[q.id] ?? [];
  const toggle = (id: string) => setAnswers((a) => ({ ...a, [q.id]: q.multi ? (chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]) : [id] }));
  return (
    <section className="qcard" aria-label={title}>
      <div className="qh">
        <b>{title}</b>
        <span className="qdots" aria-hidden="true">
          {questions.map((x, i) => (
            <i key={x.id} className={(i <= at ? 'on' : '') + (i === at ? ' cur' : '')} />
          ))}
        </span>
      </div>
      <div key={q.id} className={'qpane' + (at === 0 && !back ? '' : back ? ' is-back' : ' is-next')}>
        <h5>{q.title}</h5>
        {q.why && <p className="why">{q.why}</p>}
        <div className="opts" role={q.multi ? 'group' : 'radiogroup'} aria-label={q.title}>
          {q.options.map((o) => (
            <button key={o.id} type="button" className={'opt' + (q.multi ? ' multi' : '')} aria-pressed={chosen.includes(o.id)} onClick={() => toggle(o.id)}>
              <span className="bx" aria-hidden="true">
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none">
                  <path d="M3.5 8.5l3 3 6-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" pathLength="24" />
                </svg>
              </span>
              <span className="ot">{o.label}</span>
              {o.hint && <span className="hint">{o.hint}</span>}
            </button>
          ))}
        </div>
      </div>
      <div className="qft">
        {at > 0 ? (
          <button type="button" className="c" onClick={() => go(at - 1)}>
            Back
          </button>
        ) : (
          <button type="button" className="sk" onClick={finish}>
            Skip, just build
          </button>
        )}
        <button type="button" className="p" data-ch-press="" onClick={() => (at === questions.length - 1 ? finish() : go(at + 1))}>
          {at === questions.length - 1 ? 'Build it' : 'Next'}
        </button>
      </div>
    </section>
  );
}
