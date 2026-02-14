'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { Coach, CoachStatus } from '../page';
import { 
  IconX, IconMail, IconPhone, IconStar, IconStarFilled, 
  IconCalendar, IconPlus 
} from '@/components/icons';

interface CoachDetailPanelProps {
  coach: Coach;
  onClose: () => void;
  onUpdate: (updates: Partial<Coach>) => void;
  statusConfig: Record<CoachStatus, { label: string; color: string; bgColor: string }>;
  priorityConfig: Record<number, { label: string; color: string; icon: string }>;
}

interface ContactLog {
  id: string;
  contact_type: string;
  contact_date: string;
  subject: string | null;
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
];

const HIGHLIGHT_COLORS = [
  { value: null, label: 'None', color: 'bg-white border-warm-300' },
  { value: '#10b981', label: 'Green', color: 'bg-emerald-500' },
  { value: '#3b82f6', label: 'Blue', color: 'bg-blue-500' },
  { value: '#8b5cf6', label: 'Purple', color: 'bg-purple-500' },
  { value: '#f59e0b', label: 'Orange', color: 'bg-amber-500' },
  { value: '#ef4444', label: 'Red', color: 'bg-red-500' },
  { value: '#ec4899', label: 'Pink', color: 'bg-pink-500' },
];

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
  
  // Edit states
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState(coach.notes || '');
  const [editingComments, setEditingComments] = useState(false);
  const [commentsValue, setCommentsValue] = useState(coach.internal_comments || '');
  
  // New contact form
  const [showContactForm, setShowContactForm] = useState(false);
  const [newContact, setNewContact] = useState({
    type: 'email',
    notes: '',
    nextAction: '',
    nextActionDate: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    fetchLogs();
  }, [coach.id]);

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const { data } = await supabase
        .from('crm_contact_log')
        .select('*')
        .eq('coach_id', coach.id)
        .order('contact_date', { ascending: false });
      setLogs(data || []);
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

  const saveComments = async () => {
    onUpdate({ internal_comments: commentsValue || null });
    setEditingComments(false);
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
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  };

  return (
    <div className="fixed right-0 top-0 h-full w-[480px] bg-white border-l border-warm-200 shadow-xl z-30 flex flex-col">
      {/* Header */}
      <div className="flex items-start justify-between p-6 border-b border-warm-200 bg-gradient-to-r from-warm-50 to-white">
        <div className="flex-1 pr-4">
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={() => onUpdate({ is_starred: !coach.is_starred })}
              className={cn(
                'p-1 rounded transition-colors',
                coach.is_starred ? 'text-yellow-500' : 'text-warm-300 hover:text-yellow-400'
              )}
            >
              {coach.is_starred ? <IconStarFilled className="w-5 h-5" /> : <IconStar className="w-5 h-5" />}
            </button>
            <h2 className="text-xl font-bold text-warm-900">{coach.name}</h2>
            {coach.priority > 0 && (
              <span className={cn('text-lg', priorityConfig[coach.priority]?.color)}>
                {priorityConfig[coach.priority]?.icon}
              </span>
            )}
          </div>
          <p className="text-sm text-warm-600">{coach.title}</p>
          <p className="text-sm font-medium text-warm-800 mt-1">{coach.school}</p>
          <p className="text-xs text-warm-500">{coach.conference} • {coach.division}</p>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-warm-100 text-warm-500 transition-colors"
        >
          <IconX className="w-5 h-5" />
        </button>
      </div>

      {/* Quick Actions */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-warm-200 bg-warm-50">
        {coach.email && (
          <a
            href={`mailto:${coach.email}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 hover:bg-blue-200 text-sm font-medium transition-colors"
          >
            <IconMail className="w-4 h-4" />
            Email
          </a>
        )}
        {coach.phone && (
          <a
            href={`tel:${coach.phone}`}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-100 text-green-700 hover:bg-green-200 text-sm font-medium transition-colors"
          >
            <IconPhone className="w-4 h-4" />
            Call
          </a>
        )}
        <button
          onClick={() => setShowContactForm(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-medium transition-colors ml-auto"
        >
          <IconPlus className="w-4 h-4" />
          Log Contact
        </button>
      </div>

      {/* Status & Priority Row */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-warm-200">
        <div className="flex items-center gap-2">
          <span className="text-xs text-warm-500">Status:</span>
          <select
            value={coach.status}
            onChange={(e) => onUpdate({ status: e.target.value as CoachStatus })}
            className={cn(
              'px-2 py-1 rounded-full text-xs font-medium border-0 cursor-pointer',
              statusConfig[coach.status]?.bgColor,
              statusConfig[coach.status]?.color
            )}
          >
            {Object.entries(statusConfig).map(([value, config]) => (
              <option key={value} value={value}>{config.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-warm-500">Priority:</span>
          <select
            value={coach.priority}
            onChange={(e) => onUpdate({ priority: parseInt(e.target.value) })}
            className="px-2 py-1 rounded text-xs font-medium border border-warm-200 cursor-pointer bg-white"
          >
            {[0, 1, 2, 3].map((p) => (
              <option key={p} value={p}>{priorityConfig[p]?.icon} {priorityConfig[p]?.label}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1 ml-auto">
          <span className="text-xs text-warm-500">Highlight:</span>
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c.value || 'none'}
              onClick={() => onUpdate({ highlight_color: c.value })}
              className={cn(
                'w-5 h-5 rounded-full border-2 transition-transform hover:scale-110',
                c.color,
                coach.highlight_color === c.value 
                  ? 'ring-2 ring-offset-1 ring-warm-400' 
                  : 'border-transparent'
              )}
              title={c.label}
            />
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-warm-200">
        {(['details', 'activity', 'notes'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'flex-1 px-4 py-3 text-sm font-medium transition-colors border-b-2',
              activeTab === tab
                ? 'border-emerald-500 text-emerald-600 bg-emerald-50/50'
                : 'border-transparent text-warm-500 hover:text-warm-700 hover:bg-warm-50'
            )}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === 'details' && (
          <div className="space-y-6">
            {/* Contact Info */}
            <div>
              <h3 className="text-sm font-semibold text-warm-900 mb-3">Contact Information</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-warm-500">Email</span>
                  <span className="text-warm-900">{coach.email || '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-warm-500">Phone</span>
                  <span className="text-warm-900">{coach.phone || '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-warm-500">Best Contact</span>
                  <span className="text-warm-900 capitalize">{coach.best_contact_method || '—'}</span>
                </div>
              </div>
            </div>

            {/* Program Info */}
            <div>
              <h3 className="text-sm font-semibold text-warm-900 mb-3">Program</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-warm-500">Type</span>
                  <span className="text-warm-900 capitalize">
                    {coach.program === 'mens' ? "Men's" : coach.program === 'womens' ? "Women's" : 'Both'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-warm-500">Team Size</span>
                  <span className="text-warm-900">{coach.team_size || '—'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-warm-500">Current Software</span>
                  <span className="text-warm-900">{coach.current_software || '—'}</span>
                </div>
              </div>
            </div>

            {/* Timeline */}
            <div>
              <h3 className="text-sm font-semibold text-warm-900 mb-3">Timeline</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-warm-500">Last Contact</span>
                  <span className="text-warm-900">
                    {coach.last_contacted_at ? formatDate(coach.last_contacted_at) : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-warm-500">Next Follow-up</span>
                  <span className={cn(
                    coach.next_follow_up_at && new Date(coach.next_follow_up_at) < new Date()
                      ? 'text-red-600 font-medium'
                      : 'text-warm-900'
                  )}>
                    {coach.next_follow_up_at ? formatDate(coach.next_follow_up_at) : '—'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-warm-500">Decision Timeline</span>
                  <span className="text-warm-900">{coach.decision_timeline || '—'}</span>
                </div>
              </div>
            </div>

            {/* Tags */}
            {coach.tags && coach.tags.length > 0 && (
              <div>
                <h3 className="text-sm font-semibold text-warm-900 mb-3">Tags</h3>
                <div className="flex flex-wrap gap-2">
                  {coach.tags.map((tag, i) => (
                    <span
                      key={i}
                      className="px-2 py-1 bg-warm-100 text-warm-700 rounded text-xs"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="space-y-4">
            {/* New Contact Form */}
            {showContactForm && (
              <div className="bg-warm-50 rounded-xl p-4 space-y-3 border border-warm-200">
                <div className="flex gap-2 flex-wrap">
                  {CONTACT_TYPES.map((type) => (
                    <button
                      key={type.value}
                      onClick={() => setNewContact({ ...newContact, type: type.value })}
                      className={cn(
                        'px-3 py-1.5 rounded-lg text-sm transition-colors',
                        newContact.type === type.value
                          ? 'bg-emerald-600 text-white'
                          : 'bg-white border border-warm-200 hover:bg-warm-100'
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
                  className="w-full px-3 py-2 border border-warm-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  rows={3}
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Next action..."
                    value={newContact.nextAction}
                    onChange={(e) => setNewContact({ ...newContact, nextAction: e.target.value })}
                    className="px-3 py-2 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <input
                    type="date"
                    value={newContact.nextActionDate}
                    onChange={(e) => setNewContact({ ...newContact, nextActionDate: e.target.value })}
                    className="px-3 py-2 border border-warm-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
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
                    className="px-4 py-1.5 bg-emerald-600 text-white rounded-lg text-sm hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {submitting ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            )}

            {/* Activity Log */}
            {loadingLogs ? (
              <div className="text-center py-8 text-warm-500">Loading...</div>
            ) : logs.length === 0 ? (
              <div className="text-center py-8 text-warm-500">
                <div className="text-3xl mb-2">📭</div>
                No contact history yet
              </div>
            ) : (
              <div className="space-y-3">
                {logs.map((log) => (
                  <div key={log.id} className="bg-white border border-warm-200 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">
                        {CONTACT_TYPES.find(t => t.value === log.contact_type)?.icon}{' '}
                        {CONTACT_TYPES.find(t => t.value === log.contact_type)?.label}
                      </span>
                      <span className="text-xs text-warm-500">{formatDate(log.contact_date)}</span>
                    </div>
                    {log.notes && (
                      <p className="text-sm text-warm-700">{log.notes}</p>
                    )}
                    {log.next_action && (
                      <div className="mt-2 flex items-center gap-1 text-xs text-warm-500">
                        <IconCalendar className="w-3 h-3" />
                        Next: {log.next_action}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'notes' && (
          <div className="space-y-6">
            {/* Public Notes */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-warm-900">Notes</h3>
                <button
                  onClick={() => {
                    if (editingNotes) saveNotes();
                    else setEditingNotes(true);
                  }}
                  className="text-xs text-emerald-600 hover:text-emerald-700"
                >
                  {editingNotes ? 'Save' : 'Edit'}
                </button>
              </div>
              {editingNotes ? (
                <textarea
                  value={notesValue}
                  onChange={(e) => setNotesValue(e.target.value)}
                  className="w-full px-3 py-2 border border-warm-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  rows={6}
                  placeholder="Add notes about this coach..."
                  autoFocus
                />
              ) : (
                <div className="text-sm text-warm-700 whitespace-pre-wrap bg-warm-50 rounded-lg p-3 min-h-[100px]">
                  {coach.notes || <span className="text-warm-400 italic">No notes yet</span>}
                </div>
              )}
            </div>

            {/* Internal Comments */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-warm-900">
                  Internal Comments
                  <span className="ml-2 text-xs font-normal text-warm-500">(team only)</span>
                </h3>
                <button
                  onClick={() => {
                    if (editingComments) saveComments();
                    else setEditingComments(true);
                  }}
                  className="text-xs text-emerald-600 hover:text-emerald-700"
                >
                  {editingComments ? 'Save' : 'Edit'}
                </button>
              </div>
              {editingComments ? (
                <textarea
                  value={commentsValue}
                  onChange={(e) => setCommentsValue(e.target.value)}
                  className="w-full px-3 py-2 border border-warm-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  rows={6}
                  placeholder="Add internal team comments..."
                  autoFocus
                />
              ) : (
                <div className="text-sm text-warm-700 whitespace-pre-wrap bg-yellow-50 border border-yellow-200 rounded-lg p-3 min-h-[100px]">
                  {coach.internal_comments || <span className="text-warm-400 italic">No internal comments</span>}
                </div>
              )}
            </div>

            {/* Pain Points */}
            <div>
              <h3 className="text-sm font-semibold text-warm-900 mb-2">Pain Points</h3>
              <div className="text-sm text-warm-700 bg-warm-50 rounded-lg p-3">
                {coach.pain_points && coach.pain_points.length > 0 ? (
                  <ul className="list-disc list-inside space-y-1">
                    {coach.pain_points.map((point, i) => (
                      <li key={i}>{point}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-warm-400 italic">None documented</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
