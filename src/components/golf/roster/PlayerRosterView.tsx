'use client';

import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { IconUsers, IconMessage } from '@/components/icons';
import { YearBadge } from '@/components/golf/roster/YearBadge';
import { LargeTitleHeader } from '@/components/golf/layout/LargeTitleHeader';
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
        <LargeTitleHeader
          title="Team Roster"
          subtitle={`${players.length} ${players.length === 1 ? 'teammate' : 'teammates'} on ${teamName}`}
        />
      </AnimatedItem>

      <AnimatedItem>
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-7 md:py-10">
          {players.length === 0 ? (
            <div className="surface-matte rounded-3xl p-12 md:p-16 text-center">
              <div className="w-20 h-20 rounded-2xl bg-primary-50/70 flex items-center justify-center mx-auto mb-6">
                <IconUsers size={32} className="text-primary-700" />
              </div>
              <h3 className="text-h2 md:text-h1 font-light tracking-[-0.025em] text-warm-900 mb-3">No teammates yet</h3>
              <p className="text-[13.5px] text-warm-500 max-w-md mx-auto leading-relaxed">
                Your team roster is empty. Your coach will add players to the team.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
              {players.map((player) => (
                <div
                  key={player.id}
                  className="group surface-matte rounded-3xl transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] hover:-translate-y-[2px] hover:shadow-[0_2px_4px_rgba(58,50,40,0.04),0_24px_44px_rgba(58,50,40,0.07)]"
                >
                  <div className="p-6 md:p-7">
                    <div className="flex items-start gap-4">
                      <div className="relative flex-shrink-0">
                        {player.avatar_url ? (
                          <div className="w-[68px] h-[68px] md:w-[76px] md:h-[76px] rounded-2xl overflow-hidden">
                            <Image
                              src={player.avatar_url}
                              alt={`${player.first_name} ${player.last_name}`}
                              width={76}
                              height={76}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-[68px] h-[68px] md:w-[76px] md:h-[76px] rounded-2xl bg-warm-100/60 flex items-center justify-center">
                            <span className="text-h2 font-medium text-warm-500 tracking-[-0.005em]">
                              {(player.first_name?.[0] || '')}{(player.last_name?.[0] || '')}
                            </span>
                          </div>
                        )}
                        <div
                          className={cn(
                            'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full ring-[3px] ring-cream-50',
                            isUserOnline(player.last_seen) ? 'bg-primary-500' : 'bg-warm-300',
                          )}
                          title={isUserOnline(player.last_seen) ? 'Online' : 'Offline'}
                        />
                      </div>

                      <div className="flex-1 min-w-0 pt-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-h3 font-medium tracking-[-0.012em] text-warm-900 truncate">
                            {player.first_name} {player.last_name}
                          </h3>
                          <YearBadge year={player.graduation_year} />
                        </div>
                        <div className="mt-2.5 flex items-center gap-3">
                          <span className={cn(
                            'text-body-sm font-medium tabular-nums',
                            player.handicap !== null && player.handicap <= 0 ? 'text-primary-700' : 'text-warm-600'
                          )}>
                            {player.handicap !== null ? `${formatHandicap(player.handicap)} HCP` : '—'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="px-6 md:px-7 pb-6 md:pb-7">
                    <Link href={`/golf/dashboard/messages?player=${player.id}`} className="block">
                      <button className="w-full pill-soft justify-center py-2.5">
                        <IconMessage size={15} />
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
