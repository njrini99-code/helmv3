'use client';

import { BookOpen } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { AskTurnRead } from '../../../../data/coachhelm-chat-thread';
import { readRows } from '../../../../data/coachhelm-chat-thread';
import { Icon } from '../../../../ui/Icon';

/** A pill naming the read and window a sentence's figure came from. Tap opens what's behind it; every row comes from the envelope (AK2). */
export function ReadChip({ read }: { read: AskTurnRead }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        btn.current?.focus();
      }
    };
    const onDown = (e: PointerEvent) => {
      if (!pop.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);
  const rows = readRows(read);
  return (
    <span className="cite-wrap">
      <button ref={btn} type="button" className={'cite' + (open ? ' on' : '')} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)}>
        <Icon icon={BookOpen} size={12} />
        {read.chip}
      </button>
      {open && (
        <div ref={pop} className="cpop" role="dialog" aria-label={read.name}>
          <b>{read.name}</b>
          <dl>
            {rows.map((r) => (
              <div key={r.label}>
                <dt>{r.label}</dt>
                <dd className="ch-num">{r.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </span>
  );
}
