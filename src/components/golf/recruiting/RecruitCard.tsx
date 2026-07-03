'use client';

import { cn } from '@/lib/utils';
import { GraduationCap, MapPin, Mail, Phone, MoreHorizontal } from 'lucide-react';
import { RecruitStatusChip } from './RecruitStatusChip';
import type { Recruit } from '@/app/golf/actions/recruiting';
import { Button } from '@/components/ui/button';

interface RecruitCardProps {
  recruit: Recruit;
  onClick: () => void;
}

function getInitials(first: string, last: string | null): string {
  const f = first?.[0] ?? '';
  const l = last?.[0] ?? '';
  return `${f}${l}`.toUpperCase() || '?';
}

function formatLocation(hometown: string | null, state: string | null): string | null {
  if (hometown && state) return `${hometown}, ${state}`;
  return hometown || state || null;
}

const AVATAR_TONE: Record<Recruit['status'], string> = {
  watched: 'bg-amber-50/80 text-amber-700',
  recruiting: 'bg-primary-50/80 text-primary-700',
  offered: 'bg-violet-50/80 text-violet-700',
  committed: 'bg-blue-50/80 text-blue-700',
};

export function RecruitCard({ recruit, onClick }: RecruitCardProps) {
  const fullName = `${recruit.first_name}${recruit.last_name ? ` ${recruit.last_name}` : ''}`.trim();
  const location = formatLocation(recruit.hometown, recruit.state);
  const initials = getInitials(recruit.first_name, recruit.last_name);

  return (
    <Button variant="ghost"
      type="button"
      onClick={onClick}
      className={cn(
        'group relative w-full text-left rounded-3xl surface-matte',
        'transition-all duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)]',
        'hover:-translate-y-[2px] hover:shadow-[0_2px_4px_rgba(58,50,40,0.04),0_24px_44px_rgba(58,50,40,0.07)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30',
      )}
      aria-label={`Edit ${fullName}`}
    >
      <div className="p-6 md:p-7 flex items-start gap-4">
        {/* Avatar — soft tone disc, no ring, no gradient */}
        <div
          className={cn(
            'w-12 h-12 rounded-2xl flex-shrink-0 flex items-center justify-center',
            'font-medium text-body tracking-[-0.005em]',
            AVATAR_TONE[recruit.status],
          )}
        >
          {initials}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-h3 font-medium text-warm-900 tracking-[-0.012em] truncate">
                {fullName || 'Unnamed prospect'}
              </h3>
              <div className="flex items-center gap-2 mt-1.5 text-caption text-warm-500">
                {recruit.hs_class && (
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <GraduationCap className="w-3.5 h-3.5" />
                    Class of {recruit.hs_class}
                  </span>
                )}
                {recruit.hs_class && location && <span aria-hidden>·</span>}
                {location && (
                  <span className="inline-flex items-center gap-1 truncate">
                    <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="truncate">{location}</span>
                  </span>
                )}
              </div>
            </div>
            <RecruitStatusChip status={recruit.status} size="sm" />
          </div>

          {(recruit.email || recruit.phone || recruit.notes) && (
            <div className="mt-4 pt-4 border-t border-warm-200/35 space-y-2">
              {recruit.email && (
                <p className="flex items-center gap-2 text-caption text-warm-600 truncate">
                  <Mail className="w-3.5 h-3.5 text-warm-400 flex-shrink-0" />
                  <span className="truncate">{recruit.email}</span>
                </p>
              )}
              {recruit.phone && (
                <p className="flex items-center gap-2 text-caption text-warm-600 tabular-nums">
                  <Phone className="w-3.5 h-3.5 text-warm-400 flex-shrink-0" />
                  {recruit.phone}
                </p>
              )}
              {recruit.notes && (
                <p className="text-caption text-warm-500 line-clamp-2 leading-relaxed">
                  {recruit.notes}
                </p>
              )}
            </div>
          )}
        </div>

        <span
          aria-hidden
          className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity duration-500 [transition-timing-function:cubic-bezier(0.16,1,0.3,1)] text-warm-400"
        >
          <MoreHorizontal className="w-4 h-4" />
        </span>
      </div>
    </Button>
  );
}
