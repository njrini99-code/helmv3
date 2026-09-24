'use client';

/**
 * The player detail context menu: every coach action that is not the page's
 * one primary (Message). The only write here is the existing, non-destructive
 * roster status change (`updatePlayerStatus`), fired only by an explicit tap.
 */

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { PopoverPanel } from '@/components/fairway/overlays/PopoverPanel';
import { fairwayToast } from '@/components/fairway/feedback/ToastStack';
import { updatePlayerStatus } from '@/app/golf/actions/golf';
import { IconMoreHorizontal } from '@/components/icons';
import type { PlayerIdentity } from './types';

const ITEM =
  'flex min-h-11 w-full items-center rounded-fw-sm px-2.5 py-2 text-left font-fw-sans text-body text-text-primary ' +
  'transition-colors duration-150 hover:bg-surface-sunken active:bg-surface-sunken ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';

export function PlayerActionsMenu({ player }: { player: PlayerIdentity }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [status, setStatus] = React.useState(player.membershipStatus === 'inactive' ? 'inactive' : 'active');
  const [busy, setBusy] = React.useState(false);
  const base = `/golf/dashboard/players/${player.id}`;
  const next = status === 'inactive' ? 'active' : 'inactive';

  const toggleStatus = async () => {
    setBusy(true);
    const prev = status;
    setStatus(next);
    try {
      const res = await updatePlayerStatus(player.id, next);
      if (!res.success) throw new Error(res.error ?? 'Update failed');
      fairwayToast.success(next === 'inactive' ? `${player.firstName} marked inactive` : `${player.firstName} marked active`);
      setOpen(false);
      router.refresh();
    } catch {
      setStatus(prev);
      fairwayToast.danger("Couldn't change the status. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PopoverPanel
      open={open}
      onOpenChange={setOpen}
      surface="matte"
      align="end"
      width="md"
      ariaLabel={`More actions for ${player.fullName}`}
      trigger={
        // eslint-disable-next-line helm/no-raw-button -- 44pt icon-only trigger for a Radix popover
        <button
          type="button"
          aria-label="More actions"
          className={cn(
            'grid h-11 w-11 place-items-center rounded-full text-text-secondary',
            'transition-colors duration-150 hover:bg-surface-sunken active:bg-surface-sunken',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600',
          )}
        >
          <IconMoreHorizontal size={22} />
        </button>
      }
    >
      <div className="flex flex-col p-1" role="menu">
        <Link role="menuitem" href={`${base}/game?tab=scouting`} className={ITEM} onClick={() => setOpen(false)}>
          Scouting report
        </Link>
        <Link role="menuitem" href={`${base}/game/print`} className={ITEM} onClick={() => setOpen(false)}>
          Print report
        </Link>
        {player.email ? (
          <a role="menuitem" href={`mailto:${player.email}`} className={ITEM}>
            Email {player.firstName}
          </a>
        ) : null}
        {player.phone ? (
          <a role="menuitem" href={`tel:${player.phone}`} className={ITEM}>
            Call {player.firstName}
          </a>
        ) : null}
        <PopoverPanel.Separator />
        <PopoverPanel.Item role="menuitem" onClick={toggleStatus} disabled={busy}>
          {status === 'inactive' ? 'Mark active' : 'Mark inactive'}
        </PopoverPanel.Item>
      </div>
    </PopoverPanel>
  );
}
