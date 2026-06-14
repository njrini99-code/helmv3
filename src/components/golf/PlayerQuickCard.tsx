'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover';
import { IconMessage, IconChart, IconUser, IconChevronRight } from '@/components/icons';
import { Button } from '@/components/ui/button';

interface PlayerQuickCardProps {
  player: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url?: string | null;
    year?: string | null;
    handicap?: number | null;
    scoring_average?: number | null;
  };
  children: React.ReactNode;
  className?: string;
}

export function PlayerQuickCard({ player, children, className }: PlayerQuickCardProps) {
  const name = `${player.first_name || ''} ${player.last_name || ''}`.trim();

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost"
          type="button"
          className={cn('inline-block text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50', className)}
          aria-label={`Open quick card for ${name || 'player'}`}
        >
          {children}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={8}
        className="w-64 p-0 overflow-hidden"
      >
        <div className="relative surface-matte rounded-3xl overflow-clip">
          {/* Shine effect */}
          <div
            className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
            style={{
              background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
            }}
          />

          {/* Header */}
          <div className="p-4 bg-warm-50 border-b border-warm-100">
            <div className="flex items-center gap-3">
              <Avatar name={name} src={player.avatar_url} size="lg" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-warm-900 truncate">{name}</p>
                <p className="text-sm text-warm-500 capitalize">
                  {player.year?.replace('_', ' ') || 'Player'}
                </p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="p-3 grid grid-cols-2 gap-2 text-center border-b border-warm-100">
            <div className="px-2 py-1">
              <p className="text-xs text-warm-500">Handicap</p>
              <p className="font-medium text-warm-900">
                {player.handicap !== null && player.handicap !== undefined
                  ? (player.handicap < 0 ? '+' : '') + Math.abs(player.handicap).toFixed(1)
                  : '--'}
              </p>
            </div>
            <div className="px-2 py-1">
              <p className="text-xs text-warm-500">Avg Score</p>
              <p className="font-medium text-warm-900">
                {player.scoring_average?.toFixed(1) || '--'}
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="p-2">
            <Link href={`/golf/dashboard/stats?player=${player.id}`}>
              <Button variant="ghost" className="w-full flex items-center gap-2 px-3 py-3 min-h-[44px] text-sm text-warm-700 hover:bg-warm-50 active:bg-warm-100 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50">
                <IconChart size={16} className="text-warm-400" />
                <span>View Stats</span>
                <IconChevronRight size={14} className="ml-auto text-warm-400" />
              </Button>
            </Link>
            <Link href={`/golf/dashboard/messages?player=${player.id}`}>
              <Button variant="ghost" className="w-full flex items-center gap-2 px-3 py-3 min-h-[44px] text-sm text-warm-700 hover:bg-warm-50 active:bg-warm-100 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50">
                <IconMessage size={16} className="text-warm-400" />
                <span>Send Message</span>
                <IconChevronRight size={14} className="ml-auto text-warm-400" />
              </Button>
            </Link>
            <Link href={`/golf/dashboard/players/${player.id}`}>
              <Button variant="ghost" className="w-full flex items-center gap-2 px-3 py-3 min-h-[44px] text-sm text-warm-700 hover:bg-warm-50 active:bg-warm-100 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-cream-50">
                <IconUser size={16} className="text-warm-400" />
                <span>View Profile</span>
                <IconChevronRight size={14} className="ml-auto text-warm-400" />
              </Button>
            </Link>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
