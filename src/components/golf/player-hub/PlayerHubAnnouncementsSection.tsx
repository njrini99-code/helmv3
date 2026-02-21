'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconBell, IconCheck, IconChevronRight } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { ShineEffect } from '@/components/ui/shine-effect';
import { useToast } from '@/components/ui/toast';
import { acknowledgeAnnouncement } from '@/app/golf/actions/communication';
import { useNotificationBadges } from '@/contexts/notification-badge-context';
import type { GolfAnnouncementMeta } from '@/lib/types/golf';

// ─── Urgency config ─────────────────────────────────────────────────────────

type UrgencyStyle = { dot: string; bg: string; text: string; border: string; label: string };
const urgencyConfig: Record<string, UrgencyStyle> = {
  low:    { dot: 'bg-warm-400',  bg: 'bg-warm-50',  text: 'text-warm-600',  border: 'border-warm-200', label: 'Low' },
  normal: { dot: 'bg-blue-400',  bg: 'bg-blue-50',  text: 'text-blue-700',  border: 'border-blue-200', label: 'Normal' },
  high:   { dot: 'bg-amber-400', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', label: 'High' },
  urgent: { dot: 'bg-red-500',   bg: 'bg-red-50',   text: 'text-red-700',   border: 'border-red-200', label: 'Urgent' },
};
const defaultUrg: UrgencyStyle = urgencyConfig['normal']!;

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isUnread(ann: GolfAnnouncementMeta): boolean {
  if (ann.requires_acknowledgement && !ann.has_player_acknowledged) return true;
  if (!ann.requires_acknowledgement && ann.published_at) {
    return (Date.now() - new Date(ann.published_at).getTime()) < 24 * 3600000;
  }
  return false;
}

// ─── Main Component ─────────────────────────────────────────────────────────

interface PlayerHubAnnouncementsSectionProps {
  announcements: GolfAnnouncementMeta[];
}

export function PlayerHubAnnouncementsSection({ announcements }: PlayerHubAnnouncementsSectionProps) {
  const { showToast } = useToast();
  const badges = useNotificationBadges();
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());
  const [acknowledging, setAcknowledging] = useState<string | null>(null);

  // Sort unread first, limit to 3
  const sorted = [...announcements].sort((a, b) => {
    const aU = isUnread(a) && !acknowledged.has(a.id);
    const bU = isUnread(b) && !acknowledged.has(b.id);
    if (aU && !bU) return -1;
    if (!aU && bU) return 1;
    return 0;
  }).slice(0, 3);

  const handleAcknowledge = useCallback(async (announcementId: string) => {
    setAcknowledging(announcementId);
    const result = await acknowledgeAnnouncement(announcementId);
    if (result.success) {
      setAcknowledged(prev => new Set(prev).add(announcementId));
      showToast('Acknowledged', 'success');
      badges.refetch();
    } else {
      showToast(result.error || 'Failed to acknowledge', 'error');
    }
    setAcknowledging(null);
  }, [showToast, badges]);

  if (announcements.length === 0) return null;

  const unreadCount = sorted.filter(a => isUnread(a) && !acknowledged.has(a.id)).length;

  return (
    <m.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary-50 border border-primary-200/60 flex items-center justify-center">
            <IconBell size={15} className="text-primary-600" />
          </div>
          <h2 className="text-sm font-semibold text-warm-900 uppercase tracking-wider">Announcements</h2>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 text-micro font-bold rounded-full bg-primary-100 text-primary-700 border border-primary-200 tabular-nums">
              {unreadCount} new
            </span>
          )}
        </div>
        <Link
          href="/golf/dashboard/announcements"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 transition-colors"
        >
          View all
          <IconChevronRight size={12} />
        </Link>
      </div>

      {/* Announcement cards */}
      <div className="space-y-2">
        {sorted.map((ann, i) => {
          const urg = urgencyConfig[ann.urgency || 'normal'] ?? defaultUrg;
          const unread = isUnread(ann) && !acknowledged.has(ann.id);
          const needsAck = ann.requires_acknowledgement && !ann.has_player_acknowledged && !acknowledged.has(ann.id);
          const isAcked = ann.has_player_acknowledged || acknowledged.has(ann.id);

          return (
            <m.div
              key={ann.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05, type: 'spring', stiffness: 400, damping: 30 }}
              className={cn(
                'relative glass-standard rounded-xl overflow-hidden transition-all duration-200',
                unread
                  ? 'ring-1 ring-primary-200/60 shadow-sm'
                  : 'hover:shadow-sm'
              )}
            >
              <ShineEffect />
              {/* Urgency accent bar */}
              <div className={cn('absolute left-0 top-0 bottom-0 w-1 rounded-l-xl', urg.dot)} />

              <div className="pl-4 pr-3.5 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {/* Title */}
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className={cn(
                        'font-semibold text-warm-900 truncate',
                        unread ? 'text-[14px]' : 'text-sm'
                      )}>
                        {ann.title}
                      </h3>
                      {needsAck && (
                        <span className="flex-shrink-0 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider rounded-full bg-amber-100 text-amber-700 border border-amber-200">
                          Action
                        </span>
                      )}
                      {unread && !needsAck && (
                        <span className="relative flex h-2 w-2 flex-shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-400 opacity-50" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-500" />
                        </span>
                      )}
                    </div>

                    {/* Body preview */}
                    <p className="text-sm text-warm-500 line-clamp-1 leading-relaxed">{ann.body}</p>
                  </div>

                  {/* Time + action */}
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <span className="text-label text-warm-400 tabular-nums">
                      {ann.published_at ? relativeTime(ann.published_at) : ''}
                    </span>
                    {needsAck && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleAcknowledge(ann.id)}
                        isLoading={acknowledging === ann.id}
                        leftIcon={<IconCheck size={11} />}
                      >
                        Ack
                      </Button>
                    )}
                    {isAcked && (
                      <span className="inline-flex items-center gap-0.5 text-label text-primary-600 font-medium">
                        <IconCheck size={11} />
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </m.div>
          );
        })}
      </div>
    </m.section>
  );
}
