'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import {
  X,
  Mail,
  Phone,
  Plus,
  Clock,
  MessageSquare,
  Star,
  FileText,
  History,
  Tag,
  ListChecks,
  ClipboardCheck,
  Monitor,
  Users,
  StickyNote,
  Check,
  Pencil,
} from 'lucide-react';
import type { Coach, CoachStatus } from '../crm-config';

interface CoachDetailPanelProps {
  coach: Coach;
  onClose: () => void;
  onUpdate: (updates: Partial<Coach>) => void;
  statusConfig: Record<CoachStatus, { label: string; color: string; bgColor: string; iconLabel: string; icon: React.ReactNode }>;
  priorityConfig: Record<number, { label: string; color: string; bgColor: string; iconLabel: string }>;
}

interface ContactLog {
  id: string;
  contact_type: string;
  contact_date: string;
  notes: string | null;
  next_action: string | null;
  next_action_date: string | null;
}

const CONTACT_TYPES = [
  { value: 'email', label: 'Email', Icon: Mail, dotColor: 'bg-blue-500' },
  { value: 'call', label: 'Call', Icon: Phone, dotColor: 'bg-primary-500' },
  { value: 'demo', label: 'Demo', Icon: Monitor, dotColor: 'bg-violet-500' },
  { value: 'meeting', label: 'Meeting', Icon: Users, dotColor: 'bg-cyan-500' },
  { value: 'note', label: 'Note', Icon: StickyNote, dotColor: 'bg-warm-400' },
] as const;

const ALL_STATUSES: CoachStatus[] = [
  'new_lead', 'researching', 'outreach_pending', 'initial_contact', 'follow_up',
  'engaged', 'demo_scheduled', 'demo_completed', 'proposal_sent', 'negotiating',
  'closed_won', 'closed_lost', 'not_interested', 'bad_timing', 'nurture',
];

