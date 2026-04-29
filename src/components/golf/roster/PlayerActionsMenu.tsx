'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { removePlayerFromTeam } from '@/app/golf/actions/roster';
import { updatePlayerStatus } from '@/app/golf/actions/golf';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { triggerHaptic } from '@/lib/utils/capacitor';
import {
  IconMoreVertical,
  IconUsers,
  IconUser,
  IconChevronRight,
} from '@/components/icons';

type PlayerStatus = 'active' | 'injured' | 'redshirt' | 'inactive';

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
    value: 'injured',
    label: 'Injured',
    description: 'Player is recovering from an injury',
    dotColor: 'bg-rose-500',
    badgeStyle: 'bg-rose-500/10 text-rose-700 ring-rose-500/20',
  },
  {
    value: 'redshirt',
    label: 'Redshirt',
    description: 'Player is redshirting this season',
    dotColor: 'bg-amber-500',
    badgeStyle: 'bg-amber-500/10 text-amber-700 ring-amber-500/20',
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
  const [showMenu, setShowMenu] = useState(false);
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
        setShowMenu(false);
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
    setShowMenu(false);
  }

  return (
    <div className="relative">
      {/* Three-dot menu button */}
      <button
        onClick={() => {
          void triggerHaptic('light');
          setShowMenu(!showMenu);
        }}
        className="w-11 h-11 flex items-center justify-center rounded-xl text-warm-500 hover:text-warm-700 hover:bg-warm-100/60 active:bg-warm-200/60 active:scale-95 transition-[color,background-color,transform] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
        aria-label="Player actions"
        aria-haspopup="menu"
        aria-expanded={showMenu}
      >
        <IconMoreVertical size={18} />
      </button>

      {/* Dropdown menu */}
      {showMenu && (
        <>
          {/* Backdrop to close menu */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setShowMenu(false)}
          />

          {/* Menu */}
          <div
            role="menu"
            className="absolute right-0 top-full mt-1.5 w-52 bg-cream-50/95 backdrop-blur-xl rounded-2xl shadow-[0_12px_40px_rgba(16,24,40,0.14)] border border-warm-200/50 py-1.5 z-20 origin-top-right animate-in fade-in zoom-in-95 slide-in-from-top-1 duration-180"
          >
            <button
              role="menuitem"
              onClick={() => {
                void triggerHaptic('light');
                router.push(`/golf/dashboard/players/${playerId}`);
                setShowMenu(false);
              }}
              className="w-full px-3 py-2.5 min-h-[44px] text-left text-[15px] font-medium hover:bg-warm-100/60 active:bg-warm-100/80 transition-colors flex items-center gap-3 text-warm-800"
            >
              <IconChevronRight size={18} className="text-warm-500" />
              View Profile
            </button>

            <button
              role="menuitem"
              onClick={() => {
                void triggerHaptic('light');
                openStatusModal();
              }}
              className="w-full px-3 py-2.5 min-h-[44px] text-left text-[15px] font-medium hover:bg-warm-100/60 active:bg-warm-100/80 transition-colors flex items-center gap-3 text-warm-800"
            >
              <IconUser size={18} className="text-warm-500" />
              Change Status
            </button>

            <div className="h-px bg-warm-200/50 my-1" />

            <button
              role="menuitem"
              onClick={() => {
                void triggerHaptic('light');
                setShowRemoveConfirm(true);
                setShowMenu(false);
              }}
              className="w-full px-3 py-2.5 min-h-[44px] text-left text-[15px] font-medium hover:bg-[#FF3B30]/8 active:bg-[#FF3B30]/12 transition-colors flex items-center gap-3"
              style={{ color: '#FF3B30' }}
            >
              <IconUsers size={18} />
              Remove from Team
            </button>
          </div>
        </>
      )}

      {/* Remove confirmation modal */}
      {showRemoveConfirm && (
        <div className="fixed inset-0 bg-warm-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h2 className="text-[20px] font-medium text-warm-900 tracking-[-0.012em] mb-2">
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
              <button
                onClick={() => setShowRemoveConfirm(false)}
                disabled={removing}
                className="px-4 py-2 rounded-lg border border-warm-200 text-warm-700 hover:bg-warm-50 active:bg-warm-100 font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
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
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Change status modal */}
      {showStatusModal && (
        <div className="fixed inset-0 bg-warm-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h2 className="text-[20px] font-medium text-warm-900 tracking-[-0.012em] mb-2">
              Change Player Status
            </h2>
            <p className="text-warm-600 mb-6">
              Update the status for <strong>{playerName}</strong>.
            </p>

            {/* Status options */}
            <div className="space-y-2 mb-6">
              {statuses.map((status) => (
                <button
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
                </button>
              ))}
            </div>

            {/* Current status indicator */}
            {currentStatus && (
              <p className="text-sm text-warm-500 mb-4">
                Current status: <span className="font-medium capitalize">{currentStatus}</span>
              </p>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowStatusModal(false);
                  setSelectedStatus(null);
                }}
                disabled={updatingStatus}
                className="px-4 py-2 rounded-lg border border-warm-200 text-warm-700 hover:bg-warm-50 active:bg-warm-100 font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
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
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
