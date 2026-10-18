'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, MessageSquare } from 'lucide-react';
import type { ChPlayerHelm, ChProposal } from '../../data/coachhelm-shape';
import { haptic } from '../../lib/haptics';
import { isOffline, normalise, useAction } from '../../lib/use-action';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { RefreshNotice } from '../../ui/RefreshNotice';
import { SectionBoundary } from '../../ui/SectionBoundary';
import { useToast } from '../../ui/Toast';
import { messageCoachHref } from '../home/player-links';
import type { ChPlayerWrites } from './writes';

/**
 * One focus area a coach proposed, answered by the player it is for (Q-77): Accept starts it, Decline sets it aside. The same two
 * actions and the same refusal behaviour as Stats Development's Accept and Decline, with this page's own catalog numbers. The
 * answer confirms itself in place (the chip), so Accept has no success toast; the follow-up is inside the action, so a toast's Retry
 * that lands shows the chip too. Nothing refreshes the page away from it (131501).
 *
 * Decline is held while its toast offers Undo (wave 7, decision C; the calendar's held move, P006-B3): the chip shows at once with
 * "Tell coach why", and the decline is written when Undo stops being offered (the toast's onExpire), or at once when the page is
 * left. There is no reverse of a decline to call, so Undo is the write never sent. A write that fails puts Accept and Decline back.
 */
function ProposalRow({ p, writes, quiet = false }: { p: ChProposal; writes: ChPlayerWrites; quiet?: boolean }) {
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
  const toast = useToast();
  /** The decline waiting on its Undo; each is its own record, so a stale toast never acts on a newer one. */
  const held = useRef<{ write: () => void } | null>(null);
  const write = useRef<() => Promise<void>>(async () => {});
  write.current = async () => {
    held.current = null;
    const res = await decline.run();
    // Not written (offline, refused, thrown): the buttons come back beside the error toast, whose Retry sets the chip again.
    if (!res.success) setAnswered(null);
  };
  // Leaving the page writes a waiting decline at once, as the calendar's held move does.
  useEffect(() => {
    const flush = () => held.current?.write();
    window.addEventListener('pagehide', flush);
    return () => {
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, []);
  const holdDecline = () => {
    // Offline, nothing is held: the action says so itself (CH-1903) and nothing changes.
    if (isOffline()) {
      void decline.run();
      return;
    }
    haptic('select');
    setAnswered('declined');
    // Written early (the page was left), the toast goes with it: an Undo that could no longer undo is never left up.
    const notice = new AbortController();
    const entry = {
      write: () => {
        notice.abort();
        void write.current();
      },
    };
    held.current = entry;
    toast({
      title: `Declined · ${p.title}`,
      code: 'CH-13912',
      signal: notice.signal,
      action: {
        label: 'Undo',
        run: () => {
          if (held.current !== entry) return;
          held.current = null;
          setAnswered(null);
          haptic('select');
        },
      },
      onExpire: () => {
        if (held.current === entry) entry.write();
      },
    });
  };
  const pending = accept.pending || decline.pending;
  return (
    <li className="ch-hl-prop__r">
      <span className="ch-hl-prop__t">
        <b>{p.title}</b>
        <em>{p.from ? `From the read “${p.from}”` : 'Your coach proposed this as a focus.'}</em>
      </span>
      {answered ? (
        <span className="ch-hl-prop__a is-answered">
          <span className="ch-hl-done" role="status" data-ch-code="CH-13902">
            <Icon icon={Check} size={15} />
            <span>
              {answered === 'accepted' ? 'Started' : 'Declined'} · {p.title}
            </span>
          </span>
          {/* Optional: the reason goes to the coach who proposed it, in Messages (wave 7, decision C). Not offered when who that is
              didn't load: never a guess at the coach. */}
          {answered === 'declined' && p.coachUserId && (
            <Button size="sm" variant="ghost" leftIcon={MessageSquare} href={messageCoachHref(p.coachUserId)}>
              Tell coach why
            </Button>
          )}
        </span>
      ) : (
        <span className="ch-hl-prop__a" role="group" aria-label={`Answer ${p.title}`}>
          <Button size="sm" variant={quiet ? 'secondary' : 'primary'} feel="press" disabled={pending} onClick={() => void accept.run()}>
            {accept.pending ? <span data-ch-code="CH-13404">Accepting…</span> : 'Accept'}
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={holdDecline}>
            {decline.pending ? <span data-ch-code="CH-13404">Declining…</span> : 'Decline'}
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
          // More than one proposal: each Accept is secondary, so the page keeps one primary action (P013 D10).
          <ProposalRow key={p.id} p={p} writes={writes} quiet={list.length > 1} />
        ))}
      </ul>
    </section>
  );
}

/**
 * The focus areas a coach proposed to this player, above their insights (Q-77). A read that failed is its own notice (CH-13205),
 * never "nothing proposed"; with nothing proposed there is no section. A section that crashes is contained (CH-13204).
 */
export function Proposals({ proposals, writes }: { proposals: ChPlayerHelm['proposals']; writes: ChPlayerWrites }) {
  if (proposals.error) {
    return <RefreshNotice code="CH-13205" title="Your proposed focus areas didn’t load" body="Nothing is lost. Anything your coach proposed is still waiting for you; try again in a moment." />;
  }
  if (proposals.list.length === 0) return null;
  return (
    <SectionBoundary surface="coachhelm.proposals" label="Proposed focus areas" code="CH-13204">
      <ProposalSection list={proposals.list} writes={writes} />
    </SectionBoundary>
  );
}