export function CoachDetailPanel({
  coach,
  onClose,
  onUpdate,
  statusConfig,
  priorityConfig,
}: CoachDetailPanelProps) {
  const [logs, setLogs] = useState<ContactLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);

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

  const fetchLogs = useCallback(async () => {
    setLoadingLogs(true);
    try {
      const { data } = await supabase.from('crm_contact_log').select('*').eq('coach_id', coach.id).order('contact_date', { ascending: false });
      setLogs((data || []) as ContactLog[]);
    } catch (err) { console.error('Failed to fetch logs:', err); }
    finally { setLoadingLogs(false); }
  }, [supabase, coach.id]);

  useEffect(() => { const t = setTimeout(() => setIsVisible(true), 10); return () => clearTimeout(t); }, []);
  useEffect(() => {
    fetchLogs();
    setNotesValue(coach.notes || '');
    setFollowUpDate(coach.next_follow_up_at?.split('T')[0] || '');
    setContactForm({ name: coach.name, title: coach.title || '', email: coach.email || '', phone: coach.phone || '', school: coach.school });
    setEditingContact(false);
  }, [coach.id, coach.name, coach.title, coach.email, coach.phone, coach.school, coach.notes, coach.next_follow_up_at, fetchLogs]);

  const handleClose = () => { setIsVisible(false); setTimeout(onClose, 200); };

  const saveNotes = () => { onUpdate({ notes: notesValue || null }); setEditingNotes(false); };

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

  const submitContact = async () => {
    setSubmitting(true);
    try {
      await supabase.from('crm_contact_log').insert({
        coach_id: coach.id,
        contact_type: newContact.type as 'email' | 'call' | 'demo' | 'meeting' | 'note',
        notes: newContact.notes || null,
        next_action: newContact.nextAction || null,
        next_action_date: newContact.nextActionDate || null,
      });
      const updates: Partial<Coach> = { last_contacted_at: new Date().toISOString() };
      if (newContact.nextActionDate) updates.next_follow_up_at = newContact.nextActionDate;
      if (coach.status === 'new_lead') updates.status = 'initial_contact' as CoachStatus;
      onUpdate(updates);
      setNewContact({ type: 'email', notes: '', nextAction: '', nextActionDate: '' });
      setShowContactForm(false);
      fetchLogs();
    } catch (err) { console.error('Failed to log contact:', err); }
    finally { setSubmitting(false); }
  };

  const addTag = () => {
    if (!newTag.trim()) return;
    const current = coach.tags || [];
    if (!current.includes(newTag.trim())) onUpdate({ tags: [...current, newTag.trim()] });
    setNewTag('');
  };
  const removeTag = (tag: string) => onUpdate({ tags: (coach.tags || []).filter(t => t !== tag) });
  const saveFollowUp = () => { onUpdate({ next_follow_up_at: followUpDate ? new Date(followUpDate).toISOString() : null }); setEditingFollowUp(false); };

  const formatDate = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const formatShort = (s: string) => new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const isOverdue = coach.next_follow_up_at && new Date(coach.next_follow_up_at) < new Date();

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

        {/* Header — clean white background */}
        <div className="bg-white border-b border-warm-100 p-5 flex-shrink-0">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              {editingContact ? (
                <div className="space-y-2">
                  <input type="text" value={contactForm.name} onChange={e => setContactForm({ ...contactForm, name: e.target.value })}
                    placeholder="Name *" className="w-full px-3 py-1.5 border border-warm-200/50 rounded-xl text-sm font-bold text-warm-900 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white/50" />
                  <input type="text" value={contactForm.title} onChange={e => setContactForm({ ...contactForm, title: e.target.value })}
                    placeholder="Title (e.g. Head Coach)" className="w-full px-3 py-1.5 border border-warm-200/50 rounded-xl text-sm text-warm-600 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white/50" />
                  <input type="text" value={contactForm.school} onChange={e => setContactForm({ ...contactForm, school: e.target.value })}
                    placeholder="School *" className="w-full px-3 py-1.5 border border-warm-200/50 rounded-xl text-sm font-medium text-warm-900 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white/50" />
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
                  <div className="flex items-center gap-2 mb-1">
                    <button
                      onClick={() => onUpdate({ is_starred: !coach.is_starred })}
                      className="hover:scale-110 transition-transform"
                    >
                      <Star size={18} className={cn(coach.is_starred ? 'fill-amber-400 text-amber-400' : 'text-warm-300 hover:text-warm-400')} />
                    </button>
                    <h2 className="text-xl font-bold text-warm-900 truncate">{coach.name}</h2>
                    {coach.priority > 0 && (
                      <span className={cn('text-micro font-bold px-1.5 py-0.5 rounded', priorityConfig[coach.priority]?.bgColor, priorityConfig[coach.priority]?.color)}>
                        {priorityConfig[coach.priority]?.iconLabel} {priorityConfig[coach.priority]?.label}
                      </span>
                    )}
                  </div>
                  <p className="text-warm-500 text-sm">{coach.title || 'Coach'}</p>
                  <p className="text-warm-900 font-medium mt-1">{coach.school}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-warm-500 text-sm">{coach.conference}</span>
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
                  className="p-2 rounded-xl hover:bg-warm-50 active:bg-warm-100 transition-colors text-warm-400 hover:text-warm-600"
                  title="Edit contact info">
                  <Pencil size={14} />
                </button>
              )}
              <button onClick={handleClose} className="p-2 rounded-xl hover:bg-warm-50 active:bg-warm-100 transition-colors text-warm-400 hover:text-warm-600">
                <X size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Status + Priority + Contact bar */}
        <div className="flex-shrink-0 border-b border-warm-200/30 bg-white/50">
          <div className="flex items-center gap-3 px-5 py-3">
            <div className="flex items-center gap-2 flex-1">
              <span className="text-xs text-warm-500 font-medium">Status</span>
              <select value={coach.status} onChange={e => onUpdate({ status: e.target.value as CoachStatus })}
                className={cn('px-2.5 py-1.5 rounded-xl text-xs font-semibold border-0 cursor-pointer', statusConfig[coach.status]?.bgColor, statusConfig[coach.status]?.color)}>
                {ALL_STATUSES.map(s => <option key={s} value={s}>{statusConfig[s]?.iconLabel} {statusConfig[s]?.label}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-warm-500 font-medium">Priority</span>
              <select value={coach.priority} onChange={e => onUpdate({ priority: parseInt(e.target.value) })}
                className="px-2.5 py-1.5 rounded-xl text-xs font-medium border border-warm-200/30 cursor-pointer bg-white/50">
                <option value={0}>Normal</option><option value={1}>High</option><option value={2}>Hot</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2 px-5 pb-3 flex-wrap">
            {editingContact ? (
              <>
                <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
                  <Mail size={12} className="text-blue-500 flex-shrink-0" />
                  <input type="email" value={contactForm.email} onChange={e => setContactForm({ ...contactForm, email: e.target.value })}
                    placeholder="Email address" className="flex-1 px-2 py-1 border border-warm-200/50 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white/50" />
                </div>
                <div className="flex items-center gap-1.5 flex-1 min-w-[160px]">
                  <Phone size={12} className="text-primary-500 flex-shrink-0" />
                  <input type="tel" value={contactForm.phone} onChange={e => setContactForm({ ...contactForm, phone: e.target.value })}
                    placeholder="Phone number" className="flex-1 px-2 py-1 border border-warm-200/50 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white/50" />
                </div>
              </>
            ) : (
              <>
                {coach.email ? (
                  <a href={`mailto:${coach.email}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-medium transition-colors">
                    <Mail size={12} /> {coach.email}
                  </a>
                ) : (
                  <button onClick={() => setEditingContact(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-warm-300 text-xs text-warm-400 hover:border-warm-400 hover:text-warm-500 transition-colors">
                    <Mail size={12} /> Add email
                  </button>
                )}
                {coach.phone ? (
                  <a href={`tel:${coach.phone}`} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary-50 text-primary-700 hover:bg-primary-100 text-xs font-medium transition-colors">
                    <Phone size={12} /> {coach.phone}
                  </a>
                ) : (
                  <button onClick={() => setEditingContact(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-dashed border-warm-300 text-xs text-warm-400 hover:border-warm-400 hover:text-warm-500 transition-colors">
                    <Phone size={12} /> Add phone
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Overdue alert */}
        {isOverdue && (
          <div className="mx-5 mt-3 px-3 py-2 rounded-xl bg-red-50 border border-red-200/50 flex items-center gap-2 flex-shrink-0">
            <Clock size={14} className="text-red-500" />
            <span className="text-xs font-medium text-red-700">Overdue follow-up: {coach.next_follow_up_at ? formatShort(coach.next_follow_up_at) : ''}</span>
          </div>
        )}

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">

          {/* Notes */}
          <Section title="Notes" icon={<FileText size={14} className="text-warm-400" />}
            action={
              <button onClick={() => { if (editingNotes) saveNotes(); else setEditingNotes(true); }}
                className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1">
                {editingNotes ? <><Check size={12} /> Save</> : <><Pencil size={12} /> Edit</>}
              </button>
            }>
            {editingNotes ? (
              <textarea value={notesValue} onChange={e => setNotesValue(e.target.value)} autoFocus rows={5}
                className="w-full px-3 py-2 border border-warm-200/30 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white/50" placeholder="Add notes..." />
            ) : (
              <div className="text-sm text-warm-600 whitespace-pre-wrap min-h-[40px]">
                {coach.notes || <span className="text-warm-400 italic text-xs">Click Edit to add notes about this coach...</span>}
              </div>
            )}
          </Section>

          {/* Contact Log Timeline */}
          <Section title="Contact Log" icon={<History size={14} className="text-warm-400" />}
            action={
              <button onClick={() => setShowContactForm(!showContactForm)}
                className="text-xs text-primary-600 hover:text-primary-700 font-semibold flex items-center gap-1">
                <Plus size={12} /> Log Contact
              </button>
            }>

            {showContactForm && (
              <div className="mb-4 p-3 rounded-xl border border-primary-200/50 bg-primary-50/20 space-y-3">
                <div className="flex gap-1.5 flex-wrap">
                  {CONTACT_TYPES.map(type => {
                    const TypeIcon = type.Icon;
                    return (
                      <button key={type.value} onClick={() => setNewContact({ ...newContact, type: type.value })}
                        className={cn('px-3 py-1.5 rounded-xl text-xs font-medium transition-all inline-flex items-center gap-1.5',
                          newContact.type === type.value ? 'bg-primary-600 text-white shadow-sm' : 'bg-white/60 border border-warm-200/30 text-warm-600 hover:bg-warm-50 active:bg-warm-100')}>
                        <TypeIcon size={12} /> {type.label}
                      </button>
                    );
                  })}
                </div>
                <textarea placeholder="Notes..." value={newContact.notes} onChange={e => setNewContact({ ...newContact, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-warm-200/30 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white/50" rows={2} />
                <div className="grid grid-cols-2 gap-2">
                  <input type="text" placeholder="Next action..." value={newContact.nextAction} onChange={e => setNewContact({ ...newContact, nextAction: e.target.value })}
                    className="px-3 py-2 border border-warm-200/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white/50" />
                  <input type="date" value={newContact.nextActionDate} onChange={e => setNewContact({ ...newContact, nextActionDate: e.target.value })}
                    className="px-3 py-2 border border-warm-200/30 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white/50" />
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setShowContactForm(false)} className="px-3 py-1.5 text-sm text-warm-600 hover:text-warm-800">Cancel</button>
                  <button onClick={submitContact} disabled={submitting} className="px-4 py-1.5 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 transition-colors disabled:opacity-50 shadow-sm">
                    {submitting ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            )}

            {loadingLogs ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="flex gap-3 pl-4">
                    <div className="w-[10px] h-[10px] rounded-full bg-warm-200/60 skeleton-shimmer mt-1" />
                    <div className="flex-1 space-y-1"><div className="h-3 w-24 bg-warm-200/60 rounded skeleton-shimmer" /><div className="h-3 w-48 bg-warm-100/60 rounded skeleton-shimmer" /></div>
                  </div>
                ))}
              </div>
            ) : logs.length === 0 ? (
              <div className="py-6 text-center">
                <div className="w-10 h-10 rounded-xl bg-warm-50 flex items-center justify-center mx-auto mb-2">
                  <MessageSquare size={18} className="text-warm-300" />
                </div>
                <p className="text-sm font-medium text-warm-500">No contacts yet</p>
                <p className="text-xs text-warm-400 mt-0.5">Log your first interaction with this coach</p>
                <button onClick={() => setShowContactForm(true)}
                  className="mt-3 px-3 py-1.5 text-xs font-medium bg-primary-50 text-primary-700 rounded-lg hover:bg-primary-100 transition-colors">
                  Log Contact
                </button>
              </div>
            ) : (
              <div className="space-y-0 relative">
                <div className="absolute left-4 top-6 bottom-2 w-px bg-warm-200" />
                {logs.map((log) => {
                  const ct = CONTACT_TYPES.find(t => t.value === log.contact_type);
                  const LogIcon = ct?.Icon || MessageSquare;
                  return (
                    <div key={log.id} className="relative flex gap-3 pb-4 pl-4">
                      <div className={cn(
                        'absolute left-[11px] top-1.5 w-[10px] h-[10px] rounded-full border-2 border-white z-10',
                        ct?.dotColor || 'bg-warm-400'
                      )} />
                      <div className="ml-4 flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-warm-900 flex items-center gap-1.5">
                            <LogIcon size={12} className="text-warm-400" />
                            {ct?.label || log.contact_type}
                          </p>
                          <span className="text-xs text-warm-400 tabular-nums">{formatDate(log.contact_date)}</span>
                        </div>
                        {log.notes && <p className="text-xs text-warm-600 mt-0.5 leading-relaxed">{log.notes}</p>}
                        {log.next_action && (
                          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-600">
                            <Clock size={11} /> Next: {log.next_action}
                            {log.next_action_date && <span className="text-warm-400">({formatShort(log.next_action_date)})</span>}
                          </div>
                        )}
                      </div>
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
                  <button onClick={() => removeTag(tag)} className="hover:text-red-600 transition-colors"><X size={10} /></button>
                </span>
              ))}
              {(coach.tags || []).length === 0 && !newTag && (
                <button onClick={() => document.getElementById('tag-input')?.focus()}
                  className="flex items-center gap-1 px-2 py-1 rounded-lg border border-dashed border-warm-300 text-xs text-warm-400 hover:border-warm-400 hover:text-warm-500 transition-colors">
                  <Plus size={12} /> Add tag
                </button>
              )}
              <div className="flex items-center gap-1">
                <input id="tag-input" type="text" value={newTag} onChange={e => setNewTag(e.target.value)} onKeyDown={e => e.key === 'Enter' && addTag()}
                  placeholder="Add tag..." className="px-2 py-1 border border-warm-200/30 rounded-lg text-xs w-24 focus:outline-none focus:ring-1 focus:ring-primary-500 bg-white/50" />
                {newTag && <button onClick={addTag} className="w-6 h-6 rounded-md bg-primary-100 text-primary-600 flex items-center justify-center hover:bg-primary-200 transition-colors"><Plus size={12} /></button>}
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
                    className="px-2 py-1 border border-warm-200/30 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-primary-500" />
                  <button onClick={saveFollowUp} className="text-xs text-primary-600 font-semibold px-1"><Check size={12} /></button>
                  <button onClick={() => setEditingFollowUp(false)} className="text-xs text-warm-400 px-1"><X size={12} /></button>
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
      </aside>
    </>
  );
}

// ============================================================================
// HELPERS
// ============================================================================
function Section({ title, icon, action, children }: { title: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-warm-500 uppercase tracking-wider flex items-center gap-1.5">
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
