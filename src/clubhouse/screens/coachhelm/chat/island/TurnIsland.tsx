'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { haptic } from '../../../../lib/haptics';
import { Icon } from '../../../../ui/Icon';
import { LeadMark, StepRow } from './ActivityIsland';
import type { IslandModel } from './model';

export interface TurnIslandProps {
  model: IslandModel;
  /** What the work came to, once it is over ("Read 8 rounds"). */
  summary: string;
  /** "3 steps · 4s", beside the summary. */
  meta: string;
  /** The words of a live turn that has no step yet ("Sending", "Reading your question"); null while there is nothing to say. */
  words: string | null;
  open: boolean;
  onToggle: () => void;
  onOpenStep?: (ref: string, label: string) => void;
}

/**
 * The activity island, in the thread (direction A; owner, 11 Nov): how CoachHelm's steps show while it works. It sits in the
 * flow under the question: a deep green rounded panel with a title row and a chevron, and one row a step (a ringed tick for
 * done, a ring that turns for active, a dim disc for waiting). When the first words of the answer arrive, or the work
 * finishes, it folds to one line ("Read 8 rounds · 3 steps · 4s"); a tap opens the steps again. The line is led by the
 * chat's mark, the ball (`LeadMark`): thinking from the first moment after send and while the answer is written, gone
 * when the work is done, when the line keeps only its tick.
 *
 * Every row is one of the engine's own events (`island/model.ts`). Its two sizes swap in one frame and only its rows fade, so
 * no height is animated; it folds before anything is drawn under it, so nothing the coach is reading moves by itself.
 */
export function TurnIsland({ model, summary, meta, words, open, onToggle, onOpenStep }: TurnIslandProps) {
  const listId = useId();
  const hasSteps = model.steps.length > 0;
  const shown = open && hasSteps;
  // What a screen reader hears: a step finishing, in a few words. Never a restored turn's history.
  const [said, setSaid] = useState('');
  const told = useRef<Set<string> | null>(null);
  useEffect(() => {
    const first = told.current === null;
    told.current ??= new Set();
    for (const s of model.steps) {
      if ((s.state !== 'done' && s.state !== 'failed') || told.current.has(s.id)) continue;
      told.current.add(s.id);
      if (model.live && !first) setSaid(s.detail ? `${s.label}, ${s.detail}` : s.label);
    }
  }, [model]);

  // A live turn with no step yet says only what is known: nothing for the first beat (the ball alone, thinking), then the wait's own words.
  const title = model.live ? (hasSteps ? (shown ? 'Working on your question' : model.head) : (words ?? '')) : model.stopped ? 'Stopped' : summary;
  const line = (
    <>
      {!shown && <LeadMark live={model.live} settled={model.stopped ? 'stopped' : 'done'} />}
      {/* Keyed by its words: a change of activity is a new line fading in, not letters swapping in place. */}
      {title && (
        <span key={title} className="t">
          {title}
        </span>
      )}
      {!model.live && !shown && meta && <span className="m ch-num">{meta}</span>}
      {hasSteps && <Icon icon={ChevronDown} size={shown ? 16 : 14} className="chev" />}
    </>
  );
  return (
    <section className={'ch-ak-isl' + (shown ? ' is-open' : '') + (model.live ? ' is-live' : '')} aria-label="What CoachHelm did" data-ch-code="CH-13860">
      {hasSteps ? (
        <button
          type="button"
          className="hd"
          aria-expanded={shown}
          aria-controls={listId}
          data-ch-press=""
          onClick={() => {
            haptic('select');
            onToggle();
          }}
        >
          {line}
        </button>
      ) : (
        <p className="hd" role="status">
          {line}
        </p>
      )}
      {shown && (
        <ol id={listId} className="steps">
          {model.steps.map((s) => (
            <StepRow key={s.id} step={s} onOpen={onOpenStep} />
          ))}
        </ol>
      )}
      <span className="ch-sr-only" role="status" aria-live="polite">
        {said}
      </span>
    </section>
  );
}
