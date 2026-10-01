'use client';

import { useState } from 'react';
import { Check } from 'lucide-react';
import type { ChPlayerHelm, ChProposal } from '../../data/coachhelm-shape';
import { normalise, useAction } from '../../lib/use-action';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { SectionBoundary } from '../../ui/SectionBoundary';
import type { ChPlayerWrites } from './writes';

/**
 * One focus area a coach proposed, answered by the player it is for (Q-77): Accept starts it, Decline sets it aside. The same two
 * actions and the same refusal behaviour as Stats Development's Accept and Decline, with this page's own catalog numbers. The
 * answer confirms itself in place (the chip), so there is no success toast; the follow-up is inside the action, so a toast's Retry
 * that lands shows the chip too. Nothing refreshes the page away from it (131501).
 */
function ProposalRow({ p, writes }: { p: ChProposal; writes: ChPlayerWrites }) {
  const [answered, setAnswered] = useState<'accepted' | 'declined' | null>(null);
  const accept = useAction(
    'coachhelm.acceptFocusArea',
    async () => {
      const res = await writes.accept(p.id);
      if (normalise(res).success) setAnswered('accepted');
      return res;
    },
    { done: '', failed: `Couldn’t accept ${p.title}`, hint: 'It is still waiting for you. Try again in a moment.', code: 'CH-13004' },
  );
  const decline = useAction(
    'coachhelm.declineFocusArea',
    async () => {
      const res = await writes.decline(p.id);
      if (normalise(res).success) setAnswered('declined');
      return res;
    },
    { done: '', failed: `Couldn’t decline ${p.title}`, hint: 'It is still waiting for you. Try again in a moment.', code: 'CH-13005' },
  );
  const pending = accept.pending || decline.pending;
  return (
    <li className="ch-hl-prop__r">
      <span className="ch-hl-prop__t">
        <b>{p.title}</b>
        <em>{p.from ? `From: ${p.from}` : 'Your coach proposed this as a focus.'}</em>
      </span>
      {answered ? (
        <span className="ch-hl-done" role="status" data-ch-code="CH-13902">
          <Icon icon={Check} size={15} />
          {answered === 'accepted' ? 'Started' : 'Declined'} · {p.title}
        </span>
      ) : (
        <span className="ch-hl-prop__a" role="group" aria-label={`Answer ${p.title}`}>
          <Button size="sm" variant="primary" disabled={pending} onClick={() => void accept.run()}>
            {accept.pending ? <span data-ch-code="CH-13404">Accepting</span> : 'Accept'}
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => void decline.run()}>
            {decline.pending ? <span data-ch-code="CH-13404">Declining</span> : 'Decline'}
          </Button>
        </span>
      )}
    </li>
  );
}

function ProposalSection({ list, writes }: { list: ChProposal[]; writes: ChPlayerWrites }) {
  return (
    <section className="ch-hl-prop" aria-labelledby="ch-hl-prop-h">
      <h2 id="ch-hl-prop-h">Proposed for you</h2>
      <p className="ch-hl-note">Accept to start a focus, or decline to set it aside.</p>
      <ul>
        {list.map((p) => (
          <ProposalRow key={p.id} p={p} writes={writes} />
        ))}
      </ul>
    </section>
  );
}

/**
 * The focus areas a coach proposed to this player, above their insights (Q-77). A read that failed is its own notice (CH-13205),
 * never "nothing proposed"; with nothing proposed there is no section. A section that crashes is contained (CH-13204).
 */
export function Proposals({ proposals, writes, onRetry }: { proposals: ChPlayerHelm['proposals']; writes: ChPlayerWrites; onRetry: () => void }) {
  if (proposals.error) {
    return <InlineNotice code="CH-13205" title="Your proposed focus areas didn’t load" body="Nothing is lost. Anything your coach proposed is still waiting for you; try again in a moment." onRetry={onRetry} />;
  }
  if (proposals.list.length === 0) return null;
  return (
    <SectionBoundary surface="coachhelm.proposals" label="Proposed focus areas" code="CH-13204">
      <ProposalSection list={proposals.list} writes={writes} />
    </SectionBoundary>
  );
}
