'use client';

import { linkParts, firstName } from '../model';
import { isNativeApp, openExternalUrl } from '@/lib/utils/capacitor';
import type { ChMessagesApi } from '../api/types';
import { personOf } from '../person-of';
import { useChReducedMotion } from '../../../lib/reduced-motion';
import { Icon } from '../../../ui/Icon';
import { ListChecks } from 'lucide-react';

/**
 * A message's text with its web links as links (wave 5 #13): React nodes, never HTML, and only http(s) (linkParts). In
 * the iOS app a link opens in the in-app browser (openExternalUrl), not inside the app's own web view.
 */
export function MessageText({ text }: { text: string }) {
  return (
    <>
      {linkParts(text).map((p, i) =>
        typeof p === "string" ? p : (
          <a
            key={i}
            className="ch-ms-link"
            href={p.href}
            target="_blank"
            rel="noreferrer noopener"
            onClick={(e) => {
              if (!isNativeApp()) return;
              e.preventDefault();
              void openExternalUrl(p.href);
            }}
          >
            {p.text}
          </a>
        ),
      )}
    </>
  );
}

/** A parent outside the loaded history remains an honest unavailable reference. */
/** The chip's name (S-MSG.reply): the first name, or "yourself" for your own message. */
export function replyName(api: ChMessagesApi, id: string): string {
  const m = api.msgs.find((x) => x.id === id);
  if (!m) return "message";
  return m.mine ? "yourself" : firstName(personOf(api, m.senderId)?.name ?? "them");
}

export function ReplyQuote({ api, replyToId }: { api: ChMessagesApi; replyToId: string }) {
  const reduced = useChReducedMotion();
  const parent = api.msgs.find((m) => m.id === replyToId);
  const name = parent ? (parent.mine ? "You" : personOf(api, parent.senderId)?.name ?? "Member") : "Reply";
  return (
    <button type="button" className="ch-ms-quote" aria-label={`Reply to ${name}`} disabled={!parent}
      onClick={() => document.getElementById(`ch-ms-message-${replyToId}`)?.scrollIntoView({
        block: "center",
        behavior: reduced ? "instant" : "smooth",
      })}>
      <b>{name}</b>
      <span>
        {!parent ? "Original message unavailable" : parent.deleted ? "Message deleted" : parent.poll ? (
          <>
            <Icon icon={ListChecks} size={13} className="ch-ms-row__poll" />
            {parent.poll.question}
          </>
        ) : (
          parent.text || (parent.hasAttachments ? "Attachment" : "Message")
        )}
      </span>
    </button>
  );
}
