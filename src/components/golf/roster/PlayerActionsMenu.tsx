'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { removePlayerFromTeam } from '@/app/golf/actions/roster';
import { updatePlayerStatus } from '@/app/golf/actions/golf';
import { useToast } from '@/components/ui/sonner';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { coachHelmRoutes } from '@/lib/coachhelm/fairway-routes';
import { triggerHaptic } from '@/lib/utils/capacitor';
import { Button, IconButton } from '@/components/ui/button';
import {
  IconMoreVertical,
  IconUsers,
  IconUser,
  IconChevronRight,
  IconChartBar,
  IconMessage,
} from '@/components/icons';

// B4/F007: golf_team_members.status only allows pending/active/inactive/removed
// — 'injured' and 'redshirt' were never valid write values, so the Change
// Status modal offers Active + Inactive only.
type PlayerStatus = 'active' | 'inactive';

const statuses: Array<{
  value: PlayerStatus;
  label: string;
  description: string;
  dotColor: string;
  badgeStyle: string;
}> = [
  {
    value: 'active',
    label: 'Active',
    description: 'Player is actively participating in team activities',
    dotColor: 'bg-primary-500',
    badgeStyle: 'bg-primary-500/10 text-primary-700 ring-primary-500/20',
  },
  {
    value: 'inactive',
    label: 'Inactive',
    description: 'Player is not currently participating',
    dotColor: 'bg-warm-400',
    badgeStyle: 'bg-warm-500/10 text-warm-600 ring-warm-500/20',
  },
];

interface PlayerActionsMenuProps {
  playerId: string;
  playerName: string;
  currentStatus?: string | null;
}

