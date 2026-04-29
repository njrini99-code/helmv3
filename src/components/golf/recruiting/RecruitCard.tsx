'use client';

import { cn } from '@/lib/utils';
import { GraduationCap, MapPin, Mail, Phone, MoreHorizontal } from 'lucide-react';
import { RecruitStatusChip } from './RecruitStatusChip';
import type { Recruit } from '@/app/golf/actions/recruiting';

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

const STATUS_RING: Record<Recruit['status'], string> = {
  watched: 'ring-amber-200',
  recruiting: 'ring-primary-200',
  offered: 'ring-violet-200',
  committed: 'ring-blue-200',
};

const AVATAR_GRAD: Record<Recruit['status'], string> = {
  watched: 'from-amber-100 to-amber-200 text-amber-800',
  recruiting: 'from-primary-100 to-primary-200 text-primary-800',
  offered: 'from-violet-100 to-violet-200 text-violet-800',
  committed: 'from-blue-100 to-blue-200 text-blue-800',
};

export function RecruitCard({ recruit, onClick }: RecruitCardProps) {
  const fullName = `${recruit.first_name}${recruit.last_name ? ` ${recruit.last_name}` : ''}`.trim();
  const location = formatLocation(recruit.hometown, recruit.state);
  const initials = getInitials(recruit.first_name, recruit.last_name);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative w-full text-left',
        'bg-white/80 backdrop-blur-xl rounded-2xl border border-white/40',
        'shadow-[0_2px_10px_rgba(16,24,40,0.04)]',
        'transition-all duration-200',
        'hover:bg-white hover:shadow-[0_8px_24px_rgba(16,24,40,0.08)] hover:-translate-y-[1px]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40',
      )}
      aria-label={`Edit ${fullName}`}
    >
      <div className="p-5 flex items-start gap-4">
        {/* Avatar */}
        <div
          className={cn(
            'w-12 h-12 rounded-2xl flex-shrink-0',
            'flex items-center justify-center',
            'bg-gradient-to-br',
            AVATAR_GRAD[recruit.status],
            'ring-2',
            STATUS_RING[recruit.status],
            'font-bold text-base shadow-sm',
          )}
        >
          {initials}
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-[family-name:var(--font-fraunces)] text-[18px] leading-tight font-semibold text-warm-900 truncate">
                {fullName || 'Unnamed prospect'}
              </h3>
              <div className="flex items-center gap-2 mt-1 text-xs text-warm-500">
                {recruit.hs_class && (
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <GraduationCap className="w-3.5 h-3.5" />
                    Class of {recruit.hs_class}
                  </span>
                )}
                {recruit.hs_class && location && <span aria-hidden="true">·</span>}
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

          {/* Contact / notes preview */}
          {(recruit.email || recruit.phone || recruit.notes) && (
            <div className="mt-3 pt-3 border-t border-warm-200/60 space-y-1.5">
              {recruit.email && (
                <p className="flex items-center gap-1.5 text-xs text-warm-600 truncate">
                  <Mail className="w-3.5 h-3.5 text-warm-400 flex-shrink-0" />
                  <span className="truncate">{recruit.email}</span>
                </p>
              )}
              {recruit.phone && (
                <p className="flex items-center gap-1.5 text-xs text-warm-600 tabular-nums">
                  <Phone className="w-3.5 h-3.5 text-warm-400 flex-shrink-0" />
                  {recruit.phone}
                </p>
              )}
              {recruit.notes && (
                <p className="text-xs text-warm-500 line-clamp-2 leading-relaxed">
                  {recruit.notes}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Subtle action affordance */}
        <span
          aria-hidden="true"
          className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity text-warm-400"
        >
          <MoreHorizontal className="w-4 h-4" />
        </span>
      </div>
    </button>
  );
}
