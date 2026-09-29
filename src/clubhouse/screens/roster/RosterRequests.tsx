'use client';

import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { acceptJoinRequest, rejectJoinRequest } from '@/app/golf/actions/teams';
import type { ChJoinRequest } from '../../data/roster';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { InlineNotice } from '../../ui/Notices';
import { useAction } from '../../lib/use-action';
import { formatHcp } from './format';

/**
 * Join requests. Approve and Decline update the list optimistically; a
 * failure puts the request back and says so (useAction).
 */
export function RosterRequests({ teamName, initial, error }: { teamName: string; initial: ChJoinRequest[]; error: boolean }) {
  const [reqs, setReqs] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const approve = useAction('roster.approveRequest', (r: ChJoinRequest) => acceptJoinRequest(r.id), (r) => ({
    done: `${r.name} added to ${teamName}`,
    failed: `Couldn't approve ${r.name}`,
    hint: 'The request may have been withdrawn. Refresh to see the latest.',
  }));
  const decline = useAction('roster.declineRequest', (r: ChJoinRequest) => rejectJoinRequest(r.id), (r) => ({
    done: `Request from ${r.name} declined`,
    failed: `Couldn't decline ${r.name}'s request`,
  }));

  if (error) {
    return (
      <InlineNotice
        title="Join requests didn't load."
        body="Pending requests are safe. Refresh to try again; the error has been reported."
      />
    );
  }
  if (!reqs.length) return null;

  const decide = async (r: ChJoinRequest, ok: boolean) => {
    setBusy(r.id);
    const idx = reqs.findIndex((x) => x.id === r.id);
    setReqs((cur) => cur.filter((x) => x.id !== r.id));
    const res = await (ok ? approve.run(r) : decline.run(r));
    if (!res.success) setReqs((cur) => [...cur.slice(0, idx), r, ...cur.slice(idx)]);
    setBusy(null);
  };

  return (
    <section className="ch-rs-req" aria-label="Join requests">
      <div className="ch-rs-req__head">
        <span className="ch-rs-req__ic">
          <Icon icon={UserPlus} size={15} />
        </span>
        <b>
          {reqs.length} {reqs.length === 1 ? 'player wants' : 'players want'} to join {teamName}
        </b>
        <span>Approving adds them to the roster and team chat.</span>
      </div>
      {reqs.map((r) => (
        <div key={r.id} className="ch-rs-req__row">
          <Avatar name={r.name} size={32} />
          <span className="ch-rs-req__who">
            <b>{r.name}</b>
            <span>
              {r.meta}
              {r.handicap != null && ` · HCP ${formatHcp(r.handicap)}`}
            </span>
          </span>
          <div className="ch-rs-req__act">
            <Button size="sm" variant="ghost" disabled={busy === r.id} onClick={() => void decide(r, false)}>
              Decline
            </Button>
            <Button size="sm" variant="primary" disabled={busy === r.id} onClick={() => void decide(r, true)} feel={null}>
              Approve
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}
