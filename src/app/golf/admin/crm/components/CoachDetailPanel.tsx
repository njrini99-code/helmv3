'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
  IconX,
  IconMail,
  IconPhone,
  IconExternalLink,
  IconPlus,
  IconClock,
  IconMessageSquare,
  IconFileText,
  IconUsers,
  IconCheck,
  IconCalendar,
  IconStar,
  IconRefresh as History,
  IconHash as Tag,
  IconClipboardList as ListChecks,
  IconClipboard as ClipboardCheck,
  IconEye as Monitor,
  IconNote as StickyNote,
  IconPencil as Pencil,
  IconVideo as Video,
} from '@/components/icons';
import type { Coach, CoachStatus } from '../crm-config';
import { STATUS_COLORS } from '../crm-config';
import { ToastProvider, useToast } from './Toast';

// ============================================================================
// TYPES
// ============================================================================
interface CoachDetailPanelProps {
  coach: Coach;
  onClose: () => void;
  onUpdate: (updates: Partial<Coach>) => void;
  statusConfig: Record<CoachStatus, { label: string; color: string; bgColor: string; iconLabel: React.ReactNode; icon: React.ReactNode }>;
  priorityConfig: Record<number, { label: string; color: string; bgColor: string; iconLabel: React.ReactNode }>;
}

interface EmailEvent {
  event_type: string;
  occurred_at: string;
}

interface ContactLog {
  id: string;
  contact_type: string;
  contact_date: string;
  notes: string | null;
  next_action: string | null;
  next_action_date: string | null;
  resend_message_id: string | null;
  crm_email_events: EmailEvent[];
}

interface CrmEvent {
  id: string;
  event_type: string;
  title: string;
  description: string | null;
  start_time: string;
  end_time: string;
  location: string | null;
  meeting_url: string | null;
  notes: string | null;
  outcome: string | null;
  status: string | null;
}

// Unified timeline entry
interface TimelineEntry {
  id: string;
  source: 'log' | 'event';
  type: string;        // email | call | demo | meeting | note | follow_up | email_reminder | other
  date: string;
  title: string;
  notes: string | null;
  // Contact log specific
  nextAction?: string | null;
  nextActionDate?: string | null;
  emailEvents?: EmailEvent[];
  resendMessageId?: string | null;
  // CRM event specific
  location?: string | null;
  meetingUrl?: string | null;
  outcome?: string | null;
  eventStatus?: string | null;
  endTime?: string;
}

// ============================================================================
// CONSTANTS
// ============================================================================
const CONTACT_TYPES = [
  { value: 'email', label: 'Email', Icon: IconMail, dotColor: 'bg-blue-500' },
  { value: 'call', label: 'Call', Icon: IconPhone, dotColor: 'bg-primary-500' },
  { value: 'demo', label: 'Demo', Icon: Monitor, dotColor: 'bg-violet-500' },
  { value: 'meeting', label: 'Meeting', Icon: IconUsers, dotColor: 'bg-cyan-500' },
  { value: 'note', label: 'Note', Icon: StickyNote, dotColor: 'bg-warm-400' },
] as const;

const TIMELINE_TYPE_CONFIG: Record<string, { Icon: typeof IconMail; dotColor: string; label: string }> = {
  email:          { Icon: IconMail,     dotColor: 'bg-blue-500',    label: 'Email Sent' },
  call:           { Icon: IconPhone,    dotColor: 'bg-primary-500', label: 'Call Logged' },
  demo:           { Icon: Video,    dotColor: 'bg-violet-500',  label: 'Demo' },
  meeting:        { Icon: IconUsers,    dotColor: 'bg-cyan-500',    label: 'Meeting' },
  note:           { Icon: StickyNote, dotColor: 'bg-warm-400',  label: 'Note Added' },
  follow_up:      { Icon: IconCalendar, dotColor: 'bg-amber-500',  label: 'Follow-up' },
  email_reminder: { Icon: IconMail,     dotColor: 'bg-sky-500',     label: 'Email Reminder' },
  other:          { Icon: IconMessageSquare, dotColor: 'bg-warm-300', label: 'Activity' },
};

