'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { m } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconBell, IconCheck, IconChevronRight } from '@/components/icons';
import { Button } from '@/components/ui/button';
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
} from '@/components/ui/drawer';
import { useToast } from '@/components/ui/sonner';
import { acknowledgeAnnouncement } from '@/app/golf/actions/communication';
import type { GolfAnnouncementMeta } from '@/lib/types/golf';

// ─── Urgency config ─────────────────────────────────────────────────────────

// Brand semantic colors — primary (info/normal), helm-amber (high), red (urgent),
// neutral warm for low priority. Accent bar color is kept very soft so it reads
// as a subtle stripe rather than a loud alert rail.
type UrgencyStyle = {
  bar: string;     // left accent bar background (Tailwind class)
  badgeBg: string; // badge surface
  badgeText: string;
  badgeDot: string; // tiny dot inside badge
  label: string;
};
const urgencyConfig: Record<string, UrgencyStyle> = {
  low: {
    bar: 'bg-warm-300',
    badgeBg: 'bg-warm-100/80',
    badgeText: 'text-warm-600',
    badgeDot: 'bg-warm-400',
    label: 'Low',
  },
  normal: {
    bar: 'bg-primary-600',
    badgeBg: 'bg-primary-600/10',
    badgeText: 'text-primary-700',
    badgeDot: 'bg-primary-600',
    label: 'Normal',
  },
  high: {
    bar: 'bg-helm-amber-500',
    badgeBg: 'bg-helm-amber-500/10',
    badgeText: 'text-helm-amber-700',
    badgeDot: 'bg-helm-amber-500',
    label: 'High',
  },
  urgent: {
    bar: 'bg-red-500',
    badgeBg: 'bg-red-500/10',
    badgeText: 'text-red-700',
    badgeDot: 'bg-red-500',
    label: 'Urgent',
  },
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
 * Uses the shared Drawer primitive so it inherits iOS-native behaviors:
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
    <Drawer
      open={announcements.length > 0}
      onOpenChange={(next) => {
        if (!next) onDismiss();
      }}
    >
      <DrawerContent>
      <div
        className="px-6 pb-4 overflow-y-auto overscroll-contain"
      >
      {/* Header */}
      <div className="flex items-center gap-3 pb-4">
        <div className="w-11 h-11 rounded-2xl bg-primary-50 border border-primary-200/60 flex items-center justify-center flex-shrink-0">
          <IconBell size={20} className="text-primary-600" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-headline text-warm-900">
            {title}
          </h2>
          <p className="text-footnote text-warm-500">From your coaching staff</p>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-warm-200/80 via-warm-200/40 to-transparent mb-3" />

      {/* Announcement cards */}
      <div className="space-y-3">
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
                'relative rounded-2xl overflow-hidden border transition-all duration-200',
                needsAck
                  ? 'border-primary-200/70 bg-gradient-to-br from-primary-50/40 via-white to-white shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)]'
                  : isAcked
                    ? 'border-warm-200/60 bg-warm-50/40'
                    : 'border-warm-200/70 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.03)]',
              )}
            >
              {/* Urgency accent bar — soft, narrow, matches brand semantic color */}
              <div
                className={cn('absolute left-0 top-0 bottom-0 w-[3px] opacity-65', urg.bar)}
                aria-hidden="true"
              />

              <div className="pl-4 pr-4 py-3.5">
                {/* Title row */}
                <div className="flex items-start gap-2 mb-1">
                  <h3 className={cn(
                    'text-subhead font-medium text-warm-900 line-clamp-2 flex-1 leading-snug',
                    isAcked && 'text-warm-500',
                  )}>
                    {ann.title}
                  </h3>
                  <span className={cn(
                    'inline-flex items-center gap-1 px-2 py-[3px] rounded-full text-eyebrow font-medium uppercase tracking-wider flex-shrink-0 mt-0.5',
                    urg.badgeBg, urg.badgeText,
                  )}>
                    <span className={cn('w-1.5 h-1.5 rounded-full', urg.badgeDot)} />
                    {urg.label}
                  </span>
                </div>

                {/* Body preview */}
                <p className={cn(
                  'text-body-sm text-warm-600 line-clamp-3 leading-relaxed mb-2.5',
                  isAcked && 'text-warm-400',
                )}>
                  {ann.body}
                </p>

                {/* Footer: time + action */}
                <div className="flex items-center justify-between">
                  <span className="text-caption-1 text-warm-500 tabular-nums">
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
                    <span className="inline-flex items-center gap-1 text-caption text-primary-600 font-medium">
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
      </div>
      <DrawerFooter>
        <div className="flex items-center gap-3">
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
      </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
