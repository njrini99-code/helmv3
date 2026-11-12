'use client';

import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { readRows, type AskTurnRead } from '../../../../data/coachhelm-chat-thread';
import { haptic } from '../../../../lib/haptics';
import { Icon } from '../../../../ui/Icon';

/** The one fact a source row carries beside its name: its sample ("8 rounds"), else its window. */
function metaOf(read: AskTurnRead): string | null {
  const row = readRows(read).find((r) => r.label !== 'Read' && r.label !== 'Computed');
  return row?.value ?? null;
}

/**
 * The sources, at the foot of the answer (direction A): the same pencilled numerals that are raised in the sentences, each a
 * row that opens the read behind it. Every read of the turn is listed, even where the model forgot a marker (02 §5).
 * `plain`: the answer is words on the page, not a leaf, so the rows hang under it without the leaf's rule.
 */
export function Sources({ reads, onOpen, openRef = null, action, plain = false }: { reads: AskTurnRead[]; /** Opens one read in the evidence sheet or panel. */ onOpen?: (ref: string, label: string) => void; openRef?: string | null; /** The answer's own key (Copy), at the end of the heading row. */ action?: ReactNode; plain?: boolean }) {
  if (reads.length === 0 && !action) return null;
  const computed = reads.length > 0 && reads.every((r) => r.via === 'code');
  return (
    <footer className={'ch-ak-src' + (plain ? ' is-plain' : '') + (reads.length === 0 ? ' is-bare' : '')}>
      <div className="ch-ak-src__h">
        {/* A computed answer has no markers in its sentences: this row is where it says what it stands on (never an empty row). */}
        {reads.length > 0 && <h3>{computed ? 'Worked out from' : 'Sources'}</h3>}
        {action}
      </div>
      {reads.map((r, i) => {
        const meta = metaOf(r);
        const inner = (
          <>
            <span className="n ch-num">{i + 1}</span>
            <span className="t">{r.name}</span>
            {meta && <span className="m ch-num">{meta}</span>}
            {onOpen && <Icon icon={ChevronRight} size={14} />}
          </>
        );
        return onOpen ? (
          <button
            key={r.ref}
            type="button"
            className={'ch-ak-src__row' + (openRef === r.ref ? ' is-on' : '')}
            aria-pressed={openRef === r.ref}
            data-ch-press=""
            onClick={() => {
              haptic('select');
              onOpen(r.ref, r.name);
            }}
          >
            {inner}
          </button>
        ) : (
          <div key={r.ref} className="ch-ak-src__row">
            {inner}
          </div>
        );
      })}
    </footer>
  );
}
