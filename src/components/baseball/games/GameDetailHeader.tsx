'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { IconPencil } from '@/components/icons';
import { EditGameModal } from './EditGameModal';
import type { BaseballGame } from '@/lib/types';

interface GameDetailHeaderProps {
  game: BaseballGame;
  opponentLabel: string;
  /** Coach-only gate (can_manage_stats), resolved server-side. */
  canManageStats: boolean;
}

/**
 * Game Detail breadcrumb row + coach-only "Edit" affordance. Lets a coach fix
 * a mistyped date/opponent/location/notes without deleting the game (which
 * would cascade-destroy its box score).
 */
export function GameDetailHeader({ game, opponentLabel, canManageStats }: GameDetailHeaderProps) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-sm text-warm-400">
        <Link href="/baseball/dashboard/stats/games" className="hover:text-warm-600 transition-colors">
          Games
        </Link>
        <span>›</span>
        <span className="text-warm-600">{opponentLabel}</span>
      </div>

      {canManageStats && (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setEditOpen(true)}
            className="shrink-0"
          >
            <IconPencil size={14} />
            <span className="ml-1.5">Edit</span>
          </Button>
          {editOpen && (
            <EditGameModal game={game} open={editOpen} onClose={() => setEditOpen(false)} />
          )}
        </>
      )}
    </div>
  );
}
