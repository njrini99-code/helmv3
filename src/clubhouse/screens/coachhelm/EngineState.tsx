'use client';

import { useId, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { ChAuditLine, ChReadEngine } from '../../data/coachhelm-engine-shape';
import { Icon } from '../../ui/Icon';

/**
 * What the engine now knows about a read (CoachHelm surfaces A; supercharge 04 §3 and §6 layouts 2, 5 and 6), drawn flush under
 * the read: how sure it is (the claim ladder, with the range in words, or the Watching count-down), the cause state, Cleared,
 * Contradicted or Under review, and the verdict on the focus area made from it. Every row is drawn only when the loader put it on
 * the card, which it does only with that state's flag on, so with every flag off this draws nothing. Words carry every state; the
 * pill's tone is decoration.
 */

const RUNG_TONE: Record<string, string> = {
  seen_repeatedly: 'good',
  observed: 'good',
  likely: 'mid',
  working_hypothesis: 'plain',
  not_enough_yet: 'plain',
};
const LIFE_TONE: Record<string, string> = {
  Cleared: 'good',
  Contradicted: 'warn',
  'Under review': 'plain',
};

export function EngineState({ engine, code = 'CH-13990' }: { engine: ChReadEngine | undefined; code?: string }) {
  if (!engine) return null;
  const { support, cause, lifecycle, verdict } = engine;
  if (!support && !cause && !lifecycle && !verdict) return null;
  return (
    <dl className="ch-hl-eng" data-ch-code={code}>
      {lifecycle && (
        <div>
          <dt>Status</dt>
          <dd>
            <span className={'ch-hl-eng__w is-' + (LIFE_TONE[lifecycle.word] ?? 'plain')}>{lifecycle.word}</span>
            {lifecycle.line && <span className="ch-hl-eng__l">{lifecycle.line}</span>}
            {lifecycle.pair && (
              <>
                <span className="ch-hl-eng__l">Drawn as one with: {lifecycle.pair.with}.</span>
                {lifecycle.pair.lines.map((l) => (
                  <span key={l} className="ch-hl-eng__l ch-num">
                    {l}
                  </span>
                ))}
              </>
            )}
          </dd>
        </div>
      )}
      {support && (
        <div>
          <dt>How sure</dt>
          <dd>
            <span className={'ch-hl-eng__w is-' + (RUNG_TONE[support.rung] ?? 'plain')}>{support.word}</span>
            {support.watching ? (
              <span className="ch-hl-eng__l ch-num">{support.watching}</span>
            ) : (
              support.range && <span className="ch-hl-eng__l ch-num">{support.range}</span>
            )}
          </dd>
        </div>
      )}
      {cause && (
        <div>
          <dt>Cause</dt>
          <dd>
            <span className={'ch-hl-eng__w is-' + (cause.state === 'counted' ? 'good' : cause.state === 'likely' ? 'mid' : 'plain')}>{cause.word}</span>
            <span className="ch-hl-eng__l ch-num">{cause.line}</span>
          </dd>
        </div>
      )}
      {verdict && (
        <div>
          <dt>Focus area</dt>
          <dd>
            <span className={'ch-hl-eng__w is-' + verdict.tone}>{verdict.word}</span>
            {verdict.line && <span className="ch-hl-eng__l ch-num">{verdict.line}</span>}
            {verdict.target && <span className="ch-hl-eng__l ch-num">{verdict.target}</span>}
          </dd>
        </div>
      )}
    </dl>
  );
}

/**
 * "Why do you think so?" (layout 6): the read's audit lines in a plain list, behind a disclosure that names what it controls. Closed
 * at first; like the card's other disclosure its tap is silent (D-70). Drawn only when the support flag put audit lines on the card.
 */
export function WhyAudit({ lines, code = 'CH-13991' }: { lines: readonly ChAuditLine[] | undefined; code?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (!lines || lines.length === 0) return null;
  return (
    <div className="ch-hl-audit" data-ch-code={code}>
      <button type="button" className="ch-hl-why" aria-expanded={open} aria-controls={`${id}-audit`} onClick={() => setOpen((v) => !v)}>
        <span>Why do you think so?</span>
        <Icon icon={open ? ChevronUp : ChevronDown} size={15} />
      </button>
      <dl id={`${id}-audit`} className="ch-hl-audit__l" hidden={!open}>
        {lines.map((l) => (
          <div key={l.k}>
            <dt>{l.k}</dt>
            <dd className="ch-num">{l.v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Reads the recheck found cleared (04 example 5): one line each, under their own heading. */
export function ClearedLines({ lines, code = 'CH-13992' }: { lines: readonly string[] | undefined; code?: string }) {
  if (!lines || lines.length === 0) return null;
  return (
    <section className="ch-hl-cleared" aria-label="Cleared" data-ch-code={code}>
      <h3>
        Cleared <span className="ch-num">{lines.length}</span>
      </h3>
      <ul>
        {lines.map((l) => (
          <li key={l} className="ch-num">
            {l}
          </li>
        ))}
      </ul>
    </section>
  );
}
