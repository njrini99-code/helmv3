'use client';

import { cn } from '@/lib/utils';
import { Link2, Copy } from 'lucide-react';

/**
 * Abstract roster with invite link mockup
 */
export function RosterMockup() {
  return (
    <div className="space-y-2">
      {/* Invite link card */}
      <div className={cn(
        "flex items-center gap-2 p-2 rounded-lg",
        "bg-primary-50 border border-primary-100"
      )}>
        <Link2 className="w-4 h-4 text-primary-600" />
        <div className="flex-1 min-w-0">
          <div className="h-1.5 w-20 bg-primary-200 rounded" />
        </div>
        <div className="w-5 h-5 rounded bg-primary-100 flex items-center justify-center">
          <Copy className="w-2.5 h-2.5 text-primary-600" />
        </div>
      </div>

      {/* Player rows */}
      <div className="space-y-1">
        <RosterRow jersey={7} recruiting />
        <RosterRow jersey={23} />
      </div>
    </div>
  );
}

function RosterRow({ jersey, recruiting }: { jersey: number; recruiting?: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-2 p-1.5 rounded",
      "bg-white/45 border border-white/30"
    )}>
      {/* Jersey number */}
      <div className="w-6 h-6 rounded bg-slate-100 flex items-center justify-center">
        <span className="text-[10px] font-bold text-slate-600">#{jersey}</span>
      </div>

      {/* Avatar */}
      <div className="w-5 h-5 rounded-full bg-gradient-to-br from-slate-200 to-slate-300" />

      {/* Name */}
      <div className="flex-1 h-1.5 bg-slate-200 rounded w-16" />

      {/* Recruiting status */}
      {recruiting && (
        <span className="text-[8px] px-1 py-0.5 rounded bg-primary-100 text-primary-700 font-medium">
          Recruiting
        </span>
      )}
    </div>
  );
}
