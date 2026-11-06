'use client';

import { BookOpen } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import type { AskTurnRead } from '../../../../data/coachhelm-chat-thread';
import { readBasis, readRows } from '../../../../data/coachhelm-chat-thread';
import { rebuiltHref } from '../../../../shell/nav';
import { Icon } from '../../../../ui/Icon';
import { usePopoverFit } from '../../../../lib/use-popover-fit';

/** Where a read's figures live: this player's Stats, or the team's. Null where Stats isn't rebuilt, and then no link is drawn. */
export function readStatsHref(read: AskTurnRead): string | null {
  const entity = readBasis(read.envelope)?.entity;
  if (!entity) return null;
  return rebuiltHref(entity.kind === 'player' ? `/golf/dashboard/stats?player=${entity.id}` : '/golf/dashboard/stats');
}

/** A pill naming the read and window a sentence's figure came from. Tap opens what's behind it; every row comes from the envelope (AK2). */
export function ReadChip({ read, onSources }: { read: AskTurnRead; /** Opens this answer's list of every read. */ onSources?: () => void }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLSpanElement>(null);
  // ASK-6: beside its chip and inside the screen, flipping above when there's no room below.
  const fit = usePopoverFit(pop, open);
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
  const stats = readStatsHref(read);
  return (
    <span className="cite-wrap">
      <button ref={btn} type="button" className={'cite' + (open ? ' on' : '')} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen((v) => !v)}>
        <Icon icon={BookOpen} size={12} />
        {read.chip}
      </button>
      {/* A chip sits inside the answer's paragraph, so every box in here is a span: a div or a list in a <p> is invalid HTML. */}
      {open && (
        <span ref={pop} className="cpop" role="dialog" aria-label={read.name} style={fit ? { left: fit.left, top: fit.top, maxHeight: fit.maxHeight } : undefined}>
          <b>{read.name}</b>
          <span className="rows">
            {rows.map((r) => (
              <span className="row" key={r.label}>
                <span className="k">{r.label}</span>
                <span className="v ch-num">{r.value}</span>
              </span>
            ))}
          </span>
          {(stats || onSources) && (
            <span className="cpop-f">
              {stats && (
                <Link prefetch={false} href={stats}>
                  Open in Stats
                </Link>
              )}
              {onSources && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    onSources();
                  }}
                >
                  Sources
                </button>
              )}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
