'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button, IconButton } from '@/components/ui/button';
import { useToast } from '@/components/ui/sonner';
import { IconPlus, IconSend, IconPaperclip, IconClipboardList, IconUsers, IconUser, IconCheck, IconX, IconSearch, IconFile, IconCalendar, IconChevronDown } from '@/components/icons';
import { createEnrichedAnnouncement } from '@/app/golf/actions/announcements';
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
} from '@/components/ui/drawer';

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
  id: string;
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
      <AnnouncementDialog
        isOpen={isOpen}
        players={players}
        documents={documents}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}

// ─── Dialog ──────────────────────────────────────────────────────────────────

function AnnouncementDialog({
  isOpen,
  players,
  documents,
  onClose,
}: CreateAnnouncementFlowProps & { isOpen: boolean; onClose: () => void }) {
  const prefersReducedMotion = useReducedMotion();
  const router = useRouter();
  const { showToast } = useToast();
  const titleRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

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

  // Focus title input on open. Drawer handles scroll lock, ESC, focus trap.
  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => titleRef.current?.focus(), 150);
    return () => clearTimeout(t);
  }, [isOpen]);

  function handleClose() {
    if (loading) return;
    onClose();
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
  const recipientCount = isAllTeam ? players.length : recipientPlayerIds!.length;

  return (
    <Drawer
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) handleClose();
      }}
    >
      <DrawerContent
        className="sm:max-w-lg sm:mx-auto sm:rounded-3xl p-0 overflow-hidden flex flex-col"
        aria-labelledby="ann-dialog-title"
      >
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          {/* ── Header ──────────────────────────────────────────── */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-warm-100 flex-shrink-0">
            <DrawerTitle id="ann-dialog-title" className="text-body font-medium text-warm-900 tracking-[-0.005em]">
              New Announcement
            </DrawerTitle>
            <IconButton variant="default"
              type="button"
              onClick={handleClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-warm-400 hover:text-warm-600 hover:bg-warm-100 transition-colors"
              aria-label="Close"
            >
              <IconX size={18} />
            </IconButton>
          </div>

          {/* ── Scrollable body ─────────────────────────────────── */}
          <div ref={scrollBodyRef} className="flex-1 overflow-y-auto overscroll-contain min-h-0 px-5 py-4 space-y-4">
            {/* Title input */}
            <input
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Announcement title"
              aria-label="Announcement title"
              autoCapitalize="sentences"
              autoCorrect="on"
              enterKeyHint="next"
              className="w-full text-body-lg font-medium text-warm-900 tracking-[-0.012em] placeholder:text-warm-300 bg-transparent outline-none border-none"
            />

            {/* Message textarea */}
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              aria-label="Announcement message"
              autoCapitalize="sentences"
              autoCorrect="on"
              className="w-full text-sm text-warm-700 placeholder:text-warm-400 bg-warm-50/60 rounded-xl border border-warm-200 px-3.5 py-2.5 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 transition-colors resize-none min-h-[80px]"
              placeholder="Write your message to the team..."
            />

            {/* ── Compact settings row ────────────────────────────── */}
            <div className="space-y-3">
              {/* Priority */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-warm-500 w-16 flex-shrink-0">Priority</span>
                <div className="flex gap-1 flex-wrap">
                  {urgencyOptions.map((opt) => {
                    const isActive = urgency === opt.value;
                    return (
                      <Button variant="ghost"
                        key={opt.value}
                        type="button"
                        onClick={() => setUrgency(opt.value)}
                        className={cn(
                          'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border',
                          isActive
                            ? `${opt.activeBg} ${opt.activeBorder} ${opt.activeText}`
                            : 'bg-white border-warm-200 text-warm-500 hover:bg-warm-50'
                        )}
                      >
                        <div className={cn('w-1.5 h-1.5 rounded-full', isActive ? opt.dot : 'bg-warm-300')} />
                        {opt.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Send to */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-warm-500 w-16 flex-shrink-0">Send to</span>
                <div className="flex gap-1">
                  <Button variant="primary"
                    type="button"
                    onClick={() => { setRecipientPlayerIds(null); setShowPlayerPicker(false); setPlayerSearch(''); }}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border',
                      isAllTeam
                        ? 'bg-primary-50 border-primary-300 text-primary-700'
                        : 'bg-white border-warm-200 text-warm-500 hover:bg-warm-50'
                    )}
                  >
                    <IconUsers size={11} />
                    All Team
                  </Button>
                  <Button variant="primary"
                    type="button"
                    onClick={() => {
                      if (isAllTeam) setRecipientPlayerIds([]);
                      setShowPlayerPicker(!showPlayerPicker);
                    }}
                    className={cn(
                      'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border',
                      !isAllTeam
                        ? 'bg-primary-50 border-primary-300 text-primary-700'
                        : 'bg-white border-warm-200 text-warm-500 hover:bg-warm-50'
                    )}
                  >
                    <IconUser size={11} />
                    Select
                    {!isAllTeam && recipientPlayerIds!.length > 0 && (
                      <span className="bg-primary-200 text-primary-800 text-micro font-medium px-1.5 rounded-full leading-tight">
                        {recipientPlayerIds!.length}
                      </span>
                    )}
                    <IconChevronDown size={10} className={cn('transition-transform', showPlayerPicker && !isAllTeam && '-rotate-180')} />
                  </Button>
                </div>
              </div>
            </div>

            {/* Player picker */}
            <AnimatePresence>
              {showPlayerPicker && !isAllTeam && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.2 })}
                  className="overflow-hidden"
                >
                  <div className="border border-warm-200 rounded-xl overflow-hidden bg-white">
                    <div className="px-3 py-2 border-b border-warm-100 flex items-center gap-2">
                      <IconSearch size={14} className="text-warm-400" />
                      <input
                        type="search"
                        value={playerSearch}
                        onChange={(e) => setPlayerSearch(e.target.value)}
                        placeholder="Search players..."
                        aria-label="Search players"
                        inputMode="search"
                        autoCorrect="off"
                        autoCapitalize="none"
                        spellCheck={false}
                        enterKeyHint="search"
                        className="w-full text-sm text-warm-900 placeholder:text-warm-400 bg-transparent outline-none"
                      />
                      {(recipientPlayerIds?.length ?? 0) > 0 && (
                        <span className="text-xs text-warm-400 flex-shrink-0 tabular-nums">{recipientPlayerIds!.length} selected</span>
                      )}
                    </div>
                    <div className="max-h-36 overflow-y-auto p-1.5">
                      <div className="grid grid-cols-2 gap-0.5">
                        {filteredPlayers.map((player) => {
                          const isSelected = (recipientPlayerIds || []).includes(player.id);
                          return (
                            <Button variant="primary"
                              key={player.id}
                              type="button"
                              onClick={() => {
                                const current = recipientPlayerIds || [];
                                if (isSelected) setRecipientPlayerIds(current.filter(id => id !== player.id));
                                else setRecipientPlayerIds([...current, player.id]);
                              }}
                              className={cn(
                                'flex items-center gap-2 px-2 py-1.5 rounded-lg text-left text-sm transition-colors',
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
                            </Button>
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

            {/* ── Toolbar divider ──────────────────────────────────── */}
            <div className="border-t border-warm-100 pt-3 flex items-center gap-2 flex-wrap">
              <Button variant="primary"
                type="button"
                onClick={() => setRequiresAcknowledgement(!requiresAcknowledgement)}
                className={cn(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border',
                  requiresAcknowledgement
                    ? 'bg-primary-50 border-primary-300 text-primary-700'
                    : 'bg-white border-warm-200 text-warm-500 hover:bg-warm-50'
                )}
              >
                {requiresAcknowledgement ? <IconCheck size={11} /> : <span className="w-3 h-3 rounded border border-warm-300" />}
                Require Ack
              </Button>

              {documents.length > 0 && (
                <Button variant="primary"
                  type="button"
                  onClick={() => setShowDocPicker(!showDocPicker)}
                  className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors border',
                    showDocPicker || selectedDocumentIds.length > 0
                      ? 'bg-primary-50 border-primary-300 text-primary-700'
                      : 'bg-white border-warm-200 text-warm-500 hover:bg-warm-50'
                  )}
                >
                  <IconPaperclip size={11} />
                  {selectedDocumentIds.length > 0 ? `${selectedDocumentIds.length} Doc${selectedDocumentIds.length !== 1 ? 's' : ''}` : 'Attach'}
                  <IconChevronDown size={10} className={cn('transition-transform', showDocPicker && '-rotate-180')} />
                </Button>
              )}

              <Button variant="ghost"
                type="button"
                onClick={() => setInlineTasks(prev => [...prev, { id: crypto.randomUUID(), title: '' }])}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border bg-white border-warm-200 text-warm-500 hover:bg-warm-50 transition-colors"
              >
                <IconClipboardList size={11} />
                Add Task
                {inlineTasks.length > 0 && (
                  <span className="bg-warm-200 text-warm-600 text-micro font-medium px-1.5 rounded-full leading-tight">
                    {inlineTasks.length}
                  </span>
                )}
              </Button>
            </div>

            {/* Attached doc chips */}
            <AnimatePresence mode="popLayout">
              {selectedDocs.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-wrap gap-1.5">
                  {selectedDocs.map((doc) => {
                    const colors = getFileColor(doc.file_type);
                    return (
                      <motion.div
                        key={doc.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        layout
                        className="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg border border-warm-200 bg-white text-xs"
                      >
                        <div className={cn('w-5 h-5 rounded flex items-center justify-center', colors.bg)}>
                          <span className={cn('text-eyebrow font-medium leading-none', colors.text)}>{getFileLabel(doc.file_type)}</span>
                        </div>
                        <span className="font-medium text-warm-700 max-w-[120px] truncate">{doc.title}</span>
                        <IconButton variant="default" aria-label="Close"
                          type="button"
                          onClick={() => setSelectedDocumentIds(prev => prev.filter(id => id !== doc.id))}
                          className="w-4 h-4 rounded flex items-center justify-center hover:bg-red-50 text-warm-400 hover:text-red-500 transition-colors"
                        >
                          <IconX size={9} />
                        </IconButton>
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
                  transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.2 })}
                  className="overflow-hidden"
                >
                  <div className="border border-warm-200 rounded-xl overflow-hidden bg-white">
                    {availableDocs.length > 3 && (
                      <div className="px-3 py-2 border-b border-warm-100 flex items-center gap-2">
                        <IconSearch size={14} className="text-warm-400" />
                        <input
                          type="search"
                          value={docSearch}
                          onChange={(e) => setDocSearch(e.target.value)}
                          placeholder="Search documents..."
                          aria-label="Search documents"
                          inputMode="search"
                          autoCorrect="off"
                          autoCapitalize="none"
                          spellCheck={false}
                          enterKeyHint="search"
                          className="w-full text-sm text-warm-900 placeholder:text-warm-400 bg-transparent outline-none"
                        />
                      </div>
                    )}
                    <div className="max-h-36 overflow-y-auto p-1.5">
                      <div className="grid grid-cols-1 gap-0.5">
                        {filteredAvailableDocs.map((doc) => {
                          const colors = getFileColor(doc.file_type);
                          return (
                            <Button variant="ghost"
                              key={doc.id}
                              type="button"
                              onClick={() => {
                                setSelectedDocumentIds(prev => [...prev, doc.id]);
                                if (availableDocs.length <= 1) setShowDocPicker(false);
                              }}
                              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-warm-50 active:bg-warm-100 text-left transition-colors"
                            >
                              <div className={cn('w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0', colors.bg)}>
                                <span className={cn('text-eyebrow font-medium', colors.text)}>{getFileLabel(doc.file_type)}</span>
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-warm-700 truncate">{doc.title}</p>
                                <p className="text-micro text-warm-400">{formatFileSize(doc.file_size)}</p>
                              </div>
                              <IconPlus size={12} className="text-warm-400 flex-shrink-0" />
                            </Button>
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
              <p className="text-xs text-warm-400 flex items-center gap-1.5">
                <IconFile size={12} />
                No team documents available yet.
              </p>
            )}

            {/* Inline tasks */}
            <AnimatePresence mode="popLayout">
              {inlineTasks.map((task, index) => (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8, height: 0 }}
                  transition={prefersReducedMotion ? { duration: 0 } : ({ duration: 0.15 })}
                  layout
                >
                  <div className="flex items-start gap-2 p-2.5 border border-warm-200 rounded-xl bg-warm-50/30">
                    <span className="w-5 h-5 rounded-md bg-warm-200/60 flex items-center justify-center text-micro font-medium text-warm-500 flex-shrink-0 mt-0.5">
                      {index + 1}
                    </span>
                    <div className="flex-1 min-w-0 space-y-1">
                      <input
                        type="text"
                        value={task.title}
                        onChange={(e) => {
                          const updated = inlineTasks.map((t, i) => i === index ? { ...t, title: e.target.value } : t);
                          setInlineTasks(updated);
                        }}
                        placeholder="Task title..."
                        aria-label={`Task ${index + 1} title`}
                        autoCapitalize="sentences"
                        autoCorrect="on"
                        enterKeyHint="next"
                        className="w-full text-sm font-medium text-warm-900 placeholder:text-warm-400 bg-transparent outline-none"
                        // eslint-disable-next-line jsx-a11y/no-autofocus
                        autoFocus={task.title === ''}
                      />
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={task.description || ''}
                          onChange={(e) => {
                            const updated = inlineTasks.map((t, i) => i === index ? { ...t, description: e.target.value || undefined } : t);
                            setInlineTasks(updated);
                          }}
                          placeholder="Description (optional)"
                          aria-label={`Task ${index + 1} description`}
                          autoCapitalize="sentences"
                          autoCorrect="on"
                          enterKeyHint="next"
                          className="flex-1 text-xs text-warm-600 placeholder:text-warm-400 bg-transparent outline-none min-w-0"
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
                    <IconButton variant="default" aria-label="Close"
                      type="button"
                      onClick={() => setInlineTasks(prev => prev.filter((_, i) => i !== index))}
                      className="w-5 h-5 rounded-md flex items-center justify-center hover:bg-red-50 text-warm-400 hover:text-red-500 transition-colors flex-shrink-0"
                    >
                      <IconX size={11} />
                    </IconButton>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>

          {/* ── Footer ─────────────────────────────────────────── */}
          <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-warm-200 bg-warm-50/50 rounded-b-2xl flex-shrink-0">
            <div className="flex items-center gap-1.5 text-xs text-warm-500 min-w-0">
              <IconUsers size={11} className="flex-shrink-0 text-primary-600" />
              <span className="truncate">
                {recipientCount} player{recipientCount !== 1 ? 's' : ''}
                {selectedDocumentIds.length > 0 && ` \u00b7 ${selectedDocumentIds.length} doc${selectedDocumentIds.length !== 1 ? 's' : ''}`}
                {inlineTasks.length > 0 && ` \u00b7 ${inlineTasks.length} task${inlineTasks.length !== 1 ? 's' : ''}`}
                {requiresAcknowledgement && ' \u00b7 ack'}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button variant="secondary" type="button" size="sm" onClick={handleClose} disabled={loading}>
                Cancel
              </Button>
              <Button type="submit" size="sm" isLoading={loading} leftIcon={<IconSend size={13} />}>
                Post
              </Button>
            </div>
          </div>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
