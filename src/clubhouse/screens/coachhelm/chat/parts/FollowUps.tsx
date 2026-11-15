'use client';

import { ArrowRight } from 'lucide-react';
import { haptic } from '../../../../lib/haptics';
import { Icon } from '../../../../ui/Icon';

/** Three chips at most, together, under the card; each from a read this turn made. */
export function FollowUps({ items, prompts, onSend }: { items: string[]; /** What each item sends, by position; the label itself when absent. */ prompts?: string[]; onSend: (text: string) => void }) {
  if (items.length === 0) return null;
  return (
    <ul className="chips" aria-label="Next steps">
      {items.slice(0, 3).map((f, i) => (
        <li key={f}>
          <button
            type="button"
            className="chip"
            data-ch-press=""
            data-ch-ask-source=""
            onClick={() => {
              haptic('select');
              onSend(prompts?.[i] || f);
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