export function PlayerActionsMenu({ playerId, playerName, currentStatus }: PlayerActionsMenuProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [showStatusModal, setShowStatusModal] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<PlayerStatus | null>(null);

  async function handleRemovePlayer() {
    setRemoving(true);

    try {
      const result = await removePlayerFromTeam(playerId);
      if (result.success) {
        showToast(`${playerName} removed from team`, 'success');
        setShowRemoveConfirm(false);
        router.refresh();
      } else {
        showToast(result.error || 'Failed to remove player', 'error');
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Failed to remove player',
        'error'
      );
    } finally {
      setRemoving(false);
    }
  }

  async function handleStatusChange() {
    if (!selectedStatus) return;

    setUpdatingStatus(true);

    try {
      const result = await updatePlayerStatus(playerId, selectedStatus);

      if (result.success) {
        const statusLabel = statuses.find(s => s.value === selectedStatus)?.label || selectedStatus;
        showToast(`${playerName}'s status changed to ${statusLabel}`, 'success');
        setShowStatusModal(false);
        setSelectedStatus(null);
        router.refresh();
      } else {
        showToast(result.error || 'Failed to update status', 'error');
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Failed to update status',
        'error'
      );
    } finally {
      setUpdatingStatus(false);
    }
  }

  function openStatusModal() {
    // Pre-select the current status if available
    const normalizedStatus = currentStatus as PlayerStatus;
    if (normalizedStatus && statuses.some(s => s.value === normalizedStatus)) {
      setSelectedStatus(normalizedStatus);
    } else {
      setSelectedStatus('active');
    }
    setShowStatusModal(true);
  }

  return (
    <div className="relative">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton variant="default"
            onClick={() => {
              void triggerHaptic('light');
            }}
            className="w-11 h-11 flex items-center justify-center rounded-xl text-warm-500 hover:text-warm-700 hover:bg-warm-100/60 active:bg-warm-200/60 active:scale-95 transition-[color,background-color,transform] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
            aria-label="Player actions"
          >
            <IconMoreVertical size={18} />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {/* F143: this routes to the CoachHelm Player Insight surface
              (/golf/dashboard/players/[playerId]), not the roster profile —
              labeled "View Insights" so the destination is honest and matches
              the Fairway kebab. */}
          <DropdownMenuItem
            onSelect={() => {
              void triggerHaptic('light');
              router.push(`/golf/dashboard/players/${playerId}`);
            }}
            className="gap-3"
          >
            <IconChevronRight size={18} className="text-warm-500" />
            View Insights
          </DropdownMenuItem>

          {/* Moved from the card body in the 2026-05-28 IA trim — the roster
              card now exposes only the primary "View Player" CTA inline. */}
          <DropdownMenuItem
            onSelect={() => {
              void triggerHaptic('light');
              router.push(coachHelmRoutes.playerStats(playerId));
            }}
            className="gap-3"
          >
            <IconChartBar size={18} className="text-warm-500" />
            View Stats
          </DropdownMenuItem>

          <DropdownMenuItem
            onSelect={() => {
              void triggerHaptic('light');
              router.push(`/golf/dashboard/messages?player=${playerId}`);
            }}
            className="gap-3"
          >
            <IconMessage size={18} className="text-warm-500" />
            Message
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={() => {
              void triggerHaptic('light');
              openStatusModal();
            }}
            className="gap-3"
          >
            <IconUser size={18} className="text-warm-500" />
            Change Status
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            onSelect={() => {
              void triggerHaptic('light');
              setShowRemoveConfirm(true);
            }}
            className="gap-3 hover:bg-red-500/8 data-[highlighted]:bg-red-500/8"
            style={{ color: '#FF3B30' }}
          >
            <IconUsers size={18} />
            Remove from Team
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Remove confirmation modal */}
      {showRemoveConfirm && (
        <div className="fixed inset-0 bg-warm-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h2 className="text-h3 font-medium text-warm-900 tracking-[-0.012em] mb-2">
              Remove Player?
            </h2>
            <p className="text-warm-600 mb-6">
              Are you sure you want to remove <strong>{playerName}</strong> from your team?
              They can rejoin later using the team invite code.
              <br />
              <br />
              <span className="text-sm text-warm-500">
                Note: Their account and stats will not be deleted.
              </span>
            </p>
            <div className="flex justify-end gap-3">
              <Button variant="ghost"
                onClick={() => setShowRemoveConfirm(false)}
                disabled={removing}
                className="px-4 py-2 rounded-lg border border-warm-200 text-warm-700 hover:bg-warm-50 active:bg-warm-100 font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </Button>
              <Button variant="ghost"
                onClick={handleRemovePlayer}
                disabled={removing}
                className="px-4 py-2 rounded-lg text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-2 active:scale-95"
                style={{ backgroundColor: '#FF3B30' }}
              >
                {removing ? (
                  <>
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '300ms' }} />
                    </span>
                    Removing...
                  </>
                ) : (
                  'Remove Player'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Change status modal */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-warm-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h2 className="text-h3 font-medium text-warm-900 tracking-[-0.012em] mb-2">
              Change Player Status
            </h2>
            <p className="text-warm-600 mb-6">
              Update the status for <strong>{playerName}</strong>.
            </p>

            {/* Status options */}
            <div className="space-y-2 mb-6">
              {statuses.map((status) => (
                <Button variant="primary"
                  key={status.value}
                  onClick={() => setSelectedStatus(status.value)}
                  disabled={updatingStatus}
                  className={cn(
                    'w-full px-4 py-3 rounded-xl border-2 text-left transition-all',
                    'hover:border-warm-300 hover:bg-warm-50 active:bg-warm-100',
                    'disabled:opacity-50 disabled:cursor-not-allowed',
                    selectedStatus === status.value
                      ? 'border-primary-500 bg-primary-50/50'
                      : 'border-warm-200 bg-white'
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span className={cn('w-3 h-3 rounded-full', status.dotColor)} />
                    <div className="flex-1">
                      <span className={cn(
                        'font-medium block',
                        selectedStatus === status.value ? 'text-warm-900' : 'text-warm-700'
                      )}>
                        {status.label}
                      </span>
                      <span className="text-xs text-warm-500">
                        {status.description}
                      </span>
                    </div>
                    {selectedStatus === status.value && (
                      <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                </Button>
              ))}
            </div>

            {/* Current status indicator */}
            {currentStatus && (
              <p className="text-sm text-warm-500 mb-4">
                Current status: <span className="font-medium capitalize">{currentStatus}</span>
              </p>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="ghost"
                onClick={() => {
                  setShowStatusModal(false);
                  setSelectedStatus(null);
                }}
                disabled={updatingStatus}
                className="px-4 py-2 rounded-lg border border-warm-200 text-warm-700 hover:bg-warm-50 active:bg-warm-100 font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </Button>
              <Button variant="primary"
                onClick={handleStatusChange}
                disabled={updatingStatus || !selectedStatus || selectedStatus === currentStatus}
                className="px-4 py-2 rounded-lg bg-primary-600 hover:bg-primary-700 text-white font-medium transition-colors disabled:opacity-50 disabled:bg-warm-300 flex items-center gap-2"
              >
                {updatingStatus ? (
                  <>
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-white skeleton-shimmer" style={{ animationDelay: '300ms' }} />
                    </span>
                    Updating...
                  </>
                ) : (
                  'Update Status'
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
