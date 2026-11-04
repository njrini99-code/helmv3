'use client';

import { BookOpen } from 'lucide-react';
import { useId, useState } from 'react';
import { readRows, type AskTurnRead } from '../../../../data/coachhelm-chat-thread';
import { Icon } from '../../../../ui/Icon';

/** "3 reads" under the answer: every read of the turn, even where the model forgot a marker (02 §5). */
export function Sources({ reads }: { reads: AskTurnRead[] }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  if (reads.length === 0) return null;
  return (
    <div className="srcw">
      <button type="button" className="srcs" aria-expanded={open} aria-controls={id} onClick={() => setOpen((v) => !v)}>
        <span className="stack" aria-hidden="true">
          {reads.slice(0, 3).map((r) => (
            <i key={r.ref}>
              <Icon icon={BookOpen} size={11} />
            </i>
          ))}
        </span>
        <span className="ch-num">
          {reads.length} {reads.length === 1 ? 'read' : 'reads'}
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
