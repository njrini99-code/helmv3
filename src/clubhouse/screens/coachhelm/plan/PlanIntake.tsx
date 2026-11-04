'use client';

import { ClipboardList, FileText } from 'lucide-react';
import { useState } from 'react';
import type { AskBriefData } from '../../../data/coachhelm-chat-thread';
import { Icon } from '../../../ui/Icon';

/** S-ASK.intake: one card, every question at once, the best guesses already picked. Build the plan sends the picks as the coach's next line, which folds the card. */
export function PlanIntake({ brief, onSend }: { brief: AskBriefData; onSend: (line: string) => void }) {
  const [picks, setPicks] = useState<Record<string, string[]>>(() => Object.fromEntries(brief.questions.map((q) => [q.id, (q as { pick?: string[] }).pick ?? []])));
  const [done, setDone] = useState(false);
  const ready = brief.questions.every((q) => (picks[q.id] ?? []).length > 0);
  if (done) return null;
  return (
    <div className="ch-cpv" data-ch="plan-intake">
      <section className="art intake" aria-label={brief.title}>
        <header className="art-h">
          <span className="tile">
            <Icon icon={ClipboardList} size={18} />
          </span>
          <div className="hd">
            <span className="t">{brief.title}</span>
            {brief.intake?.line && <span className="m">{brief.intake.line}</span>}
          </div>
        </header>
        <div className="qs">
          {brief.questions.map((q) => (
            <div className="q" key={q.id}>
              <div className="ql">{q.title}</div>
              <div className="qc">
                {q.options.map((o) => {
                  const on = !!picks[q.id]?.includes(o.id);
                  return (
                    <button
                      key={o.id}
                      type="button"
                      className={'qo' + (on ? ' on' : '')}
                      aria-pressed={on}
                      onClick={() =>
                        setPicks((p) => {
                          const now = p[q.id] ?? [];
                          return { ...p, [q.id]: q.multi ? (on ? now.filter((x) => x !== o.id) : [...now, o.id]) : [o.id] };
                        })
                      }
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
              {q.why && <div className="qh">{q.why}</div>}
            </div>
          ))}
        </div>
        {brief.intake?.format && (
          <div className="fmtline">
            <Icon icon={FileText} size={16} />
            <span>
              In your format · <b>{brief.intake.format}</b>
            </span>
          </div>
        )}
        <div className="acts is-pad">
          <button
            type="button"
            className="btn-p is-wide"
            disabled={!ready}
            onClick={() => {
              setDone(true);
              onSend(brief.questions.map((q) => q.options.filter((o) => picks[q.id]?.includes(o.id)).map((o) => o.label).join(', ')).join(' · '));
            }}
          >
            Build the plan
          </button>
        </div>
      </section>
    </div>
  );
}