const ALL_STATUSES: readonly string[] = [
  'new_lead', 'contacted', 'engaged', 'proposal', 'won', 'lost', 'nurture',
];

const EMAIL_DELIVERY_STEPS = [
  { key: 'sent',      label: 'Sent' },
  { key: 'delivered',  label: 'Delivered',  eventType: 'email.delivered' },
  { key: 'opened',     label: 'Opened',     eventType: 'email.opened' },
  { key: 'clicked',    label: 'Clicked',    eventType: 'email.clicked' },
] as const;

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
  coach,
  onClose,
  onUpdate,
  statusConfig,
  priorityConfig,
}: CoachDetailPanelProps) {
  const { toast } = useToast();

  const [logs, setLogs] = useState<ContactLog[]>([]);
  const [events, setEvents] = useState<CrmEvent[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(true);

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

  const supabase = createClient();

  // --------------------------------------------------------------------------
  // Data fetching
  // --------------------------------------------------------------------------
  const fetchTimeline = useCallback(async () => {
    setLoadingTimeline(true);
    try {
      const [logsRes, eventsRes] = await Promise.all([
        supabase
          .from('crm_contact_log')
          .select('*, crm_email_events(event_type, occurred_at)')
          .eq('coach_id', coach.id)
          .order('contact_date', { ascending: false }),
        supabase
          .from('crm_events')
          .select('*')
          .eq('coach_id', coach.id)
          .order('start_time', { ascending: false }),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setLogs((logsRes.data || []).map((d: any) => ({
        id: d.id,
        contact_type: d.contact_type,
        contact_date: d.contact_date,
        notes: d.notes,
        next_action: d.next_action,
        next_action_date: d.next_action_date,
        resend_message_id: d.resend_message_id || null,
        crm_email_events: Array.isArray(d.crm_email_events) ? d.crm_email_events : [],
      })));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setEvents((eventsRes.data || []).map((d: any) => ({
        id: d.id,
        event_type: d.event_type,
        title: d.title,
        description: d.description,
        start_time: d.start_time,
        end_time: d.end_time,
        location: d.location,
        meeting_url: d.meeting_url,
        notes: d.notes,
        outcome: d.outcome,
        status: d.status,
      })));
    } catch {
      toast('Failed to load activity timeline', 'error');
    } finally {
      setLoadingTimeline(false);
    }
  }, [supabase, coach.id, toast]);

  useEffect(() => { const t = setTimeout(() => setIsVisible(true), 10); return () => clearTimeout(t); }, []);
  useEffect(() => {
    fetchTimeline();
    setNotesValue(coach.notes || '');
    setFollowUpDate(coach.next_follow_up_at?.split('T')[0] || '');
    setContactForm({ name: coach.name, title: coach.title || '', email: coach.email || '', phone: coach.phone || '', school: coach.school });
    setEditingContact(false);
  }, [coach.id, coach.name, coach.title, coach.email, coach.phone, coach.school, coach.notes, coach.next_follow_up_at, fetchTimeline]);

  // --------------------------------------------------------------------------
  // Unified timeline — merge logs + events, sort by date desc
  // --------------------------------------------------------------------------
  const timeline = useMemo<TimelineEntry[]>(() => {
    const logEntries: TimelineEntry[] = logs.map(l => ({
      id: `log-${l.id}`,
      source: 'log',
      type: l.contact_type,
      date: l.contact_date,
      title: TIMELINE_TYPE_CONFIG[l.contact_type]?.label || l.contact_type,
      notes: l.notes,
      nextAction: l.next_action,
      nextActionDate: l.next_action_date,
      emailEvents: l.crm_email_events,
      resendMessageId: l.resend_message_id,
    }));

    const eventEntries: TimelineEntry[] = events.map(e => ({
      id: `event-${e.id}`,
      source: 'event',
      type: e.event_type,
      date: e.start_time,
      title: e.title,
      notes: e.notes,
      location: e.location,
      meetingUrl: e.meeting_url,
      outcome: e.outcome,
      eventStatus: e.status,
      endTime: e.end_time,
    }));

    return [...logEntries, ...eventEntries].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [logs, events]);

  // --------------------------------------------------------------------------
  // Handlers
  // --------------------------------------------------------------------------
  const handleClose = () => { setIsVisible(false); setTimeout(onClose, 200); };

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
      fetchTimeline();
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
  const formatDate = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const formatShort = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const relativeTime = (dateStr: string): string => {
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 30) return `${diffDay}d ago`;
    return formatShort(dateStr);
  };

  const isOverdue = coach.next_follow_up_at && new Date(coach.next_follow_up_at) < new Date();

  // --------------------------------------------------------------------------
  // Render
  // --------------------------------------------------------------------------
  return (
    <>
      {/* Backdrop */}
      <div className={cn('fixed inset-0 z-40', isVisible ? 'opacity-100' : 'opacity-0')} onClick={handleClose}>
        <div className="absolute inset-0 bg-black/10 backdrop-blur-[2px] transition-opacity duration-200" />
      </div>

      {/* Panel */}
      <aside className={cn(
        'fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg',
        'bg-[#FFFEF8] border-l border-warm-200/60 shadow-2xl',
        'transition-transform duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]',
        isVisible ? 'translate-x-0' : 'translate-x-full',
        'flex flex-col'
      )}>
        {/* Primary accent bar */}
        <div className="h-1 bg-gradient-to-r from-primary-500 to-primary-600 flex-shrink-0" />

        {/* Header — glass */}
        <div className="bg-white/80 backdrop-blur-xl border-b border-white/20 p-5 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              {editingContact ? (
                <div className="space-y-2">
                  <input type="text" value={contactForm.name} onChange={e => setContactForm({ ...contactForm, name: e.target.value })}
                    placeholder="Name *" className="w-full bg-white/50 border border-warm-200/60 rounded-lg px-3 py-2 text-sm font-bold text-warm-900 focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
                  <input type="text" value={contactForm.title} onChange={e => setContactForm({ ...contactForm, title: e.target.value })}
                    placeholder="Title (e.g. Head Coach)" className="w-full bg-white/50 border border-warm-200/60 rounded-lg px-3 py-2 text-sm text-warm-600 focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
                  <input type="text" value={contactForm.school} onChange={e => setContactForm({ ...contactForm, school: e.target.value })}
                    placeholder="School *" className="w-full bg-white/50 border border-warm-200/60 rounded-lg px-3 py-2 text-sm font-medium text-warm-900 focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
                  <div className="flex gap-2 pt-1">
                    <button onClick={saveContactInfo} disabled={!contactForm.name.trim() || !contactForm.school.trim()}
                      className="px-3 py-1.5 bg-primary-600 text-white rounded-xl text-xs font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50 shadow-sm">
                      Save
                    </button>
                    <button onClick={cancelEditContact} className="px-3 py-1.5 text-xs text-warm-600 hover:text-warm-800">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2.5 mb-1">
                    <button
                      onClick={() => onUpdate({ is_starred: !coach.is_starred })}
                      className="hover:scale-110 active:scale-95 transition-all duration-200"
                    >
                      <IconStar size={20} className={cn(
                        'transition-all duration-200',
                        coach.is_starred ? 'fill-amber-400 text-amber-400 drop-shadow-sm' : 'text-warm-300 hover:text-amber-300'
                      )} />
                    </button>
                    <h2 className="text-lg font-semibold text-warm-900 truncate">{coach.name}</h2>
                    {coach.priority > 0 && priorityConfig[coach.priority] && (
                      <span className={cn('flex items-center gap-1', priorityConfig[coach.priority]?.color)}>
                        {priorityConfig[coach.priority]?.iconLabel}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-warm-500">{coach.school}</p>
                  <div className="flex items-center gap-2 mt-2">
                    {/* Status badge — pill-shaped, clickable */}
                    <select value={coach.status} onChange={e => handleStatusChange(e.target.value as CoachStatus)}
                      className={cn(
                        'appearance-none cursor-pointer px-3 py-1 rounded-full text-xs font-semibold border transition-colors',
                        STATUS_COLORS[coach.status]?.bg,
                        STATUS_COLORS[coach.status]?.text,
                        STATUS_COLORS[coach.status]?.border,
                      )}>
                      {ALL_STATUSES.map(s => <option key={s} value={s}>{statusConfig[s as CoachStatus]?.label}</option>)}
                    </select>
                    <span className="text-warm-300">&middot;</span>
                    <span className="text-sm text-warm-500">{coach.conference}</span>
                    <span className="text-warm-300">&middot;</span>
                    <span className={cn('px-1.5 py-0.5 rounded text-micro font-bold',
                      coach.division === 'D2' ? 'bg-blue-100 text-blue-700' : 'bg-primary-100 text-primary-700')}>
                      {coach.division}
                    </span>
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-1">
              {!editingContact && (
                <button onClick={() => setEditingContact(true)}
                  className="p-2 rounded-xl hover:bg-white/60 active:bg-white/80 transition-colors text-warm-400 hover:text-warm-600"
                  title="Edit contact info">
                  <Pencil size={14} />
                </button>
              )}
              <button onClick={handleClose} className="p-2 rounded-xl hover:bg-white/60 active:bg-white/80 transition-colors text-warm-400 hover:text-warm-600">
                <IconX size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Contact info + Priority bar */}
        <div className="flex-shrink-0 border-b border-warm-200/30 bg-white/40">
          <div className="flex items-center gap-3 px-5 py-3">
            <div className="flex items-center gap-2 flex-1">
              <span className="text-xs text-warm-500 font-medium">{coach.title || 'Coach'}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-warm-500 font-medium">Priority</span>
              <select value={coach.priority} onChange={e => onUpdate({ priority: parseInt(e.target.value) })}
                className="px-2.5 py-1.5 rounded-xl text-xs font-medium border border-warm-200/60 cursor-pointer bg-white/50 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-300 transition-all duration-200">
                <option value={0}>Normal</option><option value={1}>High</option><option value={2}>Hot</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2 px-5 pb-3 flex-wrap">
            {editingContact ? (
              <>
                <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
                  <IconMail size={12} className="text-blue-500 flex-shrink-0" />
                  <input type="email" value={contactForm.email} onChange={e => setContactForm({ ...contactForm, email: e.target.value })}
                    placeholder="Email address" className="flex-1 bg-white/50 border border-warm-200/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
                </div>
                <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
                  <IconPhone size={12} className="text-primary-500 flex-shrink-0" />
                  <input type="tel" value={contactForm.phone} onChange={e => setContactForm({ ...contactForm, phone: e.target.value })}
                    placeholder="Phone number" className="flex-1 bg-white/50 border border-warm-200/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
                </div>
              </>
            ) : (
              <>
                {coach.email ? (
                  <a href={`mailto:${coach.email}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-medium transition-colors">
                    <IconMail size={12} /> {coach.email}
                  </a>
                ) : (
                  <button onClick={() => setEditingContact(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-warm-300 text-xs text-warm-400 hover:border-warm-400 hover:text-warm-500 transition-colors">
                    <IconMail size={12} /> Add email
                  </button>
                )}
                {coach.phone ? (
                  <a href={`tel:${coach.phone}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-50 text-primary-700 hover:bg-primary-100 text-xs font-medium transition-colors">
                    <IconPhone size={12} /> {coach.phone}
                  </a>
                ) : (
                  <button onClick={() => setEditingContact(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-warm-300 text-xs text-warm-400 hover:border-warm-400 hover:text-warm-500 transition-colors">
                    <IconPhone size={12} /> Add phone
                  </button>
                )}
                {coach.athletics_url && (
                  <a href={coach.athletics_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-violet-50 text-violet-700 hover:bg-violet-100 text-xs font-medium transition-colors">
                    <IconExternalLink size={12} /> Golf Staff Page
                  </a>
                )}
              </>
            )}
          </div>
        </div>

        {/* Overdue alert */}
        {isOverdue && (
          <div className="mx-5 mt-3 px-3 py-2 rounded-xl bg-red-50 border border-red-200/50 flex items-center gap-2 flex-shrink-0">
            <IconClock size={14} className="text-red-500" />
            <span className="text-xs font-medium text-red-700">Overdue follow-up: {coach.next_follow_up_at ? formatShort(coach.next_follow_up_at) : ''}</span>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">

          {/* Notes */}
          <Section title="Notes" icon={<IconFileText size={14} className="text-warm-400" />}
            action={
              <button onClick={() => { if (editingNotes) saveNotes(); else setEditingNotes(true); }}
                className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1">
                {editingNotes ? <><IconCheck size={12} /> Save</> : <><Pencil size={12} /> Edit</>}
              </button>
            }>
            {editingNotes ? (
              <textarea value={notesValue} onChange={e => setNotesValue(e.target.value)} autoFocus rows={5}
                className="w-full bg-white/50 border border-warm-200/60 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/30" placeholder="Add notes..." />
            ) : (
              <div className="text-sm text-warm-600 whitespace-pre-wrap min-h-[40px]">
                {coach.notes || <span className="text-warm-400 italic text-xs">Click Edit to add notes about this coach...</span>}
              </div>
            )}
          </Section>

          {/* ================================================================
              Unified Activity Timeline
              ================================================================ */}
          <Section title="Activity Timeline" icon={<History size={14} className="text-warm-400" />}
            action={
              <button onClick={() => setShowContactForm(!showContactForm)}
                className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1">
                <IconPlus size={12} /> Log Contact
              </button>
            }>

            {showContactForm && (
              <div className="mb-4 p-3 rounded-xl border border-primary-200/50 bg-primary-50/20 space-y-3">
                <div className="flex gap-1.5 flex-wrap">
                  {CONTACT_TYPES.map(type => {
                    const TypeIcon = type.Icon;
                    return (
                      <button key={type.value} onClick={() => setNewContact({ ...newContact, type: type.value })}
                        className={cn('px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 inline-flex items-center gap-1.5',
                          newContact.type === type.value ? 'bg-primary-600 text-white shadow-sm' : 'bg-white/60 border border-warm-200/60 text-warm-600 hover:bg-warm-50 active:bg-warm-100')}>
                        <TypeIcon size={12} /> {type.label}
                      </button>
                    );
                  })}
                </div>
                <textarea placeholder="Notes..." value={newContact.notes} onChange={e => setNewContact({ ...newContact, notes: e.target.value })}
                  className="w-full bg-white/50 border border-warm-200/60 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500/30" rows={2} />
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" placeholder="Next action..." value={newContact.nextAction} onChange={e => setNewContact({ ...newContact, nextAction: e.target.value })}
                    className="bg-white/50 border border-warm-200/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
                  <input type="date" value={newContact.nextActionDate} onChange={e => setNewContact({ ...newContact, nextActionDate: e.target.value })}
                    className="bg-white/50 border border-warm-200/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowContactForm(false)} className="px-3 py-1.5 text-sm text-warm-600 hover:text-warm-800">Cancel</button>
                  <button onClick={submitContact} disabled={submitting} className="px-4 py-1.5 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50 shadow-sm">
                    {submitting ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            )}

            {loadingTimeline ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex gap-3 pl-4">
                    <div className="w-[10px] h-[10px] rounded-full bg-warm-200/60 skeleton-shimmer mt-1" />
                    <div className="flex-1 space-y-1"><div className="h-3 w-24 bg-warm-200/60 rounded skeleton-shimmer" /><div className="h-3 w-48 bg-warm-100/60 rounded skeleton-shimmer" /></div>
                  </div>
                ))}
              </div>
            ) : timeline.length === 0 ? (
              <div className="py-6 text-center">
                <div className="w-10 h-10 rounded-xl bg-warm-50 flex items-center justify-center mx-auto mb-2">
                  <IconMessageSquare size={18} className="text-warm-300" />
                </div>
                <p className="text-sm font-medium text-warm-500">No activity yet</p>
                <p className="text-xs text-warm-400 mt-0.5">Log your first interaction with this coach</p>
                <button onClick={() => setShowContactForm(true)}
                  className="mt-3 px-3 py-1.5 text-xs font-medium bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors">
                  Log Contact
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {timeline.map((entry) => {
                  const defaultConf = { Icon: IconMessageSquare, dotColor: 'bg-warm-300', label: 'Activity' };
                  const typeConf = TIMELINE_TYPE_CONFIG[entry.type] || defaultConf;
                  const EntryIcon = typeConf.Icon;
                  const isPending = entry.type === 'email'
                    && entry.source === 'log'
                    && entry.emailEvents
                    && entry.emailEvents.length === 0
                    && (Date.now() - new Date(entry.date).getTime()) < 5 * 60 * 1000;

                  return (
                    <div key={entry.id} className="bg-white/60 backdrop-blur-sm border border-white/40 rounded-xl p-3 shadow-sm hover:bg-white/70 transition-all duration-200">
                      {/* Header row */}
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-warm-900 flex items-center gap-2 truncate">
                          <span className={cn(
                            'flex items-center justify-center w-6 h-6 rounded-lg flex-shrink-0',
                            typeConf.dotColor.replace('bg-', 'bg-') + '/15'
                          )}>
                            <EntryIcon size={13} className={typeConf.dotColor.replace('bg-', 'text-')} />
                          </span>
                          {entry.source === 'event' ? entry.title : typeConf.label}
                          {entry.source === 'event' && (
                            <span className={cn(
                              'text-[10px] font-semibold px-1.5 py-0.5 rounded-md',
                              entry.eventStatus === 'completed' ? 'bg-emerald-50 text-emerald-600' :
                              entry.eventStatus === 'cancelled' ? 'bg-red-50 text-red-600' :
                              'bg-blue-50 text-blue-600'
                            )}>
                              {entry.eventStatus || 'scheduled'}
                            </span>
                          )}
                        </p>
                        <span className="text-xs text-warm-400 tabular-nums flex-shrink-0">{relativeTime(entry.date)}</span>
                      </div>

                      {/* Notes / description */}
                      {entry.notes && (
                        <p className="text-xs text-warm-600 mt-1.5 leading-relaxed ml-8">{entry.notes}</p>
                      )}

                      {/* Event-specific details */}
                      {entry.source === 'event' && (
                        <div className="mt-1.5 ml-8 space-y-0.5">
                          {entry.location && (
                            <p className="text-[11px] text-warm-500 flex items-center gap-1">
                              <span className="text-warm-400">Location:</span> {entry.location}
                            </p>
                          )}
                          {entry.meetingUrl && (
                            <a href={entry.meetingUrl} target="_blank" rel="noopener noreferrer"
                              className="text-[11px] text-blue-600 hover:text-blue-700 flex items-center gap-1">
                              <Video size={10} /> Join meeting
                            </a>
                          )}
                          {entry.outcome && (
                            <p className="text-[11px] text-warm-500">
                              <span className="text-warm-400">Outcome:</span> {entry.outcome}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Email delivery timeline */}
                      {entry.type === 'email' && entry.source === 'log' && (
                        <div className="ml-8">
                          <EmailDeliveryTimeline
                            events={entry.emailEvents || []}
                            isPending={!!isPending}
                            isBounced={entry.emailEvents?.some(e => e.event_type === 'email.bounced') || false}
                            isSpam={entry.emailEvents?.some(e => e.event_type === 'email.complained') || false}
                          />
                        </div>
                      )}

                      {/* Next action */}
                      {entry.nextAction && (
                        <div className="mt-1.5 ml-8 flex items-center gap-1.5 text-xs text-amber-600">
                          <IconClock size={11} /> Next: {entry.nextAction}
                          {entry.nextActionDate && <span className="text-warm-400">({formatShort(entry.nextActionDate)})</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* Tags */}
          <Section title="Tags" icon={<Tag size={14} className="text-warm-400" />}>
            <div className="flex flex-wrap gap-1.5">
              {(coach.tags || []).map((tag, i) => (
                <span key={i} className="inline-flex items-center gap-1 px-2 py-1 bg-primary-50 text-primary-700 rounded-lg text-xs font-medium">
                  {tag}
                  <button onClick={() => removeTag(tag)} className="hover:text-red-600 transition-colors"><IconX size={10} /></button>
                </span>
              ))}
              {(coach.tags || []).length === 0 && !newTag && (
                <button onClick={() => document.getElementById('tag-input')?.focus()}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-warm-300 text-xs text-warm-400 hover:border-warm-400 hover:text-warm-500 transition-colors">
                  <IconPlus size={12} /> Add tag
                </button>
              )}
              <div className="flex items-center gap-1">
                <input id="tag-input" type="text" value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()}
                  placeholder="Add tag..." className="bg-white/50 border border-warm-200/60 rounded-lg px-3 py-2 text-sm w-28 focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
                {newTag && <button onClick={addTag} className="w-6 h-6 rounded-md bg-primary-100 text-primary-600 flex items-center justify-center hover:bg-primary-200 transition-colors"><IconPlus size={12} /></button>}
              </div>
            </div>
          </Section>

          {/* Next Steps */}
          <Section title="Next Steps" icon={<ListChecks size={14} className="text-warm-400" />}>
            <div className="flex items-center justify-between py-1">
              <span className="text-xs text-warm-500">Follow-up Date</span>
              {editingFollowUp ? (
                <div className="flex items-center gap-1">
                  <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)}
                    className="bg-white/50 border border-warm-200/60 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500/30" />
                  <button onClick={saveFollowUp} className="text-xs text-primary-600 font-semibold px-1"><IconCheck size={12} /></button>
                  <button onClick={() => setEditingFollowUp(false)} className="text-xs text-warm-400 px-1"><IconX size={12} /></button>
                </div>
              ) : (
                <button onClick={() => setEditingFollowUp(true)}
                  className={cn('text-xs font-medium', isOverdue ? 'text-red-600' : coach.next_follow_up_at ? 'text-warm-800' : 'text-primary-600')}>
                  {coach.next_follow_up_at ? formatShort(coach.next_follow_up_at) : '+ Set date'}
                </button>
              )}
            </div>
            <div className="flex items-center justify-between py-1">
              <span className="text-xs text-warm-500">Last Contact</span>
              <span className={cn('text-xs font-medium', coach.last_contacted_at ? 'text-warm-800' : 'text-red-500')}>
                {coach.last_contacted_at ? formatDate(coach.last_contacted_at) : 'Never'}
              </span>
            </div>
          </Section>

          {/* Qualification */}
          <Section title="Qualification" icon={<ClipboardCheck size={14} className="text-warm-400" />}>
            <Row label="Program" value={coach.program === 'mens' ? "Men's" : coach.program === 'womens' ? "Women's" : 'Both'} />
            <Row label="Team Size" value={coach.team_size?.toString()} />
            <Row label="Current Software" value={coach.current_software} />
            <Row label="Budget" value={coach.budget_range} />
            <Row label="Timeline" value={coach.decision_timeline} />
            <Row label="Best Contact" value={coach.best_contact_method} />
            <Row label="Timezone" value={coach.timezone} />
          </Section>
        </div>

        {/* Quick actions bar — sticky bottom */}
        <div className="bg-white/80 backdrop-blur-xl border-t border-white/20 p-4 flex-shrink-0">
          <div className="flex items-center gap-2">
            {coach.email ? (
              <a href={`mailto:${coach.email}`}
                className="bg-primary-500 text-white rounded-xl px-4 py-2 text-sm font-medium inline-flex items-center gap-1.5 hover:bg-primary-600 transition-colors shadow-sm">
                <IconMail size={14} /> Email
              </a>
            ) : (
              <button onClick={() => setEditingContact(true)}
                className="bg-primary-500 text-white rounded-xl px-4 py-2 text-sm font-medium inline-flex items-center gap-1.5 hover:bg-primary-600 transition-colors shadow-sm">
                <IconMail size={14} /> Email
              </button>
            )}
            {coach.phone ? (
              <a href={`tel:${coach.phone}`}
                className="bg-white/60 border border-warm-200 text-warm-700 rounded-xl px-4 py-2 text-sm font-medium inline-flex items-center gap-1.5 hover:bg-warm-50 transition-colors">
                <IconPhone size={14} /> Call
              </a>
            ) : (
              <button onClick={() => setEditingContact(true)}
                className="bg-white/60 border border-warm-200 text-warm-700 rounded-xl px-4 py-2 text-sm font-medium inline-flex items-center gap-1.5 hover:bg-warm-50 transition-colors">
                <IconPhone size={14} /> Call
              </button>
            )}
            <button onClick={() => setEditingFollowUp(true)}
              className="bg-white/60 border border-warm-200 text-warm-700 rounded-xl px-4 py-2 text-sm font-medium inline-flex items-center gap-1.5 hover:bg-warm-50 transition-colors">
              <IconCalendar size={14} /> Schedule
            </button>
            <button onClick={() => setShowContactForm(true)}
              className="bg-white/60 border border-warm-200 text-warm-700 rounded-xl px-4 py-2 text-sm font-medium inline-flex items-center gap-1.5 hover:bg-warm-50 transition-colors">
              <IconFileText size={14} /> Note
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

// ============================================================================
// EMAIL DELIVERY TIMELINE
// ============================================================================
function EmailDeliveryTimeline({
  events,
  isPending,
  isBounced,
  isSpam,
}: {
  events: EmailEvent[];
  isPending: boolean;
  isBounced: boolean;
  isSpam: boolean;
}) {
  if (isBounced || isSpam) {
    return (
      <div className="flex items-center gap-1 mt-1.5 flex-wrap">
        {isBounced && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-red-50 text-red-600 text-[10px] font-semibold leading-none">
            <span className="w-1 h-1 rounded-full bg-red-400" /> Bounced
          </span>
        )}
        {isSpam && (
          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-red-50 text-red-600 text-[10px] font-semibold leading-none">
            <span className="w-1 h-1 rounded-full bg-red-400" /> Spam
          </span>
        )}
      </div>
    );
  }

  const eventSet = new Set(events.map(e => e.event_type));

  return (
    <div className="mt-2 ml-1 relative">
      {/* Mini connecting line */}
      <div className="absolute left-[3px] top-1 bottom-1 w-px bg-warm-100" />

      <div className="flex items-center gap-0">
        {EMAIL_DELIVERY_STEPS.map((step, idx) => {
          const isActive = step.key === 'sent'
            ? true // Always sent if we have the log entry
            : eventSet.has(step.eventType!);

          return (
            <div key={step.key} className="flex items-center">
              <div className="flex flex-col items-center">
                <div className={cn(
                  'w-[6px] h-[6px] rounded-full transition-colors',
                  isActive ? 'bg-emerald-400' : 'bg-warm-200'
                )} />
                <span className={cn(
                  'text-[9px] mt-0.5 font-medium',
                  isActive ? 'text-emerald-600' : 'text-warm-300'
                )}>
                  {step.label}
                </span>
              </div>
              {idx < EMAIL_DELIVERY_STEPS.length - 1 && (
                <div className={cn(
                  'w-6 h-px mx-0.5 mt-[-10px]',
                  isActive && (
                    step.key === 'sent' ? eventSet.has('email.delivered') :
                    step.key === 'delivered' ? eventSet.has('email.opened') :
                    eventSet.has('email.clicked')
                  ) ? 'bg-emerald-300' : 'bg-warm-200'
                )} />
              )}
            </div>
          );
        })}
      </div>

      {/* Pending indicator */}
      {isPending && (
        <div className="flex items-center gap-1.5 mt-1">
          <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-[10px] text-amber-500 font-medium animate-pulse">Pending...</span>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// HELPERS
// ============================================================================
function Section({ title, icon, action, children }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-medium text-warm-600 uppercase tracking-wider flex items-center gap-1.5">
          {icon} {title}
        </h3>
        {action}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-xs text-warm-500">{label}</span>
      <span className="text-xs font-medium text-warm-800 truncate max-w-[200px]">{value || <span className="text-warm-300">&mdash;</span>}</span>
    </div>
  );
}
