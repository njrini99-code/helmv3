'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { IconPlus, IconSend } from '@/components/icons';
import { UrgencyPicker } from './UrgencyPicker';
import { PlayerSelector } from './PlayerSelector';
import { DocumentAttacher } from './DocumentAttacher';
import { InlineTaskBuilder, type InlineTask } from './InlineTaskBuilder';
import { createEnrichedAnnouncement } from '@/app/golf/actions/announcements';

interface Player {
  id: string;
  first_name: string | null;
  last_name: string | null;
}

interface Document {
  id: string;
  title: string;
  file_type: string;
  file_size: number;
}

interface CreateAnnouncementFlowProps {
  players: Player[];
  documents: Document[];
}

export function CreateAnnouncementFlow({ players, documents }: CreateAnnouncementFlowProps) {
  const router = useRouter();
  const { showToast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [urgency, setUrgency] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [recipientPlayerIds, setRecipientPlayerIds] = useState<string[] | null>(null);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [inlineTasks, setInlineTasks] = useState<InlineTask[]>([]);
  const [requiresAcknowledgement, setRequiresAcknowledgement] = useState(false);

  function resetForm() {
    setTitle('');
    setBody('');
    setUrgency('normal');
    setRecipientPlayerIds(null);
    setSelectedDocumentIds([]);
    setInlineTasks([]);
    setRequiresAcknowledgement(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!title.trim()) {
      showToast('Title is required', 'error');
      return;
    }
    if (!body.trim()) {
      showToast('Message is required', 'error');
      return;
    }

    // Validate inline tasks have titles
    const validTasks = inlineTasks.filter(t => t.title.trim());
    if (inlineTasks.length > 0 && validTasks.length !== inlineTasks.length) {
      showToast('Please fill in all task titles or remove empty tasks', 'error');
      return;
    }

    // Validate specific player selection
    if (recipientPlayerIds !== null && recipientPlayerIds.length === 0) {
      showToast('Please select at least one player or choose All Team', 'error');
      return;
    }

    setLoading(true);
    try {
      const result = await createEnrichedAnnouncement({
        title: title.trim(),
        body: body.trim(),
        urgency,
        requiresAcknowledgement,
        recipientPlayerIds,
        documentIds: selectedDocumentIds,
        inlineTasks: validTasks.map(t => ({
          title: t.title.trim(),
          description: t.description?.trim(),
          dueDate: t.dueDate,
        })),
      });

      if (!result.success) {
        showToast(result.error || 'Failed to create announcement', 'error');
        setLoading(false);
        return;
      }

      showToast('Announcement posted successfully', 'success');
      resetForm();
      setIsOpen(false);
      router.refresh();
    } catch {
      showToast('Failed to create announcement', 'error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)} leftIcon={<IconPlus size={16} />}>
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
              placeholder="Practice schedule change, tournament update..."
              required
              autoFocus
            />

            {/* Body */}
            <div>
              <label className="text-sm font-medium text-warm-700 block mb-1.5">
                Message
              </label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                required
                className="w-full px-4 py-2.5 rounded-xl border border-warm-200 focus:border-green-500 focus:ring-2 focus:ring-green-100 text-warm-900 placeholder:text-warm-400 transition-colors resize-y min-h-[72px] max-h-[200px] text-sm"
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

            {/* Documents */}
            <DocumentAttacher
              existingDocuments={documents}
              selectedDocumentIds={selectedDocumentIds}
              onChange={setSelectedDocumentIds}
            />

            {/* Tasks */}
            <InlineTaskBuilder
              tasks={inlineTasks}
              onChange={setInlineTasks}
            />

            {/* Acknowledgement toggle */}
            <motion.div
              whileHover={{ scale: 1.005 }}
              className="flex items-start gap-3 p-3.5 bg-warm-50/80 rounded-xl border border-warm-200/60 cursor-pointer"
              onClick={() => setRequiresAcknowledgement(!requiresAcknowledgement)}
            >
              <div className="pt-0.5">
                <div className={`w-9 h-5 rounded-full transition-colors relative ${requiresAcknowledgement ? 'bg-green-500' : 'bg-warm-300'}`}>
                  <motion.div
                    className="absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-sm"
                    animate={{ left: requiresAcknowledgement ? 18 : 2 }}
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                  />
                </div>
              </div>
              <div>
                <p className="text-sm font-medium text-warm-700">
                  Require player acknowledgement
                </p>
                <p className="text-xs text-warm-500 mt-0.5">
                  Players will need to confirm they&apos;ve read this announcement
                </p>
              </div>
            </motion.div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between pt-4 mt-5 border-t border-warm-200 sticky bottom-0 bg-white/95 backdrop-blur-sm -mx-6 px-6 pb-1 -mb-6">
            <div className="flex items-center gap-2 text-xs text-warm-400">
              {recipientPlayerIds === null ? (
                <span>Sending to all {players.length} players</span>
              ) : (
                <span>Sending to {recipientPlayerIds.length} player{recipientPlayerIds.length !== 1 ? 's' : ''}</span>
              )}
              {inlineTasks.length > 0 && (
                <>
                  <span>&middot;</span>
                  <span>{inlineTasks.length} task{inlineTasks.length !== 1 ? 's' : ''}</span>
                </>
              )}
              {selectedDocumentIds.length > 0 && (
                <>
                  <span>&middot;</span>
                  <span>{selectedDocumentIds.length} doc{selectedDocumentIds.length !== 1 ? 's' : ''}</span>
                </>
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
                leftIcon={<IconSend size={14} />}
              >
                Post Announcement
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}
