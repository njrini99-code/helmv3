'use client';

import { ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { haptic } from '../../../lib/haptics';
import { Icon } from '../../../ui/Icon';

/** The card that closes a view: one line on what the page was, and the ways on, each a link row to another view. `title`: a coach's reads "Also for Jonah". */
export function KeepReading({ id, line, items, title = 'Keep reading' }: { id: string; line: string; items: ReadonlyArray<{ href: string; title: string; note: string }>; title?: string }) {
  return (
    <aside className="ch-hv-next" aria-labelledby={id}>
      <h3 id={id}>{title}</h3>
      <p>{line}</p>
      {items.map((i) => (
        <Link key={i.href} className="ch-hv-link" href={i.href} onClick={() => haptic('select')}>
          <span>
            <b>{i.title}</b>
            <em>{i.note}</em>
          </span>
          <Icon icon={ArrowRight} size={16} />
        </Link>
      ))}
    </aside>
  );
}
