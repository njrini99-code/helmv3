'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconBell, IconCheck, IconChevronRight } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { useToast } from '@/components/ui/toast';
import { acknowledgeAnnouncement } from '@/app/golf/actions/communication';
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

// ─── Main Component ─────────────────────────────────────────────────────────

interface NewAnnouncementsModalProps {
  announcements: GolfAnnouncementMeta[];
  onDismiss: () => void;
}

/**
 * Shown to players when unseen announcements exist.
 *
 * Uses the shared BottomSheet primitive so it inherits iOS-native behaviors:
 * swipe-to-close, drag handle, safe-area padding, haptics, focus trap, and
 * Escape key handling — keeping this modal visually consistent with the
 * rest of the app (command palette, event sheets, etc.).
 */
export function NewAnnouncementsModal({ announcements, onDismiss }: NewAnnouncementsModalProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [acknowledging, setAcknowledging] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState<Set<string>>(new Set());

  const handleAcknowledge = useCallback(async (announcementId: string) => {
    setAcknowledging(announcementId);
    const result = await acknowledgeAnnouncement(announcementId);
    if (result.success) {
      setAcknowledged(prev => new Set(prev).add(announcementId));
      showToast('Acknowledged', 'success');
    } else {
      showToast(result.error || 'Failed to acknowledge', 'error');
    }
    setAcknowledging(null);
  }, [showToast]);

  const handleViewAll = useCallback(() => {
    onDismiss();
    router.push('/golf/dashboard/announcements');
  }, [onDismiss, router]);

  const count = announcements.length;
  const title = count === 1 ? 'New Announcement' : `${count} New Announcements`;

  return (
    <BottomSheet
      open={announcements.length > 0}
      onClose={onDismiss}
      snapPoints={[0.85]}
      showHandle
      swipeToClose
    >
      {/* Header */}
      <div className="flex items-center gap-3 pb-4">
        <div className="w-10 h-10 rounded-xl bg-primary-50 border border-primary-200/60 flex items-center justify-center flex-shrink-0">
          <IconBell size={18} className="text-primary-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-warm-900 tracking-tight">
            {title}
          </h2>
          <p className="text-sm text-warm-500">From your coaching staff</p>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-warm-200/80 via-warm-200/40 to-transparent mb-4" />

      {/* Announcement cards */}
      <div className="space-y-2.5">
        {announcements.map((ann, i) => {
          const urg = urgencyConfig[ann.urgency || 'normal'] ?? defaultUrg;
          const needsAck = ann.requires_acknowledgement && !ann.has_player_acknowledged && !acknowledged.has(ann.id);
          const isAcked = ann.has_player_acknowledged || acknowledged.has(ann.id);

          return (
            <m.div
              key={ann.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04, type: 'spring', stiffness: 400, damping: 30 }}
              className={cn(
                'relative rounded-xl overflow-hidden border transition-all duration-200',
                needsAck
                  ? 'border-primary-200/80 bg-gradient-to-r from-primary-50/30 via-white to-white shadow-sm'
                  : isAcked
                    ? 'border-warm-200/60 bg-warm-50/30'
                    : 'border-warm-200/80 bg-white',
              )}
            >
              {/* Urgency accent bar */}
              <div className={cn('absolute left-0 top-0 bottom-0 w-1 rounded-l-xl', urg.dot)} />

              <div className="pl-4 pr-4 py-3.5">
                {/* Title row */}
                <div className="flex items-center gap-2 mb-1">
                  <h3 className={cn(
                    'font-semibold text-sm text-warm-900 truncate flex-1',
                    isAcked && 'text-warm-500',
                  )}>
                    {ann.title}
                  </h3>
                  <span className={cn(
                    'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-micro font-semibold uppercase tracking-wider border flex-shrink-0',
                    urg.bg, urg.text, urg.border
                  )}>
                    <span className={cn('w-1.5 h-1.5 rounded-full', urg.dot)} />
                    {urg.label}
                  </span>
                </div>

                {/* Body preview */}
                <p className={cn(
                  'text-sm text-warm-500 line-clamp-2 leading-relaxed mb-2.5',
                  isAcked && 'text-warm-400',
                )}>
                  {ann.body}
                </p>

                {/* Footer: time + action */}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-warm-400 tabular-nums">
                    {ann.published_at ? relativeTime(ann.published_at) : ''}
                  </span>

                  {needsAck && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleAcknowledge(ann.id)}
                      isLoading={acknowledging === ann.id}
                      leftIcon={<IconCheck size={12} />}
                    >
                      Acknowledge
                    </Button>
                  )}
                  {isAcked && (
                    <span className="inline-flex items-center gap-1 text-xs text-primary-600 font-medium">
                      <IconCheck size={12} />
                      Acknowledged
                    </span>
                  )}
                </div>
              </div>
            </m.div>
          );
        })}
      </div>

      {/* Footer actions */}
      <div className="sticky bottom-0 -mx-6 px-6 pt-4 pb-2 mt-4 bg-white/95 backdrop-blur-xl border-t border-warm-100/80 flex items-center gap-3">
        <Button
          variant="primary"
          className="flex-1"
          onClick={onDismiss}
        >
          Got it
        </Button>
        {count > 1 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleViewAll}
            rightIcon={<IconChevronRight size={14} />}
          >
            View all
          </Button>
        )}
      </div>
    </BottomSheet>
  );
}
