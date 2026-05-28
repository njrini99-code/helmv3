'use client';

import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
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
  const prefersReducedMotion = useReducedMotion();
  const scoreToPar = round.scoreToPar;
  const isUnderPar = scoreToPar < 0;
  const isOverPar = scoreToPar > 0;

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.3, delay: index * 0.08 })}
    >
      <Link
        href={`/golf/dashboard/rounds/${round.id}`}
        className={cn(
          'flex items-center gap-4 p-4 rounded-xl transition-all duration-200',
          'surface-matte',
          'hover:bg-cream-50/92 hover:shadow-md hover:-translate-y-0.5',
          'group'
        )}
      >
        {/* Score badge */}
        <div className={cn(
          'w-14 h-14 rounded-xl flex flex-col items-center justify-center flex-shrink-0',
          isUnderPar ? 'bg-primary-50 border border-primary-100' :
          isOverPar ? 'bg-amber-50 border border-amber-100' :
          'bg-warm-50 border border-warm-100'
        )}>
          <span className={cn(
            'text-xl font-medium',
            isUnderPar ? 'text-primary-600' :
            isOverPar ? 'text-amber-600' :
            'text-warm-600'
          )}>
            {round.score}
          </span>
          <span className={cn(
            'text-xs font-medium',
            isUnderPar ? 'text-primary-500' :
            isOverPar ? 'text-amber-500' :
            'text-warm-400'
          )}>
            {formatScoreToPar(scoreToPar)}
          </span>
        </div>

        {/* Round info */}
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-warm-900 text-sm truncate group-hover:text-primary-600 transition-colors">
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
        <div className="flex items-center gap-1 text-xs font-medium text-primary-600 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-shrink-0">
          Review
          <IconChevronRight size={14} />
        </div>
      </Link>
    </motion.div>
  );
}

export function RecentRoundReviews({ rounds }: RecentRoundReviewsProps) {
  const prefersReducedMotion = useReducedMotion();
  // Empty state
  if (rounds.length === 0) {
    return (
      <Card variant="overlay" padding="md">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
            <IconGolf size={20} className="text-primary-600" />
          </div>
          <div>
            <h3 className="font-medium text-warm-900">Recent Round Reviews</h3>
            <p className="text-xs text-warm-500">AI-powered round analysis</p>
          </div>
        </div>

        <EmptyState
          variant="minimal"
          icon={<IconGolf size={20} />}
          description="No rounds to review yet. Complete a round to get AI-powered insights."
          action={{ label: 'Log Your First Round', href: '/golf/dashboard/rounds/new' }}
        />
      </Card>
    );
  }

  return (
    <Card variant="overlay" padding="md">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
            <IconGolf size={20} className="text-primary-600" />
          </div>
          <div>
            <h3 className="font-medium text-warm-900">Recent Round Reviews</h3>
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
          transition={prefersReducedMotion ? { duration: 0 } : ({ delay: 0.4 })}
          className="mt-4 pt-4 border-t border-white/20 text-center"
        >
          <p className="text-xs text-warm-500 mb-2">
            Log more rounds to unlock deeper insights
          </p>
          <Link
            href="/golf/dashboard/rounds/new"
            className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 active:bg-primary-100 rounded-lg transition-colors"
          >
            <IconGolf size={14} />
            Log a Round
          </Link>
        </motion.div>
      )}
    </Card>
  );
}
