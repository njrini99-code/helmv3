'use client';

import { Button } from '../../ui/Button';

import { useState } from 'react';
import type { AskBriefData } from '../../data/coachhelm-chat-thread';

/**
 * S-RUN.ask-plan and S-RUN.ask-qual: one small card with every group of chips at once, the answers a read gave already ticked. The primary stays dim until each group has a
 * pick. It answers by sending the picks as the coach's next line, as Ask's brief does.
 */
export function QuickAsk({ brief, onSend }: { brief: AskBriefData; onSend: (line: string) => void }) {
  const [picks, setPicks] = useState<Record<string, string[]>>(() => Object.fromEntries(brief.questions.map((q) => [q.id, (q as { pick?: string[] }).pick ?? []])));
  const [done, setDone] = useState(false);
  const ready = brief.questions.every((q) => (picks[q.id] ?? []).length > 0);
  const toggle = (id: string, opt: string, multi: boolean | undefined) =>
    setPicks((p) => {
      const now = p[id] ?? [];
      return { ...p, [id]: multi ? (now.includes(opt) ? now.filter((x) => x !== opt) : [...now, opt]) : now.includes(opt) ? [] : [opt] };
    });
  const line = () => brief.questions.map((q) => q.options.filter((o) => picks[q.id]?.includes(o.id)).map((o) => o.label).join(', ')).join(' · ');
  const why = brief.questions[0]?.why;
  return (
    <div className="qask" role="group" aria-label={brief.title} data-ch="quick-ask">
      <p className="qask__q">
        {brief.title}
        {why && <span>{why}</span>}
      </p>
      {brief.questions.map((q) => (
        <div className="qask__g" key={q.id}>
          <span>{q.title}</span>
          <div className="opts">
            {q.options.map((o) => (
              <button key={o.id} type="button" aria-pressed={!!picks[q.id]?.includes(o.id)} disabled={done} onClick={() => toggle(q.id, o.id, q.multi)}>
                {o.label}
              </button>
            ))}
          </div>
        </div>
      ))}
      <Button variant="primary" size="lg" className="qc-act" disabled={!ready || done} onClick={() => {
          setDone(true);
          onSend(line());
        }}>
        <span className="lbl">{/plan/i.test(brief.title) || brief.questions.some((q) => /work on/i.test(q.title)) ? 'Build the plan' : 'Set it up'}</span>
      </Button>
    </div>
  );
}
