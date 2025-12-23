'use client';

import type { GolfAnnouncement } from '@/lib/types/golf';
import { IconBell, IconAlertCircle } from '@/components/icons';

interface AnnouncementCardProps {
  announcement: GolfAnnouncement;
  isCoach: boolean;
  playerId: string | null;
}

export function AnnouncementCard({ announcement, isCoach, playerId }: AnnouncementCardProps) {
  const getUrgencyBadge = (urgency: string) => {
    switch (urgency) {
      case 'urgent':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'high':
        return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'normal':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'low':
        return 'bg-slate-100 text-slate-600 border-slate-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  const formatDate = (dateStr: string) => {
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
  };

  const isUrgent = announcement.urgency === 'urgent' || announcement.urgency === 'high';

  return (
    <div
      className={`bg-white rounded-2xl border ${
        isUrgent ? 'border-red-200' : 'border-slate-200'
      } p-6 shadow-sm`}
    >
      <div className="flex items-start gap-4">
        <div
          className={`w-10 h-10 rounded-full ${
            isUrgent ? 'bg-red-100' : 'bg-green-100'
          } flex items-center justify-center flex-shrink-0`}
        >
          {isUrgent ? (
            <IconAlertCircle size={20} className="text-red-600" />
          ) : (
            <IconBell size={20} className="text-green-600" />
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
              className={`px-2.5 py-1 text-xs font-medium rounded-full border ${getUrgencyBadge(
                announcement.urgency || 'normal'
              )}`}
            >
              {(announcement.urgency || 'normal').toUpperCase()}
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
