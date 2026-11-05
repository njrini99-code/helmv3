'use client';

import { ChevronDown } from 'lucide-react';
import { PlanPreview } from '../../plan/PlanCard';
import { ReadPicture } from '../../plan/ReadPicture';
import { useContext, useEffect, useId, useRef, useState } from 'react';
import { stepsReceipt, type AskStep } from '../../../../data/coachhelm-chat-thread';
import { useChReducedMotion } from '../../../../lib/reduced-motion';
import { Icon } from '../../../../ui/Icon';

function Glyph({ state, active }: { state: AskStep['state']; active: boolean }) {
  // An amber ring with a bar (the board's step states); red means under par and nothing else.
  if (state === 'failed')
    return (
      <span className="ic is-fail" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="9" cy="9" r="7" />
          <path d="M6 9h6" />
        </svg>
      </span>
    );
  if (state === 'next')
    return (
      <span className="ic is-next" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="9" cy="9" r="6" />
        </svg>
      </span>
    );
  if (active || state === 'active') return <span className="ic" aria-hidden="true"><i className="dot" /></span>;
  return (
    <span className="ic ok" aria-hidden="true">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2.5 7.5 5.6 10.5 11.5 3.8" pathLength="24" />
      </svg>
    </span>
  );
}

/**
 * The run (kit ①): one row per step the server announced, never an invented one, no percentage, no timer. Live while the turn runs; when it ends it folds to one line ("4 steps · 3s") that reopens. `waiting`: the turn stopped at a Confirm.
 */
export function Steps({ steps, active, seconds, waiting = false, stopped = false }: { steps: AskStep[]; active: boolean; seconds: number | null; waiting?: boolean; stopped?: boolean }) {
  const [open, setOpen] = useState(!!useContext(PlanPreview)?.stepsOpen);
  const id = useId();
  const reduced = useChReducedMotion();
  // M-ASK-11: the list a visit watched stays open 380ms after the last step, then folds over 360ms. One opened with the thread is folded already.
  const [fold, setFold] = useState<'none' | 'hold' | 'closing'>('none');
  const wasLive = useRef(active);
  useEffect(() => {
    if (active) {
      wasLive.current = true;
      return;
    }
    if (!wasLive.current) return;
    wasLive.current = false;
    if (waiting || stopped || reduced) return;
    setFold('hold');
    const closing = setTimeout(() => setFold('closing'), 380);
    const shut = setTimeout(() => setFold('none'), 380 + 360);
    return () => {
      clearTimeout(closing);
      clearTimeout(shut);
    };
  }, [active, waiting, stopped, reduced]);
  if (steps.length === 0) return null;
  const last = steps.length - 1;
  const list = (live: boolean) => (
    <ol id={live ? undefined : id} className={'steps' + (live ? ' is-live' : '')} aria-label="What CoachHelm is doing" aria-live={live ? 'polite' : undefined} aria-relevant={live ? 'additions text' : undefined}>
      {steps.map((s, i) => {
        // Stop freezes the row that was running: its dash stands in for the check it never earned (S-ASK.steps.stopped).
        const cut = stopped && (s.state === 'active' || (!s.state && i === last));
        const running = live && !stopped && (s.state === 'active' || (!s.state && i === last));
        const next = s.state === 'next';
        const done = !running && !cut && !next && s.state !== 'failed';
        return (
          <li key={s.id} className={'step' + (done ? ' done' : '') + (next ? ' is-next' : '') + (live ? ' is-in' : '')} aria-current={running ? 'step' : undefined}>
            {cut ? (
              <span className="ic" aria-hidden="true">
                <i className="dash" />
              </span>
            ) : (
              <Glyph state={s.state} active={running} />
            )}
            <span className="tx">
              <span className={running ? 'lb shim' : 'lb'}>{done ? (s.done ?? s.label) : s.label}</span>
              {next ? <small>Next</small> : s.detail && !running && <small>{s.detail}</small>}
              {s.picture && !running && <ReadPicture picture={s.picture} />}
            </span>
          </li>
        );
      })}
      {stopped && (
        <li className="step" data-ch-code="CH-13780">
          <span className="ic" aria-hidden="true" />
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
  if (active || waiting || stopped) {
    return (
      <div className="work open">
        {active && (
          <div className="sum is-live" aria-hidden="true">
            <span className="t">
              <span className="shim">Working</span>
            </span>
            <Icon icon={ChevronDown} size={16} />
          </div>
        )}
        {list(true)}
      </div>
    );
  }
  const shown = open || fold !== 'none';
  return (
    <div className={'work' + (shown && fold !== 'closing' ? ' open' : '')}>
      <button
        type="button"
        className="sum"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setFold('none');
          setOpen((v) => !(v || fold === 'hold'));
        }}
      >
        <span className="t ch-num">{stepsReceipt(steps, seconds)}</span>
        <Icon icon={ChevronDown} size={16} className="chev" />
      </button>
      {shown && (
        <div className={'fold' + (fold === 'closing' ? ' is-closing' : fold === 'none' ? ' is-opening' : '')}>
          <div>{list(false)}</div>
        </div>
      )}
    </div>
  );
}
