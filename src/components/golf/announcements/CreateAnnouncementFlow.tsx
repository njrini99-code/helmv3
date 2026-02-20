'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { IconPlus, IconSend, IconPaperclip, IconClipboardList, IconUsers, IconUser, IconCheck, IconX, IconSearch, IconFile, IconCalendar, IconChevronDown } from '@/components/icons';
import { createEnrichedAnnouncement } from '@/app/golf/actions/announcements';

// ─── Types ───────────────────────────────────────────────────────────────────

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

interface InlineTask {
  title: string;
  description?: string;
  dueDate?: string;
}

interface CreateAnnouncementFlowProps {
  players: Player[];
  documents: Document[];
}

// ─── Config ──────────────────────────────────────────────────────────────────

const urgencyOptions = [
  { value: 'low' as const, label: 'Low', dot: 'bg-warm-400', activeBg: 'bg-warm-50', activeBorder: 'border-warm-300', activeText: 'text-warm-700' },
  { value: 'normal' as const, label: 'Normal', dot: 'bg-blue-400', activeBg: 'bg-blue-50', activeBorder: 'border-blue-300', activeText: 'text-blue-700' },
  { value: 'high' as const, label: 'High', dot: 'bg-amber-400', activeBg: 'bg-amber-50', activeBorder: 'border-amber-300', activeText: 'text-amber-700' },
  { value: 'urgent' as const, label: 'Urgent', dot: 'bg-red-400', activeBg: 'bg-red-50', activeBorder: 'border-red-300', activeText: 'text-red-700' },
] as const;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileColor(ft: string): { bg: string; text: string } {
  if (ft.includes('pdf')) return { bg: 'bg-red-50', text: 'text-red-600' };
  if (ft.includes('doc') || ft.includes('word')) return { bg: 'bg-blue-50', text: 'text-blue-600' };
  if (ft.includes('sheet') || ft.includes('xls') || ft.includes('csv')) return { bg: 'bg-primary-50', text: 'text-primary-600' };
  if (ft.includes('image') || ft.includes('png') || ft.includes('jpg')) return { bg: 'bg-purple-50', text: 'text-purple-600' };
  return { bg: 'bg-warm-50', text: 'text-warm-600' };
}

