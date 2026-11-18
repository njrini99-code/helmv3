'use client';

import { ArrowRight } from 'lucide-react';
import { haptic } from '../../../../lib/haptics';
import { Icon } from '../../../../ui/Icon';
import { useLayoutEffect, useRef, useState } from 'react';
import { useChReducedMotion } from '../../../../lib/reduced-motion';

/** Three chips at most, together, under the card; each from a read this turn made. */
export function FollowUps({ items, onSend }: { items: string[]; onSend: (text: string) => void }) {
  const root = useRef<HTMLUListElement>(null);
  const reduced = useChReducedMotion();
  const [fresh, setFresh] = useState(false);
  useLayoutEffect(() => {
    // History renders its answer without is-new. Decide once, before paint; later preference changes never replay it.
    setFresh(!reduced && !!root.current?.closest('.ch-ak-turn.is-new'));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (items.length === 0) return null;
  return (
    <ul ref={root} className="chips ch-aki-followups" data-fresh={fresh || undefined} aria-label="Next steps">
      {items.slice(0, 3).map((f) => (
        <li key={f}>
          <button
            type="button"
            className="chip"
            data-ch-press=""
            onClick={() => {
              haptic('select');
              onSend(f);
            }}
          >
            <Icon icon={ArrowRight} size={14} />
            {f}
          </button>
        </li>
      ))}
    </ul>
  );
}
