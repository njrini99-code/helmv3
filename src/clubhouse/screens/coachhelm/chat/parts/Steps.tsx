'use client';

import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';
import { stepsReceipt, type AskStep } from '../../../../data/coachhelm-chat-thread';
import { Icon } from '../../../../ui/Icon';

function Glyph({ state, active }: { state: AskStep['state']; active: boolean }) {
  if (state === 'failed')
    return (
      <span className="ic is-fail" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="9" cy="9" r="7" />
          <path d="M9 5.5v4.2M9 12.4v.1" />
        </svg>
      </span>
    );
  if (active || state === 'active') return <span className="ic" aria-hidden="true"><i className="dot" /></span>;
  return (
    <span className="ic ok" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 7.5 5.6 10.5 11.5 3.8" />
      </svg>
    </span>
  );
}

/**
 * The run (kit ①): one row per step the server announced, never an invented one, no percentage, no timer. Live while the turn runs; when it ends it folds to one line ("4 steps · 3s") that reopens. `waiting`: the turn stopped at a Confirm.
 */
export function Steps({ steps, active, seconds, waiting = false, stopped = false }: { steps: AskStep[]; active: boolean; seconds: number | null; waiting?: boolean; stopped?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (steps.length === 0) return null;
  const last = steps.length - 1;
  const list = (live: boolean) => (
    <ol id={live ? undefined : id} className="steps" aria-label="What CoachHelm is doing" aria-live={live ? 'polite' : undefined} aria-relevant={live ? 'additions text' : undefined}>
      {steps.map((s, i) => {
        const running = live && (s.state === 'active' || (!s.state && i === last));
        const done = !running && s.state !== 'failed';
        return (
          <li key={s.id} className={'step' + (done ? ' done' : '') + (live ? ' is-in' : '')} aria-current={running ? 'step' : undefined}>
            <Glyph state={s.state} active={running} />
            <span className="tx">
              <span className={running ? 'lb shim' : 'lb'}>{done ? (s.done ?? s.label) : s.label}</span>
              {s.detail && !running && <small>{s.detail}</small>}
            </span>
          </li>
        );
      })}
      {stopped && (
        <li className="step" data-ch-code="CH-13780">
          <span className="ic" aria-hidden="true">
            <i className="dash" />
          </span>
          <span className="tx">
            <span className="lb">Stopped. Nothing was saved.</span>
          </span>
        </li>
      )}
      {waiting && (
        <li className="step is-wait">
          <span className="ic" aria-hidden="true">
            <i className="ringa" />
          </span>
          <span className="tx">
            <span className="lb">Waiting for you</span>
          </span>
        </li>
      )}
    </ol>
  );
  if (active || waiting || stopped) return <div className="work">{list(true)}</div>;
  return (
    <div className={'work' + (open ? ' open' : '')}>
      <button type="button" className="sum" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        <span className="t ch-num">{stepsReceipt(steps, seconds)}</span>
        <Icon icon={ChevronDown} size={16} className="chev" />
      </button>
      {open && list(false)}
    </div>
  );
}
