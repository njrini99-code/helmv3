'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { Coach, CoachStatus } from '../page';
import { IconX, IconMail, IconPhone, IconCalendar, IconPlus } from '@/components/icons';

interface ContactLogModalProps {
  coach: Coach;
  onClose: () => void;
  onUpdate: () => void;
}

interface ContactLog {
  id: string;
  contact_type: 'email' | 'call' | 'demo' | 'meeting' | 'note';
  contact_date: string;
  subject: string | null;
  notes: string | null;
  next_action: string | null;
  next_action_date: string | null;
  created_at: string | null;
}

const CONTACT_TYPES = [
  { value: 'email', label: 'Email', icon: '✉️' },
  { value: 'call', label: 'Call', icon: '📞' },
  { value: 'demo', label: 'Demo', icon: '🖥️' },
  { value: 'meeting', label: 'Meeting', icon: '🤝' },
  { value: 'note', label: 'Note', icon: '📝' },
] as const;

const STATUS_OPTIONS: { value: CoachStatus; label: string }[] = [
  { value: 'new_lead', label: 'New Lead' },
  { value: 'researching', label: 'Researching' },
  { value: 'outreach_pending', label: 'Outreach Pending' },
  { value: 'initial_contact', label: 'Initial Contact' },
  { value: 'follow_up', label: 'Follow Up' },
  { value: 'engaged', label: 'Engaged' },
  { value: 'demo_scheduled', label: 'Demo Scheduled' },
  { value: 'demo_completed', label: 'Demo Completed' },
  { value: 'proposal_sent', label: 'Proposal Sent' },
  { value: 'negotiating', label: 'Negotiating' },
  { value: 'closed_won', label: '✓ Customer' },
  { value: 'closed_lost', label: '✗ Lost' },
  { value: 'not_interested', label: 'Not Interested' },
  { value: 'bad_timing', label: 'Bad Timing' },
  { value: 'nurture', label: 'Nurture' },
];

