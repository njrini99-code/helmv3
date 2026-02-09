'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { GlassCard } from '@/components/ui/glass-card';
import {
  IconGolf,
  IconCalendar,
  IconChevronRight,
  IconSparkles,
} from '@/components/icons';

interface RecentRound {
  id: string;
  courseName: string;
  date: string;
  score: number;
  scoreToPar: number;
  hasReview: boolean;
}

interface RecentRoundReviewsProps {
  rounds: RecentRound[];
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function formatScoreToPar(score: number): string {
  if (score === 0) return 'E';
  return score > 0 ? `+${score}` : `${score}`;
}

function RoundReviewCard({
  round,
  index,
}: {
  round: RecentRound;
  index: number;
}) {
  const scoreToPar = round.scoreToPar;
  const isUnderPar = scoreToPar < 0;
  const isOverPar = scoreToPar > 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.08 }}
    >
      <Link
        href={`/golf/dashboard/rounds/${round.id}`}
        className={cn(
          'flex items-center gap-4 p-4 rounded-xl transition-all duration-200',
          'bg-white/60 backdrop-blur-sm border border-white/30',
          'hover:bg-white/90 hover:shadow-md hover:-translate-y-0.5',
          'group'
        )}
      >
        {/* Score badge */}
        <div className={cn(
          'w-14 h-14 rounded-xl flex flex-col items-center justify-center flex-shrink-0',
          isUnderPar ? 'bg-green-50 border border-green-100' :
          isOverPar ? 'bg-amber-50 border border-amber-100' :
          'bg-warm-50 border border-warm-100'
        )}>
          <span className={cn(
            'text-xl font-bold',
            isUnderPar ? 'text-green-600' :
            isOverPar ? 'text-amber-600' :
            'text-warm-600'
          )}>
            {round.score}
          </span>
          <span className={cn(
            'text-xs font-medium',
            isUnderPar ? 'text-green-500' :
            isOverPar ? 'text-amber-500' :
            'text-warm-400'
          )}>
            {formatScoreToPar(scoreToPar)}
          </span>
        </div>

        {/* Round info */}
        <div className="flex-1 min-w-0">
          <h4 className="font-semibold text-warm-900 text-sm truncate group-hover:text-primary-600 transition-colors">
            {round.courseName}
          </h4>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-xs text-warm-500">
              <IconCalendar size={12} className="text-warm-400" />
              {formatDate(round.date)}
            </span>
            {round.hasReview && (
              <span className="flex items-center gap-1 text-xs font-medium text-primary-600">
                <IconSparkles size={12} />
                AI Review
              </span>
            )}
          </div>
        </div>

        {/* Action hint */}
        <div className="flex items-center gap-1 text-xs font-medium text-primary-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
          Review
          <IconChevronRight size={14} />
        </div>
      </Link>
    </motion.div>
  );
}

export function RecentRoundReviews({ rounds }: RecentRoundReviewsProps) {
  // Empty state
  if (rounds.length === 0) {
    return (
      <GlassCard>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
            <IconGolf size={20} className="text-primary-600" />
          </div>
          <div>
            <h3 className="font-semibold text-warm-900">Recent Round Reviews</h3>
            <p className="text-xs text-warm-500">AI-powered round analysis</p>
          </div>
        </div>

        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mx-auto mb-3">
            <IconGolf size={24} className="text-warm-400" />
          </div>
          <p className="text-sm text-warm-600 mb-1">No rounds to review yet</p>
          <p className="text-xs text-warm-400 mb-4">
            Complete a round to get AI-powered insights
          </p>
          <Link
            href="/golf/dashboard/rounds/new"
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
          >
            Log Your First Round
          </Link>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
            <IconGolf size={20} className="text-primary-600" />
          </div>
          <div>
            <h3 className="font-semibold text-warm-900">Recent Round Reviews</h3>
            <p className="text-xs text-warm-500">
              Click any round for AI-powered analysis
            </p>
          </div>
        </div>
        <Link
          href="/golf/dashboard/rounds"
          className="text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors flex items-center gap-1"
        >
          All rounds
          <IconChevronRight size={14} />
        </Link>
      </div>

      {/* Rounds list */}
      <div className="space-y-2">
        {rounds.map((round, index) => (
          <RoundReviewCard
            key={round.id}
            round={round}
            index={index}
          />
        ))}
      </div>

      {/* CTA for more rounds */}
      {rounds.length > 0 && rounds.length < 3 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="mt-4 pt-4 border-t border-white/20 text-center"
        >
          <p className="text-xs text-warm-500 mb-2">
            Log more rounds to unlock deeper insights
          </p>
          <Link
            href="/golf/dashboard/rounds/new"
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 rounded-lg transition-colors"
          >
            <IconGolf size={14} />
            Log a Round
          </Link>
        </motion.div>
      )}
    </GlassCard>
  );
}
