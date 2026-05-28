'use client';

/**
 * EvidenceSourcesView - Displays evidence source rounds for a CoachHelm insight
 *
 * Features:
 * - Fetches source rounds from server
 * - Mini round cards showing: course, date, score, relevant stats
 * - Links to full round detail page
 * - Loading and empty states
 */

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import {
  IconCalendar,
  IconFlag,
  IconChevronRight,
  IconTrendingUp,
  IconTrendingDown,
} from '@/components/icons';
import { getInsightEvidenceSources, type EvidenceRound } from '@/app/golf/actions/insight-evidence';
import { Shimmer } from '@/components/ui/shimmer';
import type { ComposedInsight, MinedPattern } from '@/lib/coachhelm/v2/types';

interface EvidenceSourcesViewProps {
  playerId: string;
  insight: ComposedInsight;
  pattern?: MinedPattern;
}

export function EvidenceSourcesView({
  playerId,
  insight,
  pattern,
}: EvidenceSourcesViewProps) {
  const [rounds, setRounds] = useState<EvidenceRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchEvidence() {
      setLoading(true);
      setError(null);

      try {
        const result = await getInsightEvidenceSources(playerId, {
          patternId: pattern?.id,
          patternConditions: pattern?.conditions,
          insightTone: insight.tone,
          confidence: insight.confidence,
        });

        if (result.success && result.rounds) {
          setRounds(result.rounds);
        } else {
          setError(result.error || 'Failed to load evidence');
        }
      } catch (err) {
        console.error('Error fetching evidence:', err);
        setError('Unable to load evidence sources');
      } finally {
        setLoading(false);
      }
    }

    fetchEvidence();
  }, [playerId, pattern, insight]);

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="text-sm font-medium text-warm-900 mb-4">
          Loading evidence sources...
        </div>
        {[1, 2, 3].map((i) => (
          <Shimmer
            key={i}
            staggerIndex={i}
            className="rounded-xl h-24"
          />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4">
          <IconFlag size={24} className="text-red-400" />
        </div>
        <h4 className="text-sm font-medium text-warm-600 mb-1">Error Loading Evidence</h4>
        <p className="text-xs text-warm-400 max-w-[250px]">{error}</p>
      </div>
    );
  }

  if (rounds.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="w-12 h-12 rounded-full bg-warm-100 flex items-center justify-center mb-4">
          <IconFlag size={24} className="text-warm-300" />
        </div>
        <h4 className="text-sm font-medium text-warm-600 mb-1">No Evidence Available</h4>
        <p className="text-xs text-warm-400 max-w-[250px]">
          No recent rounds match the criteria for this insight.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-warm-900">
          Evidence Sources ({rounds.length} rounds)
        </h3>
        <span className="text-xs text-warm-400">
          Rounds supporting this analysis
        </span>
      </div>

      <div className="space-y-3">
        {rounds.map((round, index) => (
          <EvidenceRoundCard key={round.id} round={round} index={index} />
        ))}
      </div>

      <div className="pt-4 border-t border-warm-100">
        <p className="text-xs text-warm-400 text-center">
          These rounds were identified as relevant to the insight based on{' '}
          {pattern ? 'pattern conditions' : 'performance trends'}.
        </p>
      </div>
    </div>
  );
}

interface EvidenceRoundCardProps {
  round: EvidenceRound;
  index: number;
}

function EvidenceRoundCard({ round, index }: EvidenceRoundCardProps) {
  const formattedDate = new Date(round.round_date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const scoreToPar = round.score_to_par ?? 0;
  const totalScore = round.total_score ?? 0;

  const scoreDisplay =
    scoreToPar === 0
      ? 'E'
      : scoreToPar > 0
      ? `+${scoreToPar}`
      : scoreToPar.toString();

  const scoreColor =
    scoreToPar <= 0
      ? 'text-primary-600 bg-primary-50'
      : scoreToPar <= 5
      ? 'text-amber-600 bg-amber-50'
      : 'text-red-600 bg-red-50';

  // Check for tournament based on round_type
  const isTournament = round.round_type === 'tournament';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Link
        href={`/golf/dashboard/rounds/${round.id}`}
        className="block bg-white border border-warm-200 rounded-xl p-4 hover:border-primary-200 hover:shadow-sm transition-all group"
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {/* Course name and tournament badge */}
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-sm font-medium text-warm-900">
                {round.course_name || 'Unknown Course'}
              </h4>
              {isTournament && (
                <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full font-medium">
                  Tournament
                </span>
              )}
            </div>

            {/* Date */}
            <div className="flex items-center gap-2 text-xs text-warm-500 mb-3">
              <IconCalendar size={12} />
              <span>{formattedDate}</span>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {round.total_putts !== null && (
                <StatMini label="Putts" value={round.total_putts} />
              )}
              {round.total_gir !== null && (
                <StatMini
                  label="GIR"
                  value={`${Math.round((round.total_gir / 18) * 100)}%`}
                />
              )}
              {round.total_fairways_hit !== null && (
                <StatMini
                  label="FIR"
                  value={`${Math.round((round.total_fairways_hit / 14) * 100)}%`}
                />
              )}
            </div>
          </div>

          {/* Score display */}
          <div className="flex flex-col items-end gap-2">
            <div className="text-right">
              <p className="text-h1 font-light text-warm-900 tabular-nums tracking-[-0.025em]">
                {totalScore}
              </p>
              <span
                className={cn(
                  'inline-block text-xs font-medium px-2 py-0.5 rounded-full',
                  scoreColor
                )}
              >
                {scoreDisplay}
              </span>
            </div>
            <IconChevronRight
              size={16}
              className="text-warm-300 group-hover:text-primary-500 transition-colors"
            />
          </div>
        </div>

        {/* Performance indicator */}
        <div className="mt-3 pt-3 border-t border-warm-100 flex items-center gap-2">
          {scoreToPar <= 0 ? (
            <>
              <IconTrendingUp size={14} className="text-primary-500" />
              <span className="text-xs text-primary-600 font-medium">
                Strong performance
              </span>
            </>
          ) : scoreToPar <= 5 ? (
            <>
              <span className="w-3 h-3 rounded-full bg-amber-200" />
              <span className="text-xs text-amber-600 font-medium">
                Average performance
              </span>
            </>
          ) : (
            <>
              <IconTrendingDown size={14} className="text-red-500" />
              <span className="text-xs text-red-600 font-medium">
                Below average
              </span>
            </>
          )}
        </div>
      </Link>
    </motion.div>
  );
}

function StatMini({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs text-warm-400">{label}</p>
      <p className="text-sm font-medium text-warm-700 tabular-nums">{value}</p>
    </div>
  );
}
