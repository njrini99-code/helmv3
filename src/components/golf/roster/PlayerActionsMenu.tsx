'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { removePlayerFromTeam, updatePlayerStatus } from '@/app/golf/actions/roster';
import { useToast } from '@/components/ui/toast';
import {
  IconMoreVertical,
  IconUsers,
  IconUser,
  IconChevronRight,
} from '@/components/icons';

interface PlayerActionsMenuProps {
  playerId: string;
  playerName: string;
}

export function PlayerActionsMenu({ playerId, playerName }: PlayerActionsMenuProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [showMenu, setShowMenu] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [removing, setRemoving] = useState(false);

  async function handleRemovePlayer() {
    setRemoving(true);

    try {
      await removePlayerFromTeam(playerId);
      showToast(`${playerName} removed from team`, 'success');
      setShowRemoveConfirm(false);
      setShowMenu(false);
      router.refresh();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Failed to remove player',
        'error'
      );
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="relative">
      {/* Three-dot menu button */}
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
        aria-label="Player actions"
      >
        <IconMoreVertical size={18} className="text-slate-500" />
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
          <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-lg shadow-lg border border-slate-200 py-1 z-20">
            <button
              onClick={() => {
                router.push(`/golf/dashboard/roster/${playerId}`);
                setShowMenu(false);
              }}
              className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2 text-slate-700"
            >
              <IconChevronRight size={16} />
              View Profile
            </button>

            <button
              onClick={() => {
                // TODO: Implement change status modal
                showToast('Change status coming soon', 'info');
                setShowMenu(false);
              }}
              className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 flex items-center gap-2 text-slate-700"
            >
              <IconUser size={16} />
              Change Status
            </button>

            <div className="border-t border-slate-100 my-1" />

            <button
              onClick={() => {
                setShowRemoveConfirm(true);
                setShowMenu(false);
              }}
              className="w-full px-4 py-2 text-left text-sm hover:bg-red-50 flex items-center gap-2 text-red-600"
            >
              <IconUsers size={16} />
              Remove from Team
            </button>
          </div>
        </>
      )}

      {/* Remove confirmation modal */}
      {showRemoveConfirm && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-slate-900 mb-2">
              Remove Player?
            </h2>
            <p className="text-slate-600 mb-6">
              Are you sure you want to remove <strong>{playerName}</strong> from your team?
              They can rejoin later using the team invite code.
              <br />
              <br />
              <span className="text-sm text-slate-500">
                Note: Their account and stats will not be deleted.
              </span>
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowRemoveConfirm(false)}
                disabled={removing}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRemovePlayer}
                disabled={removing}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {removing ? (
                  <>
                    <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
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
    </div>
  );
}
