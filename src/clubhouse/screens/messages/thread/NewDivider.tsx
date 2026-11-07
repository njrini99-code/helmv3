'use client';

import type { ChMessagesApi } from '../api/types';
import { type ChConv, firstUnreadId } from '../model';
import { useState } from 'react';
import { PresenceRow } from '../../../ui/ListPresence';

/**
 * The "New" divider (wave 5 #17): placed once as a thread opens, before the first message that was unread then, so it
 * stays put as more arrive and as the open marks them read. The unread count is the one the conversation had on opening.
 */
export function useNewDivider(api: ChMessagesApi, conv: ChConv): string | null {
  const [mark, setMark] = useState<{ convId: string; unread: number; id?: string | null }>({ convId: conv.id, unread: conv.unread });
  if (mark.convId !== conv.id) setMark({ convId: conv.id, unread: conv.unread });
  else if (mark.id === undefined && !api.msgsLoading && api.msgs.length) setMark({ ...mark, id: firstUnreadId(api.msgs, mark.unread) });
  return mark.convId === conv.id ? (mark.id ?? null) : null;
}

/** Where the divider sits, before its message. */
export function NewDivider() {
  return (
    <PresenceRow as="div" className="ch-ms-day is-new" role="separator" aria-label="New messages">
      <span>New</span>
    </PresenceRow>
  );
}
