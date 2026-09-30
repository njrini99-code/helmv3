'use client';

import { useCallback, useRef, useState } from 'react';
import { acceptJoinRequest, rejectJoinRequest } from '@/app/golf/actions/teams';
import type { ChJoinRequest } from '../../data/roster';
import { normalise, useAction, type ActionCopy, type ActionResult } from '../../lib/use-action';
import { chReport } from '../../lib/track';

/** "Grace Liu", "Grace Liu and Owen Park", "Grace Liu, Owen Park and Sam Reyes". */
export function nameList(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

type AllOutcome = { added: ChJoinRequest[]; failed: ChJoinRequest[] };

/**
 * Pending join requests, shared by the desktop card and the phone banner and
 * sheet. Approve and Decline are optimistic, and a failure puts the request
 * back (useAction).
 *
 * Approve all (D-55) runs the same approve action one request at a time,
 * and each request leaves the list as it lands. It names every request that
 * failed and says how many were added (CH-3007). Failures stay in the list,
 * and the toast's Retry only re-runs those.
 */
export function useJoinRequests(teamName: string, initial: ChJoinRequest[]) {
  const [reqs, setReqs] = useState(initial);
  /** A request id while it is being decided, or 'all' during Approve all. */
  const [busy, setBusy] = useState<string | null>(null);
  const approvedIds = useRef(new Set<string>());

  const approve = useAction('roster.approveRequest', (r: ChJoinRequest) => acceptJoinRequest(r.id), (r) => ({
    done: `${r.name} added to ${teamName}`,
    failed: `Couldn't approve ${r.name}`,
    hint: 'The request may have been withdrawn. Refresh to see the latest.',
    code: 'CH-3002',
  }));
  const decline = useAction('roster.declineRequest', (r: ChJoinRequest) => rejectJoinRequest(r.id), (r) => ({
    done: `Request from ${r.name} declined`,
    failed: `Couldn't decline ${r.name}'s request`,
    code: 'CH-3003',
  }));

  const approveEach = useCallback(async (list: ChJoinRequest[]) => {
    const out: AllOutcome = { added: [], failed: [] };
    setBusy('all');
    try {
      for (const r of list) {
        if (approvedIds.current.has(r.id)) continue;
        let res: ActionResult;
        try {
          res = normalise(await acceptJoinRequest(r.id));
        } catch (err) {
          chReport(err, { surface: 'roster', action: 'roster.approveAll' });
          res = { success: false };
        }
        if (res.success) {
          approvedIds.current.add(r.id);
          out.added.push(r);
          setReqs((cur) => cur.filter((x) => x.id !== r.id));
        } else out.failed.push(r);
      }
    } finally {
      setBusy(null);
    }
    return out.failed.length
      ? { success: false, error: `${out.failed.length} of ${out.added.length + out.failed.length} approvals failed`, data: out }
      : { success: true, data: out };
  }, []);

  const all = useAction(
    'roster.approveAll',
    approveEach,
    (): ActionCopy => ({ done: '', failed: "Couldn't approve every request", code: 'CH-3007' }),
    (res, c) => {
      const out = res.data;
      if (!out) return c;
      const n = out.added.length;
      if (res.success) return { ...c, done: n === 0 ? '' : n === 1 ? `${out.added[0]!.name} added to ${teamName}` : `${n} players added to ${teamName}` };
      const tried = n + out.failed.length;
      return {
        ...c,
        failed: `Couldn't approve ${nameList(out.failed.map((r) => r.name))}`,
        hint: `${n === 0 ? `None of the ${tried} were added.` : `${n} of ${tried} added to ${teamName}.`} ${out.failed.length === 1 ? 'That request' : 'Those requests'} may have been withdrawn. Try again, or refresh to see the latest.`,
      };
    },
  );

  const decide = async (r: ChJoinRequest, ok: boolean) => {
    setBusy(r.id);
    const idx = reqs.findIndex((x) => x.id === r.id);
    setReqs((cur) => cur.filter((x) => x.id !== r.id));
    const res = await (ok ? approve.run(r) : decline.run(r));
    if (res.success && ok) approvedIds.current.add(r.id);
    if (!res.success) setReqs((cur) => [...cur.slice(0, idx), r, ...cur.slice(idx)]);
    setBusy(null);
  };

  const approveAll = async () => {
    if (reqs.length) await all.run(reqs);
  };

  return { reqs, busy, decide, approveAll, approvingAll: busy === 'all' };
}

export type ChJoinRequestsState = ReturnType<typeof useJoinRequests>;
