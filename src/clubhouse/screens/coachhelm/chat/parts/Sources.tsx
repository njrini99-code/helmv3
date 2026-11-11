'use client';
import { pluralWord } from '../../../../lib/plural';

import { BookOpen } from 'lucide-react';
import { useId, useState } from 'react';
import { readRows, type AskTurnRead } from '../../../../data/coachhelm-chat-thread';
import { Icon } from '../../../../ui/Icon';

/** "3 reads" under the answer: every read of the turn, even where the model forgot a marker (02 §5). */
export function Sources({ reads, open: openProp, onToggle }: { reads: AskTurnRead[]; open?: boolean; onToggle?: () => void }) {
  const [own, setOwn] = useState(false);
  const open = openProp ?? own;
  const id = useId();
  if (reads.length === 0) return null;
  return (
    <div className="srcw">
      <button type="button" className="srcs" aria-expanded={open} aria-controls={id} onClick={() => (onToggle ? onToggle() : setOwn((v) => !v))}>
        <span className="stack" aria-hidden="true">
          {reads.slice(0, 3).map((r) => (
            <i key={r.ref}>
              <Icon icon={BookOpen} size={11} />
            </i>
          ))}
        </span>
        <span className="ch-num">
          {/* A computed answer has no markers in its sentences: this row is where it says what it stands on (never an empty row). */}
          {reads.every((r) => r.via === 'code') ? 'Worked out from ' : ''}
          {reads.length} {pluralWord(reads.length, 'read', 'reads')}
        </span>
      </button>
      {open && (
        <div id={id} className="in">
          {reads.map((r, i) => (
            <div key={r.ref} className="src">
              <span className="n ch-num">{i + 1}</span>
              <span>
                <b>{r.name}</b>
                <span className="ch-num">{readRows(r).map((x) => x.value).join(' · ')}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
