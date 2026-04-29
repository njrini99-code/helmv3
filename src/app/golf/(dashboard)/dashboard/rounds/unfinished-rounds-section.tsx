'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { IconEdit } from '@/components/icons';
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
    if (selectedRound) {
      setLocalRounds(localRounds.filter(r => r.id !== selectedRound.id));
    }
    router.refresh();
  };

  if (localRounds.length === 0) {
    return null;
  }

  return (
    <>
      <div>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">Unfinished Rounds</h2>
          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-amber-100 text-amber-700">
            {localRounds.length}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {localRounds.map((round) => {
            const timeSince = new Date().getTime() - new Date(round.updated_at || round.created_at || new Date().toISOString()).getTime();
            const hoursSince = Math.floor(timeSince / (1000 * 60 * 60));
            const daysSince = Math.floor(hoursSince / 24);
            const timeAgo = daysSince > 0
              ? `${daysSince}d ago`
              : `${hoursSince}h ago`;
            const holesTarget = round.holes_played || 18;
            const isSetup = !round.current_hole || round.current_hole === 0;

            return (
              <button
                key={round.id}
                onClick={() => handleRoundClick(round)}
                className="w-full text-left"
              >
                <div className="relative surface-matte rounded-3xl overflow-clip hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 border-2 border-amber-200 bg-amber-50/30 p-4 flex flex-col">
                  <div className="relative z-10 flex flex-col">
                    {/* Top row: type + time since */}
                    <div className="flex items-center justify-between mb-3">
                      <span className="px-2 py-0.5 text-[10px] font-medium rounded-full capitalize border bg-warm-50 text-warm-600 border-warm-200">
                        {round.round_type || 'Round'}
                      </span>
                      <span className="text-xs text-warm-400">{timeAgo}</span>
                    </div>

                    {/* Center: Progress */}
                    <div className="flex items-center justify-center py-3">
                      {isSetup ? (
                        <div className="flex items-center gap-2 text-amber-600">
                          <IconEdit size={20} />
                          <span className="text-[17px] font-medium tracking-[-0.005em]">Setup</span>
                        </div>
                      ) : (
                        <div className="text-center">
                          <p className="text-[28px] md:text-[32px] font-light text-amber-700 tracking-[-0.025em] tabular-nums">
                            {round.current_hole} <span className="text-base font-medium text-amber-400">/ {holesTarget}</span>
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Bottom: course name + CTA */}
                    <div className="mt-2">
                      <p className="text-sm font-medium text-warm-700 truncate">{round.course_name}</p>
                      <p className="text-xs text-warm-400 mt-0.5">Tap to continue</p>
                    </div>
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
