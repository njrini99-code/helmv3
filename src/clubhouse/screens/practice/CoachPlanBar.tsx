'use client';

import { ChevronDown, Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { postPracticePlanToChat } from '@/app/golf/actions/coachhelm-practice-plans';
import { takeDownPracticePlan } from '@/app/golf/actions/practice-publish';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Menu } from '../../ui/Menu';
import { Modal } from '../../ui/Modal';
import { Switch } from '../../ui/Switch';
import { useToast } from '../../ui/Toast';

export interface ChPlanStatus {
  planId: string;
  title: string;
  version: number;
  status: 'draft' | 'published';
  edited: boolean;
  seen: { names: string[]; of: number } | null;
}

/** The coach's keys on the plan page (N-00 4.11, 4.15): Edit, Share, Seen by and Take down. */
export function CoachPlanBar({ status }: { status: ChPlanStatus }) {
  const router = useRouter();
  const toast = useToast();
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
  return (
    <div className="ch-prc-planacts">
      {status.seen && (
        <button type="button" className="ch-prc-seen ch-num" onClick={() => setSeenOpen(true)}>
          Seen by {status.seen.names.length} of {status.seen.of}
        </button>
      )}
      {published && status.edited && <span className="ch-prc-row__e">Edits not published</span>}
      <Button variant="secondary" leftIcon={Pencil} href={`${base}/edit`}>
        Edit
      </Button>
      <Menu
        label="Share"
        trigger={(p) => (
          <button type="button" className="ch-btn ch-btn--secondary" {...p}>
            <span>Share</span>
            <Icon icon={ChevronDown} size={15} />
          </button>
        )}
        items={[
          ...(published ? [{ label: 'Send to team chat', onSelect: () => void toChat() }, { label: 'Copy link', onSelect: () => void copyLink() }] : []),
          { label: 'Print or save as PDF', href: `/golf/dashboard/practice/print/${status.planId}` },
          ...(published ? [{ label: 'Take down', danger: true, onSelect: () => setDownOpen(true) }] : []),
        ]}
      />
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
    </div>
  );
}
