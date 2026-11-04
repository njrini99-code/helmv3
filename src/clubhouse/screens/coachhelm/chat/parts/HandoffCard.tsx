'use client';

import { useRouter } from 'next/navigation';
import { messagesPrefillHref } from '../../../messages/prefill';
import type { AskHandoffData } from '../../../../data/coachhelm-chat-thread';

/** The board's draft, opened in Messages from a fresh prefill on each tap. Nothing is sent until the coach sends it. */
export function HandoffCard({ handoff }: { handoff: AskHandoffData }) {
  const router = useRouter();
  return (
    <section className="ch-ak-handoff">
      <b>{handoff.title}</b>
      <p>Nothing is sent until you tap Send.</p>
      <button type="button" className="ch-btn ch-btn--secondary" onClick={() => {
        const href = messagesPrefillHref({ players: handoff.players, draft: handoff.draft, returnTo: 'ask' });
        if (href) router.push(href);
      }}>
        Open in Messages
      </button>
    </section>
  );
}
