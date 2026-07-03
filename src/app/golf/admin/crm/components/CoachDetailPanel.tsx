'use client';

import { useState, useEffect, useMemo, useRef, useId } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { useFocusTrap } from '@/hooks/use-focus-trap';
import {
  IconX,
  IconMail,
  IconPhone,
  IconExternalLink,
  IconSend,
  IconPlus,
  IconClock,
  IconFileText,
  IconUsers,
  IconCheck,
  IconCalendar,
  IconStar,
  IconChevronDown,
  IconActivity as Activity,
  IconHash as Tag,
  IconFlag as Flag,
  IconClipboard as ClipboardCheck,
  IconVideo,
  IconLayoutGrid,
  IconNote as StickyNote,
  IconPencil as Pencil,
  IconUser,
} from '@/components/icons';
import type { Coach, CoachStatus } from '../crm-config';
import { STATUS_COLORS, CRM_ASSIGNEES, type CrmAssignee } from '../crm-config';
import { setCoachAssignee } from '@/app/golf/actions/crm-assignee';
import { ToastProvider, useToast } from './Toast';
import { CoachTimeline } from './timeline/CoachTimeline';
import { NotesPanel } from './notes/NotesPanel';
import { TasksPanel } from './tasks/TasksPanel';
import { Button, IconButton } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

// ============================================================================
// TYPES
// ============================================================================
interface CoachDetailPanelProps {
  coach: Coach;
  onClose: () => void;
  onUpdate: (updates: Partial<Coach>) => void;
  statusConfig: Record<CoachStatus, { label: string; color: string; bgColor: string; iconLabel: React.ReactNode; icon: React.ReactNode }>;
  priorityConfig: Record<number, { label: string; color: string; bgColor: string; iconLabel: React.ReactNode }>;
  // "Open in Gmail" manual-send. When provided AND the coach has an email, the
  // sticky footer surfaces a secondary "Gmail" button that opens a pre-filled
  // Gmail compose window (the parent owns arming the template + logging the
  // touch). Optional so existing usages compile unchanged.
  onOpenInGmail?: (coach: Coach) => void;
  // When true, that button SENDS directly via the Gmail API (no compose tab) —
  // relabels it "Send" and updates the tooltip so the action is unambiguous.
  gmailDirectSend?: boolean;
  // Manual work-division label change. Fired after the assignee dropdown in the
  // header is changed (and the server action has been dispatched) so the parent
  // can sync its own list state. Optional so existing usages compile unchanged.
  onAssigneeChange?: (coachId: string, assignee: string | null) => void;
}

// ============================================================================
// CONSTANTS
// ============================================================================
const CONTACT_TYPES = [
  { value: 'email', label: 'Email', Icon: IconMail, dotColor: 'bg-blue-500' },
  { value: 'call', label: 'Call', Icon: IconPhone, dotColor: 'bg-primary-500' },
  { value: 'demo', label: 'Demo', Icon: IconVideo, dotColor: 'bg-violet-500' },
  { value: 'meeting', label: 'Meeting', Icon: IconUsers, dotColor: 'bg-cyan-500' },
  { value: 'note', label: 'Note', Icon: StickyNote, dotColor: 'bg-warm-400' },
] as const;

const ALL_STATUSES: readonly string[] = [
  'new_lead', 'contacted', 'engaged', 'proposal', 'won', 'lost', 'nurture',
];

// ============================================================================
// COMPONENT
// ============================================================================
export function CoachDetailPanel(props: CoachDetailPanelProps) {
  return (
    <ToastProvider>
      <CoachDetailPanelInner {...props} />
    </ToastProvider>
  );
}

