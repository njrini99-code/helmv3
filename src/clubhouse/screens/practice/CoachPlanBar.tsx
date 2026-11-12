'use client';

import { ChevronDown, Pencil, Printer } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { postPracticePlanToChat } from '@/app/golf/actions/coachhelm-practice-plans';
import { takeDownPracticePlan } from '@/app/golf/actions/practice-publish';
import { Avatar } from '../../ui/Avatar';
import { Badge, type BadgeTone } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Menu } from '../../ui/Menu';
import { Modal } from '../../ui/Modal';
import { Switch } from '../../ui/Switch';
import { useToast } from '../../ui/Toast';
import { useChPhone } from '../../lib/use-phone';

export interface ChPlanStatus {
  planId: string;
  title: string;
  version: number;
  status: 'draft' | 'published';
  edited: boolean;
  seen: { names: string[]; of: number } | null;
}

/**
 * The coach's line on the plan page (N-00 4.11, 4.15): what state the plan is in, said in words, with who has seen it, then Edit, Print and, once
 * published, Share with Take down. `after` is what the page draws under the status (Run, in its window).
 */
export function CoachPlanBar({ status, after = null }: { status: ChPlanStatus; after?: ReactNode }) {
  const router = useRouter();
  const toast = useToast();
  const phone = useChPhone();
  const [seenOpen, setSeenOpen] = useState(false);
  const [downOpen, setDownOpen] = useState(false);
  const [tell, setTell] = useState(true);
  const [busy, setBusy] = useState(false);
  const base = `/golf/dashboard/practice/plan/${status.planId}`;
  const published = status.status === 'published';
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${base}`);
      toast({ title: 'Link copied. Only your team can open it.' });
    } catch {
      toast({ tone: 'error', title: 'Couldn’t copy the link' });
    }
  };
  const toChat = async () => {
    const r = await postPracticePlanToChat({ planId: status.planId }).catch(() => ({ success: false as const, error: 'Couldn’t post to team chat.' }));
    if (!r.success) return toast({ tone: 'error', title: r.error ?? 'Couldn’t post to team chat.' });
    toast({ title: 'Posted in team chat' });
  };
  const takeDown = async () => {
    setBusy(true);
    const r = await takeDownPracticePlan({ planId: status.planId, expectedVersion: status.version, notify: tell, title: status.title }).catch(() => ({ success: false as const, error: 'Couldn’t take the plan down. Players can still see it.' }));
    setBusy(false);
    setDownOpen(false);
    if (!r.success) return toast({ tone: 'error', title: r.error ?? 'Couldn’t take the plan down. Players can still see it.' });
    router.refresh();
  };
  // Three states that must never be mistaken for each other: who can see the plan, and whether what they see is what the coach has now.
  const state: { key: 'draft' | 'edited' | 'live'; word: string; tone: BadgeTone; line: string } = !published
    ? { key: 'draft', word: 'Draft', tone: 'neutral', line: 'Only coaches can see this. Players get it when you publish.' }
    : status.edited
      ? { key: 'edited', word: 'Edits not published', tone: 'info', line: 'Players still have the plan as you last published it.' }
      : { key: 'live', word: 'Published', tone: 'positive', line: 'Players have this plan.' };
  // Seen by belongs to the status, so it reads on the status line: "Published · Seen by 6 of 9".
  const said = (
    <div className="ch-prc-planbar__s">
      <Badge tone={state.tone} dot>
        {state.word}
      </Badge>
      {/* On a phone a published plan's line is its word and who has seen it; the sentence that repeats the word is still read aloud. */}
      <p className={phone && state.key === 'live' ? 'ch-sr-only' : undefined}>{state.line}</p>
      {status.seen && (
        <Button variant="ghost" size="sm" className="ch-num" onClick={() => setSeenOpen(true)}>
          Seen by {status.seen.names.length} of {status.seen.of}
        </Button>
      )}
    </div>
  );
  const keys = (
    <div className="ch-prc-planbar__a">
      <Button variant={state.key === 'live' ? 'secondary' : 'primary'} leftIcon={Pencil} href={`${base}/edit`}>
        Edit
      </Button>
      {/* Print is its own key: here on a Mac, in the top bar on a phone. A draft has nobody to share with, so it has no Share. */}
      {!phone && (
        <Button leftIcon={Printer} href={`/golf/dashboard/practice/print/${status.planId}`}>
          Print
        </Button>
      )}
      {published && (
        <Menu
          label="Share"
          trigger={(p) => (
            <Button variant="secondary" rightIcon={ChevronDown} menu={p}>
              Share
            </Button>
          )}
          items={[
            { label: 'Send to team chat', onSelect: () => void toChat() },
            { label: 'Copy link', onSelect: () => void copyLink() },
            { label: 'Take down', danger: true, onSelect: () => setDownOpen(true) },
          ]}
        />
      )}
    </div>
  );
  // On a Mac the keys end the status line and Run follows. On a phone Run comes first, under the status, and the keys after it:
  // during practice the coach needs Now before Edit and Share.
  return (
    <>
      <section className="ch-prc-planbar" data-state={state.key} aria-label="Plan status">
        {said}
        {!phone && keys}
      </section>
      {after}
      {phone && keys}
      <Modal open={seenOpen} onClose={() => setSeenOpen(false)} title="Seen by" width={420} detent={0.62}>
        <ul className="ch-prc-seenlist">
          {(status.seen?.names ?? []).map((n) => (
            <li key={n}>
              <Avatar name={n} size="xs" />
              <span>{n}</span>
            </li>
          ))}
        </ul>
      </Modal>
      <Modal
        open={downOpen}
        onClose={() => setDownOpen(false)}
        title="Take this plan down?"
        description="Players can’t open it any more. It stays here as a draft."
        width={420}
        footer={
          <>
            <Button variant="ghost" onClick={() => setDownOpen(false)}>
              Keep it up
            </Button>
            <Button variant="danger" busy={busy} onClick={() => void takeDown()}>
              Take down
            </Button>
          </>
        }
      >
        <Switch label="Tell players" checked={tell} onChange={setTell} />
      </Modal>
    </>
  );
}
