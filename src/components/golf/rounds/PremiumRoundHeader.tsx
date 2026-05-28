'use client';

import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { Avatar } from '@/components/ui/avatar';
import { Card } from '@/components/ui/card';
import { useFormatDate, useAppearancePreferences } from '@/hooks/golf/use-appearance-preferences';

interface PremiumRoundHeaderProps {
  playerName: string;
  playerAvatarUrl?: string | null;
  courseName: string | null;
  courseCity: string | null;
  courseState: string | null;
  roundDate: string;
  roundType: string | null;
  totalScore: number | null;
  scoreToPar: number | null;
  totalPutts: number | null;
  totalFairwaysHit: number | null;
  totalFairways: number | null;
  totalGir: number | null;
  totalGirPossible: number | null;
  frontNine: number | null;
  backNine: number | null;
  courseRating: number | null;
  courseSlope: number | null;
  teesPlayed: string | null;
  notes: string | null;
}

const statReveal = {
  hidden: { opacity: 0, y: 10 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: 0.35 + i * 0.08, duration: 0.45, ease: [0.16, 1, 0.3, 1] as const },
  }),
};

export function PremiumRoundHeader({
  playerName,
  playerAvatarUrl,
  courseName,
  courseCity,
  courseState,
  roundDate,
  roundType,
  totalScore,
  scoreToPar,
  totalPutts,
  totalFairwaysHit,
  totalFairways,
  totalGir,
  totalGirPossible,
  frontNine,
  backNine,
  courseRating,
  courseSlope,
  teesPlayed,
  notes,
}: PremiumRoundHeaderProps) {
  const { scoreDisplay: scoreDisplayMode } = useAppearancePreferences();

  const toParLabel = scoreToPar === null || scoreToPar === undefined
    ? '--'
    : scoreToPar === 0 ? 'E' : scoreToPar > 0 ? `+${scoreToPar}` : `${scoreToPar}`;

  // In 'raw' mode, suppress the to-par sub-label (raw score already shown prominently)
  const scoreDisplay = scoreDisplayMode === 'to_par' ? toParLabel : null;

  const scoreColor = scoreToPar === null || scoreToPar === undefined
    ? 'text-warm-600'
    : scoreToPar < 0 ? 'text-primary-600' : scoreToPar > 0 ? 'text-red-600' : 'text-warm-600';

  const fmtDate = useFormatDate();
  const formattedDate = fmtDate(roundDate);

  const stats = [
    {
      label: 'Putts',
      value: totalPutts ?? '--',
      sub: null,
    },
    {
      label: 'Fairways',
      value: totalFairwaysHit !== null && totalFairways ? `${totalFairwaysHit}/${totalFairways}` : '--',
      sub: totalFairwaysHit !== null && totalFairways && totalFairways > 0
        ? `${Math.round((totalFairwaysHit / totalFairways) * 100)}%`
        : null,
    },
    {
      label: 'Greens',
      value: totalGir !== null && totalGirPossible ? `${totalGir}/${totalGirPossible}` : '--',
      sub: totalGir !== null && totalGirPossible && totalGirPossible > 0
        ? `${Math.round((totalGir / totalGirPossible) * 100)}%`
        : null,
    },
    {
      label: 'Front / Back',
      value: `${frontNine ?? '--'} / ${backNine ?? '--'}`,
      sub: null,
    },
  ];

  return (
    <div className="space-y-4">
      {/* Header Card */}
      <Card variant="glass" padding="none" className="overflow-hidden shadow-sm">
        <div className="p-6 sm:p-8">
          {/* Player info + score */}
          <div className="flex items-start justify-between gap-4">
            <motion.div
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="flex items-center gap-4"
            >
              <Avatar
                src={playerAvatarUrl}
                name={playerName}
                size="xl"
              />
              <div>
                <h2 className="text-h3 font-medium text-warm-900 tracking-[-0.015em]">{playerName}</h2>
                <p className="text-sm text-warm-500 mt-0.5">{formattedDate}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="text-sm font-medium text-warm-700">{courseName}</span>
                  {courseCity && courseState && (
                    <span className="text-xs text-warm-400">{courseCity}, {courseState}</span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3 mt-2">
                  {roundType && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-warm-100 text-warm-600 capitalize border border-warm-200/50">
                      {roundType.replace(/_/g, ' ')}
                    </span>
                  )}
                  {courseRating && (
                    <span className="text-xs text-warm-400">Rating: {courseRating}</span>
                  )}
                  {courseSlope && (
                    <span className="text-xs text-warm-400">Slope: {courseSlope}</span>
                  )}
                  {teesPlayed && (
                    <span className="text-xs text-warm-400">Tees: {teesPlayed}</span>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Score display */}
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.55, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
              className="text-right flex-shrink-0"
            >
              <div className="text-display md:text-display font-light tracking-[-0.025em] text-warm-900 tabular-nums">
                {totalScore ?? '--'}
              </div>
              {scoreDisplay !== null && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35, duration: 0.35 }}
                  className={cn('text-xl font-medium', scoreColor)}
                >
                  {scoreDisplay}
                </motion.div>
              )}
              {frontNine !== null && backNine !== null && (
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.45, duration: 0.3 }}
                  className="text-xs text-warm-400 mt-1 tabular-nums"
                >
                  {frontNine} / {backNine}
                </motion.p>
              )}
            </motion.div>
          </div>

          {/* Stats row */}
          <div className="mt-6 pt-6 border-t border-warm-200/60 grid grid-cols-2 sm:grid-cols-4 gap-4">
            {stats.map((stat, i) => (
              <motion.div
                key={stat.label}
                custom={i}
                variants={statReveal}
                initial="hidden"
                animate="visible"
                className="rounded-xl bg-warm-50/50 p-3"
              >
                <p className="text-xs text-warm-400 font-medium">{stat.label}</p>
                <p className="text-h3 font-medium text-warm-900 tracking-[-0.015em] tabular-nums mt-0.5">{stat.value}</p>
                {stat.sub && (
                  <p className="text-xs text-warm-400 mt-0.5">{stat.sub}</p>
                )}
              </motion.div>
            ))}
          </div>
        </div>
      </Card>

      {/* Notes */}
      {notes && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <Card variant="glass">
            <div className="p-5">
              <p className="text-sm font-medium text-warm-700 mb-2">Round Notes</p>
              <p className="text-sm text-warm-600 leading-relaxed">{notes}</p>
            </div>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
