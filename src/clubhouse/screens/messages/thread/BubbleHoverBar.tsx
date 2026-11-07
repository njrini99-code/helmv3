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
  return (
    <div className="ch-msv-hoverbar" role="toolbar" aria-label="Message actions">
      {REACTIONS.filter((r) => r.key === "Like" || r.key === "Love" || r.key === "Laugh").map((r) => {
        const on = reacts.some((x) => x.key === r.key && x.mine);
        return (
          <button
            key={r.key}
            type="button"
            aria-label={`${on ? "Remove" : "React"} ${r.key.toLowerCase()}`}
            aria-pressed={on}
            onClick={() => {
              haptic("select");
              api.react(m.id, r.key, !on);
            }}
          >
            <Icon icon={r.icon} size={14.4} />
          </button>
        );
      })}
      {onReply && (
        <button type="button" aria-label="Reply" onClick={onReply}>
          <Icon icon={Reply} size={14.4} />
        </button>
      )}
      <button
        type="button"
        aria-label="More message actions"
        onClick={() => {
          onMore();
        }}
      >
        <Icon icon={Ellipsis} size={14.4} />
      </button>
    </div>
  );
}
