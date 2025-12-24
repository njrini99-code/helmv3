'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Avatar } from '@/components/ui/avatar';
import { IconMessage, IconChart, IconUser, IconChevronRight } from '@/components/icons';

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
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<'top' | 'bottom'>('bottom');
  const triggerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();

  const name = `${player.first_name || ''} ${player.last_name || ''}`.trim();

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      // Calculate position
      if (triggerRef.current) {
        const rect = triggerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        setPosition(spaceBelow < 200 ? 'top' : 'bottom');
      }
      setIsOpen(true);
    }, 300);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsOpen(false);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return (
    <div 
      ref={triggerRef}
      className={cn('relative inline-block', className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}

      {/* Hover Card */}
      <div className={cn(
        'absolute left-0 z-50 w-64 opacity-0 scale-95 pointer-events-none transition-all duration-200',
        isOpen && 'opacity-100 scale-100 pointer-events-auto',
        position === 'bottom' ? 'top-full mt-2' : 'bottom-full mb-2'
      )}>
        <div className="bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
          {/* Header */}
          <div className="p-4 bg-slate-50 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <Avatar name={name} src={player.avatar_url} size="lg" />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-900 truncate">{name}</p>
                <p className="text-sm text-slate-500 capitalize">
                  {player.year?.replace('_', ' ') || 'Player'}
                </p>
              </div>
            </div>
          </div>

          {/* Stats */}
          <div className="p-3 grid grid-cols-2 gap-2 text-center border-b border-slate-100">
            <div className="px-2 py-1">
              <p className="text-xs text-slate-500">Handicap</p>
              <p className="font-semibold text-slate-900">
                {player.handicap !== null && player.handicap !== undefined 
                  ? (player.handicap > 0 ? '+' : '') + player.handicap.toFixed(1)
                  : '--'}
              </p>
            </div>
            <div className="px-2 py-1">
              <p className="text-xs text-slate-500">Avg Score</p>
              <p className="font-semibold text-slate-900">
                {player.scoring_average?.toFixed(1) || '--'}
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="p-2">
            <Link href={`/golf/dashboard/stats?player=${player.id}`}>
              <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg transition-colors">
                <IconChart size={16} className="text-slate-400" />
                <span>View Stats</span>
                <IconChevronRight size={14} className="ml-auto text-slate-400" />
              </button>
            </Link>
            <Link href={`/golf/dashboard/messages?player=${player.id}`}>
              <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg transition-colors">
                <IconMessage size={16} className="text-slate-400" />
                <span>Send Message</span>
                <IconChevronRight size={14} className="ml-auto text-slate-400" />
              </button>
            </Link>
            <Link href={`/golf/dashboard/roster/${player.id}`}>
              <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 rounded-lg transition-colors">
                <IconUser size={16} className="text-slate-400" />
                <span>View Profile</span>
                <IconChevronRight size={14} className="ml-auto text-slate-400" />
              </button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
