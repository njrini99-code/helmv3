'use client';

import { useState } from 'react';
import Image from 'next/image';
import { cn } from '@/lib/utils';
import { Users, Search } from 'lucide-react';

export interface AttendanceRecord {
  id: string;
  player_id: string;
  status: 'going' | 'maybe' | 'not_going' | 'pending';
  check_in_at: string | null;
  responded_at: string | null;
  player: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
  } | null;
}

interface RSVPStatusSectionProps {
  records: AttendanceRecord[];
  className?: string;
  compact?: boolean;
}

type RSVPFilter = 'all' | 'going' | 'maybe' | 'not_going' | 'pending';

const STATUS_CONFIG = {
  going: { label: 'Going', color: 'bg-emerald-500', textColor: 'text-emerald-700', bgColor: 'bg-emerald-50' },
  maybe: { label: 'Maybe', color: 'bg-amber-500', textColor: 'text-amber-700', bgColor: 'bg-amber-50' },
  not_going: { label: "Can't Go", color: 'bg-rose-400', textColor: 'text-rose-700', bgColor: 'bg-rose-50' },
  pending: { label: 'No Response', color: 'bg-slate-300', textColor: 'text-slate-600', bgColor: 'bg-slate-50' },
};

export function RSVPStatusSection({ records, className, compact = false }: RSVPStatusSectionProps) {
  const [filter, setFilter] = useState<RSVPFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const stats = {
    going: records.filter((r) => r.status === 'going').length,
    maybe: records.filter((r) => r.status === 'maybe').length,
    not_going: records.filter((r) => r.status === 'not_going').length,
    pending: records.filter((r) => r.status === 'pending').length,
    total: records.length,
  };

  const filteredRecords = records
    .filter((r) => filter === 'all' || r.status === filter)
    .filter((r) => {
      if (!searchQuery) return true;
      const name = `${r.player?.first_name || ''} ${r.player?.last_name || ''}`.toLowerCase();
      return name.includes(searchQuery.toLowerCase());
    });

  return (
    <div className={cn('bg-white rounded-2xl border border-slate-200 shadow-sm', className)}>
      {/* Header with stats */}
      <div className={cn('p-4 border-b border-slate-100', compact && 'p-3')}>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-slate-900">RSVP Status</h4>
          <span className="text-xs text-slate-500">
            {stats.going} of {stats.total} going
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden flex">
          {stats.total > 0 && (
            <>
              <div
                className="bg-emerald-500 transition-all duration-300"
                style={{ width: `${(stats.going / stats.total) * 100}%` }}
              />
              <div
                className="bg-amber-400 transition-all duration-300"
                style={{ width: `${(stats.maybe / stats.total) * 100}%` }}
              />
              <div
                className="bg-rose-400 transition-all duration-300"
                style={{ width: `${(stats.not_going / stats.total) * 100}%` }}
              />
            </>
          )}
        </div>

        {/* Stat counts */}
        <div className="flex items-center gap-4 mt-2">
          {(Object.entries(stats) as Array<[string, number]>)
            .filter(([key]) => key !== 'total')
            .map(([key, count]) => {
              const config = STATUS_CONFIG[key as keyof typeof STATUS_CONFIG];
              return (
                <div key={key} className="flex items-center gap-1.5">
                  <div className={cn('w-2 h-2 rounded-full', config.color)} />
                  <span className="text-xs text-slate-600">
                    {count} {config.label.toLowerCase()}
                  </span>
                </div>
              );
            })}
        </div>
      </div>

      {/* Search and filter */}
      <div className="p-3 border-b border-slate-100 space-y-2">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search players..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
          />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(['all', 'going', 'maybe', 'not_going', 'pending'] as const).map((f) => {
            const isAll = f === 'all';
            const config = isAll ? null : STATUS_CONFIG[f];
            const count = isAll ? records.length : stats[f];

            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5',
                  filter === f
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 active:bg-slate-300',
                )}
              >
                {config && <div className={cn('w-1.5 h-1.5 rounded-full', config.color)} />}
                {isAll ? 'All' : config?.label}
                <span className="opacity-75">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Player list */}
      <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto overscroll-contain touch-pan-y" style={{ WebkitOverflowScrolling: 'touch' }}>
        {filteredRecords.length === 0 ? (
          <div className="p-8 text-center">
            <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">
              {searchQuery ? 'No players match your search' : 'No responses yet'}
            </p>
          </div>
        ) : (
          filteredRecords.map((record) => {
            const config = STATUS_CONFIG[record.status];
            const firstName = record.player?.first_name || 'Unknown';
            const lastName = record.player?.last_name || '';
            const initials = `${firstName[0] || ''}${lastName[0] || ''}`.toUpperCase();

            return (
              <div key={record.id} className="flex items-center gap-3 p-3 hover:bg-slate-50 active:bg-slate-100 transition-colors">
                {/* Avatar */}
                {record.player?.avatar_url ? (
                  <Image
                    src={record.player.avatar_url}
                    alt={`${firstName} ${lastName}`}
                    width={36}
                    height={36}
                    className="w-9 h-9 rounded-full object-cover flex-shrink-0"
                    unoptimized
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-xs font-medium text-slate-600 flex-shrink-0">
                    {initials}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">
                    {firstName} {lastName}
                  </p>
                  {record.check_in_at && (
                    <p className="text-xs text-emerald-600 font-medium">Checked in</p>
                  )}
                </div>

                <div
                  className={cn(
                    'flex items-center gap-1.5 px-2 py-1 rounded-full',
                    config.bgColor,
                  )}
                >
                  <div className={cn('w-2 h-2 rounded-full', config.color)} />
                  {!compact && (
                    <span className={cn('text-xs font-medium', config.textColor)}>
                      {config.label}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
