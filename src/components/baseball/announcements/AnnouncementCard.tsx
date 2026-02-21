'use client';

import { cn } from '@/lib/utils';
import { IconBell, IconAlertCircle } from '@/components/icons';
import type { BaseballAnnouncementMeta } from '@/app/baseball/actions/announcements';

interface AnnouncementCardProps {
  announcement: BaseballAnnouncementMeta;
}

const urgencyBadgeStyles: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-amber-100 text-amber-700 border-amber-200',
  normal: 'bg-primary-100 text-primary-700 border-primary-200',
  low: 'bg-slate-100 text-slate-600 border-slate-200',
};

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  const now = new Date();
  const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

  if (diffInHours < 1) {
    const minutes = Math.floor(diffInHours * 60);
    return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
  } else if (diffInHours < 24) {
    const hours = Math.floor(diffInHours);
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  } else if (diffInHours < 48) {
    return 'Yesterday';
  } else {
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
    });
  }
}

export function AnnouncementCard({ announcement }: AnnouncementCardProps) {
  const isUrgent = announcement.urgency === 'urgent' || announcement.urgency === 'high';
  const urgency = announcement.urgency || 'normal';

  return (
    <div
      className={cn(
        'relative glass-standard rounded-2xl overflow-hidden p-6',
        isUrgent && 'border-red-200'
      )}
    >
      {/* Shine effect */}
      <div
        className="absolute inset-x-0 top-0 h-px pointer-events-none z-10"
        style={{
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.8), transparent)',
        }}
      />

      <div className="relative flex items-start gap-4">
        <div
          className={cn(
            'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0',
            isUrgent ? 'bg-red-100' : 'bg-primary-100'
          )}
        >
          {isUrgent ? (
            <IconAlertCircle size={20} className="text-red-600" />
          ) : (
            <IconBell size={20} className="text-primary-600" />
          )}
        </div>

        <div className="flex-1">
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">{announcement.title}</h3>
              <p className="text-sm text-slate-500">
                {announcement.published_at
                  ? formatDate(announcement.published_at)
                  : announcement.created_at
                    ? formatDate(announcement.created_at)
                    : 'No date'}
              </p>
            </div>
            <span
              className={cn(
                'px-2.5 py-1 text-xs font-medium rounded-full border',
                urgencyBadgeStyles[urgency] || urgencyBadgeStyles.normal
              )}
            >
              {urgency.toUpperCase()}
            </span>
          </div>

          <p className="text-slate-600 whitespace-pre-wrap">{announcement.body}</p>

          {announcement.requires_acknowledgement && (
            <div className="mt-4 pt-4 border-t border-slate-200">
              <div className="flex items-center gap-2 text-sm">
                <IconAlertCircle size={16} className="text-amber-600" />
                <span className="text-amber-700 font-medium">
                  Acknowledgement required
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