function CoachDetailPanelInner({
  coach: coachProp,
  onClose,
  onUpdate,
  statusConfig,
  priorityConfig,
  onOpenInGmail,
  gmailDirectSend,
  onAssigneeChange,
}: CoachDetailPanelProps) {
  const { toast } = useToast();

  // The list-view fetch is narrowed for payload size, so heavy columns
  // (internal_comments, budget_range, timezone, athletics_url,
  // best_contact_*) arrive as nulls in the prop. We hydrate the full row
  // once when the panel opens and overlay onto the prop so the UI sees
  // real values.
  const [hydratedCoach, setHydratedCoach] = useState<Partial<Coach> | null>(null);
  const coach = useMemo<Coach>(
    () => (hydratedCoach ? { ...coachProp, ...hydratedCoach } : coachProp),
    [coachProp, hydratedCoach],
  );

  // Bumped to force the <CoachTimeline> component to refetch (e.g. after the
  // user logs a new contact via the inline form).
  const [timelineRefreshKey, setTimelineRefreshKey] = useState(0);

  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(coach.notes || '');

  // Editable contact info
  const [editingContact, setEditingContact] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: coach.name,
    title: coach.title || '',
    email: coach.email || '',
    phone: coach.phone || '',
    school: coach.school,
  });

  const [showContactForm, setShowContactForm] = useState(false);
  const [newContact, setNewContact] = useState({
    type: 'email' as typeof CONTACT_TYPES[number]['value'],
    notes: '',
    nextAction: '',
    nextActionDate: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const [newTag, setNewTag] = useState('');
  const [editingFollowUp, setEditingFollowUp] = useState(false);
  const [followUpDate, setFollowUpDate] = useState(coach.next_follow_up_at?.split('T')[0] || '');

  // New: collapsible Quick Info
  const [showInfo, setShowInfo] = useState(false);

  // Assignee (manual work-division label). Optimistic local mirror of
  // coach.assigned_to so the dropdown reflects the choice immediately while the
  // server action persists in the background.
  const [assignee, setAssignee] = useState<string | null>(coach.assigned_to ?? null);
  const [assigneeSaving, setAssigneeSaving] = useState(false);

  const supabase = createClient();

  // --------------------------------------------------------------------------
  // Dialog accessibility — focus trap, Escape-to-close, scroll-lock, and
  // focus restoration to the trigger element on close. The panel is mounted
  // by the parent only while open, so the trap is always active here; routing
  // its close through `handleClose` preserves the exit animation.
  // --------------------------------------------------------------------------
  const titleId = useId();

  // Downward swipe-to-close for the mobile bottom sheet. We track the touch
  // start Y and the live drag offset; on release a sufficient downward drag
  // (or flick) dismisses, otherwise we spring back to 0.
  const [dragOffset, setDragOffset] = useState(0);
  const touchStartY = useRef<number | null>(null);
  const touchStartTime = useRef(0);

  // --------------------------------------------------------------------------
  // Hydrate full coach row on open (list view fetches a narrow column set).
  // --------------------------------------------------------------------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('crm_coaches')
        .select(
          'internal_comments, budget_range, timezone, best_contact_method, best_contact_time, athletics_url, highlight_color, source, is_archived, archived_at, archived_by',
        )
        .eq('id', coachProp.id)
        .maybeSingle();
      if (!cancelled && data) {
        setHydratedCoach(data as Partial<Coach>);
      }
    })();
    return () => { cancelled = true; };
  }, [coachProp.id, supabase]);

  // --------------------------------------------------------------------------
  // Reset transient form state when the panel switches between coaches.
  // Timeline data itself is owned by <CoachTimeline coachId=... /> below.
  // --------------------------------------------------------------------------
  useEffect(() => { const t = setTimeout(() => setIsVisible(true), 10); return () => clearTimeout(t); }, []);
  useEffect(() => {
    setNotesValue(coach.notes || '');
    setFollowUpDate(coach.next_follow_up_at?.split('T')[0] || '');
    setContactForm({ name: coach.name, title: coach.title || '', email: coach.email || '', phone: coach.phone || '', school: coach.school });
    setEditingContact(false);
    setAssignee(coach.assigned_to ?? null);
  }, [coach.id, coach.name, coach.title, coach.email, coach.phone, coach.school, coach.notes, coach.next_follow_up_at, coach.assigned_to]);

  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------
  const handleClose = () => { setIsVisible(false); setTimeout(onClose, 200); };

  // Focus trap + Escape + scroll-lock + focus-restore. Mounted == open, so we
  // pass `true`; closing animates out via handleClose before the parent unmounts.
  const { modalRef } = useFocusTrap(true, handleClose);

  // ---- Mobile bottom-sheet swipe-to-dismiss --------------------------------
  const SWIPE_CLOSE_PX = 96;       // drag far enough to dismiss
  const FLICK_VELOCITY = 0.5;      // or flick fast enough (px/ms)
  const handleTouchStart = (e: React.TouchEvent) => {
    // Only initiate a sheet drag from the grab-handle / header region; ignore
    // touches that begin inside the scrollable body so list scrolling works.
    touchStartY.current = e.touches[0]?.clientY ?? null;
    touchStartTime.current = Date.now();
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartY.current === null) return;
    const delta = (e.touches[0]?.clientY ?? 0) - touchStartY.current;
    setDragOffset(Math.max(0, delta)); // downward only
  };
  const handleTouchEnd = () => {
    if (touchStartY.current === null) return;
    const elapsed = Math.max(1, Date.now() - touchStartTime.current);
    const velocity = dragOffset / elapsed;
    if (dragOffset > SWIPE_CLOSE_PX || velocity > FLICK_VELOCITY) {
      handleClose();
    }
    setDragOffset(0);
    touchStartY.current = null;
  };

  const saveNotes = () => {
    onUpdate({ notes: notesValue || null });
    setEditingNotes(false);
    toast('Notes saved', 'success');
  };

  const saveContactInfo = () => {
    if (!contactForm.name.trim() || !contactForm.school.trim()) return;
    onUpdate({
      name: contactForm.name.trim(),
      title: contactForm.title.trim() || null,
      email: contactForm.email.trim() || null,
      phone: contactForm.phone.trim() || null,
      school: contactForm.school.trim(),
    });
    setEditingContact(false);
  };

  const cancelEditContact = () => {
    setContactForm({ name: coach.name, title: coach.title || '', email: coach.email || '', phone: coach.phone || '', school: coach.school });
    setEditingContact(false);
  };

  const handleStatusChange = (newStatus: CoachStatus) => {
    onUpdate({ status: newStatus });
    toast(`Status updated to ${statusConfig[newStatus]?.label || newStatus}`, 'success');
  };

  const handleAssigneeChange = async (next: string | null) => {
    const previous = assignee;
    setAssignee(next); // optimistic
    setAssigneeSaving(true);
    try {
      const { ok } = await setCoachAssignee({ coach_id: coach.id, assignee: next });
      if (!ok) {
        setAssignee(previous); // rollback
        toast('Failed to update assignee', 'error');
        return;
      }
      onAssigneeChange?.(coach.id, next);
      toast(next ? `Assigned to ${next}` : 'Unassigned', 'success');
    } catch {
      setAssignee(previous); // rollback
      toast('Failed to update assignee', 'error');
    } finally {
      setAssigneeSaving(false);
    }
  };

  const submitContact = async () => {
    setSubmitting(true);
    try {
      const { error } = await supabase.from('crm_contact_log').insert({
        coach_id: coach.id,
        contact_type: newContact.type as 'email' | 'call' | 'demo' | 'meeting' | 'note',
        notes: newContact.notes || null,
        next_action: newContact.nextAction || null,
        next_action_date: newContact.nextActionDate || null,
      });
      if (error) throw error;

      const updates: Partial<Coach> = { last_contacted_at: new Date().toISOString() };
      if (newContact.nextActionDate) updates.next_follow_up_at = newContact.nextActionDate;
      if (coach.status === 'new_lead') updates.status = 'contacted' as CoachStatus;
      onUpdate(updates);
      setNewContact({ type: 'email', notes: '', nextAction: '', nextActionDate: '' });
      setShowContactForm(false);
      setTimelineRefreshKey((k) => k + 1);
      toast('Contact logged', 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to log contact';
      toast(message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const addTag = () => {
    if (!newTag.trim()) return;
    const current = coach.tags || [];
    if (!current.includes(newTag.trim())) onUpdate({ tags: [...current, newTag.trim()] });
    setNewTag('');
  };
  const removeTag = (tag: string) => onUpdate({ tags: (coach.tags || []).filter(t => t !== tag) });

  const saveFollowUp = () => {
    onUpdate({ next_follow_up_at: followUpDate ? new Date(followUpDate).toISOString() : null });
    setEditingFollowUp(false);
    toast('Follow-up scheduled', 'success');
  };

  // --------------------------------------------------------------------------
  // Formatting helpers
  // --------------------------------------------------------------------------
  const formatShort = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const isOverdue = coach.next_follow_up_at && new Date(coach.next_follow_up_at) < new Date();

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  return (
    <>
      {/* Backdrop / overlay — dismisses on click; Escape handled by useFocusTrap */}
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- modal backdrop dismisses on click; Escape key is handled by the focus trap */}
      <div className={cn('fixed inset-0 z-40 transition-opacity duration-200', isVisible ? 'opacity-100' : 'opacity-0')} onClick={handleClose}>
        <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px]" />
      </div>

      {/* Panel — desktop (>=lg): right-side slide-over. Mobile (<lg): full-height
          bottom sheet with a drag-handle, rounded top, and swipe-to-dismiss. */}
      <aside
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={dragOffset > 0 ? { transform: `translateY(${dragOffset}px)`, transition: 'none' } : undefined}
        className={cn(
          'fixed z-50 bg-[#FFFEF8] shadow-2xl flex flex-col',
          // Mobile bottom sheet
          'inset-x-0 bottom-0 top-12 w-full rounded-t-3xl border-t border-warm-200/60',
          'transition-transform duration-300 [transition-timing-function:cubic-bezier(0.32,0.72,0,1)]',
          isVisible ? 'translate-y-0' : 'translate-y-full',
          // Desktop right slide-over (overrides the mobile sheet positioning)
          'lg:inset-y-0 lg:right-0 lg:left-auto lg:top-0 lg:bottom-0 lg:max-w-lg',
          'lg:rounded-none lg:border-t-0 lg:border-l lg:border-warm-200/60',
          isVisible ? 'lg:translate-x-0 lg:translate-y-0' : 'lg:translate-x-full lg:translate-y-0',
        )}
      >
        {/* Drag-handle affordance + grab zone — mobile bottom-sheet only.
            Touch handlers live here (not the whole sheet) so swipe-to-dismiss
            never competes with scrolling inside the timeline body. */}
        <div
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          className="lg:hidden flex-shrink-0 flex justify-center items-center min-h-[28px] pt-2.5 pb-1 cursor-grab active:cursor-grabbing touch-none"
        >
          <span className="h-1.5 w-10 rounded-full bg-warm-300" aria-hidden="true" />
        </div>

        {/* Primary accent bar */}
        <div className="h-1 bg-gradient-to-r from-primary-500 to-primary-600 flex-shrink-0" />

        {/* ================================================================
            1. HEADER (compact)
            ================================================================ */}
        <div className="glass-standard px-5 pt-4 pb-3 flex-shrink-0">
          {editingContact ? (
            <div className="space-y-2">
              <div className="flex items-start justify-between">
                <div className="flex-1 space-y-2">
                  <Input id={titleId} type="text" value={contactForm.name} onChange={e => setContactForm({ ...contactForm, name: e.target.value })}
                    aria-label="Coach name" placeholder="Name *" className="w-full bg-cream-50 border border-warm-200/60 rounded-lg px-3 py-2 text-sm font-bold text-warm-900 focus:outline-none focus:ring-2 focus:ring-primary-500/30 min-h-0" />
                  <Input type="text" value={contactForm.title} onChange={e => setContactForm({ ...contactForm, title: e.target.value })}
                    placeholder="Title (e.g. Head Coach)" className="w-full bg-cream-50 border border-warm-200/60 rounded-lg px-3 py-2 text-sm text-warm-600 focus:outline-none focus:ring-2 focus:ring-primary-500/30 min-h-0" />
                  <Input type="text" value={contactForm.school} onChange={e => setContactForm({ ...contactForm, school: e.target.value })}
                    placeholder="School *" className="w-full bg-cream-50 border border-warm-200/60 rounded-lg px-3 py-2 text-sm font-medium text-warm-900 focus:outline-none focus:ring-2 focus:ring-primary-500/30 min-h-0" />
                  <div className="flex items-center gap-1.5">
                    <IconMail size={12} className="text-blue-500 flex-shrink-0" />
                    <Input type="email" value={contactForm.email} onChange={e => setContactForm({ ...contactForm, email: e.target.value })}
                      placeholder="Email address" className="flex-1 bg-cream-50 border border-warm-200/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 min-h-0" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <IconPhone size={12} className="text-primary-500 flex-shrink-0" />
                    <Input type="tel" value={contactForm.phone} onChange={e => setContactForm({ ...contactForm, phone: e.target.value })}
                      placeholder="Phone number" className="flex-1 bg-cream-50 border border-warm-200/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30 min-h-0" />
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button variant="primary" onClick={saveContactInfo} disabled={!contactForm.name.trim() || !contactForm.school.trim()}
                      className="px-3 py-1.5 bg-primary-600 text-white rounded-xl text-xs font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50 shadow-sm">
                      Save
                    </Button>
                    <Button variant="ghost" onClick={cancelEditContact} className="px-3 py-1.5 text-xs text-warm-600 hover:text-warm-800">Cancel</Button>
                  </div>
                </div>
                <IconButton variant="default" onClick={handleClose} aria-label="Close" className="p-1.5 rounded-md hover:bg-warm-100 transition-colors text-warm-500 hover:text-warm-900 ml-2 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 flex items-center justify-center">
                  <IconX size={14} aria-hidden="true" />
                </IconButton>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <IconButton variant="default"
                      onClick={() => onUpdate({ is_starred: !coach.is_starred })}
                      aria-label={coach.is_starred ? 'Unstar coach' : 'Star coach'}
                      aria-pressed={coach.is_starred}
                      className="hover:scale-110 active:scale-95 transition-all duration-200 flex-shrink-0"
                    >
                      <IconStar size={18} className={cn(
                        'transition-all duration-200',
                        coach.is_starred ? 'fill-amber-400 text-amber-400 drop-shadow-sm' : 'text-warm-300 hover:text-amber-300'
                      )} />
                    </IconButton>
                    <h2 id={titleId} className="text-lg font-semibold text-warm-900 truncate">{coach.name}</h2>
                  </div>
                  <p className="text-sm text-warm-500 ml-[26px]">
                    {coach.school}
                    {coach.conference && <><span className="text-warm-300 mx-1.5">&middot;</span>{coach.conference}</>}
                    {coach.division && (
                      <>
                        <span className="text-warm-300 mx-1.5">&middot;</span>
                        <span className={cn('px-1.5 py-0.5 rounded text-micro font-bold',
                          coach.division === 'D2' ? 'bg-blue-100 text-blue-700' : 'bg-primary-100 text-primary-700')}>
                          {coach.division}
                        </span>
                      </>
                    )}
                  </p>
                  <div className="flex items-center gap-2 mt-2 ml-[26px]">
                    <NativeSelect value={coach.status} onChange={e => handleStatusChange(e.target.value as CoachStatus)}
                      aria-label="Coach status"
                      style={{}}
                      className={cn(
                        'w-auto min-h-0 appearance-none cursor-pointer px-3 py-1 rounded-full text-xs font-semibold border transition-colors',
                        'focus:outline-none focus:ring-2 focus:ring-primary-500/30',
                        STATUS_COLORS[coach.status]?.bg,
                        STATUS_COLORS[coach.status]?.text,
                        STATUS_COLORS[coach.status]?.border,
                      )}>
                      {ALL_STATUSES.map(s => <option key={s} value={s}>{statusConfig[s as CoachStatus]?.label}</option>)}
                    </NativeSelect>
                    <NativeSelect value={coach.priority} onChange={e => onUpdate({ priority: parseInt(e.target.value) })}
                      aria-label="Coach priority"
                      style={{}}
                      className="w-auto min-h-0 appearance-none cursor-pointer px-2.5 py-1 rounded-full text-xs font-medium border border-warm-200/60 bg-cream-50 focus:outline-none focus:ring-2 focus:ring-primary-500/30 transition-all duration-200">
                      <option value={0}>Normal</option>
                      <option value={1}>High</option>
                      <option value={2}>Hot</option>
                    </NativeSelect>
                    {coach.priority > 0 && priorityConfig[coach.priority] && (
                      <span className={cn('flex items-center gap-1 text-xs', priorityConfig[coach.priority]?.color)}>
                        {priorityConfig[coach.priority]?.iconLabel}
                      </span>
                    )}
                  </div>
                  {/* Assignee — manual work-division label (one shared login). */}
                  <div className="flex items-center gap-1.5 mt-2 ml-[26px]">
                    <IconUser size={12} className="text-warm-400 flex-shrink-0" aria-hidden="true" />
                    <div className="relative inline-flex items-center">
                      <NativeSelect
                        value={assignee ?? ''}
                        onChange={e => handleAssigneeChange(e.target.value === '' ? null : (e.target.value as CrmAssignee))}
                        disabled={assigneeSaving}
                        aria-label="Assigned to"
                        style={{}}
                        className={cn(
                          'w-auto min-h-0 appearance-none cursor-pointer pl-2.5 pr-7 py-1 rounded-full text-xs font-medium border transition-colors',
                          'focus:outline-none focus:ring-2 focus:ring-primary-500/30 disabled:opacity-50',
                          assignee
                            ? 'bg-primary-50 text-primary-700 border-primary-200'
                            : 'bg-cream-50 text-warm-500 border-warm-200/60',
                        )}
                      >
                        <option value="">Unassigned</option>
                        {CRM_ASSIGNEES.map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </NativeSelect>
                      <IconChevronDown
                        size={12}
                        className="pointer-events-none absolute right-2 text-warm-400"
                        aria-hidden="true"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <IconButton variant="default" onClick={() => setEditingContact(true)}
                    aria-label="Edit contact info"
                    className="p-1.5 rounded-md hover:bg-warm-100 transition-colors text-warm-500 hover:text-warm-900 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 flex items-center justify-center"
                    title="Edit contact info">
                    <Pencil size={14} aria-hidden="true" />
                  </IconButton>
                  <IconButton variant="default" onClick={handleClose} aria-label="Close" className="p-1.5 rounded-md hover:bg-warm-100 transition-colors text-warm-500 hover:text-warm-900 min-h-[44px] min-w-[44px] lg:min-h-0 lg:min-w-0 flex items-center justify-center">
                    <IconX size={14} aria-hidden="true" />
                  </IconButton>
                </div>
              </div>

              {/* Overdue alert — subtle banner inside header */}
              {isOverdue && (
                <div className="mt-2 ml-[26px] px-2.5 py-1.5 rounded-lg bg-red-50/80 border border-red-200/40 flex items-center gap-1.5">
                  <IconClock size={12} className="text-red-500" />
                  <span className="text-eyebrow font-medium text-red-600">Overdue: {coach.next_follow_up_at ? formatShort(coach.next_follow_up_at) : ''}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* ================================================================
            2. CONTACT BAR (single row)
            ================================================================ */}
        {!editingContact && (
          <div className="flex items-center gap-2 px-5 py-2.5 border-b border-warm-200/30 glass-subtle flex-shrink-0 flex-wrap">
            {coach.email ? (
              <a href={`mailto:${coach.email}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-medium transition-colors">
                <IconMail size={12} /> {coach.email}
              </a>
            ) : (
              <Button variant="ghost" onClick={() => setEditingContact(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-warm-300 text-xs text-warm-400 hover:border-warm-400 hover:text-warm-500 transition-colors">
                <IconMail size={12} /> Add email
              </Button>
            )}
            {coach.phone ? (
              <a href={`tel:${coach.phone}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-50 text-primary-700 hover:bg-primary-100 text-xs font-medium transition-colors">
                <IconPhone size={12} /> {coach.phone}
              </a>
            ) : (
              <Button variant="ghost" onClick={() => setEditingContact(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-warm-300 text-xs text-warm-400 hover:border-warm-400 hover:text-warm-500 transition-colors">
                <IconPhone size={12} /> Add phone
              </Button>
            )}
            {coach.athletics_url && (
              <a href={coach.athletics_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-50 text-violet-700 hover:bg-violet-100 text-xs font-medium transition-colors">
                <IconExternalLink size={12} /> Golf Staff Page
              </a>
            )}
          </div>
        )}

        {/* ================================================================
            3. QUICK INFO (collapsible, default collapsed)
            ================================================================ */}
        <div className="flex-shrink-0 border-b border-warm-200/30">
          <Button variant="ghost"
            onClick={() => setShowInfo(!showInfo)}
            aria-expanded={showInfo}
            className="w-full flex items-center justify-between px-5 py-2.5 text-xs font-medium text-warm-500 hover:text-warm-700 hover:bg-cream-100 transition-colors"
          >
            <span className="flex items-center gap-1.5">
              <ClipboardCheck size={12} className="text-warm-400" />
              Quick Info
            </span>
            <IconChevronDown size={14} aria-hidden="true" className={cn('text-warm-400 transition-transform duration-200', showInfo && 'rotate-180')} />
          </Button>

          {showInfo && (
            <div className="px-5 pb-3 space-y-2">
              {/* Notes (inline editable) */}
              <div className="flex items-start gap-2">
                <span className="text-xs text-warm-400 w-20 flex-shrink-0 pt-0.5 flex items-center gap-1">
                  <IconFileText size={11} /> Notes
                </span>
                <div className="flex-1 min-w-0">
                  {editingNotes ? (
                    <div className="space-y-1.5">
                      {/* eslint-disable-next-line jsx-a11y/no-autofocus -- intentional default focus in dialog */}
                      <Textarea value={notesValue} onChange={e => setNotesValue(e.target.value)} autoFocus rows={3}
                        className="w-full bg-cream-50 border border-warm-200/60 rounded-lg px-2.5 py-1.5 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/30" placeholder="Add notes..." />
                      <div className="flex gap-1.5">
                        <Button variant="primary" onClick={saveNotes} className="px-2 py-1 bg-primary-600 text-white rounded-md text-eyebrow font-semibold hover:bg-primary-700 transition-colors">Save</Button>
                        <Button variant="ghost" onClick={() => { setEditingNotes(false); setNotesValue(coach.notes || ''); }} className="px-2 py-1 text-eyebrow text-warm-500 hover:text-warm-700">Cancel</Button>
                      </div>
                    </div>
                  ) : (
                    <Button variant="ghost" onClick={() => setEditingNotes(true)} className="text-xs text-warm-600 text-left hover:text-warm-800 transition-colors w-full">
                      {coach.notes || <span className="text-warm-400 italic">Add notes...</span>}
                    </Button>
                  )}
                </div>
              </div>

              {/* Tags (inline chips) */}
              <div className="flex items-start gap-2">
                <span className="text-xs text-warm-400 w-20 flex-shrink-0 pt-0.5 flex items-center gap-1">
                  <Tag size={11} /> Tags
                </span>
                <div className="flex-1 flex flex-wrap items-center gap-1">
                  {(coach.tags || []).map((tag, i) => (
                    <span key={i} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-primary-50 text-primary-700 rounded-md text-eyebrow font-medium">
                      {tag}
                      <IconButton variant="default" onClick={() => removeTag(tag)} aria-label={`Remove tag ${tag}`} className="hover:text-red-600 transition-colors"><IconX size={8} aria-hidden="true" /></IconButton>
                    </span>
                  ))}
                  <div className="flex items-center gap-0.5">
                    <Input id="tag-input" type="text" value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()}
                      placeholder="+" className="bg-transparent border-none rounded-none min-h-0 px-0 py-0 text-eyebrow text-warm-400 w-12 focus:outline-none focus:ring-0 focus:w-20 transition-all placeholder:text-warm-300" />
                    {newTag && <IconButton variant="primary" onClick={addTag} aria-label="Add tag" className="w-4 h-4 rounded bg-primary-100 text-primary-600 flex items-center justify-center hover:bg-primary-200 transition-colors"><IconPlus size={8} aria-hidden="true" /></IconButton>}
                  </div>
                </div>
              </div>

              {/* One-line info rows */}
              <QuickInfoRow icon={<Flag size={11} />} label="Program" value={coach.program === 'mens' ? "Men's" : coach.program === 'womens' ? "Women's" : coach.program ? 'Both' : null} />
              <QuickInfoRow icon={<IconUsers size={11} />} label="Team Size" value={coach.team_size?.toString()} />
              <QuickInfoRow icon={<IconLayoutGrid size={11} />} label="Software" value={coach.current_software} />
              <QuickInfoRow icon={<IconClock size={11} />} label="Timeline" value={coach.decision_timeline} />

              {/* Follow-up date */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-warm-400 w-20 flex-shrink-0 flex items-center gap-1">
                  <IconCalendar size={11} /> Follow-up
                </span>
                {editingFollowUp ? (
                  <div className="flex items-center gap-1">
                    <Input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)}
                      className="bg-cream-50 border border-warm-200/60 rounded-md px-2 py-1 text-xs min-h-0 focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
                    <IconButton variant="default" onClick={saveFollowUp} aria-label="Save follow-up date" className="text-primary-600"><IconCheck size={12} aria-hidden="true" /></IconButton>
                    <IconButton variant="default" onClick={() => setEditingFollowUp(false)} aria-label="Cancel" className="text-warm-400"><IconX size={12} aria-hidden="true" /></IconButton>
                  </div>
                ) : (
                  <Button variant="danger" onClick={() => setEditingFollowUp(true)}
                    className={cn('text-xs font-medium', isOverdue ? 'text-red-600' : coach.next_follow_up_at ? 'text-warm-700' : 'text-primary-600 hover:text-primary-700')}>
                    {coach.next_follow_up_at ? formatShort(coach.next_follow_up_at) : '+ Set date'}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ================================================================
            3.5 STRUCTURED NOTES (crm_notes — Phase 1.5)
            Lives between Quick Info and Outreach Timeline. NotesPanel is
            self-contained: fetches via listCoachNotes, handles add/edit/
            delete + pinning + kind selector internally.
            ================================================================ */}
        <div className="px-5 pt-3 border-t border-white/30">
          <NotesPanel coachId={coach.id} />
        </div>

        {/* ================================================================
            3.6 TASKS (crm_tasks — Phase 1.5)
            Same surface treatment as Notes — self-contained panel.
            ================================================================ */}
        <div className="px-5 pt-3 border-t border-white/30">
          <TasksPanel coachId={coach.id} />
        </div>

        {/* ================================================================
            4. OUTREACH TIMELINE (THE MAIN EVENT)
            ================================================================ */}
        <div className="flex-1 overflow-y-auto">
          <div className="px-5 pt-4 pb-2 flex items-center justify-between">
            <h3 className="text-xs font-medium text-warm-500 uppercase tracking-wider flex items-center gap-1.5">
              <Activity size={13} className="text-warm-400" /> Timeline
            </h3>
            <Button variant="ghost" onClick={() => setShowContactForm(!showContactForm)}
              className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1">
              <IconPlus size={12} /> Log
            </Button>
          </div>

          {/* ================================================================
              5. LOG CONTACT FORM (inline at top of timeline)
              ================================================================ */}
          {showContactForm && (
            <div className="mx-5 mb-4 p-3 rounded-xl border border-primary-200/50 bg-primary-50/20 space-y-3">
              <div className="flex gap-1.5 flex-wrap">
                {CONTACT_TYPES.map(type => {
                  const TypeIcon = type.Icon;
                  return (
                    <Button variant="primary" key={type.value} onClick={() => setNewContact({ ...newContact, type: type.value })}
                      className={cn('px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 inline-flex items-center gap-1.5',
                        newContact.type === type.value ? 'bg-primary-600 text-white shadow-sm' : 'bg-cream-50 border border-warm-200/60 text-warm-600 hover:bg-warm-50 active:bg-warm-100')}>
                      <TypeIcon size={12} /> {type.label}
                    </Button>
                  );
                })}
              </div>
              <Textarea placeholder="Notes..." value={newContact.notes} onChange={e => setNewContact({ ...newContact, notes: e.target.value })}
                className="w-full bg-cream-50 border border-warm-200/60 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/30" rows={2} />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setShowContactForm(false)} className="px-3 py-1.5 text-sm text-warm-600 hover:text-warm-800">Cancel</Button>
                <Button variant="primary" onClick={submitContact} disabled={submitting} className="px-4 py-1.5 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50 shadow-sm">
                  {submitting ? 'Saving...' : 'Save'}
                </Button>
              </div>
            </div>
          )}

          {/* Timeline content — owned by <CoachTimeline> (Stream C). Bumping
              `timelineRefreshKey` re-fetches after a contact log insert. */}
          <div className="px-5 pb-5">
            <CoachTimeline coachId={coach.id} refreshKey={timelineRefreshKey} />
          </div>
        </div>

        {/* ================================================================
            6. QUICK ACTIONS BAR (sticky bottom)
            ================================================================ */}
        <div className="glass-standard p-4 pb-[max(1rem,env(safe-area-inset-bottom))] flex-shrink-0">
          {/* On phones the actions stretch to fill the bar for one-handed reach;
              every action is >=44px tall. On desktop they revert to auto width. */}
          <div className="flex items-center gap-2">
            {coach.email ? (
              <a href={`mailto:${coach.email}`}
                className="flex-1 lg:flex-initial min-h-[44px] bg-primary-500 text-white rounded-xl px-4 py-2 text-sm font-medium inline-flex items-center justify-center gap-1.5 hover:bg-primary-600 transition-colors shadow-sm">
                <IconMail size={14} /> Email
              </a>
            ) : (
              <Button variant="primary" onClick={() => setEditingContact(true)}
                className="flex-1 lg:flex-initial min-h-[44px] bg-primary-500 text-white rounded-xl px-4 py-2 text-sm font-medium inline-flex items-center justify-center gap-1.5 hover:bg-primary-600 transition-colors shadow-sm">
                <IconMail size={14} /> Email
              </Button>
            )}
            {onOpenInGmail && coach.email && (
              <Button variant="ghost" onClick={() => onOpenInGmail(coach)}
                title={gmailDirectSend
                  ? 'Send this email directly through your Workspace mailbox (Gmail API)'
                  : 'Open a pre-filled Gmail compose window for this coach'}
                className="flex-1 lg:flex-initial min-h-[44px] bg-cream-50 border border-warm-200 text-warm-700 rounded-xl px-4 py-2 text-sm font-medium inline-flex items-center justify-center gap-1.5 hover:bg-warm-50 transition-colors">
                {gmailDirectSend
                  ? <><IconSend size={14} className="text-primary-500" /> Send</>
                  : <><IconExternalLink size={14} className="text-primary-500" /> Gmail</>}
              </Button>
            )}
            {coach.phone ? (
              <a href={`tel:${coach.phone}`}
                className="flex-1 lg:flex-initial min-h-[44px] bg-cream-50 border border-warm-200 text-warm-700 rounded-xl px-4 py-2 text-sm font-medium inline-flex items-center justify-center gap-1.5 hover:bg-warm-50 transition-colors">
                <IconPhone size={14} /> Call
              </a>
            ) : (
              <Button variant="ghost" onClick={() => setEditingContact(true)}
                className="flex-1 lg:flex-initial min-h-[44px] bg-cream-50 border border-warm-200 text-warm-700 rounded-xl px-4 py-2 text-sm font-medium inline-flex items-center justify-center gap-1.5 hover:bg-warm-50 transition-colors">
                <IconPhone size={14} /> Call
              </Button>
            )}
            <Button variant="ghost" onClick={() => setEditingFollowUp(true)}
              className="flex-1 lg:flex-initial min-h-[44px] bg-cream-50 border border-warm-200 text-warm-700 rounded-xl px-4 py-2 text-sm font-medium inline-flex items-center justify-center gap-1.5 hover:bg-warm-50 transition-colors">
              <IconCalendar size={14} /> Schedule
            </Button>
            <Button variant="ghost" onClick={() => { setShowContactForm(true); setNewContact({ ...newContact, type: 'note' }); }}
              className="flex-1 lg:flex-initial min-h-[44px] bg-cream-50 border border-warm-200 text-warm-700 rounded-xl px-4 py-2 text-sm font-medium inline-flex items-center justify-center gap-1.5 hover:bg-warm-50 transition-colors">
              <IconFileText size={14} /> Note
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}

// ============================================================================
// HELPERS
// ============================================================================
function QuickInfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-warm-400 w-20 flex-shrink-0 flex items-center gap-1">
        {icon} {label}
      </span>
      <span className="text-xs font-medium text-warm-700 truncate">{value}</span>
    </div>
  );
}
