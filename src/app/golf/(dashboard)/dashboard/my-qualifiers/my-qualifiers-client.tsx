'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { PlayerQualifierInfo } from '@/app/golf/actions/golf';
import { IconTrophy, IconChevronRight, IconCalendar, IconMapPin, IconGolf } from '@/components/icons';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';

interface MyQualifiersClientProps {
  qualifiers: PlayerQualifierInfo[];
  error?: string;
}

export function MyQualifiersClient({ qualifiers, error }: MyQualifiersClientProps) {
  const router = useRouter();

  const getStatusBadge = (status: string, roundsCompleted: number, numRounds: number) => {
    if (roundsCompleted >= numRounds) {
      return { label: 'Complete', className: 'bg-primary-100 text-primary-700' };
    }
    switch (status) {
      case 'upcoming':
        return { label: 'Upcoming', className: 'bg-warm-100 text-warm-700' };
      case 'in_progress':
        return { label: 'In Progress', className: 'bg-amber-100 text-amber-700' };
      case 'completed':
        return { label: 'Ended', className: 'bg-warm-100 text-warm-600' };
      default:
        return { label: status, className: 'bg-warm-100 text-warm-600' };
    }
  };

  const formatDate = (dateStr: string) => {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const parts = dateStr.split('T')[0]?.split('-');
    if (parts && parts.length === 3) {
      const month = months[parseInt(parts[1]!, 10) - 1] ?? parts[1];
      return `${month} ${parseInt(parts[2]!, 10)}, ${parts[0]}`;
    }
    return dateStr;
  };

  const formatToPar = (toPar: number | null) => {
    if (toPar === null) return '-';
    if (toPar === 0) return 'E';
    return toPar > 0 ? `+${toPar}` : toPar.toString();
  };

  return (
    <AnimatedPage className="min-h-full bg-transparent">
      {/* Header */}
      <AnimatedItem>
        <LargeTitleHeader
          title="My Qualifiers"
          subtitle="View your qualifier progress and leaderboards"
        />
      </AnimatedItem>

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 md:py-8">

        <AnimatedItem>
        {error ? (
          <div className="relative surface-matte rounded-3xl overflow-clip p-6">
            <p className="text-red-600">{error}</p>
          </div>
        ) : qualifiers.length === 0 ? (
          <div className="relative surface-matte rounded-3xl overflow-clip p-8 md:p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-4">
              <IconTrophy size={32} className="text-warm-400" />
            </div>
            <h3 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em] mb-2">No Qualifiers Yet</h3>
            <p className="text-warm-500 text-sm max-w-md mx-auto">
              You haven&apos;t been entered into any qualifiers yet. Your coach will add you to qualifiers when they&apos;re created.
            </p>
          </div>
        ) : (
          <div className="space-y-4 mobile-stagger">
            {qualifiers.map(qualifier => {
              const statusBadge = getStatusBadge(qualifier.status, qualifier.roundsCompleted, qualifier.numRounds);
              const canEnterRounds = qualifier.status !== 'completed' && qualifier.roundsCompleted < qualifier.numRounds;

              return (
                <Link
                  key={qualifier.id}
                  href={`/golf/dashboard/qualifiers/${qualifier.id}`}
                  className="block group"
                >
                  <div className="relative surface-matte rounded-3xl overflow-clip p-6 hover:shadow-md transition-all">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-[17px] font-medium text-warm-900 tracking-[-0.012em] truncate">
                            {qualifier.name}
                          </h3>
                          <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${statusBadge.className}`}>
                            {statusBadge.label}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-sm text-warm-600 mb-4">
                          <div className="flex items-center gap-1.5">
                            <IconCalendar size={14} className="text-warm-400" />
                            <span>{formatDate(qualifier.startDate)}</span>
                            {qualifier.endDate && qualifier.endDate !== qualifier.startDate && (
                              <span> - {formatDate(qualifier.endDate)}</span>
                            )}
                          </div>
                          {qualifier.courseName && (
                            <div className="flex items-center gap-1.5">
                              <IconMapPin size={14} className="text-warm-400" />
                              <span>{qualifier.courseName}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <IconGolf size={14} className="text-warm-400" />
                            <span>{qualifier.holesPerRound} holes/round</span>
                          </div>
                        </div>

                        {/* Progress */}
                        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                          <div>
                            <p className="text-xs text-warm-500 uppercase font-medium mb-1">Rounds</p>
                            <p className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">
                              {qualifier.roundsCompleted} / {qualifier.numRounds}
                            </p>
                          </div>
                          {qualifier.totalScore !== null && (
                            <>
                              <div>
                                <p className="text-xs text-warm-500 uppercase font-medium mb-1">Total Score</p>
                                <p className="text-[17px] font-medium text-warm-900 tracking-[-0.012em]">{qualifier.totalScore}</p>
                              </div>
                              <div>
                                <p className="text-xs text-warm-500 uppercase font-medium mb-1">To Par</p>
                                <p className={`text-lg font-medium ${
                                  (qualifier.totalToPar ?? 0) < 0 ? 'text-primary-600' :
                                  (qualifier.totalToPar ?? 0) > 0 ? 'text-amber-600' :
                                  'text-warm-900'
                                }`}>
                                  {formatToPar(qualifier.totalToPar)}
                                </p>
                              </div>
                            </>
                          )}
                          {qualifier.completedRoundNumbers.length > 0 && (
                            <div>
                              <p className="text-xs text-warm-500 uppercase font-medium mb-1">Completed</p>
                              <p className="text-sm text-warm-700">
                                {qualifier.completedRoundNumbers.map(n => `R${n}`).join(', ')}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {canEnterRounds && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              router.push(`/golf/dashboard/rounds/new?qualifier=${qualifier.id}`);
                            }}
                            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
                          >
                            Enter Round
                          </button>
                        )}
                        <IconChevronRight size={20} className="text-warm-400 group-hover:text-warm-600 transition-colors" />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
        </AnimatedItem>

        {/* Help Text */}
        <AnimatedItem className="mt-8 p-4 bg-warm-100 rounded-xl">
          <h4 className="font-medium text-warm-700 mb-2">How Qualifiers Work</h4>
          <ul className="text-sm text-warm-600 space-y-1">
            <li>• When entering a new round, select &ldquo;Qualifier&rdquo; as the round type</li>
            <li>• Choose which qualifier and round number you&apos;re playing</li>
            <li>• Your scores automatically appear on the leaderboard</li>
            <li>• Click any qualifier above to view the full leaderboard</li>
          </ul>
        </AnimatedItem>
      </div>
    </AnimatedPage>
  );
}
