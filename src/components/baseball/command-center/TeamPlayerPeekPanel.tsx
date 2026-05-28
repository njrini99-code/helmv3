'use client';

import Link from 'next/link';
import Image from 'next/image';
import { AnimatePresence, motion } from 'framer-motion';
import { IconX, IconTrendingUp, IconTrendingDown, IconMinus } from '@/components/icons';
import type { BaseballRosterPlayer } from '@/lib/types';
import { IconButton } from '@/components/ui/button';

interface TeamPlayerPeekPanelProps {
  player: BaseballRosterPlayer | null;
  onClose: () => void;
}

function SkeletonBlock({ className }: { className?: string }) {
  return (
    <div className={`animate-pulse bg-warm-200 rounded-lg ${className ?? ''}`} />
  );
}

function Skeleton() {
  return (
    <div className="p-6 space-y-6">
      {/* hero */}
      <div className="flex items-center gap-4">
        <SkeletonBlock className="w-24 h-24 rounded-2xl flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <SkeletonBlock className="h-5 w-3/4" />
          <SkeletonBlock className="h-4 w-1/2" />
          <SkeletonBlock className="h-4 w-2/3" />
        </div>
      </div>
      {/* bio */}
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <SkeletonBlock key={i} className="h-14 rounded-xl" />
        ))}
      </div>
      {/* stats */}
      <div className="grid grid-cols-2 gap-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <SkeletonBlock key={i} className="h-16 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function formatAvg(v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toFixed(3).replace(/^0\./, '.');
}