export function ContactLogModal({ coach, onClose, onUpdate }: ContactLogModalProps) {
  const [logs, setLogs] = useState<ContactLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  
  const [newLog, setNewLog] = useState({
    contact_type: 'email' as ContactLog['contact_type'],
    notes: '',
    next_action: '',
    next_action_date: '',
    update_status: '' as CoachStatus | '',
  });

  const supabase = createClient();

  useEffect(() => {
    fetchLogs();
  }, [coach.id]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('crm_contact_log')
        .select('*')
        .eq('coach_id', coach.id)
        .order('contact_date', { ascending: false });

      if (error) throw error;
      setLogs((data || []) as ContactLog[]);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddLog = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    try {
      // Add contact log
      const { error: logError } = await supabase
        .from('crm_contact_log')
        .insert({
          coach_id: coach.id,
          contact_type: newLog.contact_type,
          notes: newLog.notes || null,
          next_action: newLog.next_action || null,
          next_action_date: newLog.next_action_date || null,
        });

      if (logError) throw logError;

      // Update coach record
      const updateData: Record<string, unknown> = {
        last_contacted_at: new Date().toISOString(),
      };

      if (newLog.next_action_date) {
        updateData.next_follow_up_at = newLog.next_action_date;
      }

      if (newLog.update_status) {
        updateData.status = newLog.update_status;
      }

      const { error: updateError } = await supabase
        .from('crm_coaches')
        .update(updateData)
        .eq('id', coach.id);

      if (updateError) throw updateError;

      // Reset form and refresh
      setNewLog({
        contact_type: 'email',
        notes: '',
        next_action: '',
        next_action_date: '',
        update_status: '',
      });
      setShowAddForm(false);
      fetchLogs();
      onUpdate();
    } catch (err) {
      console.error('Failed to add log:', err);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-warm-200 flex-shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-warm-900">{coach.name}</h2>
            <p className="text-sm text-warm-500">{coach.school} • {coach.conference}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-warm-100 text-warm-500 transition-colors"
          >
            <IconX className="w-5 h-5" />
          </button>
        </div>

        {/* Coach Details */}
        <div className="px-6 py-4 bg-warm-50 border-b border-warm-200 flex-shrink-0">
          <div className="flex items-center gap-6 text-sm">
            {coach.email && (
              <a href={`mailto:${coach.email}`} className="flex items-center gap-2 text-blue-600 hover:underline">
                <IconMail className="w-4 h-4" />
                {coach.email}
              </a>
            )}
            {coach.phone && (
              <a href={`tel:${coach.phone}`} className="flex items-center gap-2 text-blue-600 hover:underline">
                <IconPhone className="w-4 h-4" />
                {coach.phone}
              </a>
            )}
            <span className="text-warm-600">
              Status: <span className="font-medium">{coach.status.replace(/_/g, ' ')}</span>
            </span>
          </div>
          {coach.notes && (
            <p className="mt-2 text-sm text-warm-600">{coach.notes}</p>
          )}
        </div>

        {/* Contact Log */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-warm-900">Contact History</h3>
            {!showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 text-sm transition-colors"
              >
                <IconPlus className="w-4 h-4" />
                Log Contact
              </button>
            )}
          </div>

          {/* Add Log Form */}
          {showAddForm && (
            <form onSubmit={handleAddLog} className="mb-6 p-4 bg-warm-50 rounded-xl space-y-4">
              <div className="flex gap-2 flex-wrap">
                {CONTACT_TYPES.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    onClick={() => setNewLog({ ...newLog, contact_type: type.value })}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-sm transition-colors',
                      newLog.contact_type === type.value
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
                value={newLog.notes}
                onChange={(e) => setNewLog({ ...newLog, notes: e.target.value })}
                className="w-full px-4 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                rows={3}
              />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-warm-600 mb-1">Next Action</label>
                  <input
                    type="text"
                    placeholder="Follow up with demo offer..."
                    value={newLog.next_action}
                    onChange={(e) => setNewLog({ ...newLog, next_action: e.target.value })}
                    className="w-full px-3 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-warm-600 mb-1">Follow-up Date</label>
                  <input
                    type="date"
                    value={newLog.next_action_date}
                    onChange={(e) => setNewLog({ ...newLog, next_action_date: e.target.value })}
                    className="w-full px-3 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-warm-600 mb-1">Update Status (optional)</label>
                <select
                  value={newLog.update_status}
                  onChange={(e) => setNewLog({ ...newLog, update_status: e.target.value as CoachStatus | '' })}
                  className="w-full px-3 py-2 border border-warm-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-sm bg-white"
                >
                  <option value="">Keep current status</option>
                  {STATUS_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-4 py-2 rounded-lg border border-warm-200 text-warm-600 hover:bg-warm-100 text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 text-sm transition-colors"
                >
                  {submitting ? 'Saving...' : 'Save Log'}
                </button>
              </div>
            </form>
          )}

          {/* Log List */}
          {loading ? (
            <div className="text-center py-8 text-warm-500">Loading...</div>
          ) : logs.length === 0 ? (
            <div className="text-center py-8 text-warm-500">No contact history yet</div>
          ) : (
            <div className="space-y-4">
              {logs.map((log) => (
                <div key={log.id} className="border border-warm-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium capitalize">
                      {CONTACT_TYPES.find(t => t.value === log.contact_type)?.icon}{' '}
                      {log.contact_type}
                    </span>
                    <span className="text-xs text-warm-500">{formatDate(log.contact_date)}</span>
                  </div>
                  {log.notes && (
                    <p className="text-sm text-warm-700">{log.notes}</p>
                  )}
                  {log.next_action && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-warm-500">
                      <IconCalendar className="w-3 h-3" />
                      Next: {log.next_action}
                      {log.next_action_date && ` (${new Date(log.next_action_date).toLocaleDateString()})`}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