function getFileLabel(ft: string): string {
  if (ft.includes('pdf')) return 'PDF';
  if (ft.includes('doc') || ft.includes('word')) return 'DOC';
  if (ft.includes('sheet') || ft.includes('xls') || ft.includes('csv')) return 'XLS';
  if (ft.includes('image') || ft.includes('png') || ft.includes('jpg')) return 'IMG';
  if (ft.includes('video')) return 'VID';
  return 'FILE';
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export function CreateAnnouncementFlow({ players, documents }: CreateAnnouncementFlowProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setIsOpen(true)} leftIcon={<IconPlus size={16} />}>
        New Announcement
      </Button>
      {isOpen && (
        <AnnouncementDialog
          players={players}
          documents={documents}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}

// ─── Dialog ──────────────────────────────────────────────────────────────────
// Proper centered modal: dimmed backdrop, fixed header with close button,
// scrollable body, pinned footer that never overlaps content.

function AnnouncementDialog({
  players,
  documents,
  onClose,
}: CreateAnnouncementFlowProps & { onClose: () => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const titleRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  // Form state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [urgency, setUrgency] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [recipientPlayerIds, setRecipientPlayerIds] = useState<string[] | null>(null);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [inlineTasks, setInlineTasks] = useState<InlineTask[]>([]);
  const [requiresAcknowledgement, setRequiresAcknowledgement] = useState(false);

  // UI state
  const [showPlayerPicker, setShowPlayerPicker] = useState(false);
  const [showDocPicker, setShowDocPicker] = useState(false);
  const [playerSearch, setPlayerSearch] = useState('');
  const [docSearch, setDocSearch] = useState('');

  const scrollBodyRef = useRef<HTMLDivElement>(null);

  // Animate in + lock body scroll + scroll modal to top
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    // Prevent iOS Safari background scroll on touch
    const preventTouchScroll = (e: TouchEvent) => {
      // Allow scrolling inside the modal body
      if (scrollBodyRef.current?.contains(e.target as Node)) return;
      e.preventDefault();
    };
    document.addEventListener('touchmove', preventTouchScroll, { passive: false });

    requestAnimationFrame(() => requestAnimationFrame(() => {
      setIsAnimating(true);
      // Ensure modal body starts scrolled to top
      scrollBodyRef.current?.scrollTo(0, 0);
    }));
    setTimeout(() => titleRef.current?.focus(), 150);

    return () => {
      document.body.style.overflow = 'unset';
      document.removeEventListener('touchmove', preventTouchScroll);
    };
  }, []);

  // Escape key
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && !loading) handleClose();
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  function handleClose() {
    if (loading) return;
    setIsAnimating(false);
    setTimeout(onClose, 200);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { showToast('Title is required', 'error'); return; }
    if (!body.trim()) { showToast('Message is required', 'error'); return; }

    const validTasks = inlineTasks.filter(t => t.title.trim());
    if (inlineTasks.length > 0 && validTasks.length !== inlineTasks.length) {
      showToast('Please fill in all task titles or remove empty tasks', 'error');
      return;
    }
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

      showToast('Announcement posted', 'success');
      onClose();
      router.refresh();
    } catch {
      showToast('Failed to create announcement', 'error');
    } finally {
      setLoading(false);
    }
  }

  // Computed
  const isAllTeam = recipientPlayerIds === null;
  const selectedDocs = documents.filter(d => selectedDocumentIds.includes(d.id));
  const availableDocs = documents.filter(d => !selectedDocumentIds.includes(d.id));
  const filteredAvailableDocs = availableDocs.filter(d =>
    !docSearch || d.title.toLowerCase().includes(docSearch.toLowerCase())
  );
  const filteredPlayers = players.filter(p => {
    if (!playerSearch) return true;
    const name = `${p.first_name || ''} ${p.last_name || ''}`.toLowerCase();
    return name.includes(playerSearch.toLowerCase());
  });
  const recipientLabel = isAllTeam
    ? `All ${players.length} players`
    : `${recipientPlayerIds!.length} of ${players.length} players`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6">
      {/* Backdrop */}
      <div
        className={cn(
          'absolute inset-0 bg-warm-900/60 backdrop-blur-sm transition-opacity duration-200',
          isAnimating ? 'opacity-100' : 'opacity-0'
        )}
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Dialog panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ann-dialog-title"
        className={cn(
          'relative z-10 w-full max-w-2xl bg-white border border-warm-200/60 rounded-2xl shadow-2xl',
          'flex flex-col max-h-[calc(100vh-3rem)]',
          'transition-all duration-200 ease-out',
          isAnimating
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-4 scale-[0.97]'
        )}
      >
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {/* ── Fixed header ──────────────────────────────────── */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-warm-100 flex-shrink-0">
            <h2 id="ann-dialog-title" className="text-base font-semibold text-warm-900">
              New Announcement
            </h2>
            <button
              type="button"
              onClick={handleClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-warm-400 hover:text-warm-600 hover:bg-warm-100 transition-all"
              aria-label="Close"
            >
              <IconX size={18} />
            </button>
          </div>

          {/* ── Scrollable body ───────────────────────────────── */}
          <div ref={scrollBodyRef} className="flex-1 overflow-y-auto overscroll-contain min-h-0 px-6 py-5">
            {/* Title */}
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Announcement title"
              required
              className="w-full text-xl font-semibold text-warm-900 placeholder:text-warm-300 bg-transparent outline-none border-none mb-4"
            />

            {/* Message */}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              required
              className="w-full text-sm text-warm-700 placeholder:text-warm-400 bg-warm-50/60 rounded-xl border border-warm-200 px-4 py-3 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-all resize-y min-h-[100px] max-h-[300px] mb-5"
              placeholder="Write your message to the team..."
            />

            {/* Priority + Recipients + Options */}
            <div className="flex flex-wrap items-start gap-x-6 gap-y-4 mb-5">
              <div>
                <label className="text-xs font-semibold text-warm-500 uppercase tracking-wider block mb-2">Priority</label>
                <div className="flex gap-1.5">
                  {urgencyOptions.map((opt) => {
                    const isActive = urgency === opt.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setUrgency(opt.value)}
                        className={cn(
                          'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                          isActive
                            ? `${opt.activeBg} ${opt.activeBorder} ${opt.activeText}`
                            : 'bg-white border-warm-200 text-warm-500 hover:bg-warm-50 hover:border-warm-300'
                        )}
                      >
                        <div className={cn('w-1.5 h-1.5 rounded-full', isActive ? opt.dot : 'bg-warm-300')} />
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-warm-500 uppercase tracking-wider block mb-2">Send To</label>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => { setRecipientPlayerIds(null); setShowPlayerPicker(false); setPlayerSearch(''); }}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                      isAllTeam
                        ? 'bg-primary-50 border-primary-300 text-primary-700'
                        : 'bg-white border-warm-200 text-warm-500 hover:bg-warm-50 hover:border-warm-300'
                    )}
                  >
                    <IconUsers size={12} />
                    All Team
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isAllTeam) setRecipientPlayerIds([]);
                      setShowPlayerPicker(!showPlayerPicker);
                    }}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                      !isAllTeam
                        ? 'bg-primary-50 border-primary-300 text-primary-700'
                        : 'bg-white border-warm-200 text-warm-500 hover:bg-warm-50 hover:border-warm-300'
                    )}
                  >
                    <IconUser size={12} />
                    Select
                    {!isAllTeam && recipientPlayerIds!.length > 0 && (
                      <span className="bg-primary-200 text-primary-800 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                        {recipientPlayerIds!.length}
                      </span>
                    )}
                    <IconChevronDown size={10} className={cn('transition-transform', showPlayerPicker && !isAllTeam && '-rotate-180')} />
                  </button>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-warm-500 uppercase tracking-wider block mb-2">Options</label>
                <button
                  type="button"
                  onClick={() => setRequiresAcknowledgement(!requiresAcknowledgement)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                    requiresAcknowledgement
                      ? 'bg-primary-50 border-primary-300 text-primary-700'
                      : 'bg-white border-warm-200 text-warm-500 hover:bg-warm-50 hover:border-warm-300'
                  )}
                >
                  {requiresAcknowledgement ? <IconCheck size={12} /> : <span className="w-3 h-3 rounded border border-warm-300" />}
                  Require Ack
                </button>
              </div>
            </div>

            {/* Player picker */}
            <AnimatePresence>
              {showPlayerPicker && !isAllTeam && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden mb-5"
                >
                  <div className="border border-warm-200 rounded-xl overflow-hidden bg-white">
                    <div className="px-3 py-2 border-b border-warm-100 flex items-center gap-2">
                      <IconSearch size={14} className="text-warm-400" />
                      <input
                        type="text"
                        value={playerSearch}
                        onChange={(e) => setPlayerSearch(e.target.value)}
                        placeholder="Search players..."
                        className="w-full text-sm text-warm-900 placeholder:text-warm-400 bg-transparent outline-none"
                      />
                      {(recipientPlayerIds?.length ?? 0) > 0 && (
                        <span className="text-xs text-warm-400 flex-shrink-0 tabular-nums">{recipientPlayerIds!.length} selected</span>
                      )}
                    </div>
                    <div className="max-h-44 overflow-y-auto p-1.5">
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-0.5">
                        {filteredPlayers.map((player) => {
                          const isSelected = (recipientPlayerIds || []).includes(player.id);
                          return (
                            <button
                              key={player.id}
                              type="button"
                              onClick={() => {
                                const current = recipientPlayerIds || [];
                                if (isSelected) setRecipientPlayerIds(current.filter(id => id !== player.id));
                                else setRecipientPlayerIds([...current, player.id]);
                              }}
                              className={cn(
                                'flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-sm transition-all',
                                isSelected ? 'bg-primary-50 text-primary-900' : 'hover:bg-warm-50 text-warm-700'
                              )}
                            >
                              <div className={cn(
                                'w-3.5 h-3.5 rounded border flex items-center justify-center flex-shrink-0 transition-colors',
                                isSelected ? 'bg-primary-600 border-primary-600' : 'border-warm-300'
                              )}>
                                {isSelected && <IconCheck size={8} className="text-white" />}
                              </div>
                              <span className="truncate">{player.first_name || ''} {player.last_name || ''}</span>
                            </button>
                          );
                        })}
                      </div>
                      {filteredPlayers.length === 0 && (
                        <p className="text-sm text-warm-400 text-center py-3">No players found</p>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Toolbar: Attach + Tasks */}
            <div className="flex items-center gap-2 mb-4">
              {documents.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowDocPicker(!showDocPicker)}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border',
                    showDocPicker || selectedDocumentIds.length > 0
                      ? 'bg-primary-50 border-primary-300 text-primary-700'
                      : 'bg-white border-warm-200 text-warm-500 hover:bg-warm-50 hover:border-warm-300'
                  )}
                >
                  <IconPaperclip size={12} />
                  {selectedDocumentIds.length > 0 ? `${selectedDocumentIds.length} Attached` : 'Attach Documents'}
                  <IconChevronDown size={10} className={cn('transition-transform', showDocPicker && '-rotate-180')} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setInlineTasks(prev => [...prev, { title: '' }])}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border bg-white border-warm-200 text-warm-500 hover:bg-warm-50 hover:border-warm-300 transition-all"
              >
                <IconClipboardList size={12} />
                Add Task
                {inlineTasks.length > 0 && (
                  <span className="bg-warm-200 text-warm-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                    {inlineTasks.length}
                  </span>
                )}
              </button>
            </div>

            {/* Attached doc chips */}
            <AnimatePresence mode="popLayout">
              {selectedDocs.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-wrap gap-2 mb-4">
                  {selectedDocs.map((doc) => {
                    const colors = getFileColor(doc.file_type);
                    return (
                      <motion.div
                        key={doc.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        layout
                        className="flex items-center gap-2 pl-2.5 pr-1.5 py-1.5 rounded-lg border border-warm-200 bg-white shadow-sm"
                      >
                        <div className={cn('w-6 h-6 rounded flex items-center justify-center', colors.bg)}>
                          <span className={cn('text-[9px] font-bold leading-none', colors.text)}>{getFileLabel(doc.file_type)}</span>
                        </div>
                        <span className="text-xs font-medium text-warm-700 max-w-[160px] truncate">{doc.title}</span>
                        <span className="text-[10px] text-warm-400">{formatFileSize(doc.file_size)}</span>
                        <button
                          type="button"
                          onClick={() => setSelectedDocumentIds(prev => prev.filter(id => id !== doc.id))}
                          className="w-5 h-5 rounded flex items-center justify-center hover:bg-red-50 text-warm-400 hover:text-red-500 transition-colors"
                        >
                          <IconX size={10} />
                        </button>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Doc picker */}
            <AnimatePresence>
              {showDocPicker && availableDocs.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden mb-4"
                >
                  <div className="border border-warm-200 rounded-xl overflow-hidden bg-white">
                    {availableDocs.length > 3 && (
                      <div className="px-3 py-2 border-b border-warm-100 flex items-center gap-2">
                        <IconSearch size={14} className="text-warm-400" />
                        <input
                          type="text"
                          value={docSearch}
                          onChange={(e) => setDocSearch(e.target.value)}
                          placeholder="Search documents..."
                          className="w-full text-sm text-warm-900 placeholder:text-warm-400 bg-transparent outline-none"
                        />
                      </div>
                    )}
                    <div className="max-h-40 overflow-y-auto p-1.5">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-0.5">
                        {filteredAvailableDocs.map((doc) => {
                          const colors = getFileColor(doc.file_type);
                          return (
                            <button
                              key={doc.id}
                              type="button"
                              onClick={() => {
                                setSelectedDocumentIds(prev => [...prev, doc.id]);
                                if (availableDocs.length <= 1) setShowDocPicker(false);
                              }}
                              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-warm-50 active:bg-warm-100 text-left transition-colors"
                            >
                              <div className={cn('w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0', colors.bg)}>
                                <span className={cn('text-[9px] font-bold', colors.text)}>{getFileLabel(doc.file_type)}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-warm-700 truncate">{doc.title}</p>
                                <p className="text-[10px] text-warm-400">{formatFileSize(doc.file_size)}</p>
                              </div>
                              <IconPlus size={12} className="text-warm-400 flex-shrink-0" />
                            </button>
                          );
                        })}
                      </div>
                      {filteredAvailableDocs.length === 0 && (
                        <p className="text-xs text-warm-400 text-center py-3">
                          {docSearch ? 'No documents match' : 'All documents attached'}
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {showDocPicker && availableDocs.length === 0 && selectedDocs.length === 0 && (
              <p className="text-xs text-warm-400 flex items-center gap-1.5 mb-4">
                <IconFile size={12} />
                No team documents available yet.
              </p>
            )}

            {/* Inline tasks */}
            <AnimatePresence mode="popLayout">
              {inlineTasks.map((task, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8, height: 0 }}
                  transition={{ duration: 0.15 }}
                  layout
                  className="mb-2"
                >
                  <div className="flex items-start gap-2.5 p-3 border border-warm-200 rounded-xl bg-warm-50/30">
                    <span className="w-5 h-5 rounded-md bg-warm-200/60 flex items-center justify-center text-[10px] font-bold text-warm-500 flex-shrink-0 mt-0.5">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <input
                        type="text"
                        value={task.title}
                        onChange={(e) => {
                          const updated = inlineTasks.map((t, i) => i === index ? { ...t, title: e.target.value } : t);
                          setInlineTasks(updated);
                        }}
                        placeholder="Task title..."
                        className="w-full text-sm font-medium text-warm-900 placeholder:text-warm-400 bg-transparent outline-none"
                        autoFocus={task.title === ''}
                      />
                      <div className="flex items-center gap-3">
                        <input
                          type="text"
                          value={task.description || ''}
                          onChange={(e) => {
                            const updated = inlineTasks.map((t, i) => i === index ? { ...t, description: e.target.value || undefined } : t);
                            setInlineTasks(updated);
                          }}
                          placeholder="Description (optional)"
                          className="flex-1 text-xs text-warm-600 placeholder:text-warm-400 bg-transparent outline-none"
                        />
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <IconCalendar size={10} className="text-warm-400" />
                          <input
                            type="date"
                            value={task.dueDate || ''}
                            onChange={(e) => {
                              const updated = inlineTasks.map((t, i) => i === index ? { ...t, dueDate: e.target.value || undefined } : t);
                              setInlineTasks(updated);
                            }}
                            className="text-xs text-warm-600 bg-transparent outline-none border-none w-[105px]"
                          />
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setInlineTasks(prev => prev.filter((_, i) => i !== index))}
                      className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-red-50 text-warm-400 hover:text-red-500 transition-colors flex-shrink-0"
                    >
                      <IconX size={12} />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* ── Pinned footer ─────────────────────────────────── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 px-6 py-3 border-t border-warm-200 bg-warm-50/50 rounded-b-2xl flex-shrink-0">
            <div className="flex items-center gap-1.5 text-xs flex-wrap">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary-50/80 text-primary-700 font-medium">
                <IconUsers size={11} className="flex-shrink-0" />
                <span className="whitespace-nowrap">Sending to {recipientLabel}</span>
              </div>
              {selectedDocumentIds.length > 0 && (
                <span className="text-warm-500 whitespace-nowrap">{'\u00b7'} {selectedDocumentIds.length} doc{selectedDocumentIds.length !== 1 ? 's' : ''}</span>
              )}
              {inlineTasks.length > 0 && (
                <span className="text-warm-500 whitespace-nowrap">{'\u00b7'} {inlineTasks.length} task{inlineTasks.length !== 1 ? 's' : ''}</span>
              )}
              {requiresAcknowledgement && (
                <span className="text-warm-500 whitespace-nowrap">{'\u00b7'} ack required</span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-auto">
              <Button variant="secondary" type="button" size="sm" onClick={handleClose} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" size="sm" isLoading={loading} leftIcon={<IconSend size={13} />}>
                Post Announcement
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
