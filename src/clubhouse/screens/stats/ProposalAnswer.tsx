'use client';

import { useRouter } from 'next/navigation';
import { acceptFocusArea, declineFocusArea } from '@/app/golf/actions/development';
import { Button } from '../../ui/Button';
import { normalise, useAction } from '../../lib/use-action';

/**
 * A coach's proposed focus area, answered by the player it is for (Q-77): Accept starts it, Decline sets it aside.
 * The actions act only on the player's own `proposed` rows (RLS and a status guard), so a stale answer is refused,
 * not applied twice. The page reads again inside each action, so a toast's Retry that lands does that too.
 */
export function ProposalAnswer({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const accept = useAction(
    'stats.acceptFocusArea',
    async () => {
      const res = await acceptFocusArea(id);
      if (normalise(res).success) router.refresh();
      return res;
    },
    () => ({ done: `Started · ${title}`, failed: `Couldn’t accept ${title}`, hint: 'It is still waiting for you. Try again in a moment.', code: 'CH-5003' }),
  );
  const decline = useAction(
    'stats.declineFocusArea',
    async () => {
      const res = await declineFocusArea(id);
      if (normalise(res).success) router.refresh();
      return res;
    },
    () => ({ done: `Declined · ${title}`, failed: `Couldn’t decline ${title}`, hint: 'It is still waiting for you. Try again in a moment.', code: 'CH-5004' }),
  );
  const pending = accept.pending || decline.pending;
  return (
    <span className="ch-pf-answer" role="group" aria-label={`Answer ${title}`}>
      <Button size="sm" variant="primary" disabled={pending} onClick={() => void accept.run()}>
        {accept.pending ? <span data-ch-code="CH-5404">Accepting</span> : 'Accept'}
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => void decline.run()}>
        {decline.pending ? <span data-ch-code="CH-5404">Declining</span> : 'Decline'}
      </Button>
    </span>
  );
}
