'use client';

import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { IconUsers, IconMessage } from '@/components/icons';
import { YearBadge } from '@/components/golf/roster/YearBadge';
import { MobileNavHeader } from '@/components/golf/layout/MobileNavHeader';
import { AnimatedPage, AnimatedItem } from '@/components/golf/layout/AnimatedPage';

interface PlayerRosterPlayer {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  graduation_year: number | null;
  handicap: number | null;
  last_seen: string | null;
}

interface PlayerRosterViewProps {
  players: PlayerRosterPlayer[];
  teamName: string;
}

function isUserOnline(lastSeen: string | null): boolean {
  if (!lastSeen) return false;
  const diffMinutes = (Date.now() - new Date(lastSeen).getTime()) / (1000 * 60);
  return diffMinutes < 5;
}

function formatHandicap(handicap: number | null): string {
  if (handicap === null) return '—';
  if (handicap > 0) return `+${handicap.toFixed(1)}`;
  return handicap.toFixed(1);
}

export function PlayerRosterView({ players, teamName }: PlayerRosterViewProps) {
  return (
    <AnimatedPage className="min-h-full bg-transparent">
      <AnimatedItem>
        <MobileNavHeader
          title="Team Roster"
          subtitle={`${players.length} ${players.length === 1 ? 'teammate' : 'teammates'} on ${teamName}`}
        />
      </AnimatedItem>

      <AnimatedItem>
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-6 md:py-8">
          {players.length === 0 ? (
            <div className="bg-white rounded-2xl border border-warm-200 p-12 md:p-16 text-center shadow-sm">
              <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center mx-auto mb-6 shadow-sm">
                <IconUsers size={36} className="text-primary-500" />
              </div>
              <h3 className="text-2xl font-semibold text-warm-900 mb-3">No Teammates Yet</h3>
              <p className="text-warm-500 max-w-md mx-auto leading-relaxed">
                Your team roster is empty. Your coach will add players to the team.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-5">
              {players.map((player) => (
                <div
                  key={player.id}
                  className="group bg-white rounded-2xl border border-warm-200 shadow-sm hover:shadow-md hover:border-warm-300 hover:-translate-y-0.5 transition-all duration-200"
                >
                  <div className="p-5 md:p-6">
                    <div className="flex items-start gap-4">
                      {/* Avatar */}
                      <div className="relative flex-shrink-0">
                        {player.avatar_url ? (
                          <div className="w-[72px] h-[72px] md:w-20 md:h-20 rounded-2xl overflow-hidden ring-1 ring-warm-200 shadow-sm">
                            <Image
                              src={player.avatar_url}
                              alt={`${player.first_name} ${player.last_name}`}
                              width={80}
                              height={80}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-[72px] h-[72px] md:w-20 md:h-20 rounded-2xl bg-gradient-to-br from-warm-100 to-warm-200 flex items-center justify-center ring-1 ring-warm-200">
                            <span className="text-2xl font-semibold text-warm-500">
                              {(player.first_name?.[0] || '')}{(player.last_name?.[0] || '')}
                            </span>
                          </div>
                        )}
                        {/* Online status */}
                        <div className={cn(
                          'absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-[3px] border-white shadow-sm',
                          isUserOnline(player.last_seen) ? 'bg-primary-500' : 'bg-warm-300',
                        )} title={isUserOnline(player.last_seen) ? 'Online' : 'Offline'} />
                      </div>

                      {/* Player Info */}
                      <div className="flex-1 min-w-0 pt-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-lg md:text-xl font-semibold text-warm-900 truncate">
                            {player.first_name} {player.last_name}
                          </h3>
                          <YearBadge year={player.graduation_year} />
                        </div>
                        <div className="mt-2 flex items-center gap-3">
                          <span className={cn(
                            'text-sm font-medium tabular-nums',
                            player.handicap !== null && player.handicap <= 0 ? 'text-primary-600' : 'text-warm-600'
                          )}>
                            {player.handicap !== null ? `${formatHandicap(player.handicap)} HCP` : '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Message Button */}
                  <div className="px-5 md:px-6 pb-5 md:pb-6">
                    <Link href={`/golf/dashboard/messages?player=${player.id}`} className="block">
                      <button className="w-full px-4 py-3 min-h-[48px] bg-white border border-warm-200 text-warm-700 text-sm font-medium rounded-xl hover:bg-warm-50 hover:border-warm-300 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                        <IconMessage size={16} />
                        Message
                      </button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </AnimatedItem>
    </AnimatedPage>
  );
}
