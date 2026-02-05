'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ShineEffect } from '@/components/ui/shine-effect';
import Link from 'next/link';
import { getPlayerQualifiers, type PlayerQualifierInfo } from '@/app/golf/actions/golf';
import { IconTrophy, IconChevronRight, IconCalendar, IconMapPin, IconGolf } from '@/components/icons';

export default function MyQualifiersPage() {
  const router = useRouter();
  const [qualifiers, setQualifiers] = useState<PlayerQualifierInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getPlayerQualifiers().then(result => {
      setLoading(false);
      if (result.success) {
        setQualifiers(result.data);
      } else {
        setError(result.error);
      }
    });
  }, []);

  const getStatusBadge = (status: string, roundsCompleted: number, numRounds: number) => {
    if (roundsCompleted >= numRounds) {
      return { label: 'Complete', className: 'bg-green-100 text-green-700' };
    }
    switch (status) {
      case 'upcoming':
        return { label: 'Upcoming', className: 'bg-slate-100 text-slate-700' };
      case 'in_progress':
        return { label: 'In Progress', className: 'bg-amber-100 text-amber-700' };
      case 'completed':
        return { label: 'Ended', className: 'bg-slate-100 text-slate-600' };
      default:
        return { label: status, className: 'bg-slate-100 text-slate-600' };
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatToPar = (toPar: number | null) => {
    if (toPar === null) return '-';
    if (toPar === 0) return 'E';
    return toPar > 0 ? `+${toPar}` : toPar.toString();
  };

  if (loading) {
    return (
      <div className="min-h-full bg-transparent">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="animate-pulse">
            <div className="h-8 w-48 bg-slate-200 rounded mb-6" />
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-32 bg-slate-200 rounded-2xl" />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-transparent">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
            <IconTrophy size={20} className="text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">My Qualifiers</h1>
            <p className="text-slate-500 text-sm">View your qualifier progress and leaderboards</p>
          </div>
        </div>

        {error ? (
          <div className="relative glass-standard rounded-2xl overflow-hidden p-6">
            <ShineEffect />
            <p className="text-red-600">{error}</p>
          </div>
        ) : qualifiers.length === 0 ? (
          <div className="relative glass-standard rounded-2xl overflow-hidden p-12 text-center">
            <ShineEffect />
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-4">
              <IconTrophy size={32} className="text-slate-400" />
            </div>
            <h3 className="text-lg font-medium text-slate-900 mb-2">No Qualifiers Yet</h3>
            <p className="text-slate-500 text-sm max-w-md mx-auto">
              You haven&apos;t been entered into any qualifiers yet. Your coach will add you to qualifiers when they&apos;re created.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {qualifiers.map(qualifier => {
              const statusBadge = getStatusBadge(qualifier.status, qualifier.roundsCompleted, qualifier.numRounds);
              const canEnterRounds = qualifier.status !== 'completed' && qualifier.roundsCompleted < qualifier.numRounds;

              return (
                <Link
                  key={qualifier.id}
                  href={`/golf/dashboard/qualifiers/${qualifier.id}`}
                  className="block group"
                >
                  <div className="relative glass-standard rounded-2xl overflow-hidden p-6 hover:shadow-md transition-all">
                    <ShineEffect />
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-slate-900 truncate">
                            {qualifier.name}
                          </h3>
                          <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${statusBadge.className}`}>
                            {statusBadge.label}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-600 mb-4">
                          <div className="flex items-center gap-1.5">
                            <IconCalendar size={14} className="text-slate-400" />
                            <span>{formatDate(qualifier.startDate)}</span>
                            {qualifier.endDate && qualifier.endDate !== qualifier.startDate && (
                              <span> - {formatDate(qualifier.endDate)}</span>
                            )}
                          </div>
                          {qualifier.courseName && (
                            <div className="flex items-center gap-1.5">
                              <IconMapPin size={14} className="text-slate-400" />
                              <span>{qualifier.courseName}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-1.5">
                            <IconGolf size={14} className="text-slate-400" />
                            <span>{qualifier.holesPerRound} holes/round</span>
                          </div>
                        </div>

                        {/* Progress */}
                        <div className="flex items-center gap-6">
                          <div>
                            <p className="text-xs text-slate-500 uppercase font-medium mb-1">Rounds</p>
                            <p className="text-lg font-semibold text-slate-900">
                              {qualifier.roundsCompleted} / {qualifier.numRounds}
                            </p>
                          </div>
                          {qualifier.totalScore !== null && (
                            <>
                              <div>
                                <p className="text-xs text-slate-500 uppercase font-medium mb-1">Total Score</p>
                                <p className="text-lg font-semibold text-slate-900">{qualifier.totalScore}</p>
                              </div>
                              <div>
                                <p className="text-xs text-slate-500 uppercase font-medium mb-1">To Par</p>
                                <p className={`text-lg font-semibold ${
                                  (qualifier.totalToPar || 0) < 0 ? 'text-green-600' :
                                  (qualifier.totalToPar || 0) > 0 ? 'text-red-600' :
                                  'text-slate-900'
                                }`}>
                                  {formatToPar(qualifier.totalToPar)}
                                </p>
                              </div>
                            </>
                          )}
                          {qualifier.completedRoundNumbers.length > 0 && (
                            <div>
                              <p className="text-xs text-slate-500 uppercase font-medium mb-1">Completed</p>
                              <p className="text-sm text-slate-700">
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
                              router.push('/golf/dashboard/rounds/new');
                            }}
                            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-green-600 text-white hover:bg-green-700 transition-colors"
                          >
                            Enter Round
                          </button>
                        )}
                        <IconChevronRight size={20} className="text-slate-400 group-hover:text-slate-600 transition-colors" />
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}

        {/* Help Text */}
        <div className="mt-8 p-4 bg-slate-100 rounded-xl">
          <h4 className="font-medium text-slate-700 mb-2">How Qualifiers Work</h4>
          <ul className="text-sm text-slate-600 space-y-1">
            <li>• When entering a new round, select &ldquo;Qualifier&rdquo; as the round type</li>
            <li>• Choose which qualifier and round number you&apos;re playing</li>
            <li>• Your scores automatically appear on the leaderboard</li>
            <li>• Click any qualifier above to view the full leaderboard</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
