'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { IconChevronDown, IconCheck } from '@/components/icons';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { acknowledgeAnnouncement } from '@/app/baseball/actions/announcements';
import type { BaseballAnnouncementMeta } from '@/app/baseball/actions/announcements';

const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.06, delayChildren: 0.1 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16, filter: 'blur(4px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { type: 'spring' as const, stiffness: 300, damping: 30 } },
};

const urgencyBorderColors: Record<string, string> = {
  low: 'border-l-slate-300',
  normal: 'border-l-green-400',
  high: 'border-l-amber-400',
  urgent: 'border-l-red-400',
};

const urgencyBadgeColors: Record<string, { bg: string; text: string }> = {
  low: { bg: 'bg-slate-100', text: 'text-slate-600' },
  normal: { bg: 'bg-green-50', text: 'text-green-600' },
  high: { bg: 'bg-amber-50', text: 'text-amber-600' },
  urgent: { bg: 'bg-red-50', text: 'text-red-600' },
};

interface AnnouncementsPlayerViewProps {
  announcements: BaseballAnnouncementMeta[];
  playerId: string;
}

export function AnnouncementsPlayerView({ announcements, playerId }: AnnouncementsPlayerViewProps) {
  void playerId; // used for future per-player task filtering
  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-3"
    >
      {announcements.map((ann) => (
        <motion.div key={ann.id} variants={itemVariants}>
          <PlayerAnnouncementCard announcement={ann} />
        </motion.div>
      ))}
    </motion.div>
  );
}

function PlayerAnnouncementCard({ announcement: ann }: { announcement: BaseballAnnouncementMeta }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const [hasAcknowledged, setHasAcknowledged] = useState(!!ann.has_player_acknowledged);
  const [acknowledging, setAcknowledging] = useState(false);

  const urgencyBorder = urgencyBorderColors[ann.urgency || 'normal'];
  const urgencyBadge = urgencyBadgeColors[ann.urgency || 'normal'] ?? { bg: 'bg-green-50', text: 'text-green-600' };

  async function handleAcknowledge() {
    setAcknowledging(true);
    const result = await acknowledgeAnnouncement(ann.id);
    if (result.success) {
      setHasAcknowledged(true);
      showToast('Acknowledged', 'success');
      router.refresh();
    } else {
      showToast(result.error || 'Failed to acknowledge', 'error');
    }
    setAcknowledging(false);
  }

  const publishedDate = ann.published_at
    ? new Date(ann.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  const isRecent = ann.published_at && (Date.now() - new Date(ann.published_at).getTime()) < 7 * 86400000;
  const needsAck = ann.requires_acknowledgement && !hasAcknowledged;

  return (
    <div
      className={cn(
        'bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-sm overflow-hidden',
        'border-l-[3px]',
        urgencyBorder,
        needsAck && 'ring-1 ring-amber-200/50',
        'transition-all hover:shadow-md'
      )}
    >
      {/* Card header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full text-left px-5 py-4 flex items-start gap-4"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-sm font-semibold text-slate-900 truncate">{ann.title}</h3>
            {isRecent && (
              <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-green-50 text-green-600 flex-shrink-0">
                New
              </span>
            )}
            {needsAck && (
              <span className="px-1.5 py-0.5 text-xs font-medium rounded-full bg-amber-50 text-amber-600 flex-shrink-0">
                Needs Acknowledgement
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 line-clamp-2">{ann.body}</p>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <span className="text-xs text-slate-400">{publishedDate}</span>
            <span className={cn('px-1.5 py-0.5 rounded text-xs font-semibold uppercase tracking-wider', urgencyBadge.bg, urgencyBadge.text)}>
              {ann.urgency || 'normal'}
            </span>
            {hasAcknowledged && (
              <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                <IconCheck size={10} />
                Acknowledged
              </span>
            )}
          </div>
        </div>
        <motion.div
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="flex-shrink-0 mt-1"
        >
          <IconChevronDown size={16} className="text-slate-400" />
        </motion.div>
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-4 border-t border-slate-100">
              <div className="pt-4 space-y-4">
                {/* Full body */}
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{ann.body}</p>

                {/* Acknowledge button */}
                {ann.requires_acknowledgement && !hasAcknowledged && (
                  <div className="pt-2 border-t border-slate-100">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={handleAcknowledge}
                      isLoading={acknowledging}
                    >
                      <IconCheck size={14} className="mr-1.5" />
                      Acknowledge
                    </Button>
                  </div>
                )}

                {ann.requires_acknowledgement && hasAcknowledged && (
                  <div className="pt-2 border-t border-slate-100 flex items-center gap-2 text-green-600">
                    <IconCheck size={16} />
                    <span className="text-sm font-medium">You acknowledged this announcement</span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
