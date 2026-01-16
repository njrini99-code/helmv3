'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShineEffect } from '@/components/ui/shine-effect';
import { IconCalendar, IconChevronRight } from '@/components/icons';
import { UnfinishedRoundModal } from '@/components/golf/UnfinishedRoundModal';
import type { GolfRound } from '@/lib/types/golf';

interface RoundWithPlayer extends GolfRound {
  player: {
    first_name: string | null;
    last_name: string | null;
  } | null;
}

interface UnfinishedRoundsSectionProps {
  rounds: RoundWithPlayer[];
}

export function UnfinishedRoundsSection({ rounds }: UnfinishedRoundsSectionProps) {
  const router = useRouter();
  const [selectedRound, setSelectedRound] = useState<RoundWithPlayer | null>(null);
  const [localRounds, setLocalRounds] = useState(rounds);

  const handleRoundClick = (round: RoundWithPlayer) => {
    setSelectedRound(round);
  };

  const handleCloseModal = () => {
    setSelectedRound(null);
  };

  const handleDeleted = () => {
    // Remove the deleted round from local state
    if (selectedRound) {
      setLocalRounds(localRounds.filter(r => r.id !== selectedRound.id));
    }
    // Refresh the page to update the list
    router.refresh();
  };

  if (localRounds.length === 0) {
    return null;
  }

  return (
    <>
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-lg font-semibold text-slate-900">Unfinished Rounds</h2>
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
            {localRounds.length} unfinished
          </span>
        </div>
        <div className="space-y-3">
          {localRounds.map((round) => {
            const timeSince = new Date().getTime() - new Date(round.updated_at || round.created_at || new Date().toISOString()).getTime();
            const hoursSince = Math.floor(timeSince / (1000 * 60 * 60));
            const daysSince = Math.floor(hoursSince / 24);
            const timeAgo = daysSince > 0
              ? `${daysSince} day${daysSince > 1 ? 's' : ''} ago`
              : `${hoursSince} hour${hoursSince !== 1 ? 's' : ''} ago`;

            return (
              <button
                key={round.id}
                onClick={() => handleRoundClick(round)}
                className="w-full text-left"
              >
                <div className="relative glass-standard rounded-xl overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 border-2 border-amber-200">
                  <ShineEffect />
                  <div className="flex items-center gap-4 p-4">
                    {/* Progress Indicator */}
                    <div className="w-14 h-14 rounded-xl bg-amber-50 flex flex-col items-center justify-center flex-shrink-0">
                      <span className="text-2xl font-bold text-amber-600">
                        {round.current_hole || 1}
                      </span>
                      <span className="text-[10px] font-medium text-amber-500">
                        of {round.holes_played || 18}
                      </span>
                    </div>

                    {/* Details */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 mb-1">
                        {round.course_name}
                      </h3>
                      <div className="flex items-center gap-3 text-sm text-slate-500">
                        <span className="flex items-center gap-1">
                          <IconCalendar size={14} />
                          {new Date(round.round_date).toLocaleDateString()}
                        </span>
                        <span className="text-xs">•</span>
                        <span>Last updated {timeAgo}</span>
                      </div>
                    </div>

                    {/* Arrow */}
                    <IconChevronRight size={20} className="text-slate-400" />
                  </div>
                </div>
              </button>
            );
          })}
        </div>

      </div>

      {/* Modal */}
      {selectedRound && (
        <UnfinishedRoundModal
          isOpen={!!selectedRound}
          onClose={handleCloseModal}
          round={selectedRound}
          onDeleted={handleDeleted}
        />
      )}
    </>
  );
}
