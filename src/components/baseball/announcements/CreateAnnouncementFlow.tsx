'use client';

import { useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/sonner';
import { IconPlus, IconSend } from '@/components/icons';
import { UrgencyPicker } from './UrgencyPicker';
import { PlayerSelector } from './PlayerSelector';
import { createAnnouncement } from '@/app/baseball/actions/announcements';

interface Player {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface CreateAnnouncementFlowProps {
  players: Player[];
  teamId: string;
  /** Called after a successful create so the parent can refetch the list. */
  onCreated?: () => void;
}

export function CreateAnnouncementFlow({ players, teamId, onCreated }: CreateAnnouncementFlowProps) {
  const prefersReducedMotion = useReducedMotion();
  const { showToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [urgency, setUrgency] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [recipientPlayerIds, setRecipientPlayerIds] = useState<string[] | null>(null);
  const [isPinned, setIsPinned] = useState(false);

  function resetForm() {
    setTitle('');
    setContent('');
    setUrgency('normal');
    setRecipientPlayerIds(null);
    setIsPinned(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!title.trim()) {
      showToast('Title is required', 'error');
      return;
    }
    if (!content.trim()) {
      showToast('Message is required', 'error');
      return;
    }

    // Validate specific player selection
    if (recipientPlayerIds !== null && recipientPlayerIds.length === 0) {
      showToast('Please select at least one player or choose All Team', 'error');
      return;
    }

    setLoading(true);
    try {
      const result = await createAnnouncement({
        teamId,
        title: title.trim(),
        content: content.trim(),
        urgency,
        isPinned,
        recipientPlayerIds,
      });

      if (!result.success) {
        showToast(result.error || 'Failed to create announcement', 'error');
        setLoading(false);
        return;
      }

      showToast('Announcement posted successfully', 'success');
      resetForm();
      setIsOpen(false);
      onCreated?.();
    } catch {
      showToast('Failed to create announcement', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)}>
        <IconPlus size={16} className="mr-2" />
        New Announcement
      </Button>

      <Modal
        open={isOpen}
        onClose={() => { if (!loading) setIsOpen(false); }}
        title="New Announcement"
        description="Share updates with your team"
        size="full"
      >
        <form onSubmit={handleSubmit}>
          <div className="space-y-5">
            {/* Title */}
            <Input
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Practice schedule change, game update..."
              required
            />

            {/* Content */}
            <div>
              <label htmlFor="caf-content" className="text-sm font-medium text-warm-700 block mb-1.5">
                Message
              </label>
              <Textarea
                id="caf-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={3}
                required
                className="resize-y min-h-[72px] max-h-[200px] text-sm"
                placeholder="Write your announcement..."
              />
            </div>

            {/* Urgency */}
            <UrgencyPicker value={urgency} onChange={setUrgency} />

            {/* Recipients */}
            <PlayerSelector
              players={players}
              selectedPlayerIds={recipientPlayerIds}
              onChange={setRecipientPlayerIds}
            />

            {/* Pin toggle */}
            <motion.div
              whileHover={{ scale: 1.005 }}
              className="flex items-start gap-3 p-3.5 bg-warm-50/80 rounded-xl border border-warm-200/60 cursor-pointer"
              onClick={() => setIsPinned(!isPinned)}
            >
              <div className="pt-0.5">
                <div className={`w-9 h-5 rounded-full transition-colors relative ${isPinned ? 'bg-primary-500' : 'bg-warm-300'}`}>
                  <motion.div
                    className="absolute top-0.5 w-4 h-4 bg-cream-50 rounded-full shadow-sm"
                    animate={{ left: isPinned ? 18 : 2 }}
                    transition={prefersReducedMotion ? { duration: 0 } : ({ type: 'spring', stiffness: 500, damping: 30 })}
                  />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-warm-700">
                  Pin announcement
                </p>
                <p className="text-xs text-warm-500 mt-0.5">
                  Pinned announcements appear at the top of the list
                </p>
              </div>
            </motion.div>
          </div>

          {/* Footer */}
          {/* Sticky footer bar — solid Paper, no glass: this is an in-modal bar,
              not a full-screen scrim, so backdrop-blur doesn't qualify for the
              scrim exemption. */}
          <div className="flex items-center justify-between pt-4 mt-5 border-t border-warm-200 sticky bottom-0 bg-cream-50 -mx-6 px-6 pb-1 -mb-6">
            <div className="flex items-center gap-2 text-xs text-warm-400">
              {recipientPlayerIds === null ? (
                <span>Sending to all {players.length} players</span>
              ) : (
                <span>Sending to {recipientPlayerIds.length} player{recipientPlayerIds.length !== 1 ? 's' : ''}</span>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="secondary"
                type="button"
                onClick={() => { if (!loading) setIsOpen(false); }}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                isLoading={loading}
              >
                <IconSend size={14} className="mr-1.5" />
                Post Announcement
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
