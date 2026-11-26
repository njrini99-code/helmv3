'use client';

import type { ChMessagesApi } from '../api/types';
import type { ChMsg, ChReaction } from '../model';
import { haptic } from '../../../lib/haptics';
import { Ellipsis, Reply } from 'lucide-react';
import { Icon } from '../../../ui/Icon';
import { REACTIONS } from '../overlays/reactions';

/** Desktop: the Like / Love / Laugh / Reply / More tools beside a bubble. */
export function BubbleHoverBar({
  api,
  m,
  reacts,
  onReply,
  onMore,
}: {
  api: ChMessagesApi;
  m: ChMsg;
  reacts: ChReaction[];
  onReply?: () => void;
  /** Opens the message's lift (refreshes its menu first). */
  onMore: () => void;
}) {
  // MSG-224: a poll takes its taps itself; the bar is for text, photos and files.
  if (m.poll) return null;
  return (
    <div className="ch-msv-hoverbar" role="toolbar" aria-label="Message actions">
      {REACTIONS.filter((r) => r.key === "Like" || r.key === "Love" || r.key === "Laugh").map((r) => {
        const on = reacts.some((x) => x.key === r.key && x.mine);
        return (
          <button data-ctl="CTL-P007-119"
            key={r.key}
            type="button"
            aria-label={r.key}
            aria-pressed={on}
            onClick={() => {
              haptic("select");
              api.react(m.id, r.key, !on);
            }}
          >
            <Icon icon={r.icon} size={15} />
          </button>
        );
      })}
      {onReply && (
        <button data-ctl="CTL-P007-120" type="button" aria-label="Reply" onClick={onReply}>
          <Icon icon={Reply} size={15} />
        </button>
      )}
      <button data-ctl="CTL-P007-121"
        type="button"
        aria-label="More actions"
        onClick={() => {
          onMore();
        }}
      >
        <Icon icon={Ellipsis} size={15} />
      </button>
    </div>
  );
}