export function TeamPlayerPeekPanel({ player, onClose }: TeamPlayerPeekPanelProps) {
  const fullName = player
    ? `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim()
    : '';

  const agg = player?.aggregates;

  const trend = agg?.recent_trend;
  const trendConfig = {
    improving: {
      label: 'Improving',
      icon: <IconTrendingUp size={16} />,
      cls: 'bg-primary-100 text-primary-700',
    },
    declining: {
      label: 'Declining',
      icon: <IconTrendingDown size={16} />,
      cls: 'bg-red-100 text-red-700',
    },
    stable: {
      label: 'Stable',
      icon: <IconMinus size={16} />,
      cls: 'bg-warm-100 text-warm-600',
    },
  } as const;

  const trendInfo = trend ? trendConfig[trend] : trendConfig.stable;

  const height =
    player?.height_feet && player.height_inches != null
      ? `${player.height_feet}'${player.height_inches}"`
      : null;

  const hometown =
    player?.city && player.state
      ? `${player.city}, ${player.state}`
      : player?.city ?? player?.state ?? null;

  // OBP from career_obp if available, else compute roughly from career_avg as proxy
  const obp = agg?.career_obp != null ? agg.career_obp : null;

  const insights = player?.insights?.slice(0, 2) ?? [];

  return (
    <AnimatePresence>
      {player && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/40 z-40"
            onClick={onClose}
          />

          {/* Panel — slide-in from right on desktop, slide-up on mobile */}
          <motion.div
            key="panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            className="fixed right-0 top-0 h-full w-full sm:w-[400px] bg-cream-100
                       shadow-2xl z-50 flex flex-col overflow-hidden"
          >
            {/* Close button */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-warm-200/80">
              <span className="text-sm font-medium text-warm-500">Player Details</span>
              <IconButton variant="default"
                onClick={onClose}
                aria-label="Close panel"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-warm-400
                           hover:text-warm-700 hover:bg-warm-100 active:bg-warm-200 transition-colors"
              >
                <IconX size={18} />
              </IconButton>
            </div>

            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto">
              {!player ? (
                <Skeleton />
              ) : (
                <div className="p-5 space-y-5">
                  {/* Hero */}
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className="relative flex-shrink-0">
                      <div className="w-24 h-24 rounded-2xl overflow-hidden bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center">
                        {player.avatar_url ? (
                          <Image
                            src={player.avatar_url}
                            alt={fullName}
                            width={96}
                            height={96}
                            className="object-cover w-full h-full"
                          />
                        ) : (
                          <span className="text-2xl font-bold text-white select-none">
                            {(player.first_name?.[0] ?? '') + (player.last_name?.[0] ?? '')}
                          </span>
                        )}
                      </div>
                      {/* Jersey badge */}
                      {player.jersey_number != null && (
                        <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1
                                         flex items-center justify-center
                                         bg-primary-600 text-white text-eyebrow font-bold rounded-full">
                          #{player.jersey_number}
                        </span>
                      )}
                    </div>

                    {/* Name + badges */}
                    <div className="min-w-0">
                      <h2 className="text-xl font-bold text-warm-900 leading-tight truncate">
                        {fullName || 'Unknown Player'}
                      </h2>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {player.primary_position && (
                          <span className="px-2 py-0.5 bg-primary-100 text-primary-700 text-xs font-medium rounded-full">
                            {player.primary_position}
                          </span>
                        )}
                        {player.secondary_position && (
                          <span className="px-2 py-0.5 bg-warm-100 text-warm-600 text-xs font-medium rounded-full">
                            {player.secondary_position}
                          </span>
                        )}
                        {player.grad_year && (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
                            &apos;{String(player.grad_year).slice(-2)}
                          </span>
                        )}
                      </div>
                      {hometown && (
                        <p className="text-xs text-warm-500 mt-1.5">{hometown}</p>
                      )}
                    </div>
                  </div>

                  {/* Bio row */}
                  {(height ?? player.weight_lbs ?? player.bats ?? player.throws ?? player.gpa) != null && (
                    <div className="grid grid-cols-3 gap-2">
                      {height && (
                        <div className="bg-cream-100/75 border border-white/20 backdrop-blur-xl rounded-xl p-2.5 text-center shadow-sm">
                          <p className="text-eyebrow text-warm-400 uppercase tracking-wide mb-0.5">Height</p>
                          <p className="text-sm font-semibold text-warm-900">{height}</p>
                        </div>
                      )}
                      {player.weight_lbs && (
                        <div className="bg-cream-100/75 border border-white/20 backdrop-blur-xl rounded-xl p-2.5 text-center shadow-sm">
                          <p className="text-eyebrow text-warm-400 uppercase tracking-wide mb-0.5">Weight</p>
                          <p className="text-sm font-semibold text-warm-900">{player.weight_lbs} lbs</p>
                        </div>
                      )}
                      {player.bats && (
                        <div className="bg-cream-100/75 border border-white/20 backdrop-blur-xl rounded-xl p-2.5 text-center shadow-sm">
                          <p className="text-eyebrow text-warm-400 uppercase tracking-wide mb-0.5">Bats/Throws</p>
                          <p className="text-sm font-semibold text-warm-900">
                            {player.bats}/{player.throws ?? '?'}
                          </p>
                        </div>
                      )}
                      {player.gpa && (
                        <div className="bg-cream-100/75 border border-white/20 backdrop-blur-xl rounded-xl p-2.5 text-center shadow-sm">
                          <p className="text-eyebrow text-warm-400 uppercase tracking-wide mb-0.5">GPA</p>
                          <p className="text-sm font-semibold text-warm-900">{player.gpa.toFixed(2)}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Career Stats */}
                  <div>
                    <h3 className="text-xs font-semibold text-warm-500 uppercase tracking-wide mb-2.5">
                      Career Stats
                    </h3>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'AVG', value: formatAvg(agg?.career_avg) },
                        { label: 'OBP', value: formatAvg(obp) },
                        { label: 'Game AVG', value: formatAvg(agg?.game_avg) },
                        { label: 'Scrimmage AVG', value: formatAvg(agg?.practice_avg) },
                        { label: 'Sessions', value: String(agg?.total_sessions ?? '—') },
                        { label: 'Total AB', value: agg?.total_at_bats != null ? String(agg.total_at_bats) : '—' },
                      ].map(({ label, value }) => (
                        <div
                          key={label}
                          className="bg-cream-100/75 border border-white/20 backdrop-blur-xl rounded-xl p-3 shadow-sm"
                        >
                          <p className="text-eyebrow text-warm-400 uppercase tracking-wide mb-0.5">{label}</p>
                          <p className="text-lg font-bold text-warm-900 tabular-nums">{value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Trend badge */}
                  <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold ${trendInfo.cls}`}>
                    {trendInfo.icon}
                    {trendInfo.label}
                  </div>

                  {/* Insights */}
                  {insights.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold text-warm-500 uppercase tracking-wide mb-2.5">
                        Insights
                      </h3>
                      <div className="space-y-2">
                        {insights.map((insight) => (
                          <div
                            key={insight.id}
                            className="bg-purple-50 border border-purple-100 rounded-xl p-3"
                          >
                            <p className="text-xs font-semibold text-purple-800 mb-0.5">
                              {insight.title}
                            </p>
                            <p className="text-xs text-purple-600 line-clamp-2">
                              {insight.description}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer CTA */}
            {player && (
              <div className="p-4 border-t border-warm-200/80 bg-cream-100/68 backdrop-blur-sm">
                <Link
                  href={`/baseball/dashboard/players/${player.id}`}
                  className="flex items-center justify-center w-full py-3 px-4
                             bg-primary-600 hover:bg-primary-700 active:bg-primary-800
                             text-white font-semibold rounded-xl transition-colors"
                >
                  View Full Profile →
                </Link>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
