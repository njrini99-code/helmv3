'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { Coach, CoachStatus } from '../page';

interface CoachDetailPanelProps {
  coach: Coach;
  onClose: () => void;
  onUpdate: (updates: Partial<Coach>) => void;
  statusConfig: Record<CoachStatus, { label: string; color: string; bgColor: string; icon: string }>;
  priorityConfig: Record<number, { label: string; color: string; bgColor: string; icon: string }>;
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
  { value: 'email', label: 'Email', icon: '✉️' },
  { value: 'call', label: 'Call', icon: '📞' },
  { value: 'demo', label: 'Demo', icon: '🖥️' },
  { value: 'meeting', label: 'Meeting', icon: '🤝' },
  { value: 'note', label: 'Note', icon: '📝' },
] as const;

export function CoachDetailPanel({
  coach,
  onClose,
  onUpdate,
  statusConfig,
  priorityConfig,
}: CoachDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'activity' | 'notes'>('details');
  const [logs, setLogs] = useState<ContactLog[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(coach.notes || '');
  
  const [showContactForm, setShowContactForm] = useState(false);
  const [newContact, setNewContact] = useState({
    type: 'email' as typeof CONTACT_TYPES[number]['value'],
    notes: '',
    nextAction: '',
    nextActionDate: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const supabase = createClient();

  // Slide-in animation
  useEffect(() => {
    // Trigger slide-in on mount
    const timer = setTimeout(() => setIsVisible(true), 10);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    fetchLogs();
    setNotesValue(coach.notes || '');
  }, [coach.id]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 200);
  };

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const { data } = await supabase
        .from('crm_contact_log')
        .select('*')
        .eq('coach_id', coach.id)
        .order('contact_date', { ascending: false });
      setLogs((data || []) as ContactLog[]);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoadingLogs(false);
    }
  };

  const saveNotes = async () => {
    onUpdate({ notes: notesValue || null });
    setEditingNotes(false);
  };

  const submitContact = async () => {
    setSubmitting(true);
    try {
      await supabase.from('crm_contact_log').insert({
        coach_id: coach.id,
        contact_type: newContact.type,
        notes: newContact.notes || null,
        next_action: newContact.nextAction || null,
        next_action_date: newContact.nextActionDate || null,
      });

      const updates: Partial<Coach> = { last_contacted_at: new Date().toISOString() };
      if (newContact.nextActionDate) {
        updates.next_follow_up_at = newContact.nextActionDate;
      }
      onUpdate(updates);

      setNewContact({ type: 'email', notes: '', nextAction: '', nextActionDate: '' });
      setShowContactForm(false);
      fetchLogs();
    } catch (err) {
      console.error('Failed to log contact:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className={cn(
          'fixed inset-0 bg-black/20 z-40 transition-opacity duration-200',
          isVisible ? 'opacity-100' : 'opacity-0'
        )}
        onClick={handleClose}
      />
      
      {/* Panel */}
      <div 
        className={cn(
          'fixed right-0 top-0 h-full w-[420px] z-50 flex flex-col',
          'bg-[#FFFEF8]',
          'border-l border-warm-200/50',
          'shadow-2xl',
          'transition-transform duration-200 ease-out',
          isVisible ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-warm-900 to-warm-800 text-white p-5">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <button
                  onClick={() => onUpdate({ is_starred: !coach.is_starred })}
                  className="text-xl hover:scale-110 transition-transform"
                >
                  {coach.is_starred ? '⭐' : '☆'}
                </button>
                <h2 className="text-xl font-bold truncate">{coach.name}</h2>
                {coach.priority > 0 && (
                  <span className="flex items-center">{priorityConfig[coach.priority]?.icon}</span>
                )}
              </div>
              <p className="text-warm-300 text-sm">{coach.title || 'Coach'}</p>
              <p className="text-white font-medium mt-1">{coach.school}</p>
              <p className="text-warm-400 text-sm">{coach.conference} • {coach.division}</p>
            </div>
            <button
              onClick={handleClose}
              className="p-2 rounded-xl hover:bg-white/10 transition-colors text-white/70 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex items-center gap-2 px-5 py-3 bg-white border-b border-warm-200/50">
          {coach.email && (
            <a
              href={`mailto:${coach.email}`}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 text-sm font-medium transition-colors"
            >
              ✉️ Email
            </a>
          )}
          {coach.phone && (
            <a
              href={`tel:${coach.phone}`}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-50 text-primary-700 hover:bg-primary-100 text-sm font-medium transition-colors"
            >
              📞 Call
            </a>
          )}
          <button
            onClick={() => setShowContactForm(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary-600 text-white hover:bg-primary-700 text-sm font-bold transition-colors ml-auto shadow-sm"
          >
            + Log Contact
          </button>
        </div>

        {/* Status & Priority Row */}
        <div className="flex items-center gap-4 px-5 py-3 border-b border-warm-200/50 bg-white">
          <div className="flex items-center gap-2">
            <span className="text-xs text-warm-500 font-medium">Status</span>
            <select
              value={coach.status}
              onChange={(e) => onUpdate({ status: e.target.value as CoachStatus })}
              className={cn(
                'px-3 py-1.5 rounded-xl text-sm font-semibold border-0 cursor-pointer',
                statusConfig[coach.status]?.bgColor,
                statusConfig[coach.status]?.color
              )}
            >
              {Object.entries(statusConfig).map(([value, config]) => (
                <option key={value} value={value}>{config.iconLabel} {config.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-warm-500 font-medium">Priority</span>
            <select
              value={coach.priority}
              onChange={(e) => onUpdate({ priority: parseInt(e.target.value) })}
              className="px-3 py-1.5 rounded-xl text-sm font-medium border border-warm-200/50 cursor-pointer bg-white"
            >
              <option value={0}>Normal</option>
              <option value={1}>⚡ High</option>
              <option value={2}>🔥 Hot</option>
            </select>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-warm-200/50 bg-white">
          {(['details', 'activity', 'notes'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'flex-1 px-4 py-3 text-sm font-semibold transition-colors',
                activeTab === tab
                  ? 'border-b-2 border-primary-500 text-primary-600 bg-primary-50/30'
                  : 'text-warm-500 hover:text-warm-700 hover:bg-warm-50'
              )}
            >
              {tab === 'details' && '📋 '}
              {tab === 'activity' && '📅 '}
              {tab === 'notes' && '📝 '}
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {activeTab === 'details' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-warm-200/50 shadow-sm p-4">
                <h3 className="text-sm font-bold text-warm-800 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-blue-50 flex items-center justify-center text-xs">📧</span>
                  Contact Info
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-warm-500">Email</span>
                    <span className="text-warm-900 font-medium">{coach.email || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-warm-500">Phone</span>
                    <span className="text-warm-900 font-medium">{coach.phone || '—'}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-warm-200/50 shadow-sm p-4">
                <h3 className="text-sm font-bold text-warm-800 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-primary-50 flex items-center justify-center text-xs">🏫</span>
                  Program
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-warm-500">Type</span>
                    <span className="text-warm-900 font-medium capitalize">
                      {coach.program === 'mens' ? "Men's" : coach.program === 'womens' ? "Women's" : 'Both'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-warm-500">Team Size</span>
                    <span className="text-warm-900 font-medium">{coach.team_size || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-warm-500">Current Software</span>
                    <span className="text-warm-900 font-medium">{coach.current_software || '—'}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-warm-200/50 shadow-sm p-4">
                <h3 className="text-sm font-bold text-warm-800 mb-3 flex items-center gap-2">
                  <span className="w-6 h-6 rounded-lg bg-amber-50 flex items-center justify-center text-xs">📅</span>
                  Timeline
                </h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-warm-500">Last Contact</span>
                    <span className="text-warm-900 font-medium">
                      {coach.last_contacted_at ? formatDate(coach.last_contacted_at) : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-warm-500">Next Follow-up</span>
                    <span className={cn(
                      'font-medium',
                      coach.next_follow_up_at && new Date(coach.next_follow_up_at) < new Date()
                        ? 'text-red-600'
                        : 'text-warm-900'
                    )}>
                      {coach.next_follow_up_at ? formatDate(coach.next_follow_up_at) : '—'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="space-y-4">
              {showContactForm && (
                <div className="bg-white rounded-2xl border border-primary-200 shadow-sm p-4 space-y-3">
                  <div className="flex gap-2 flex-wrap">
                    {CONTACT_TYPES.map((type) => (
                      <button
                        key={type.value}
                        onClick={() => setNewContact({ ...newContact, type: type.value })}
                        className={cn(
                          'px-3 py-1.5 rounded-xl text-sm font-medium transition-colors',
                          newContact.type === type.value
                            ? 'bg-primary-600 text-white'
                            : 'bg-warm-50 border border-warm-200/50 hover:bg-warm-100'
                        )}
                      >
                        {type.icon} {type.label}
                      </button>
                    ))}
                  </div>
                  <textarea
                    placeholder="Notes about this contact..."
                    value={newContact.notes}
                    onChange={(e) => setNewContact({ ...newContact, notes: e.target.value })}
                    className="w-full px-3 py-2 border border-warm-200/50 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white"
                    rows={3}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Next action..."
                      value={newContact.nextAction}
                      onChange={(e) => setNewContact({ ...newContact, nextAction: e.target.value })}
                      className="px-3 py-2 border border-warm-200/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                    <input
                      type="date"
                      value={newContact.nextActionDate}
                      onChange={(e) => setNewContact({ ...newContact, nextActionDate: e.target.value })}
                      className="px-3 py-2 border border-warm-200/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => setShowContactForm(false)}
                      className="px-3 py-1.5 text-sm text-warm-600 hover:text-warm-800"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={submitContact}
                      disabled={submitting}
                      className="px-4 py-1.5 bg-primary-600 text-white rounded-xl text-sm font-semibold hover:bg-primary-700 disabled:opacity-50 shadow-sm"
                    >
                      {submitting ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              )}

              {loadingLogs ? (
                <div className="text-center py-8 text-warm-500">Loading...</div>
              ) : logs.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 rounded-2xl bg-warm-100 flex items-center justify-center mx-auto mb-3">
                    <span className="text-2xl">📭</span>
                  </div>
                  <p className="text-warm-500 text-sm">No contact history yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {logs.map((log) => (
                    <div key={log.id} className="bg-white rounded-2xl border border-warm-200/50 shadow-sm p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-semibold text-warm-800">
                          {CONTACT_TYPES.find(t => t.value === log.contact_type)?.icon}{' '}
                          {CONTACT_TYPES.find(t => t.value === log.contact_type)?.label}
                        </span>
                        <span className="text-xs text-warm-500">{formatDate(log.contact_date)}</span>
                      </div>
                      {log.notes && (
                        <p className="text-sm text-warm-700">{log.notes}</p>
                      )}
                      {log.next_action && (
                        <div className="mt-2 text-xs text-warm-500">
                          📅 Next: {log.next_action}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'notes' && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-warm-200/50 shadow-sm p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-warm-800 flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-amber-50 flex items-center justify-center text-xs">📝</span>
                    Notes
                  </h3>
                  <button
                    onClick={() => {
                      if (editingNotes) saveNotes();
                      else setEditingNotes(true);
                    }}
                    className="text-xs text-primary-600 hover:text-primary-700 font-semibold"
                  >
                    {editingNotes ? '✓ Save' : '✎ Edit'}
                  </button>
                </div>
                {editingNotes ? (
                  <textarea
                    value={notesValue}
                    onChange={(e) => setNotesValue(e.target.value)}
                    className="w-full px-3 py-2 border border-warm-200/50 rounded-xl text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500"
                    rows={8}
                    placeholder="Add notes about this coach..."
                    autoFocus
                  />
                ) : (
                  <div className="text-sm text-warm-700 whitespace-pre-wrap bg-warm-50/50 rounded-xl p-4 min-h-[150px]">
                    {coach.notes || <span className="text-warm-400 italic">No notes yet</span>}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
