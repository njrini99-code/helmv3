'use client';

/**
 * GameBoxScoreToggle
 *
 * Completed-game surface: shows the box score view by default, with a
 * toggleable "Edit Box Score" panel so coaches can correct errors without
 * scrolling past a full table to find an entry form.
 *
 * Design: cream/green palette, glass cards, framer-motion panel slide.
 */

import { useState } from 'react';
import { LazyMotion, domAnimation, m, AnimatePresence, useReducedMotion } from 'framer-motion';
import { BoxScoreView } from './BoxScoreView';
import { BoxScoreUpload } from './BoxScoreUpload';
import { Button } from '@/components/ui/button';
import { IconEdit, IconX } from '@/components/icons';
import type { BaseballGame, BaseballBoxScoreBatting, BaseballBoxScorePitching } from '@/lib/types';

interface PlayerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_position: string | null;
  jersey_number: string | null;
}

interface GameBoxScoreToggleProps {
  game: BaseballGame;
  batting: BaseballBoxScoreBatting[];
  pitching: BaseballBoxScorePitching[];
  teamPlayers: PlayerRow[];
}

export function GameBoxScoreToggle({ game, batting, pitching, teamPlayers }: GameBoxScoreToggleProps) {
  const [editing, setEditing] = useState(false);
  const reduceMotion = useReducedMotion();

  const panelAnim = reduceMotion
    ? {}
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -4 }, transition: { duration: 0.2 } };

  return (
    <LazyMotion features={domAnimation}>
      <div className="space-y-6">
        {/* Box score read view */}
        <BoxScoreView game={game} batting={batting} pitching={pitching} />

        {/* Edit toggle */}
        <div className="flex justify-end">
          <Button
            variant={editing ? 'secondary' : 'outline'}
            size="sm"
            onClick={() => setEditing((v) => !v)}
          >
            {editing ? (
              <>
                <IconX size={15} className="mr-1.5" />
                Cancel Edit
              </>
            ) : (
              <>
                <IconEdit size={15} className="mr-1.5" />
                Edit Box Score
              </>
            )}
          </Button>
        </div>

        {/* Collapsible edit panel */}
        <AnimatePresence>
          {editing && (
            <m.div key="edit-panel" {...panelAnim}>
              <div className="glass-standard rounded-2xl p-5">
                <h3 className="text-sm font-semibold text-warm-700 mb-4">Update Box Score</h3>
                <BoxScoreUpload game={game} teamPlayers={teamPlayers} />
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </LazyMotion>
  );
}
